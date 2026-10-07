"use strict";

const SCENARIO = {
  id: "school-corridor", title: "Чужое правило", maxTurns: 10,
  stages: ["PROBE", "BOUNDARY TEST", "THREAT", "RESISTANCE", "PUNISHMENT", "ESCALATION", "COALITION", "DETERRENCE", "EXIT"],
  base: { aggressor: { power: 7, reputation: 7 }, defender: { reputation: 2, allies: 2, resolve: 5, selfControl: 6, fear: 6 } },
  actions: [
    { id: "comply", kind: "direct", responseLevel: -2, icon: "↓", name: "Отдать блокнот", hint: "Выполнить текущее требование", risk: 1, challenge: 0, profile: ["− Danger сейчас", "− Autonomy", "+ Будущее давление"] },
    { id: "defer", kind: "direct", responseLevel: -1, icon: "≈", name: "«Потом покажу»", hint: "Не согласиться сейчас, но не делать вызов", risk: 1, challenge: .25, profile: ["+ Время", "− Темп", "граница остаётся неясной"] },
    { id: "reciprocal", kind: "direct", responseLevel: 0, icon: "⇄", name: "«Тогда сначала дай свой»", hint: "Ответить условием равной силы", risk: 2, challenge: 1, assertive: true, profile: ["+ Autonomy", "равная ставка", "может задеть статус"] },
    { id: "boundary", kind: "direct", responseLevel: 1, icon: "□", name: "«Отстань, иначе позову взрослого»", hint: "Отказать и назвать последствие", risk: 2, challenge: 1.5, assertive: true, profile: ["+ Autonomy", "+ Reputation при опоре", "риск проверки"] },
    { id: "strongCounter", kind: "direct", responseLevel: 2, icon: "!", name: "Сделать требование публичным", hint: "Повторить его вслух и зафиксировать", risk: 2, challenge: 2, assertive: true, profile: ["+ External Cost", "+ Evidence", "короткий риск публичности"] },
    { id: "observe", kind: "field", baseLevel: -1, icon: "◇", name: "Наблюдать", hint: "Получить сигнал о скрытом состоянии", risk: 1, challenge: 0, profile: ["− Uncertainty", "− Fear", "+ время агрессору"] },
    { id: "delay", kind: "field", baseLevel: -1, icon: "◷", name: "Тянуть время", hint: "Дождаться движения в коридоре", risk: 2, challenge: .15, profile: ["+ Время", "+ Witnesses", "− Control"] },
    { id: "leave", kind: "field", baseLevel: 0, icon: "↗", name: "Уйти", hint: "Попытаться физически выйти из сцены", risk: 2, challenge: .6, assertive: true, profile: ["− Danger", "+ Safety", "важна опора рядом"] },
    { id: "witnesses", kind: "field", baseLevel: -1, icon: "◎", name: "Искать свидетелей", hint: "Сделать сцену публичной", risk: 1, challenge: .8, profile: ["+ External Cost", "− Control", "возможна изоляция"] },
    { id: "document", kind: "field", baseLevel: 0, icon: "▣", name: "Зафиксировать", hint: "Создать сохраняющееся доказательство", risk: 2, challenge: 1, assertive: true, profile: ["+ Evidence", "+ External Cost", "риск обнаружения"] },
    { id: "coalition", kind: "field", baseLevel: 1, icon: "⋈", name: "Начать коалицию", hint: "Позвать человека сейчас и договориться на будущее", risk: 2, challenge: .7, profile: ["+ Immediate Ally", "+ Coalition потом", "требует времени"] },
    { id: "appeal", kind: "field", baseLevel: 2, icon: "⌂", name: "Обратиться к взрослым", hint: "Превратить накопленную опору в действие", risk: 2, challenge: 1.2, profile: ["+ Institution", "+ Long-term safety", "нужны основания"] },
    { id: "offerExit", kind: "field", baseLevel: -1, icon: "↔", name: "Предложить выход", hint: "Дать отступить без потери лица", risk: 1, challenge: 0, profile: ["использует External Cost", "снимает Debt", "− Escalation"] }
  ]
};

const RESPONSE_LEVELS = [
  { value: -2, mark: "−2", label: "Сильно ниже ставки" },
  { value: -1, mark: "−1", label: "Мягче" },
  { value: 0, mark: "0", label: "Соразмерно" },
  { value: 1, mark: "+1", label: "Выше ставки" },
  { value: 2, mark: "+2", label: "Сильно выше ставки" }
];

const WEIGHTS = Object.freeze({ uncertainty: .28, control: .32, debt: .48, weapons: .5, witnesses: 1.2, evidence: 1.4, allies: .55, institution: 1.6, aggressorFear: .6, futureDemand: .45, lostAutonomy: .25, costIncentive: .62 });

const $ = id => document.getElementById(id);
const clamp = (n, min = 0, max = 10) => Math.max(min, Math.min(max, n));
const signed = n => `${n > 0 ? "+" : ""}${n}`;
let state, debugEnabled = false, soundEnabled = true;

function randomSeed() {
  if (window.crypto?.getRandomValues) return window.crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 0xffffffff);
}

function seededRandom(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function chooseWorld(seed) {
  const r = seededRandom(seed);
  const between = (min, max) => +(min + r() * (max - min)).toFixed(2);
  return {
    seed,
    resolve: Math.round(between(4, 8)), fear: Math.round(between(2, 5)), alliesNear: Math.floor(between(0, 2.99)), weapons: 0,
    witnessReliability: between(.50, .92), institutionQuality: between(.42, .92), detection: Math.round(between(2, 4)),
    bluff: between(.32, .94), needForFace: between(.28, .96), fearOfInstitution: between(.30, .92), exploitation: between(.28, .92),
    objective: r() > .48 ? "control" : "material"
  };
}

function freshState(seed = randomSeed()) {
  const world = chooseWorld(seed);
  return {
    seed, world, turn: 1, stage: 0, control: 3, autonomy: 8, escalation: 1, danger: 3,
    uncertainty: 7, evidence: 0, witnesses: 0, immediateAllies: 0, coalition: 0, field: 0, threatDebt: 0, statusPressure: 0, futureDemand: 3,
    physicalSafety: 8, longTermSafety: 5, psychologicalCost: 2, appealPenalty: 0,
    aggressor: { ...SCENARIO.base.aggressor, resolve: world.resolve, fear: world.fear, allies: world.alliesNear, weapons: world.weapons },
    defender: { ...SCENARIO.base.defender, institution: 0 },
    observations: 0, signals: [], intel: { resolve: null, allies: null, weapons: null, fear: null, bluff: null, face: null, institutionSensitivity: null },
    currentDemand: { id: "notebook", label: "Отдать блокнот", status: "active", objective: "получить блокнот" },
    currentThreat: null, demandHistory: [], possibleNextDemand: { id: "carry_bag", label: "Понести рюкзак до выхода" }, pendingDecision: null,
    memory: { compliances: 0, publicMoves: 0, emptyBoundaries: 0, institutionWorked: 0, deferrals: 0 }, complianceProcessed: false, isolationAttempted: false,
    history: [], used: new Set(), lastAction: null, bluffed: false, recruited: false, discredited: false, strongestAggressorMove: null,
    aggressorMove: { strength: 1, label: "Слабое требование", text: "«Дай посмотреть блокнот. Я потом верну»" },
    situationTitle: "Он пробует границу",
    situationText: "Старший ученик преграждает путь и просит блокнот так, будто отказ не предусмотрен. Пока это звучит почти буднично — именно так проверяется граница.",
    event: "«Дай посмотреть блокнот. Я потом верну».", effects: [], debug: "", ended: false, outcome: null
  };
}

function apply(s, changes) {
  Object.entries(changes).forEach(([path, delta]) => {
    const parts = path.split(".");
    if (parts.length === 1) s[path] = (s[path] || 0) + delta;
    else s[parts[0]][parts[1]] = (s[parts[0]][parts[1]] || 0) + delta;
  });
  ["autonomy", "danger", "uncertainty", "escalation", "physicalSafety", "longTermSafety", "psychologicalCost", "futureDemand", "evidence", "witnesses", "immediateAllies", "coalition", "field", "threatDebt", "statusPressure"].forEach(k => s[k] = clamp(s[k]));
  [s.aggressor, s.defender].forEach(actor => Object.keys(actor).forEach(k => typeof actor[k] === "number" && (actor[k] = clamp(actor[k]))));
  s.control = clamp(s.control, -10, 10);
}

function result(text, effects, debug, cause, weight = 1) { return { text, effects, debug, cause, weight }; }
function totalDebt(s) { return clamp(s.threatDebt + s.statusPressure); }
function objectiveLabel(s) { return s.world.objective === "control" ? "контроль и проверка подчинения" : "получение вещи с минимальными издержками"; }
function exitRoute(s) { return +(6 - s.control + s.witnesses * .8 + s.immediateAllies * 2 + s.field * .6 + s.defender.allies * .1).toFixed(1); }
function repeatPressure(s) {
  const objective = s.world.objective === "control" ? 1.2 : -.4;
  return clamp(+(2 + s.futureDemand * .55 + s.memory.compliances * 1.5 + s.world.exploitation + objective - s.coalition * .8 - s.defender.institution * s.world.institutionQuality * .9 - s.evidence * .35 - s.defender.reputation * .18).toFixed(1));
}
function repeatRiskLabel(s) { const risk = repeatPressure(s); return risk < 3.5 ? "низкий" : risk < 6.5 ? "средний" : "высокий"; }
function repeatDrivers(s, revealObjective = false) {
  const drivers = [];
  if (s.memory.compliances > 0) drivers.push("успешные уступки ↑");
  if (s.currentDemand.id !== "notebook") drivers.push("цепочка требований ↑");
  if (revealObjective && s.world.objective === "control") drivers.push("цель контроля ↑");
  if (s.coalition > 0) drivers.push("коалиция ↓");
  if (s.defender.institution > 0) drivers.push("институт ↓");
  if (s.evidence > 0) drivers.push("доказательства ↓");
  if (s.defender.reputation >= 4) drivers.push("репутация границ ↓");
  return drivers.slice(0, 3).join(" · ") || "устойчивых сигналов пока мало";
}

function externalCost(s) {
  return +(s.witnesses * s.world.witnessReliability * WEIGHTS.witnesses + s.evidence * WEIGHTS.evidence + s.immediateAllies * 1.2 + s.defender.allies * .3 + s.coalition * .6 + s.defender.institution * s.world.institutionQuality * WEIGHTS.institution + s.aggressor.fear * WEIGHTS.aggressorFear).toFixed(1);
}
function pressure(s) {
  const credibility = (s.aggressor.reputation + s.aggressor.resolve) / 20;
  const complianceWeight = s.world.objective === "control" ? .55 : .18;
  return +(s.aggressor.power * credibility + s.uncertainty * WEIGHTS.uncertainty + Math.max(0, s.control) * WEIGHTS.control + totalDebt(s) * WEIGHTS.debt + s.memory.compliances * complianceWeight + s.aggressor.weapons * WEIGHTS.weapons).toFixed(1);
}
function futureBenefit(s) {
  const demandWeight = s.world.objective === "control" ? .55 : .30;
  return +(s.futureDemand * demandWeight + Math.max(0, 10 - s.autonomy) * WEIGHTS.lostAutonomy).toFixed(1);
}
function netIncentive(s) { return +(pressure(s) + futureBenefit(s) - externalCost(s) * WEIGHTS.costIncentive).toFixed(1); }
function stressLoad(s) { return Math.max(0, +(s.defender.fear - s.defender.selfControl - s.defender.resolve * .2).toFixed(1)); }
function formulaLine(s) { return `Pressure ${pressure(s)} + future benefit ${futureBenefit(s)} − external cost ${externalCost(s)}×${WEIGHTS.costIncentive} = net incentive ${netIncentive(s)}.`; }

function stressAftermath(s, action) {
  const overload = stressLoad(s);
  if (!action.assertive || overload < 2) return null;
  apply(s, { control: 1, psychologicalCost: 1 });
  return `Стресс-нагрузка = Fear ${s.defender.fear} − Self-Control ${s.defender.selfControl} − Resolve ${s.defender.resolve}×0.2 = ${overload}: точное действие далось труднее, Control +1 агрессору.`;
}

function finishOrOpenAfterScene(s) {
  if (repeatPressure(s) < 3.5) { s.outcome = "safe-exit"; return false; }
  s.pendingDecision = { type: "afterScene", prompt: "Вы вышли из опасной сцены. Что сделать сейчас, чтобы следующая встреча не повторила её?" };
  setAggressorMove(s, 0, "Сцена закончена", "Немедленной опасности больше нет");
  return true;
}

const ACTION_RULES = {
  comply(s) {
    const tactical = s.danger >= 6, demandLabel = s.currentDemand.label.toLowerCase();
    s.currentDemand.status = "complied"; s.demandHistory.push({ ...s.currentDemand }); s.currentThreat && (s.currentThreat.status = "closed_by_compliance");
    s.memory.compliances += 1; s.complianceProcessed = false;
    apply(s, { "defender.fear": -2, danger: -3, autonomy: -2, futureDemand: 2, "aggressor.reputation": 1, control: 2, longTermSafety: -1, psychologicalCost: 1, threatDebt: -s.threatDebt, statusPressure: -1 });
    if (tactical) apply(s, { physicalSafety: 1 });
    return result(tactical ? `Вы выполняете требование «${demandLabel}», выбирая безопасность в опасный момент. Это не поражение, но уступка создаёт прецедент.` : `Вы выполняете требование «${demandLabel}». Напряжение падает, но требование становится работающим правилом.`, ["Fear −2", "Danger −3", "Autonomy −2", "Future pressure +2"], `Уступка всегда снижает немедленную опасность. При Danger ≥ 6 она дополнительно защищает Physical Safety. Сейчас tactical=${tactical}.`, tactical ? "Уступка сохранила физическую безопасность в опасный момент." : "Уступка снизила риск сейчас, но усилила ожидаемую выгоду будущего давления.", 2);
  },
  defer(s) {
    s.memory.deferrals += 1;
    const repeated = s.memory.deferrals > 1;
    apply(s, { control: repeated ? 1 : -1, "defender.fear": repeated ? 0 : -1, futureDemand: repeated ? 1 : 0, psychologicalCost: 1 });
    const text = s.currentThreat?.status === "active" ? "Вы предлагаете закончить сцену без последствий. Немедленного подчинения нет, но вы убираете публичный вызов." : repeated ? "Вы снова откладываете ответ. Та же тактика уже не возвращает темп: Старший начинает читать паузу как отсутствие границы." : "Вы отвечаете: «Потом покажу». Немедленного подчинения нет, но и открытого вызова тоже: теперь важно, примет ли Старший потерю темпа.";
    return result(text, [repeated ? "Control +1" : "Control −1", repeated ? "Future pressure +1" : "Fear −1", "Требование остаётся активным"], `Мягкий ответ не закрывает Demand. Повторная отсрочка=${repeated}: её эффективность снижается, а ожидание будущего подчинения может расти.`, repeated ? "Повтор отсрочки начал работать как отсутствие устойчивой границы." : "Пауза снизила темп давления, не превращая ответ в публичное соревнование.", repeated ? 1 : 2);
  },
  reciprocal(s) {
    s.currentDemand.status = "refused";
    apply(s, { autonomy: 1, control: -1, escalation: 1, "defender.reputation": 1, psychologicalCost: 1 });
    const text = s.currentThreat?.status === "active" ? "Вы называете происходящее прямо: «Это угроза. Я не согласен». Сила ответа соразмерна ходу, хотя статусный риск остаётся." : "Вы отвечаете условием той же силы: «Тогда сначала дай мне свой». Требование перестаёт выглядеть односторонним правилом.";
    return result(text, ["Autonomy +1", "Control −1", "Escalation +1", "Равная ставка"], "Соразмерный ответ сохраняет автономию. Его опасность зависит не от силы самой реплики, а от разрыва власти и чувствительности агрессора к статусу.", "Вы симметрично вернули условие, но Старший может прочитать равенство как статусный вызов.", 3);
  },
  refuse(s) {
    const support = +(s.witnesses * s.world.witnessReliability + s.immediateAllies * 1.5 + s.defender.allies * .3 + s.defender.institution * s.world.institutionQuality + s.evidence * .3).toFixed(1);
    const exposed = support < 4.5;
    s.currentDemand.status = "refused";
    apply(s, { "defender.fear": exposed ? 2 : -1, autonomy: 1, control: exposed ? 1 : -2, escalation: 1, danger: exposed ? 3 : 0, "defender.reputation": 1, psychologicalCost: 1, statusPressure: s.witnesses > 0 ? 1 : 0 });
    return result(exposed ? "Вы отказываете без достаточной видимой опоры. Граница ясна, но теперь Старшему выгодно ответить угрозой." : "Вы отказываете, и за словами уже видна опора. Публичный отказ повышает цену следующего хода для Старшего.", ["Autonomy +1", `Support ${support}`, `Danger ${signed(exposed ? 3 : 0)}`, "Угроза вероятнее"], `Опора отказа = witnesses×reliability + immediate allies×1.5 + allies×0.3 + institution×quality + evidence×0.3 = ${support}. Сам отказ не создаёт Threat Debt.`, exposed ? "Прямой отказ без достаточной опоры повысил риск угрозы, но ещё не создал долга угрозы." : "Опора превратила отказ из вызова в достоверную границу.", exposed ? 1 : 3);
  },
  delay(s) {
    const gain = s.turn >= 4 ? 2 : 1, people = s.world.witnessReliability >= .7 ? 1 : 0;
    apply(s, { control: -gain, "defender.fear": -1, witnesses: people, uncertainty: -1, psychologicalCost: 1 });
    return result(people ? "Вы задаёте вопросы и выигрываете время. У открытой двери задерживается ученик." : "Вы выигрываете время, но проходящие мимо пока не хотят вмешиваться.", [`Control ${signed(-gain)}`, `Witnesses +${people}`, "Uncertainty −1", "Psychological cost +1"], `Ценность времени=${gain}; свидетель зависит от скрытой готовности окружения ${s.world.witnessReliability.toFixed(2)}.`, people ? "Время добавило наблюдателя и уменьшило частный контроль сцены." : "Время снизило темп, но не гарантировало поддержку.", 1);
  },
  leave(s) {
    const route = exitRoute(s);
    if (route >= 5) {
      apply(s, { control: -3, danger: -3, "defender.fear": -2, autonomy: 1 });
      const afterScene = finishOrOpenAfterScene(s);
      return result(afterScene ? "Вы выходите к людной лестнице. Опасная сцена закончена, но средний риск повторения оставляет один стратегический ход после неё." : "Вы выходите к людной лестнице. Низкий риск повторения позволяет завершить конфликт на этом.", ["Safe exit", "Danger −3", "Autonomy +1", afterScene ? "После сцены: 1 ход" : "Repeat risk низкий"], `Маршрут = 6 − control + witnesses×0.8 + immediate allies×2 + field×0.6 + long-term allies×0.1 = ${route}; нужен ≥ 5. Repeat pressure=${repeatPressure(s)}.`, afterScene ? "Немедленная безопасность достигнута; теперь нужен ход против повторения." : "Выход и накопленная опора сделали продолжение маловероятным.", 3);
    }
    apply(s, { control: 2, danger: 2, "defender.fear": 2, escalation: 1, physicalSafety: -1 });
    return result("Он блокирует путь. Попытка выйти показала, что пространство пока контролирует он.", ["Control +2", "Danger +2", "Fear +2", "Safety −1"], `Маршрут ${route} < 5: контроль и изоляция перевесили доступные пути.`, "Попытка выхода при высоком Control оказалась рискованной.", 1);
  },
  witnesses(s) {
    const gain = s.world.witnessReliability >= .72 ? 2 : 1;
    const backlash = s.aggressor.resolve >= 7 && s.field === 0 ? 1 : 0;
    s.memory.publicMoves += 1;
    apply(s, { witnesses: gain, field: 1, uncertainty: -1, control: -2, "defender.fear": -1, longTermSafety: 1, danger: backlash, statusPressure: s.currentThreat?.status === "active" ? 1 : 0 });
    return result(backlash ? "Вы делаете сцену заметной. Люди смотрят, но Старший воспринимает это как публичный вызов." : "Вы смещаетесь к открытой двери и говорите громче. Давление больше не полностью частное.", [`Witnesses +${gain}`, "External Cost растёт", "Control −2", `Danger ${signed(backlash)}`], `Свидетели зависят от скрытой надёжности ${s.world.witnessReliability.toFixed(2)}. При resolve ≥ 7 краткосрочный Danger +1.`, "Конфликт стал публичнее, поэтому открытое давление подорожало.", 2);
  },
  document(s) {
    const gain = 1 + (s.witnesses >= 2 ? 1 : 0) + (s.world.witnessReliability >= .82 ? 1 : 0);
    const detected = s.world.detection >= (s.witnesses > 0 ? 3 : 2);
    apply(s, { evidence: gain, uncertainty: -1, control: -1, danger: detected ? 1 : 0, "defender.fear": detected ? 1 : 0, longTermSafety: 1 });
    return result(detected ? "Вы фиксируете требование. Старший замечает это: доказательство сохранится, но напряжение растёт." : "Вы фиксируете требование незаметно. Теперь у конфликта есть след, который останется после сцены.", [`Evidence +${gain}`, "External Cost растёт", `Danger ${signed(detected ? 1 : 0)}`, "Uncertainty −1"], `Evidence = 1 + bonus witnesses + bonus reliability = ${gain}. Detection ${s.world.detection}, порог ${s.witnesses > 0 ? 3 : 2}: detected=${detected}.`, "Доказательство сохранило информацию за пределами текущей сцены.", gain);
  },
  appeal(s) {
    const score = +(s.evidence * 1.4 + s.witnesses * s.world.witnessReliability + s.defender.reputation * .3 + s.world.institutionQuality * 4 - s.aggressor.reputation * .25 - s.appealPenalty).toFixed(1);
    if (score >= 7.5 && s.world.institutionQuality >= .72) {
      s.memory.institutionWorked += 1;
      apply(s, { "defender.institution": 4, control: -3, "defender.allies": 1, "defender.fear": -1, "aggressor.fear": 2, longTermSafety: 4, danger: -2, field: 3 }); s.outcome = "institutional";
      return result("Свидетельства и детали дают взрослому основания действовать. Стороны разводят, обращение фиксируют, повторение будет иметь последствия.", ["Institution +4", "Danger −2", "Control −3", "Institutional resolution"], `Appeal score=${score}; сильный порог 7.5; quality=${s.world.institutionQuality.toFixed(2)}.`, "Накопленные основания превратились в устойчивое институциональное вмешательство.", 4);
    }
    if (score >= 4.5) {
      s.memory.institutionWorked += 1;
      apply(s, { "defender.institution": 2, control: -2, "defender.allies": 1, "defender.fear": -1, longTermSafety: 2, danger: -1, field: 1 }); s.outcome = "temporary-institutional";
      return result("Взрослый временно разводит вас и обещает разобраться. Текущая сцена закончена, но риск следующей встречи остаётся.", ["Encounter ends", "Institution +2", "Danger −1", "Long-term safety +2"], `Appeal score ${score}: частичное вмешательство при 4.5–7.49; quality=${s.world.institutionQuality.toFixed(2)}.`, "Взрослый физически завершил эту встречу; стратегическая проблема перенесена в следующий encounter.", 3);
    }
    apply(s, { "defender.institution": 1, control: -1, psychologicalCost: 1, danger: 1 });
    return result("Взрослый воспринимает это как обычную ссору и советует «просто разойтись». След обращения остаётся, но защита пока слабая.", ["Institution +1", "Danger +1", "Psychological cost +1", "Нужны основания"], `Appeal score ${score} < 4.5: оснований недостаточно.`, "Слабое обращение показало ограничения института и необходимость оснований.", 1);
  },
  coalition(s) {
    const nearby = s.witnesses > 0 ? 1 : 0;
    apply(s, { immediateAllies: nearby, coalition: 1, witnesses: nearby ? -1 : 0, control: nearby ? -1 : 1, danger: nearby ? 0 : 1, longTermSafety: 2, "defender.fear": -1, futureDemand: -1 });
    return result(nearby ? "Один свидетель встаёт рядом, а вы договариваетесь дальше ходить вместе. Это малая помощь сейчас и начало защиты на будущее." : "Вы отправляете сообщение и начинаете договариваться о совместной защите. Прямо сейчас рядом никто не появился, а разговор занял время.", [`Immediate Ally +${nearby}`, "Coalition +1 next encounter", `Control ${signed(nearby ? -1 : 1)}`, "Long-term safety +2"], `В текущей сцене Coalition даёт максимум одного Immediate Ally и только при наличии свидетеля; nearby=${nearby}.`, "Началась коллективная защита для следующих встреч, но её текущий ресурс ограничен.", 3);
  },
  boundary(s) {
    const support = +(s.witnesses * s.world.witnessReliability + s.immediateAllies * 1.5 + s.defender.allies * .3 + s.defender.reputation).toFixed(1), credible = support >= 4.5;
    s.currentDemand.status = "refused";
    if (!credible) s.memory.emptyBoundaries += 1;
    apply(s, { autonomy: 1, "defender.reputation": credible ? 1 : -1, control: credible ? -2 : 0, escalation: credible ? 0 : 1, "defender.fear": credible ? -1 : 1, statusPressure: !credible && s.witnesses > 0 ? 1 : 0 });
    return result(credible ? "Вы коротко называете границу — и за словами видна опора." : "Вы называете границу. Она сохраняет автономию, но без видимой опоры повышает вероятность проверки.", ["Autonomy +1", credible ? "Reputation +1" : "Reputation −1", `Support ${support}`, credible ? "Граница достоверна" : "Угроза вероятнее"], `Достоверность = witnesses×reliability + immediate allies×1.5 + allies×0.3 + reputation = ${support}; нужен ≥ 4.5. Граница не создаёт Threat Debt.`, credible ? "Граница стала достоверной благодаря внешней опоре." : "Граница сохранила автономию, но создала риск проверки.", credible ? 2 : 1);
  },
  strongCounter(s) {
    const faceBacklash = s.world.needForFace >= .7 && s.witnesses === 0 ? 2 : 1;
    s.currentDemand.status = "refused"; s.memory.publicMoves += 1;
    apply(s, { autonomy: 1, witnesses: 1, evidence: 1, field: 1, control: -2, danger: faceBacklash, statusPressure: 1, longTermSafety: 1 });
    return result("Вы вслух повторяете требование и фиксируете его. Давление становится наблюдаемым и оставляет доказательство для следующего шага.", ["Witnesses +1", "Evidence +1", "Control −2", `Danger +${faceBacklash}`], `Сильная контрмера сразу повышает External Cost. Краткий Danger +${faceBacklash} зависит от Need for Face ${s.world.needForFace.toFixed(2)}.`, "Сильный ответ не победил автоматически: он купил долгосрочную опору ценой краткосрочного риска публичной потери лица.", 4);
  },
  deescalate(s) {
    apply(s, { escalation: -1, danger: -2, control: -1, "defender.fear": -1, autonomy: s.autonomy < 4 ? -1 : 0 });
    return result("Вы не соглашаетесь, но предлагаете закончить разговор без публичного вызова. Температура снижается.", ["Escalation −1", "Danger −2", "Fear −1", "Control −1"], `Деэскалация не добавляет долгосрочных ресурсов. Autonomy modifier=${s.autonomy < 4 ? -1 : 0}.`, "Деэскалация купила безопасность, не разрешив структуру давления.", 1);
  },
  observe(s) {
    s.observations += 1;
    let signal;
    if (s.currentThreat?.status === "active") {
      signal = s.world.bluff >= .68 ? "Угроза остаётся расплывчатой и меняется в деталях — признаки блефа заметны." : "Он повторяет одно последствие без колебаний; угроза выглядит подготовленной.";
      s.intel.bluff = s.world.bluff >= .68 ? "вероятен" : "маловероятен";
      s.intel.resolve = s.world.resolve >= 7 ? "скорее высокая" : "ограниченная";
    } else if (s.witnesses > 0) {
      signal = s.world.needForFace >= .65 ? "При чужих взглядах он заметно жёстче: публичная потеря лица для него важна." : "Свидетели заставляют его осторожничать, а не демонстрировать жёсткость.";
      s.intel.face = s.world.needForFace >= .65 ? "высокая чувствительность" : "умеренная чувствительность";
      s.intel.fear = s.world.fearOfInstitution >= .65 ? "боится последствий" : "слабо реагирует";
      s.intel.institutionSensitivity = s.world.fearOfInstitution >= .65 ? "высокая" : "низкая";
    } else if (s.observations === 1) {
      if (s.world.alliesNear === 0) { signal = "Похоже, его друзья сейчас не рядом."; s.intel.allies = "скорее никого"; }
      else { signal = "Он смотрит в конец коридора, будто ждёт своих."; s.intel.allies = "возможны рядом"; }
    } else if (s.observations === 2) {
      if (s.world.fear >= 4) { signal = "Он следит за дверью учительской чаще, чем за вами."; s.intel.fear = "боится последствий"; }
      else { signal = "Он почти не реагирует на возможное вмешательство."; s.intel.fear = "выглядит низким"; }
      s.intel.resolve = s.world.resolve >= 7 ? "скорее высокая" : s.world.resolve <= 4 ? "скорее низкая" : "неясная";
    } else {
      signal = s.world.bluff >= .7 ? "Формулировки угрозы меняются: есть признаки блефа." : "Он повторяет одно условие без заметных колебаний.";
      s.intel.weapons = "признаков не видно";
    }
    s.signals.unshift(signal);
    apply(s, { uncertainty: -2, "defender.fear": -1, control: 1, psychologicalCost: 1 });
    return result(`Вы наблюдаете за руками, взглядом и окружением. ${signal}`, ["Uncertainty −2", "Fear −1", "Control +1", "Контекстный сигнал"], `Сигнал выбран из текущего контекста: threat=${s.currentThreat?.status || "none"}, witnesses=${s.witnesses}, observation=${s.observations}.`, "Наблюдение заменило часть неопределённого страха проверяемой гипотезой.", 2);
  },
  offerExit(s) {
    const cost = externalCost(s), threshold = 7 + (s.world.needForFace >= .7 && s.witnesses > 0 ? 1.5 : 0);
    if (totalDebt(s) > 0 && cost >= threshold) {
      apply(s, { escalation: -2, danger: -3, control: -3, "defender.fear": -2, longTermSafety: 2, statusPressure: -s.statusPressure, threatDebt: -s.threatDebt }); s.outcome = "face-saving";
      return result("Вы оставляете нейтральный повод закончить разговор. Старший отступает, не объявляя себя проигравшим.", ["Face-saving exit", "Danger −3", "Status Pressure снят", "Long-term safety +2"], `Нужно totalDebt>0 и cost ${cost} ≥ threshold ${threshold}; needForFace=${s.world.needForFace}.`, "Высокая цена и нейтральный повод позволили снять репутационное давление без новой эскалации.", 4);
    }
    apply(s, { control: 1, "defender.fear": 1, autonomy: -1 });
    return result("Цена продолжения для него ещё недостаточна. Предложение звучит как просьба.", ["Control +1", "Fear +1", "Autonomy −1"], `Exit failed: totalDebt=${totalDebt(s)}; cost=${cost}; threshold=${threshold}.`, "Предложение выхода появилось раньше, чем агрессору стало выгодно его принять.", 1);
  }
};

const CONTEXT_ACTIONS = {
  isolation: [
    { id: "stayPublic", icon: "□", name: "Остаться здесь", hint: "Не отдавать агрессору выбор места", risk: 2, profile: ["Witnesses сохраняются", "+ Autonomy", "+ Status Pressure"] },
    { id: "goIsolated", icon: "→", name: "Пойти", hint: "Снизить публичный вызов ценой изоляции", risk: 3, profile: ["− Witnesses", "+ Danger", "+ Control агрессору"] },
    { id: "bringPerson", icon: "⋈", name: "Позвать с собой", hint: "Превратить свидетеля в непосредственную опору", risk: 1, profile: ["+ Immediate Ally", "поле остаётся видимым"] },
    { id: "inspectIsolation", icon: "◇", name: "Сначала осмотреться", hint: "Понять, ждёт ли кто-то за лестницей", risk: 1, profile: ["− Uncertainty", "+ время агрессору"] },
    { id: "leaveOther", icon: "↗", name: "Уйти в другую сторону", hint: "Отказаться и от изоляции, и от спора", risk: 2, profile: ["возможен Safe Exit", "зависит от Control"] }
  ],
  newDemand: [
    { id: "complyNew", icon: "↓", name: "Выполнить новое требование", hint: "Закончить сцену сейчас, подтвердив ожидание подчинения", risk: 1, profile: ["− Danger", "− Autonomy", "+ Repeat Pressure"] },
    { id: "refuseNew", icon: "—", name: "Остановить цепочку", hint: "Отказать уже после первой уступки", risk: 3, profile: ["+ Autonomy", "+ Danger", "угроза вероятнее"] },
    { id: "delayNew", icon: "◷", name: "Не отвечать сразу", hint: "Выиграть время и показать, что уступка не стала правилом", risk: 2, profile: ["− Control", "− Expected Compliance"] },
    { id: "publicizeNew", icon: "◎", name: "Повторить вслух", hint: "Сделать новое требование слышимым другим", risk: 2, profile: ["+ Witnesses", "+ Evidence", "+ Status Pressure"] }
  ],
  afterScene: [
    { id: "preserveEvidence", icon: "▣", name: "Сохранить свидетельства", hint: "Записать детали, пока они свежи", risk: 1, profile: ["+ Evidence", "− Repeat Risk"] },
    { id: "buildCoalitionAfter", icon: "⋈", name: "Договориться ходить вместе", hint: "Создать опору для следующей встречи", risk: 1, profile: ["+ Coalition", "+ Long-term safety"] },
    { id: "appealAfter", icon: "⌂", name: "Рассказать взрослому", hint: "Оставить институциональный след", risk: 1, profile: ["+ Institution", "качество реакции различается"] },
    { id: "doNothingAfter", icon: "—", name: "Ничего не делать", hint: "Закончить день без дополнительного шага", risk: 2, profile: ["ресурсы не меняются", "Repeat Risk сохраняется"] }
  ]
};

function resolveContext(s, id) {
  const type = s.pendingDecision?.type;
  if (type === "isolation") {
    if (id === "stayPublic") {
      s.pendingDecision = null; s.memory.publicMoves += 1;
      apply(s, { autonomy: 1, control: -1, statusPressure: 1 });
      return result("Вы остаётесь у открытой двери: «Говори здесь». Свидетели сохраняются, а попытка изоляции становится видна.", ["Witnesses сохраняются", "Autonomy +1", "Control −1", "Status Pressure +1"], "Ответ на изоляцию: поле не отдано агрессору.", "Защитник сохранил публичное поле, превратив выбор места в часть границы.", 4);
    }
    if (id === "goIsolated") {
      const lost = s.witnesses; s.pendingDecision = null;
      apply(s, { witnesses: -lost, field: -s.field, control: 2, danger: 2, "defender.fear": 1, autonomy: -1 });
      return result("Вы отходите за лестницу. Публичное напряжение падает, но теперь он снова контролирует пространство и темп.", [`Witnesses −${lost}`, "Danger +2", "Control +2", "Autonomy −1"], "Согласие на смену места применило изоляцию только после выбора игрока.", "Защитник отдал агрессору выгодное поле, снизив публичный вызов ценой безопасности.", 2);
    }
    if (id === "bringPerson") {
      s.pendingDecision = null;
      apply(s, { witnesses: -1, immediateAllies: 1, field: 1, control: -1, "defender.fear": -1 });
      return result("Вы зовёте одного из свидетелей с собой. Разговор может переместиться, но один человек остаётся непосредственной опорой.", ["Immediate Ally +1", "Witnesses −1", "Control −1", "Fear −1"], "Свидетель преобразован в непосредственного союзника; изоляция не состоялась.", "Защитник изменил предложенное поле: не отказался от движения, но не остался один.", 4);
    }
    if (id === "inspectIsolation") {
      if (s.pendingDecision.inspected) return { ...result("Вы уже проверили пространство. Теперь нужно выбрать, где и с кем продолжится сцена.", ["Нужно принять решение"], "Повторный Inspect заблокирован для этой дилеммы.", "Полученной информации достаточно; дальнейшее ожидание только отдало бы темп агрессору.", 0), keepPending: true };
      const signal = s.world.alliesNear > 0 ? "За лестницей мелькают его знакомые — идти туда заметно опаснее." : "За лестницей никого не видно, но вы потеряете текущих свидетелей.";
      s.pendingDecision.inspected = true;
      s.signals.unshift(signal); apply(s, { uncertainty: -1, control: 1, psychologicalCost: 1 });
      return { ...result(`Вы не двигаетесь сразу и оцениваете пространство. ${signal}`, ["Uncertainty −1", "Control +1", "Решение остаётся открытым"], "Контекстное наблюдение уточнило именно риск предлагаемого места.", "Защитник купил более точную оценку поля ценой времени.", 2), keepPending: true };
    }
    if (id === "leaveOther") {
      const route = exitRoute(s);
      s.pendingDecision = null;
      if (route >= 5) { apply(s, { danger: -3, control: -2, "defender.fear": -2 }); const afterScene = finishOrOpenAfterScene(s); return { ...result(afterScene ? "Вы уходите к другой лестнице. Сцена закончена; остаётся один стратегический ход против повторения." : "Вы безопасно покидаете сцену, а накопленная опора делает повторение маловероятным.", ["Safe Exit", "Danger −3", afterScene ? "После сцены: 1 ход" : "Repeat risk низкий"], `Route=${route} ≥ 5; repeat pressure=${repeatPressure(s)}.`, "Защитник вышел из сцены; дальнейшая работа зависит от риска повторения.", 4), skipAggressor: true }; }
      apply(s, { control: 1, danger: 1, "defender.fear": 1 });
      return result("Он успевает снова перекрыть путь. Маршрут выхода пока недостаточно свободен.", ["Control +1", "Danger +1", "Fear +1"], `Route=${route} < 5.`, "Попытка выхода показала, что пространство ещё контролирует агрессор.", 1);
    }
  }
  if (type === "newDemand") {
    s.pendingDecision = null;
    if (id === "complyNew") {
      s.currentDemand.status = "complied"; s.demandHistory.push({ ...s.currentDemand }); s.memory.compliances += 1; s.complianceProcessed = true;
      apply(s, { danger: -2, "defender.fear": -1, autonomy: -2, futureDemand: 2, longTermSafety: -2, control: 1 }); s.outcome = "temporary-release";
      return result("Вы выполняете и второе требование. Сцена заканчивается без нового ущерба, но ожидание будущего подчинения резко укрепляется.", ["Danger −2", "Autonomy −2", "Repeat Pressure +2", "Scene ends"], "Вторая уступка закрыла новое требование и увеличила память Expected Compliance.", "Повторная уступка завершила сцену, но приблизила систему контроля.", 4);
    }
    if (id === "refuseNew") {
      s.currentDemand.status = "refused";
      apply(s, { autonomy: 1, danger: 2, "defender.fear": 1, statusPressure: s.witnesses > 0 ? 1 : 0 });
      return result("Вы отделяете первую уступку от общего правила: «Больше ничего». Новое требование встречает явный отказ.", ["Autonomy +1", "Danger +2", "Угроза вероятнее"], "Отказ относится к новому Demand ID и сам по себе не создаёт Threat Debt.", "Защитник остановил превращение разовой уступки в открытую цепочку требований.", 4);
    }
    if (id === "delayNew") {
      s.memory.compliances = Math.max(0, s.memory.compliances - 1);
      apply(s, { control: -1, uncertainty: -1, futureDemand: -1, psychologicalCost: 1 });
      return result("Вы не отвечаете автоматически и начинаете собирать вещи. Связь «давление → немедленное подчинение» становится менее надёжной.", ["Control −1", "Future Pressure −1", "Expected Compliance −1"], "Задержка уменьшила память агрессора об автоматическом подчинении.", "Пауза разорвала темп новой проверки границы.", 3);
    }
    if (id === "publicizeNew") {
      s.memory.publicMoves += 1;
      apply(s, { witnesses: 1, evidence: 1, control: -2, statusPressure: 2, danger: 1 });
      return result("Вы громко повторяете новое требование: «Ты уже взял блокнот, а теперь хочешь, чтобы я нёс рюкзак?» Смена цели становится очевидной окружающим.", ["Witnesses +1", "Evidence +1", "Control −2", "Status Pressure +2"], "Новое требование стало публичным доказательством расширения контроля.", "Защитник сделал видимой саму цепочку требований, увеличив внешнюю цену и публичную ставку.", 4);
    }
  }
  if (type === "afterScene") {
    s.pendingDecision = null;
    if (id === "preserveEvidence") apply(s, { evidence: 2, longTermSafety: 1, futureDemand: -1 });
    if (id === "buildCoalitionAfter") apply(s, { coalition: 2, "defender.allies": 1, longTermSafety: 2, futureDemand: -1 });
    if (id === "appealAfter") {
      const worked = s.world.institutionQuality >= .62 || s.evidence >= 2;
      apply(s, { "defender.institution": worked ? 2 : 1, longTermSafety: worked ? 2 : 1, futureDemand: worked ? -1 : 0 });
    }
    s.outcome = "safe-exit";
    const texts = {
      preserveEvidence: "Вы записываете детали и сохраняете свидетельства. Следующая встреча уже не начнётся с нуля.",
      buildCoalitionAfter: "Вы договариваетесь ходить вместе. Разовый выход превращается в более устойчивую защиту.",
      appealAfter: "Вы рассказываете взрослому и оставляете формальный след, даже если реакция пока неидеальна.",
      doNothingAfter: "Вы заканчиваете день без дополнительного шага. Опасность сейчас миновала, но структура следующей встречи почти не изменилась."
    };
    return { ...result(texts[id], ["После сцены завершено", `Repeat risk: ${repeatRiskLabel(s)}`], `Post-scene action=${id}; repeat pressure=${repeatPressure(s)}.`, "После безопасного выхода игрок отдельно выбрал, что останется к следующей встрече.", id === "doNothingAfter" ? 1 : 4), skipAggressor: true };
  }
  return result("Ситуация не изменилась.", [], "Unknown context action.", "", 0);
}

function setAggressorMove(s, strength, label, text) {
  s.aggressorMove = { strength, label, text };
}

function aggressorResponse(s, playerAction = null) {
  if (s.outcome) return result("Текущая сцена завершена.", [], formulaLine(s), "", 0);
  const cost = externalCost(s), hiddenActionRisk = playerAction ? actualRiskValue(playerAction, s) : 0;
  const net = +(netIncentive(s) + Math.max(0, hiddenActionRisk - 2.5) * .25).toFixed(1);
  if (s.currentDemand.status === "complied" && !s.complianceProcessed) {
    s.complianceProcessed = true;
    const objectiveBias = s.world.objective === "control" ? .24 : -.22;
    const repeatScore = +(s.world.exploitation + s.memory.compliances * .10 + objectiveBias).toFixed(2);
    const pressesAgain = repeatScore >= .70;
    if (!pressesAgain) {
      apply(s, { control: -1, danger: -2, "aggressor.fear": 1 }); s.outcome = "temporary-release";
      setAggressorMove(s, 0, "Отступление", "Он заканчивает текущую сцену");
      return result("Он забирает блокнот и отпускает вас. Текущая опасность закончилась, но успешное давление повысило риск повторения.", ["Scene ends", "Danger −2", "Repeat pressure остаётся"], `${formulaLine(s)} Repeat score=${repeatScore}: exploitation ${s.world.exploitation} + compliance ${s.memory.compliances}×0.10 + objective bias ${objectiveBias} < 0.70.`, s.world.objective === "material" ? "Его целью была вещь с минимальными издержками; получив её, он закончил сцену." : "Даже при цели контроля склонность продолжать оказалась недостаточной, но уступка осталась в памяти.", 3);
    }
    s.currentDemand = { ...s.possibleNextDemand, status: "active", objective: "проверить, распространяется ли подчинение дальше" };
    s.currentThreat = null;
    s.pendingDecision = { type: "newDemand", prompt: "Получив блокнот, он сразу проверяет новую границу: «Теперь понеси мой рюкзак до выхода»." };
    apply(s, { futureDemand: 1, control: 1, danger: 1 });
    setAggressorMove(s, 2, "Новое требование", "«Теперь понеси мой рюкзак до выхода»");
    return result(s.pendingDecision.prompt, ["Новое требование", "Future pressure +1", "Control +1"], `${formulaLine(s)} Repeat score=${repeatScore}: exploitation ${s.world.exploitation} + compliance ${s.memory.compliances}×0.10 + objective bias ${objectiveBias} ≥ 0.70.`, s.world.objective === "control" ? "Цель контроля и успешная уступка сделали проверку следующей границы естественным продолжением стратегии." : "Материальная цель уже выполнена, но очень высокая склонность к эксплуатации подтолкнула его расширить требование.", 4);
  }
  if (cost >= 13 && totalDebt(s) <= 1) {
    apply(s, { control: -3, danger: -2, "aggressor.fear": 2, escalation: -1, longTermSafety: 1 }); s.outcome = "deterrence";
    setAggressorMove(s, 0, "Отступление", "Цена продолжения стала слишком высокой");
    return result("Старший оценивает последствия и прекращает давление. Продолжение больше не окупается.", ["Агрессор отступает", "Control −3", "Danger −2"], `${formulaLine(s)} Cost ≥ 13 и Debt ≤ 1 → отступление.`, "Высокая внешняя цена сделала продолжение давления невыгодным.", 3);
  }
  if (cost >= 8 && totalDebt(s) >= 2) {
    apply(s, { danger: -1, control: -1, "aggressor.fear": 1 });
    setAggressorMove(s, 2, "Повтор угрозы", "Он повторяет условие, но не усиливает его");
    return result("Он повторяет условие, но не усиливает его. Высокая цена мешает эскалации, а угроза — простому отступлению.", ["Aggressor Fear +1", "Danger −1", "Доступен Face-Saving Exit"], `${formulaLine(s)} Cost высокий, totalDebt=${totalDebt(s)}: поиск выхода.`, "Долг угрозы и публичная ставка заперли агрессора между дорогой эскалацией и потерей лица.", 2);
  }
  if (playerAction?.id === "defer" && s.currentThreat?.status !== "active") {
    const willingness = s.world.resolve * .38 + s.world.exploitation * 3 + Math.max(0, s.control) * .22 + (s.world.objective === "control" ? 1.2 : 0);
    if (s.world.objective === "material" && s.world.exploitation < .48) {
      apply(s, { control: -1, danger: -1, "aggressor.fear": 1 });
      setAggressorMove(s, 0, "Согласие подождать", "«Ладно, потом»");
      return result("Он пожимает плечами: «Ладно, потом». Мягкая отсрочка сработала сейчас, хотя требование не исчезло навсегда.", ["Control −1", "Danger −1", "Пауза в давлении"], `${formulaLine(s)} Defer: material objective и exploitation ${s.world.exploitation.toFixed(2)} < .48.`, "Материальная цель не стоила немедленной эскалации.", 2);
    }
    if (s.aggressor.resolve <= 5 && willingness < 4.8) {
      apply(s, { control: 1, "defender.fear": 1 });
      setAggressorMove(s, 1, "Повтор просьбы", "«Сейчас покажи, я быстро»");
      return result("Он повторяет просьбу: «Сейчас покажи, я быстро», — пытаясь сохранить будничный тон без угрозы.", ["Control +1", "Fear +1", "Требование повторено"], `${formulaLine(s)} Defer willingness ${willingness.toFixed(1)} < 4.8 при Resolve ${s.aggressor.resolve}.`, "Агрессор попробовал дожать прежним способом вместо повышения ставки.", 1);
    }
    if (s.world.needForFace >= .72 && s.aggressor.resolve < 7) {
      apply(s, { statusPressure: 1, "defender.fear": 1 });
      setAggressorMove(s, 1, "Насмешка", "Он высмеивает попытку отложить ответ");
      return result("Он усмехается над попыткой отложить ответ, но прямой угрозы не произносит.", ["Status Pressure +1", "Fear +1", "Насмешка"], `${formulaLine(s)} Need for Face ${s.world.needForFace.toFixed(2)}: мягкое уклонение вызвало статусную реакцию без Threat Debt.`, "Он защищает статус насмешкой, не связывая себя угрозой.", 1);
    }
    if (willingness < 6.1) {
      apply(s, { control: 1, uncertainty: 1 });
      setAggressorMove(s, 1, "Давление без угрозы", "Он остаётся рядом и требует ответить сейчас");
      return result("Он остаётся рядом и требует ответить сейчас, но пока не формулирует последствие.", ["Control +1", "Uncertainty +1", "Давление без угрозы"], `${formulaLine(s)} Defer willingness ${willingness.toFixed(1)} < 6.1.`, "Мягкое уклонение пригласило дальнейшее давление, но не гарантировало угрозу.", 1);
    }
  }
  if (s.currentDemand.status === "refused" && totalDebt(s) === 0) {
    const challenge = playerAction?.challenge || 0;
    if (cost >= 6 && s.aggressor.resolve <= 6) {
      apply(s, { control: -1, danger: -1, "aggressor.fear": 1 });
      setAggressorMove(s, 0, "Временное отступление", "Он делает вид, что ему всё равно, и отходит на шаг");
      return result("Он делает вид, что ему всё равно, и отходит на шаг. Это пауза, а не гарантированный конец давления.", ["Control −1", "Danger −1", "Временное отступление"], `${formulaLine(s)} Refusal branch: cost ${cost} ≥ 6, Resolve ${s.aggressor.resolve} ≤ 6.`, "Внешняя цена позволила временно отступить без исполнения угрозы.", 2);
    }
    if (s.witnesses > 0 && s.world.needForFace >= .68 && challenge >= 1) {
      apply(s, { statusPressure: 1, "defender.fear": 1, danger: 1 });
      setAggressorMove(s, 2, "Насмешка при свидетелях", "Он переводит отказ в публичную насмешку");
      return result("Он не угрожает напрямую, а высмеивает ваш ответ при свидетелях, пытаясь вернуть статус без физического шага.", ["Status Pressure +1", "Fear +1", "Danger +1", "Смена тактики"], `${formulaLine(s)} Need for Face ${s.world.needForFace.toFixed(2)} и challenge ${challenge}: публичность одновременно защищает и повышает статусную ставку.`, "Публичность подняла внешнюю цену насилия, но сделала потерю лица болезненнее.", 2);
    }
    if (s.world.objective === "material" && challenge <= 1) {
      apply(s, { control: 1, "defender.fear": 1 });
      setAggressorMove(s, 1, "Повтор требования", "Он снова просит блокнот, уже менее буднично");
      return result("Он повторяет просьбу уже менее буднично: «Дай на минуту, чего ты начинаешь?» Угрозы пока нет.", ["Control +1", "Fear +1", "Требование повторено"], `${formulaLine(s)} Материальная цель и challenge ${challenge} делают повтор дешевле угрозы.`, "Агрессор попробовал ту же тактику ещё раз вместо немедленной эскалации.", 1);
    }
    if (challenge < 1.6 && s.aggressor.resolve < 7) {
      apply(s, { uncertainty: 1, control: 1 });
      setAggressorMove(s, 1, "Смена тактики", "Он объявляет всё шуткой, но остаётся рядом");
      return result("Он усмехается: «Да ладно, я просто спросил», — но остаётся рядом и смотрит, сохраните ли вы границу.", ["Uncertainty +1", "Control +1", "Смена тактики"], `${formulaLine(s)} Challenge ${challenge} и Resolve ${s.aggressor.resolve}: выгоднее переопределить сцену, чем угрожать.`, "Он временно сменил прямое давление на двусмысленную проверку.", 1);
    }
  }
  if (s.witnesses > 0 && s.field < 3 && s.aggressor.resolve >= 6 && s.control >= -2 && !s.isolationAttempted) {
    s.isolationAttempted = true;
    s.pendingDecision = { type: "isolation", inspected: false, prompt: "Он требует отойти за лестницу, подальше от тех, кто сейчас видит сцену." };
    setAggressorMove(s, 2, "Попытка изоляции", "«Отойдём за лестницу»");
    return result(s.pendingDecision.prompt, ["Попытка сменить поле", "Нужно ваше решение", "Witnesses пока сохраняются"], `${formulaLine(s)} Resolve ${s.aggressor.resolve} и память publicMoves=${s.memory.publicMoves} запускают попытку изоляции. Штраф ещё не применён.`, "Агрессор попытался вернуть изоляцию, но выбор игрового поля остался за защитником.", 3);
  }
  if (s.evidence >= 2 && s.aggressor.allies > 0 && !s.discredited) {
    s.discredited = true; s.appealPenalty += 1.5; apply(s, { witnesses: -1, control: 1, uncertainty: 1 });
    setAggressorMove(s, 2, "Дискредитация", "Его приятель объявляет происходящее шуткой");
    return result("Его приятель говорит, что это была шутка. Запись остаётся, но свидетельская картина менее однозначна.", ["Evidence сохраняется", "Witnesses −1", "Appeal penalty +1.5", "Контригра: дискредитация"], `${formulaLine(s)} Союзник снижает эффективность Appeal на 1.5, не уничтожая Evidence.`, "Агрессор не смог стереть запись, но попытался изменить её интерпретацию.", 2);
  }
  if (s.turn >= 3 && s.world.alliesNear > 0 && !s.recruited) {
    s.recruited = true; apply(s, { "aggressor.allies": 1, control: 1, danger: 1, uncertainty: 1 });
    setAggressorMove(s, 2, "Подключение союзника", "К нему подходит приятель");
    return result("К Старшему подходит приятель. Он не вмешивается, но присутствие меняет оценку риска.", ["Aggressor Allies +1", "Control +1", "Danger +1", "Контригра: союзник"], `${formulaLine(s)} Скрытое alliesNear=${s.world.alliesNear} активировало союзника.`, "Агрессор расширил собственную социальную опору.", 2);
  }
  if (s.uncertainty >= 5 && s.world.bluff >= .7 && !s.bluffed) {
    s.bluffed = true; s.currentThreat = { id: `threat-${s.turn}`, demandId: s.currentDemand.id, consequence: "будет хуже", status: "active" };
    apply(s, { "defender.fear": 2, danger: 1, threatDebt: 1, control: 1 });
    setAggressorMove(s, 2, "Расплывчатая угроза", "«Дальше будет хуже»");
    return result("Он намекает, что «дальше будет хуже», не называя ресурса. Неопределённость делает блеф сильнее.", ["Fear +2", "Danger +1", "Debt +1", "Контригра: блеф"], `${formulaLine(s)} Bluff ${s.world.bluff.toFixed(2)} ≥ .70 и Uncertainty ${s.uncertainty} ≥ 5.`, "Неопределённость позволила усилить давление без нового ресурса.", 2);
  }
  if (net > 4 && s.control >= 1) {
    const punish = s.threatDebt >= 3 && s.escalation >= 3 && s.currentDemand.status !== "complied";
    if (!punish) s.currentThreat = { id: `threat-${s.turn}`, demandId: s.currentDemand.id, consequence: "будет хуже", status: "active" };
    if (punish) { s.currentThreat && (s.currentThreat.status = "carried_out"); s.currentDemand.status = "resolved_by_force"; s.outcome = "coercive-seizure"; }
    apply(s, { escalation: 1, danger: punish ? 2 : 1, "defender.fear": punish ? 2 : 1, control: 1, physicalSafety: punish ? -2 : 0, "aggressor.reputation": punish ? 1 : 0, threatDebt: punish ? -s.threatDebt : 1, statusPressure: !punish && s.witnesses > 0 ? 1 : 0 });
    setAggressorMove(s, punish ? 4 : 3, punish ? "Физическое действие" : "Прямая угроза", punish ? "Он силой забирает предмет" : `«${s.currentDemand.label} — или будет хуже»`);
    return result(punish ? "Он толкает вас плечом и силой забирает предмет, подтверждая связанную с требованием угрозу." : `Он повышает голос: «${s.currentDemand.label} — или будет хуже».`, punish ? ["Safety −2", "Fear +2", "Escalation +1", "Threat Debt закрыт"] : ["Fear +1", "Danger +1", "Threat Debt +1", "Контригра: угроза"], `${formulaLine(s)} Net > 4 и Control ≥ 1 → ${punish ? "исполнение активной угрозы" : "новая угроза"}.`, punish ? "Исполнение угрозы закрыло связанный с ней Threat Debt ценой реального ущерба." : "Формула «сделай X, иначе Y» создала Threat Debt.", 2);
  }
  apply(s, { control: -1, "aggressor.fear": 1, danger: -1 });
  setAggressorMove(s, 1, "Повтор требования", "Он повторяет требование, но следит за окружением");
  return result("Он повторяет требование, но следит за окружением. Давление уже не безусловно.", ["Control −1", "Aggressor Fear +1", "Danger −1"], `${formulaLine(s)} Net недостаточен для дорогой эскалации.`, "Агрессор сохранил лицо, но не нашёл выгодного усиления.", 1);
}

function snapshot() { return { control: state.control, autonomy: state.autonomy, escalation: state.escalation, danger: state.danger, fear: state.defender.fear, uncertainty: state.uncertainty, witnesses: state.witnesses, evidence: state.evidence, institution: state.defender.institution, immediateAllies: state.immediateAllies, coalition: state.coalition, threatDebt: state.threatDebt, statusPressure: state.statusPressure, futureDemand: state.futureDemand }; }
function diff(a, b) { return Object.keys(a).filter(k => a[k] !== b[k]).map(k => `${k} ${signed(b[k] - a[k])}`).join(" · ") || "без численных изменений"; }

function takeAction(id) {
  if (state.ended) return;
  const action = SCENARIO.actions.find(a => a.id === id), before = snapshot();
  const player = ACTION_RULES[id](state), stress = stressAftermath(state, action);
  const ai = state.pendingDecision?.type === "afterScene" ? result("", [], formulaLine(state), "", 0) : aggressorResponse(state, action);
  if (!state.strongestAggressorMove || ai.weight > state.strongestAggressorMove.weight) state.strongestAggressorMove = { text: ai.text, weight: ai.weight };
  state.lastAction = id; state.used.add(id); state.event = `${player.text} ${ai.text}`;
  state.effects = [...player.effects, ...ai.effects].slice(0, 7);
  state.debug = `${player.debug}${stress ? `\n${stress}` : ""}\n${ai.debug}\n\nSTATE Δ: ${diff(before, snapshot())}`;
  state.history.unshift({ turn: state.turn, action: action.name, text: state.event, cause: player.cause, responseCause: ai.cause, weight: player.weight + ai.weight });
  state.turn += 1; state.stage = clamp(Math.max(state.stage, state.escalation), 0, SCENARIO.stages.length - 1);
  updateSituation(); checkEnd(); if (soundEnabled) tickSound(); render();
}

function takeContextAction(id) {
  if (state.ended || !state.pendingDecision) return;
  const before = snapshot(), type = state.pendingDecision.type;
  const meta = CONTEXT_ACTIONS[type].find(a => a.id === id), player = resolveContext(state, id);
  const ai = player.keepPending || player.skipAggressor || state.outcome ? result("", [], formulaLine(state), "", 0) : aggressorResponse(state, meta);
  if (ai.text && (!state.strongestAggressorMove || ai.weight > state.strongestAggressorMove.weight)) state.strongestAggressorMove = { text: ai.text, weight: ai.weight };
  state.lastAction = id; state.used.add(id); state.event = [player.text, ai.text].filter(Boolean).join(" "); state.effects = [...player.effects, ...ai.effects].slice(0, 7);
  state.debug = `${player.debug}\n${ai.debug}\n\nSTATE Δ: ${diff(before, snapshot())}`;
  state.history.unshift({ turn: state.turn, action: meta.name, text: state.event, cause: player.cause, responseCause: ai.cause, weight: player.weight + ai.weight });
  state.turn += 1; state.stage = clamp(Math.max(state.stage, state.escalation), 0, SCENARIO.stages.length - 1);
  updateSituation(); checkEnd(); if (soundEnabled) tickSound(); render();
}

function updateSituation() {
  const cost = externalCost(state);
  if (state.outcome) { state.situationTitle = "Появился устойчивый выход"; state.situationText = "Давление больше не определяет все варианты. Конфликт завершается без полного подчинения."; }
  else if (state.pendingDecision?.type === "afterScene") { state.situationTitle = "После сцены"; state.situationText = "Немедленная опасность закончилась. Последний выбор определит, с чем вы войдёте в следующую встречу."; }
  else if (state.pendingDecision?.type === "isolation") { state.situationTitle = "Кто выбирает место?"; state.situationText = "Попытка изоляции пока не изменила ресурсы. Следующий ход определит, сохранится ли публичное поле."; }
  else if (state.pendingDecision?.type === "newDemand") { state.situationTitle = "Уступка стала проверкой"; state.situationText = "Первое требование выполнено и закрыто. Теперь решается, превратится ли успех давления в цепочку новых требований."; }
  else if (totalDebt(state) >= 2 && cost >= 7) { state.situationTitle = "Он связан собственной угрозой"; state.situationText = "Отступить трудно из-за репутации, продолжать дорого. Возникло окно для выхода с сохранением лица."; }
  else if (stressLoad(state) >= 2) { state.situationTitle = "Страх искажает оценку"; state.situationText = "Уступка кажется особенно привлекательной, а сопротивление — опаснее известных ресурсов. Информация и время вернут точность."; }
  else if (state.escalation >= 4) { state.situationTitle = "Угроза становится действием"; state.situationText = "Ставка высока. Немедленная безопасность важнее символического выигрыша."; }
  else if (state.field >= 2) { state.situationTitle = "Это уже не один на один"; state.situationText = "Союзники, свидетельства и правила меняют расчёт. Физическая сила прежняя, но её стратегическая ценность ниже."; }
  else { state.situationTitle = "Граница ещё подвижна"; state.situationText = "Он проверяет, станет ли разовая уступка правилом. Неизвестность всё ещё работает на него."; }
}

function checkEnd() {
  if (!state.outcome && state.turn > SCENARIO.maxTurns && state.pendingDecision) return;
  if (state.outcome || state.autonomy <= 1 || state.physicalSafety <= 2 || state.turn > SCENARIO.maxTurns) {
    state.ended = true;
    if (!state.outcome) state.outcome = state.autonomy <= 1 ? "submission" : state.physicalSafety <= 2 ? "breakdown" : state.autonomy >= 6 && state.longTermSafety >= 6 ? "contained" : "ambiguous";
    setTimeout(showResult, 650);
  }
}

function available(action) {
  if (action.id === "appeal") return state.turn >= 2;
  if (action.id === "coalition") return state.turn >= 3;
  if (action.id === "offerExit") return totalDebt(state) > 0;
  if (action.id === "document") return state.turn >= 2;
  return true;
}
function responseLevelFor(action, s = state) {
  if (action.kind === "direct") return action.responseLevel;
  let level = action.baseLevel;
  const activeThreat = s.currentThreat?.status === "active";
  const severe = s.escalation >= 4 || s.currentDemand.status === "resolved_by_force";
  if (action.id === "witnesses") level = activeThreat ? 1 : -1;
  if (action.id === "document" && activeThreat) level = 1;
  if (action.id === "appeal" && activeThreat) level = 1;
  if (action.id === "offerExit" && totalDebt(s) >= 2) level = 0;
  if (severe && ["witnesses", "document", "appeal", "coalition", "leave"].includes(action.id)) level -= 1;
  return clamp(Math.round(level), -2, 2);
}
function actualRiskValue(action, s = state) {
  const challenge = action.challenge || 0;
  const faceSensitivity = .2 + s.world.needForFace * .35;
  const powerGap = Math.max(0, s.aggressor.power - s.defender.resolve) * .08;
  const exposure = Math.max(0, s.control) * .045 + powerGap;
  const protection = s.witnesses * s.world.witnessReliability * .1 + s.immediateAllies * .22 + externalCost(s) * .012;
  const publicityBacklash = challenge > .5 && s.witnesses > 0 ? s.world.needForFace * .3 : 0;
  const stress = action.assertive ? stressLoad(s) * .1 : 0;
  return +(action.risk + challenge * faceSensitivity + exposure + publicityBacklash + stress - protection).toFixed(2);
}
function perceivedRiskValue(action, s = state) {
  const challenge = action.challenge || 0;
  const faceEstimate = s.intel.face === null ? .5 : /высок/.test(s.intel.face) ? .82 : .38;
  const resolveEstimate = s.intel.resolve === null ? 5.5 : /высок/.test(s.intel.resolve) ? 8 : /низк|огранич/.test(s.intel.resolve) ? 4 : 5.5;
  const powerGap = Math.max(0, s.aggressor.power - s.defender.resolve) * .08;
  const exposure = Math.max(0, s.control) * .045 + powerGap + s.uncertainty * .025 + Math.max(0, resolveEstimate - 5.5) * .04;
  const visibleProtection = s.witnesses * .08 + s.immediateAllies * .22 + s.evidence * .04 + s.defender.institution * .12;
  const publicityBacklash = challenge > .5 && s.witnesses > 0 ? faceEstimate * .3 : 0;
  const knownAllies = action.id === "leave" && s.intel.allies !== null ? (/возмож/.test(s.intel.allies) ? .35 : -.15) : 0;
  const stress = action.assertive ? stressLoad(s) * .1 : 0;
  return +(action.risk + challenge * (.2 + faceEstimate * .35) + exposure + publicityBacklash + knownAllies + stress - visibleProtection).toFixed(2);
}
function riskScore(action, s = state) {
  const value = perceivedRiskValue(action, s);
  return value < 1.75 ? 1 : value < 3 ? 2 : 3;
}
function riskLabel(action) {
  const labels = ["", "низкий", "средний", "высокий"];
  return `${labels[riskScore(action)]}${state.uncertainty >= 6 ? " ?" : ""}`;
}
function directCopy(action, s = state) {
  if (s.currentThreat?.status !== "active") return { name: action.name, hint: action.hint };
  const threatCopy = {
    "-2": ["Выполнить требование", "Снизить немедленную опасность"],
    "-1": ["«Давай закончим без последствий»", "Смягчить сцену, не споря о статусе"],
    "0": ["«Это угроза. Я не согласен»", "Назвать происходящее без усиления ставки"],
    "1": ["«Отстань. Я зову взрослого»", "Отказать и назвать ближайшее последствие"],
    "2": ["Сделать угрозу публичной", "Повторить её вслух и зафиксировать"]
  };
  const [name, hint] = threatCopy[String(action.responseLevel)];
  return { name, hint };
}
function placementNote(action, level) {
  if (action.kind !== "field") return "Прямой ответ на текущий ход";
  if (level === action.baseLevel) return "Сила зависит от текущей ставки";
  const reason = state.escalation >= 4 ? "после эскалации" : state.currentThreat?.status === "active" ? "после угрозы" : "из-за связанной ставки";
  return `${signed(action.baseLevel)} → ${signed(level)} ${reason}`;
}
function fieldCopy(action, s = state) {
  if (action.id === "observe") return { name: action.name, hint: s.uncertainty >= 6 ? "Уточнить риск и скрытые ресурсы" : "Проверить текущую гипотезу" };
  if (action.id === "leave" && s.intel.allies !== null) return { name: action.name, hint: /возмож/.test(s.intel.allies) ? "Маршрут рискованнее: его друзья рядом" : "Маршрут свободнее: союзников не видно" };
  if (action.id === "appeal" && s.intel.institutionSensitivity !== null) return { name: action.name, hint: s.intel.institutionSensitivity === "высокая" ? "Он чувствителен к формальным последствиям" : "Институт может не остановить его сразу" };
  return { name: action.name, hint: action.hint };
}
function renderMetric(container, label, value, known = true) {
  const row = document.createElement("div"), numeric = typeof value === "number";
  row.className = `metric-row${known ? "" : " unknown"}`;
  row.innerHTML = `<label>${label}</label><strong>${known ? value : "?"}</strong><div class="metric-bar"><i style="width:${known && numeric ? value * 10 : 0}%"></i></div>`;
  container.appendChild(row);
}

function render() {
  $("roundLabel").textContent = `ХОД ${Math.min(state.turn, SCENARIO.maxTurns)} / ${SCENARIO.maxTurns}`; $("stageName").textContent = SCENARIO.stages[state.stage];
  $("situationTitle").textContent = state.situationTitle; $("situationText").textContent = state.situationText;
  $("controlMarker").style.left = `${(state.control + 10) * 5}%`;
  $("controlValue").textContent = state.control === 0 ? "равновесие" : `${signed(Math.abs(state.control))} ${state.control > 0 ? "агрессору" : "защитнику"}`;
  const demandStatuses = { active: "АКТИВНО", complied: "ВЫПОЛНЕНО", refused: "ОТКАЗ", resolved_by_force: "РЕШЕНО СИЛОЙ" };
  $("demandLabel").textContent = state.currentDemand.label;
  $("threatStatus").textContent = state.currentThreat?.status === "active" ? `Активная угроза: ${state.currentThreat.consequence}` : "Активной угрозы нет";
  $("demandStatus").textContent = demandStatuses[state.currentDemand.status] || state.currentDemand.status.toUpperCase();
  $("demandCard").classList.toggle("resolved", state.currentDemand.status !== "active" && state.currentDemand.status !== "refused");
  const load = stressLoad(state);
  $("stressState").textContent = load >= 2 ? `Стресс искажает риск · нагрузка ${load}` : load === 1 ? "Самообладание под нагрузкой" : "Самообладание устойчиво";
  $("stressState").classList.toggle("stressed", load >= 1);

  const a = $("aggressorMetrics"); a.innerHTML = "";
  renderMetric(a, "Physical power", state.aggressor.power); renderMetric(a, "Reputation", state.aggressor.reputation);
  const intelValue = key => state.intel[key] === null ? "?" : state.intel[key];
  const intelKnown = key => state.intel[key] !== null;
  renderMetric(a, "Resolve", intelValue("resolve"), intelKnown("resolve")); renderMetric(a, "Allies nearby", intelValue("allies"), intelKnown("allies"));
  renderMetric(a, "Weapons", intelValue("weapons"), intelKnown("weapons")); renderMetric(a, "Fear", intelValue("fear"), intelKnown("fear"));
  const d = $("defenderMetrics"); d.innerHTML = "";
  renderMetric(d, "Resolve", state.defender.resolve); renderMetric(d, "Reputation", state.defender.reputation); renderMetric(d, "Self-control", state.defender.selfControl);

  $("knowledgeLabel").textContent = state.observations === 0 ? "Туманная" : state.observations < 3 ? "Вероятностная" : "Рабочая гипотеза";
  $("aggressorSummary").textContent = `Power ${state.aggressor.power} · Reputation ${state.aggressor.reputation} · оценка ${state.observations === 0 ? "туманная" : "уточняется"}`;
  $("defenderSummary").textContent = `Resolve ${state.defender.resolve} · Self-Control ${state.defender.selfControl} · Reputation ${state.defender.reputation}`;
  $("knowledgeFill").style.width = `${Math.min(100, 18 + state.observations * 25)}%`;
  $("signalList").innerHTML = state.signals.length ? state.signals.slice(0, 3).map(x => `<li>${x}</li>`).join("") : "<li>Пока только первое впечатление.</li>";
  const fieldNames = ["Один на один", "Сцена видима", "Коллективное поле", "Институциональное поле"];
  $("fieldLabel").textContent = fieldNames[clamp(state.field, 0, 3)];
  $("fieldDescription").textContent = state.field === 0 ? "Изоляция усиливает физическое преимущество агрессора." : state.field === 1 ? "Наблюдение повышает цену давления, но свидетелей можно увести или дискредитировать." : state.field === 2 ? "Коалиция сохраняется дольше текущей сцены." : "Правила и последствия ограничивают обе стороны.";
  const cost = externalCost(state);
  $("externalCostLabel").textContent = cost < 6 ? "Низкая" : cost < 10 ? "Средняя" : "Высокая"; $("externalCostFill").style.width = `${Math.min(100, cost / 15 * 100)}%`;
  const debt = totalDebt(state);
  $("debtLabel").textContent = debt === 0 ? "Связанных ставок нет" : `Debt ${debt} · угроза ${state.threatDebt} / публичная ставка ${state.statusPressure}`;
  const repeatRisk = repeatRiskLabel(state);
  $("repeatRiskLabel").textContent = `Риск повторного давления: ${repeatRisk} · ${repeatDrivers(state)}`;
  $("coreMetrics").innerHTML = [["Danger", state.danger], ["Fear", state.defender.fear], ["Autonomy", state.autonomy]].map(([k,v]) => `<div class="core-metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
  const visibleResources = [["Witnesses", state.witnesses], ["Immediate Ally", state.immediateAllies], ["Evidence", state.evidence], ["Repeat Risk", repeatRisk]];
  $("resourceStrip").innerHTML = visibleResources.map(([k,v]) => `<div class="resource-item ${/Risk/.test(k) ? "debt" : ""}"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("strategicResources").innerHTML = [["Uncertainty", state.uncertainty], ["Threat Debt", state.threatDebt], ["Status Pressure", state.statusPressure], ["Coalition", state.coalition], ["Institution", state.defender.institution], ["Future Demand", state.futureDemand]].map(([k,v]) => `<div><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("debugPanel").classList.toggle("hidden", !debugEnabled);
  $("debugText").textContent = state.debug || `Начальное состояние рассчитано функциями движка.\n${formulaLine(state)}\nStress load = max(0, Fear ${state.defender.fear} − Self-Control ${state.defender.selfControl} − Resolve ${state.defender.resolve}×0.2) = ${stressLoad(state)}.\nWorld seed: ${state.seed}.`;
  $("debugFormula").textContent = `P=${pressure(state)} · C=${externalCost(state)} · NET=${netIncentive(state)} · TD=${state.threatDebt} · SP=${state.statusPressure}`;

  const actions = $("actionGrid"); actions.innerHTML = "";
  const context = state.pendingDecision;
  $("decisionPanel").classList.toggle("context-mode", !!context);
  actions.classList.toggle("spectrum", !context);
  $("stakeAnchor").classList.toggle("hidden", !!context);
  $("stakeLabel").textContent = state.aggressorMove.label;
  $("stakeText").textContent = state.aggressorMove.text;
  if (context) actions.innerHTML = `<div class="context-intro"><strong>Ответ на ход агрессора:</strong> ${context.prompt}</div>`;
  const makeButton = (action, level = null) => {
    const distorted = action.assertive && load >= 2, btn = document.createElement("button");
    const contextDisabled = action.id === "bringPerson" && state.witnesses < 1 || action.id === "inspectIsolation" && context?.inspected;
    const direct = action.kind === "direct", copy = direct ? directCopy(action) : fieldCopy(action);
    btn.className = `action-button${direct ? " direct-response" : " field-action"}${distorted ? " fear-distorted" : ""}`; btn.disabled = context ? contextDisabled : !available(action);
    const profile = action.profile.map(x => `<em class="${/^\+|^− Danger|^− Fear|^− Control|^− Escalation/.test(x) ? "up" : /^− Autonomy|^\+ Danger|^\+ Escalation|^\+ Debt|^\+ Future/.test(x) ? "down" : ""}">${x}</em>`).join("");
    const exhausted = action.id === "inspectIsolation" && context?.inspected ? "<span class=\"fear-note\">Информация уже получена — выберите решение</span>" : "";
    const position = level === null ? "" : `<span class="placement-note">${placementNote(action, level)}</span>`;
    btn.title = "Риск оценён только по известным вам сигналам";
    btn.innerHTML = `<span class="action-icon">${action.icon}</span><span class="risk risk-${riskScore(action)}">риск: ${riskLabel(action)}</span><strong>${copy.name}</strong><small>${copy.hint}</small>${position}<span class="action-profile">${profile}</span>${distorted ? "<span class=\"fear-note\">Страх делает риск субъективно выше</span>" : ""}${exhausted}`;
    btn.addEventListener("click", () => context ? takeContextAction(action.id) : takeAction(action.id));
    return btn;
  };
  if (context) CONTEXT_ACTIONS[context.type].forEach(action => actions.appendChild(makeButton(action)));
  else RESPONSE_LEVELS.forEach(level => {
    const column = document.createElement("section"), field = document.createElement("div");
    column.className = `response-column level-${level.value < 0 ? `minus${Math.abs(level.value)}` : level.value}`;
    field.className = "field-actions";
    column.innerHTML = `<div class="response-column-heading"><b>${level.mark}</b><span>${level.label}</span></div>`;
    const direct = SCENARIO.actions.find(action => action.kind === "direct" && action.responseLevel === level.value);
    column.appendChild(makeButton(direct, level.value));
    const fieldActions = SCENARIO.actions.filter(action => action.kind === "field" && responseLevelFor(action) === level.value).sort((a, b) => Number(available(b)) - Number(available(a)) || riskScore(a) - riskScore(b));
    if (fieldActions.length) field.innerHTML = "<div class=\"field-divider\">Изменить поле</div>";
    fieldActions.slice(0, 2).forEach(action => field.appendChild(makeButton(action, level.value)));
    if (fieldActions.length > 2) {
      const more = document.createElement("details"), summary = document.createElement("summary"), extra = document.createElement("div");
      more.className = "more-actions"; summary.textContent = `ещё ${fieldActions.length - 2}`; extra.className = "more-actions-list";
      fieldActions.slice(2).forEach(action => extra.appendChild(makeButton(action, level.value)));
      more.append(summary, extra); field.appendChild(more);
    }
    column.appendChild(field); actions.appendChild(column);
  });
  $("historyCount").textContent = `${state.history.length} ${state.history.length === 1 ? "событие" : "событий"}`;
  $("historyList").innerHTML = state.history.map(h => `<li><strong>Ход ${h.turn} · ${h.action}</strong><br>${h.text}</li>`).join("");
}

const OUTCOMES = {
  "safe-exit": ["Безопасный выход", "Текущая сцена закончена безопасно. Сам по себе выход не решает риск повторения — его определяют Evidence, Coalition и Institution.", "В"],
  "temporary-release": ["Опасность миновала сейчас", "Требование выполнено, и текущая сцена закончилась. Это может быть разумной тактикой; долгосрочный результат зависит от цены повторного давления.", "П"],
  "temporary-institutional": ["Временное разделение", "Взрослый завершил текущую сцену и развёл стороны. Это реальная защита сейчас, но не окончательное решение риска повторения.", "⌂"],
  "coercive-seizure": ["Угроза исполнена", "Агрессор силой завершил текущее требование. Это необратимое действие заканчивает сцену; физическая безопасность, автономия и риск повторения оцениваются отдельно.", "!"],
  "face-saving": ["Выход без поражения", "Цена давления выросла, а нейтральный повод позволил агрессору остановиться, не подтверждая угрозу.", "↔"],
  deterrence: ["Сдерживание", "Ожидаемая цена продолжения стала выше выгоды. Давление прекратилось без исполнения угрозы.", "С"],
  institutional: ["Институциональное решение", "Накопленные основания позволили перевести конфликт в поле правил и последствий.", "И"],
  contained: ["Устойчивое сдерживание", "Вы сохранили автономию и создали условия, в которых повторное давление стало менее выгодным.", "У"],
  submission: ["Система контроля", "Немедленный риск снизился ценой почти полной автономии. Разовое требование стало правилом.", "К"],
  breakdown: ["Опасная эскалация", "Физическая безопасность резко ухудшилась. Стратегическая задача теперь — выход и внешняя помощь.", "!"],
  ambiguous: ["Хрупкое равновесие", "Открытый конфликт закончился, но причины давления и риск повторения сохранились.", "≈"]
};

function buildCausalChain() {
  const items = [...state.history].reverse().flatMap(h => [h.cause, h.responseCause]).filter(Boolean).slice(0, 8);
  return items.length ? items : ["Конфликт завершился прежде, чем сформировалась устойчивая стратегическая цепочка."];
}
function alternativeStrategy() {
  if (!state.used.has("leave")) return "Альтернативный путь: раньше проверить безопасный выход, пока Control ещё не закрепился.";
  if (!state.used.has("observe")) return "Альтернативный путь: сначала собрать сигналы и снизить неопределённость.";
  if (!state.used.has("coalition")) return "Альтернативный путь: пережить сцену и вложиться в коалицию для следующих столкновений.";
  if (!state.used.has("offerExit") && totalDebt(state) > 0) return "Альтернативный путь: после роста External Cost предложить нейтральный выход.";
  return "Альтернативный путь: временная уступка могла сохранить безопасность сейчас, но потребовала бы восстановления автономии.";
}
function describeWorld() {
  const resolve = state.world.resolve >= 7 ? "был готов долго удерживать давление" : state.world.resolve <= 4 ? "имел ограниченную решимость" : "имел среднюю решимость";
  const face = state.world.needForFace >= .7 ? "очень чувствителен к публичной потере лица" : "мог отступить без сильной потери лица";
  const institution = state.world.fearOfInstitution >= .65 ? "опасался институциональных последствий" : "слабо боялся формальных последствий";
  const allies = state.world.alliesNear ? `имел рядом потенциальных союзников: ${state.world.alliesNear}` : "не имел друзей рядом";
  const comparisons = [];
  if (state.intel.resolve) {
    const expectedHigh = /высок/.test(state.intel.resolve), actualHigh = state.world.resolve >= 7;
    comparisons.push(expectedHigh === actualHigh ? `Вы верно заметили, что его решимость ${actualHigh ? "высока" : "не выглядит высокой"}.` : `Сигналы создавали впечатление ${expectedHigh ? "высокой" : "не самой высокой"} решимости, но фактически Resolve был ${state.world.resolve}.`);
  }
  if (state.intel.allies) {
    const expectedNone = /никого/.test(state.intel.allies), actualNone = state.world.alliesNear === 0;
    comparisons.push(expectedNone === actualNone ? `Наблюдение за окружением верно оценило наличие его союзников.` : `Оценка союзников оказалась неточной: на самом деле рядом было ${state.world.alliesNear}.`);
  }
  if (state.intel.bluff) comparisons.push((state.intel.bluff === "вероятен") === (state.world.bluff >= .68) ? "Вы правильно распознали характер угрозы и вероятность блефа." : "Характер угрозы был прочитан неточно.");
  if (state.intel.face) comparisons.push((/высокая/.test(state.intel.face)) === (state.world.needForFace >= .65) ? "Вы правильно заметили его реакцию на публичность." : "Публичность влияла на него иначе, чем подсказывали сигналы.");
  if (state.intel.institutionSensitivity) comparisons.push((state.intel.institutionSensitivity === "высокая") === (state.world.fearOfInstitution >= .65) ? "Вы правильно оценили его чувствительность к институциональным последствиям." : "Его чувствительность к институту была оценена неточно.");
  if (!comparisons.length) comparisons.push("Вы собрали слишком мало сигналов, поэтому большая часть скрытого мира осталась предположением.");
  const objectiveReason = state.world.objective === "control" ? "успешная уступка делала следующую проверку границы особенно ценной" : "после получения вещи ему обычно было выгоднее закончить сцену; продолжение требовало очень высокой склонности к эксплуатации";
  return `<div class="reveal-block"><strong>Что можно было предположить</strong><ul>${comparisons.map(item => `<li>${item}</li>`).join("")}</ul></div><div class="reveal-block"><strong>Что было на самом деле</strong><p>Цель: ${objectiveLabel(state)} — ${objectiveReason}. Он ${resolve}, ${face}, ${institution}; ${allies}. Склонность к блефу: ${state.world.bluff >= .68 ? "высокая" : "ограниченная"}.</p></div><div class="reveal-block"><strong>Почему он действовал так</strong><p>${state.strongestAggressorMove?.text || "Он не успел создать устойчивую контригру"}</p></div>`;
}
function showResult() {
  $("gameView").classList.add("hidden"); $("resultView").classList.remove("hidden");
  const [name, text, seal] = OUTCOMES[state.outcome];
  $("resultTitle").textContent = name; $("resultSummary").textContent = "Здесь нет одного счёта победы. Итог разделяет безопасность сейчас и свободу в следующих столкновениях.";
  $("outcomeSeal").textContent = seal; $("outcomeName").textContent = name; $("outcomeText").textContent = text;
  if (["safe-exit", "temporary-release", "temporary-institutional"].includes(state.outcome)) $("outcomeText").textContent += ` Риск повторного давления: ${repeatRiskLabel(state)} (${repeatDrivers(state, true)}).`;
  const scores = { "Physical safety": state.physicalSafety, "Autonomy": state.autonomy, "Reputation": state.defender.reputation, "Long-term safety": state.longTermSafety, "Institutional control": state.defender.institution, "De-escalation": 10 - state.escalation, "Psychological reserve": 10 - state.psychologicalCost };
  $("scoreBars").innerHTML = Object.entries(scores).map(([k,v]) => `<div class="score-row"><span>${k}</span><div class="score-track"><i style="width:${clamp(v)*10}%"></i></div><strong>${clamp(v)}</strong></div>`).join("");
  const strategicExit = ["safe-exit", "face-saving", "deterrence", "institutional", "contained"].includes(state.outcome);
  $("lessonTitle").textContent = strategicExit ? "Как изменился расчёт сторон" : state.field >= 2 || state.defender.institution >= 2 ? "Как изменилось игровое поле" : "Почему поле осталось выгодным агрессору";
  $("causalChain").innerHTML = buildCausalChain().map(x => `<li>${x}</li>`).join("");
  const best = [...state.history].sort((a,b) => b.weight - a.weight)[0];
  $("turningPoint").innerHTML = best ? `<strong>Поворотный ход:</strong> ${best.action}. Он сильнее всего изменил следующий выбор обеих сторон.` : "<strong>Поворотный ход:</strong> сцена закончилась до формирования стратегии.";
  $("alternativeText").innerHTML = `<strong>${alternativeStrategy()}</strong>`;
  $("worldReveal").innerHTML = describeWorld();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startGame() { state = freshState(); $("introView").classList.add("hidden"); $("resultView").classList.add("hidden"); $("gameView").classList.remove("hidden"); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function tickSound() {
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(), osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = 180; gain.gain.setValueAtTime(.025, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .08); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .08); } catch (_) { /* optional */ }
}
function openModel() {
  $("modelFormulaBox").innerHTML = [
    `Pressure = Power × Credibility + Uncertainty × ${WEIGHTS.uncertainty} + positive Control × ${WEIGHTS.control} + (Threat Debt + Status Pressure) × ${WEIGHTS.debt} + Compliance Memory × objective weight + Weapons × ${WEIGHTS.weapons}`,
    `External Cost = Witnesses × Reliability × ${WEIGHTS.witnesses} + Evidence × ${WEIGHTS.evidence} + Immediate Allies × 1.2 + Allies × 0.3 + Coalition × 0.6 + Institution × Quality × ${WEIGHTS.institution} + Fearₐ × ${WEIGHTS.aggressorFear}`,
    `Net Incentive = Pressure + Future Benefit − External Cost × ${WEIGHTS.costIncentive}`
  ].map(x => `<code>${x}</code>`).join("");
  $("modelDialog").showModal();
}
$("startButton").addEventListener("click", startGame); $("restartButton").addEventListener("click", startGame); $("playAgainButton").addEventListener("click", startGame);
$("modelButton").addEventListener("click", openModel); $("resultModelButton").addEventListener("click", openModel); $("closeModelButton").addEventListener("click", () => $("modelDialog").close());
$("debugButton").addEventListener("click", () => { debugEnabled = !debugEnabled; $("debugButton").textContent = `Explain: ${debugEnabled ? "вкл" : "выкл"}`; $("debugButton").setAttribute("aria-pressed", debugEnabled); if (state) render(); });
$("soundButton").addEventListener("click", () => { soundEnabled = !soundEnabled; $("soundButton").textContent = soundEnabled ? "◉" : "○"; $("soundButton").setAttribute("aria-pressed", soundEnabled); });
$("historyToggle").addEventListener("click", () => { const list = $("historyList"), open = list.classList.toggle("hidden") === false; $("historyToggle").setAttribute("aria-expanded", open); });
$("modelDialog").addEventListener("click", e => { if (e.target === $("modelDialog")) $("modelDialog").close(); });

window.ConflictSimulator = { SCENARIO, RESPONSE_LEVELS, WEIGHTS, ACTION_RULES, CONTEXT_ACTIONS, freshState, pressure, externalCost, futureBenefit, netIncentive, aggressorResponse, resolveContext, stressLoad, totalDebt, repeatPressure, repeatRiskLabel, exitRoute, responseLevelFor, actualRiskValue, perceivedRiskValue, riskScore };
