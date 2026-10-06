"use strict";

const SCENARIO = {
  id: "school-corridor", title: "Чужое правило", maxTurns: 10,
  stages: ["PROBE", "BOUNDARY TEST", "THREAT", "RESISTANCE", "PUNISHMENT", "ESCALATION", "COALITION", "DETERRENCE", "EXIT"],
  base: { aggressor: { power: 7, reputation: 7 }, defender: { reputation: 2, allies: 2, resolve: 5, selfControl: 6, fear: 6 } },
  actions: [
    { id: "comply", icon: "↓", name: "Уступить", hint: "Снизить риск сейчас, отдав блокнот", risk: 1, profile: ["− Danger сейчас", "− Autonomy", "+ Будущее давление"] },
    { id: "refuse", icon: "—", name: "Отказать", hint: "Не принять чужое правило", risk: 3, assertive: true, profile: ["+ Autonomy", "+ Escalation", "+ Reputation Debt"] },
    { id: "delay", icon: "◷", name: "Тянуть время", hint: "Дождаться движения в коридоре", risk: 2, profile: ["+ Время", "+ Witnesses", "− Control"] },
    { id: "leave", icon: "↗", name: "Уйти", hint: "Попытаться физически выйти из сцены", risk: 2, assertive: true, profile: ["− Danger", "+ Safety", "зависит от Control"] },
    { id: "witnesses", icon: "◎", name: "Искать свидетелей", hint: "Сделать сцену публичной", risk: 1, profile: ["+ External Cost", "− Control", "возможна изоляция"] },
    { id: "document", icon: "▣", name: "Зафиксировать", hint: "Создать сохраняющееся доказательство", risk: 2, assertive: true, profile: ["+ Evidence", "+ External Cost", "риск обнаружения"] },
    { id: "appeal", icon: "⌂", name: "Обратиться к взрослым", hint: "Превратить накопленную опору в действие", risk: 2, profile: ["+ Institution", "+ Long-term safety", "нужны основания"] },
    { id: "coalition", icon: "⋈", name: "Собрать союз", hint: "Создать длительную коллективную защиту", risk: 2, profile: ["+ Allies", "+ Long-term safety", "требует времени"] },
    { id: "boundary", icon: "□", name: "Обозначить границу", hint: "Ясно назвать неприемлемое", risk: 2, assertive: true, profile: ["+ Autonomy", "+ Reputation", "+ Debt при слабой опоре"] },
    { id: "deescalate", icon: "≈", name: "Снизить градус", hint: "Не подчиниться и убрать публичный вызов", risk: 1, profile: ["− Danger", "− Escalation", "не создаёт опору"] },
    { id: "observe", icon: "◇", name: "Наблюдать", hint: "Получить сигнал о скрытом состоянии", risk: 1, profile: ["− Uncertainty", "− Fear", "+ время агрессору"] },
    { id: "offerExit", icon: "↔", name: "Предложить выход", hint: "Дать отступить без потери лица", risk: 1, profile: ["использует External Cost", "снимает Debt", "− Escalation"] }
  ]
};

const WORLD_VARIANTS = [
  { id: "блефующий", resolve: 4, fear: 5, alliesNear: 0, weapons: 0, witnessReliability: .88, institutionQuality: .62, detection: 2, bluff: .92, redLine: "institution" },
  { id: "статусный", resolve: 8, fear: 2, alliesNear: 2, weapons: 0, witnessReliability: .55, institutionQuality: .68, detection: 4, bluff: .38, redLine: "humiliation" },
  { id: "осторожный", resolve: 6, fear: 4, alliesNear: 1, weapons: 0, witnessReliability: .76, institutionQuality: .90, detection: 3, bluff: .55, redLine: "evidence" },
  { id: "оппортунист", resolve: 5, fear: 3, alliesNear: 0, weapons: 0, witnessReliability: .64, institutionQuality: .44, detection: 4, bluff: .82, redLine: "coalition" }
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

function chooseWorld(seed) {
  const source = WORLD_VARIANTS[seed % WORLD_VARIANTS.length];
  const nudge = ((seed >>> 5) % 3 - 1) * .04;
  return { ...source, witnessReliability: clamp(source.witnessReliability + nudge, .45, .95), seed };
}

function freshState(seed = randomSeed()) {
  const world = chooseWorld(seed);
  return {
    seed, world, turn: 1, stage: 0, control: 3, autonomy: 8, escalation: 1, danger: 3,
    uncertainty: 7, evidence: 0, witnesses: 0, field: 0, debt: 0, futureDemand: 3,
    physicalSafety: 8, longTermSafety: 5, psychologicalCost: 2, appealPenalty: 0,
    aggressor: { ...SCENARIO.base.aggressor, resolve: world.resolve, fear: world.fear, allies: world.alliesNear, weapons: world.weapons },
    defender: { ...SCENARIO.base.defender, institution: 0 },
    observations: 0, signals: [], intel: { resolve: null, allies: null, weapons: null, fear: null },
    history: [], used: new Set(), lastAction: null, bluffed: false, recruited: false, discredited: false,
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
  ["autonomy", "danger", "uncertainty", "escalation", "physicalSafety", "longTermSafety", "psychologicalCost", "futureDemand", "evidence", "witnesses", "field", "debt"].forEach(k => s[k] = clamp(s[k]));
  [s.aggressor, s.defender].forEach(actor => Object.keys(actor).forEach(k => typeof actor[k] === "number" && (actor[k] = clamp(actor[k]))));
  s.control = clamp(s.control, -10, 10);
}

function result(text, effects, debug, cause, weight = 1) { return { text, effects, debug, cause, weight }; }

function externalCost(s) {
  return +(s.witnesses * s.world.witnessReliability * WEIGHTS.witnesses + s.evidence * WEIGHTS.evidence + s.defender.allies * WEIGHTS.allies + s.defender.institution * s.world.institutionQuality * WEIGHTS.institution + s.aggressor.fear * WEIGHTS.aggressorFear).toFixed(1);
}
function pressure(s) {
  const credibility = (s.aggressor.reputation + s.aggressor.resolve) / 20;
  return +(s.aggressor.power * credibility + s.uncertainty * WEIGHTS.uncertainty + Math.max(0, s.control) * WEIGHTS.control + s.debt * WEIGHTS.debt + s.aggressor.weapons * WEIGHTS.weapons).toFixed(1);
}
function futureBenefit(s) { return +(s.futureDemand * WEIGHTS.futureDemand + Math.max(0, 10 - s.autonomy) * WEIGHTS.lostAutonomy).toFixed(1); }
function netIncentive(s) { return +(pressure(s) + futureBenefit(s) - externalCost(s) * WEIGHTS.costIncentive).toFixed(1); }
function stressLoad(s) { return Math.max(0, s.defender.fear - s.defender.selfControl); }
function formulaLine(s) { return `Pressure ${pressure(s)} + future benefit ${futureBenefit(s)} − external cost ${externalCost(s)}×${WEIGHTS.costIncentive} = net incentive ${netIncentive(s)}.`; }

function stressAftermath(s, action) {
  const overload = stressLoad(s);
  if (!action.assertive || overload < 2) return null;
  apply(s, { control: 1, psychologicalCost: 1 });
  return `Стресс-нагрузка = Fear ${s.defender.fear} − Self-Control ${s.defender.selfControl} = ${overload}: точное действие далось труднее, Control +1 агрессору.`;
}

const ACTION_RULES = {
  comply(s) {
    const tactical = s.danger >= 6;
    apply(s, { "defender.fear": -2, danger: -3, autonomy: -2, futureDemand: 2, "aggressor.reputation": 1, control: 2, longTermSafety: -1, psychologicalCost: 1 });
    if (tactical) apply(s, { physicalSafety: 1 });
    return result(tactical ? "Вы отдаёте блокнот, выбирая безопасность в опасный момент. Это не поражение, но уступка создаёт прецедент." : "Вы отдаёте блокнот. Напряжение падает, но требование становится работающим правилом.", ["Fear −2", "Danger −3", "Autonomy −2", "Future pressure +2"], `Уступка всегда снижает немедленную опасность. При Danger ≥ 6 она дополнительно защищает Physical Safety. Сейчас tactical=${tactical}.`, tactical ? "Уступка сохранила физическую безопасность в опасный момент." : "Уступка снизила риск сейчас, но усилила ожидаемую выгоду будущего давления.", 2);
  },
  refuse(s) {
    const support = +(s.witnesses * s.world.witnessReliability + s.defender.allies * .5 + s.defender.institution * s.world.institutionQuality + s.evidence * .3).toFixed(1);
    const exposed = support < 4.5;
    apply(s, { "defender.fear": exposed ? 2 : -1, autonomy: 1, control: exposed ? 1 : -2, escalation: 1, danger: exposed ? 3 : 0, "defender.reputation": 1, psychologicalCost: 1, debt: 2 });
    return result(exposed ? "Вы отказываете в изоляции. Граница ясна, но теперь Старшему выгодно проверить, подкреплены ли слова ресурсами." : "Вы отказываете, и за словами уже видна опора. Публичная угроза связывает Старшего сильнее, чем вас.", ["Autonomy +1", `Support ${support}`, `Danger ${signed(exposed ? 3 : 0)}`, "Reputation Debt +2"], `Опора отказа = witnesses×reliability + allies×0.5 + institution×quality + evidence×0.3 = ${support}. Порог 4.5.`, exposed ? "Прямой отказ без достаточной опоры повысил риск эскалации." : "Опора превратила отказ из вызова в достоверную границу.", exposed ? 1 : 3);
  },
  delay(s) {
    const gain = s.turn >= 4 ? 2 : 1, people = s.world.witnessReliability >= .7 ? 1 : 0;
    apply(s, { control: -gain, "defender.fear": -1, witnesses: people, uncertainty: -1, psychologicalCost: 1 });
    return result(people ? "Вы задаёте вопросы и выигрываете время. У открытой двери задерживается ученик." : "Вы выигрываете время, но проходящие мимо пока не хотят вмешиваться.", [`Control ${signed(-gain)}`, `Witnesses +${people}`, "Uncertainty −1", "Psychological cost +1"], `Ценность времени=${gain}; свидетель зависит от скрытой готовности окружения ${s.world.witnessReliability.toFixed(2)}.`, people ? "Время добавило наблюдателя и уменьшило частный контроль сцены." : "Время снизило темп, но не гарантировало поддержку.", 1);
  },
  leave(s) {
    const route = +(6 - s.control + s.witnesses + s.defender.allies * .4 + s.field).toFixed(1);
    if (route >= 5) {
      apply(s, { control: -3, danger: -3, "defender.fear": -2, autonomy: 1, longTermSafety: 1 }); s.outcome = "safe-exit";
      return result("Вы выходите к людной лестнице. Вы не доказали, кто прав, — вы прекратили опасную сцену.", ["Safe exit", "Danger −3", "Autonomy +1", "Control −3"], `Маршрут = 6 − control + witnesses + allies×0.4 + field = ${route}; нужен ≥ 5.`, "Доступный маршрут позволил прекратить сцену без подчинения.", 3);
    }
    apply(s, { control: 2, danger: 2, "defender.fear": 2, escalation: 1, physicalSafety: -1 });
    return result("Он блокирует путь. Попытка выйти показала, что пространство пока контролирует он.", ["Control +2", "Danger +2", "Fear +2", "Safety −1"], `Маршрут ${route} < 5: контроль и изоляция перевесили доступные пути.`, "Попытка выхода при высоком Control оказалась рискованной.", 1);
  },
  witnesses(s) {
    const gain = s.world.witnessReliability >= .72 ? 2 : 1;
    const backlash = s.aggressor.resolve >= 7 && s.field === 0 ? 1 : 0;
    apply(s, { witnesses: gain, field: 1, uncertainty: -1, control: -2, "defender.fear": -1, longTermSafety: 1, danger: backlash });
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
      apply(s, { "defender.institution": 4, control: -3, "defender.allies": 1, "defender.fear": -1, longTermSafety: 4, danger: -2, field: 3 }); s.outcome = "institutional";
      return result("Свидетельства и детали дают взрослому основания действовать. Стороны разводят, обращение фиксируют, повторение будет иметь последствия.", ["Institution +4", "Danger −2", "Control −3", "Institutional resolution"], `Appeal score=${score}; сильный порог 7.5; quality=${s.world.institutionQuality.toFixed(2)}.`, "Накопленные основания превратились в устойчивое институциональное вмешательство.", 4);
    }
    if (score >= 4.5) {
      apply(s, { "defender.institution": 2, control: -2, "defender.allies": 1, "defender.fear": -1, longTermSafety: 2, danger: -1, field: 1 });
      return result("Взрослый временно разводит вас и обещает разобраться. Это не финал, но у следующего давления уже будут последствия.", ["Institution +2", "Danger −1", "Long-term safety +2", "Временная защита"], `Appeal score ${score}: частичное вмешательство при 4.5–7.49; quality=${s.world.institutionQuality.toFixed(2)}.`, "Обращение создало временную защиту, но потребует дальнейшей опоры.", 2);
    }
    apply(s, { "defender.institution": 1, control: -1, psychologicalCost: 1, danger: 1 });
    return result("Взрослый воспринимает это как обычную ссору и советует «просто разойтись». След обращения остаётся, но защита пока слабая.", ["Institution +1", "Danger +1", "Psychological cost +1", "Нужны основания"], `Appeal score ${score} < 4.5: оснований недостаточно.`, "Слабое обращение показало ограничения института и необходимость оснований.", 1);
  },
  coalition(s) {
    const gain = s.turn >= 3 ? 3 : 2;
    apply(s, { "defender.allies": gain, control: -2, field: 2, longTermSafety: 3, "defender.fear": -1, futureDemand: -1 });
    return result("Вы договариваетесь идти вместе с теми, кого он уже пробовал давить. Личная проблема становится общей.", [`Allies +${gain}`, "Control −2", "Future pressure −1", "Long-term safety +3"], `Коалиция создаёт постоянный ресурс; gain=${gain} зависит от времени, не от броска.`, "Коллективная защита изменила будущие столкновения, а не только текущую сцену.", 3);
  },
  boundary(s) {
    const support = +(s.witnesses * s.world.witnessReliability + s.defender.allies * .5 + s.defender.reputation).toFixed(1), credible = support >= 4.5;
    apply(s, { autonomy: 1, "defender.reputation": 1, control: credible ? -2 : 0, escalation: credible ? 0 : 1, "defender.fear": credible ? -1 : 1, debt: credible ? 0 : 1 });
    return result(credible ? "Вы коротко называете границу — и за словами видна опора." : "Вы называете границу. Она сохраняет автономию, но без видимой опоры повышает ставку.", ["Autonomy +1", "Reputation +1", `Support ${support}`, `Debt ${signed(credible ? 0 : 1)}`], `Достоверность = witnesses×reliability + allies×0.5 + reputation = ${support}; нужен ≥ 4.5.`, credible ? "Граница стала достоверной благодаря внешней опоре." : "Граница сохранила автономию, но создала риск проверки.", credible ? 2 : 1);
  },
  deescalate(s) {
    apply(s, { escalation: -1, danger: -2, control: -1, "defender.fear": -1, autonomy: s.autonomy < 4 ? -1 : 0 });
    return result("Вы не соглашаетесь, но предлагаете закончить разговор без публичного вызова. Температура снижается.", ["Escalation −1", "Danger −2", "Fear −1", "Control −1"], `Деэскалация не добавляет долгосрочных ресурсов. Autonomy modifier=${s.autonomy < 4 ? -1 : 0}.`, "Деэскалация купила безопасность, не разрешив структуру давления.", 1);
  },
  observe(s) {
    s.observations += 1;
    let signal;
    if (s.observations === 1) {
      if (s.world.alliesNear === 0) { signal = "Похоже, его друзья сейчас не рядом."; s.intel.allies = "скорее один"; }
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
    return result(`Вы наблюдаете за руками, взглядом и окружением. ${signal}`, ["Uncertainty −2", "Fear −1", "Control +1", "Вероятностный сигнал"], `Сигнал выведен из мира ${s.world.id}; observation=${s.observations}. Цена информации — Control +1.`, "Наблюдение заменило часть неопределённого страха проверяемой гипотезой.", 2);
  },
  offerExit(s) {
    const cost = externalCost(s), threshold = s.world.redLine === "humiliation" && s.witnesses > 0 ? 8.5 : 7;
    if (s.debt > 0 && cost >= threshold) {
      apply(s, { escalation: -2, danger: -3, control: -3, "defender.fear": -2, longTermSafety: 2, debt: -s.debt }); s.outcome = "face-saving";
      return result("Вы оставляете нейтральный повод закончить разговор. Старший отступает, не объявляя себя проигравшим.", ["Face-saving exit", "Danger −3", "Debt снят", "Long-term safety +2"], `Нужно debt>0 и cost ${cost} ≥ threshold ${threshold}; red line=${s.world.redLine}.`, "Высокая цена и нейтральный повод позволили снять долг репутации без новой эскалации.", 4);
    }
    apply(s, { control: 1, "defender.fear": 1, autonomy: -1 });
    return result("Цена продолжения для него ещё недостаточна. Предложение звучит как просьба.", ["Control +1", "Fear +1", "Autonomy −1"], `Exit failed: debt=${s.debt}; cost=${cost}; threshold=${threshold}.`, "Предложение выхода появилось раньше, чем агрессору стало выгодно его принять.", 1);
  }
};

function aggressorResponse(s) {
  if (s.outcome) return result("Сцена получила устойчивый выход.", [], formulaLine(s), "", 0);
  const cost = externalCost(s), net = netIncentive(s);
  if (cost >= 13 && s.debt <= 1) {
    apply(s, { control: -3, danger: -2, "aggressor.fear": 2, escalation: -1, longTermSafety: 1 }); s.outcome = "deterrence";
    return result("Старший оценивает последствия и прекращает давление. Продолжение больше не окупается.", ["Агрессор отступает", "Control −3", "Danger −2"], `${formulaLine(s)} Cost ≥ 13 и Debt ≤ 1 → отступление.`, "Высокая внешняя цена сделала продолжение давления невыгодным.", 3);
  }
  if (cost >= 8 && s.debt >= 2) {
    apply(s, { danger: -1, control: -1, "aggressor.fear": 1 });
    return result("Он повторяет условие, но не усиливает его. Высокая цена мешает эскалации, а угроза — простому отступлению.", ["Aggressor Fear +1", "Danger −1", "Доступен Face-Saving Exit"], `${formulaLine(s)} Cost высокий, Debt=${s.debt}: поиск выхода.`, "Долг репутации запер агрессора между дорогой эскалацией и потерей лица.", 2);
  }
  if (s.witnesses > 0 && s.field < 3 && s.aggressor.resolve >= 6 && s.control >= -2) {
    const lost = Math.min(1, s.witnesses); apply(s, { witnesses: -lost, field: -1, control: 2, uncertainty: 1 });
    return result("Старший предлагает «поговорить нормально» за лестницей — пытается снова изолировать вас.", [`Witnesses −${lost}`, "Control +2", "Uncertainty +1", "Контригра: изоляция"], `${formulaLine(s)} При свидетелях и resolve ${s.aggressor.resolve} ≥ 6 агрессор меняет место.`, "Агрессор попытался вернуть выгодное ему поле — изоляцию.", 2);
  }
  if (s.evidence >= 2 && s.aggressor.allies > 0 && !s.discredited) {
    s.discredited = true; s.appealPenalty += 1.5; apply(s, { witnesses: -1, control: 1, uncertainty: 1 });
    return result("Его приятель говорит, что это была шутка. Запись остаётся, но свидетельская картина менее однозначна.", ["Evidence сохраняется", "Witnesses −1", "Appeal penalty +1.5", "Контригра: дискредитация"], `${formulaLine(s)} Союзник снижает эффективность Appeal на 1.5, не уничтожая Evidence.`, "Агрессор не смог стереть запись, но попытался изменить её интерпретацию.", 2);
  }
  if (s.turn >= 3 && s.world.alliesNear > 0 && !s.recruited) {
    s.recruited = true; apply(s, { "aggressor.allies": 1, control: 1, danger: 1, uncertainty: 1 });
    return result("К Старшему подходит приятель. Он не вмешивается, но присутствие меняет оценку риска.", ["Aggressor Allies +1", "Control +1", "Danger +1", "Контригра: союзник"], `${formulaLine(s)} Скрытое alliesNear=${s.world.alliesNear} активировало союзника.`, "Агрессор расширил собственную социальную опору.", 2);
  }
  if (s.uncertainty >= 5 && s.world.bluff >= .7 && !s.bluffed) {
    s.bluffed = true; apply(s, { "defender.fear": 2, danger: 1, debt: 1, control: 1 });
    return result("Он намекает, что «дальше будет хуже», не называя ресурса. Неопределённость делает блеф сильнее.", ["Fear +2", "Danger +1", "Debt +1", "Контригра: блеф"], `${formulaLine(s)} Bluff ${s.world.bluff.toFixed(2)} ≥ .70 и Uncertainty ${s.uncertainty} ≥ 5.`, "Неопределённость позволила усилить давление без нового ресурса.", 2);
  }
  if (net > 4 && s.control >= 1) {
    const punish = s.debt >= 3 && s.escalation >= 3;
    apply(s, { escalation: 1, danger: punish ? 2 : 1, "defender.fear": punish ? 2 : 1, control: 1, physicalSafety: punish ? -2 : 0, "aggressor.reputation": punish ? 1 : 0, debt: punish ? -1 : 1 });
    return result(punish ? "Он толкает вас плечом и выхватывает блокнот, подтверждая угрозу действием." : "Он повышает голос: «Отдай — или будет хуже».", punish ? ["Safety −2", "Fear +2", "Escalation +1", "Debt −1"] : ["Fear +1", "Danger +1", "Debt +1", "Контригра: угроза"], `${formulaLine(s)} Net > 4 и Control ≥ 1 → ${punish ? "наказание" : "угроза"}.`, punish ? "Агрессор заплатил реальную цену, чтобы подтвердить угрозу." : "Новая угроза усилила давление и создала долг репутации.", 2);
  }
  apply(s, { control: -1, "aggressor.fear": 1, danger: -1 });
  return result("Он повторяет требование, но следит за окружением. Давление уже не безусловно.", ["Control −1", "Aggressor Fear +1", "Danger −1"], `${formulaLine(s)} Net недостаточен для дорогой эскалации.`, "Агрессор сохранил лицо, но не нашёл выгодного усиления.", 1);
}

function snapshot() { return { control: state.control, autonomy: state.autonomy, escalation: state.escalation, danger: state.danger, fear: state.defender.fear, uncertainty: state.uncertainty, witnesses: state.witnesses, evidence: state.evidence, institution: state.defender.institution, allies: state.defender.allies, debt: state.debt }; }
function diff(a, b) { return Object.keys(a).filter(k => a[k] !== b[k]).map(k => `${k} ${signed(b[k] - a[k])}`).join(" · ") || "без численных изменений"; }

function takeAction(id) {
  if (state.ended) return;
  const action = SCENARIO.actions.find(a => a.id === id), before = snapshot();
  const player = ACTION_RULES[id](state), stress = stressAftermath(state, action), ai = aggressorResponse(state);
  state.lastAction = id; state.used.add(id); state.event = `${player.text} ${ai.text}`;
  state.effects = [...player.effects, ...ai.effects].slice(0, 7);
  state.debug = `${player.debug}${stress ? `\n${stress}` : ""}\n${ai.debug}\n\nSTATE Δ: ${diff(before, snapshot())}`;
  state.history.unshift({ turn: state.turn, action: action.name, text: state.event, cause: player.cause, responseCause: ai.cause, weight: player.weight + ai.weight });
  state.turn += 1; state.stage = clamp(Math.max(state.stage, state.escalation), 0, SCENARIO.stages.length - 1);
  updateSituation(); checkEnd(); if (soundEnabled) tickSound(); render();
}

function updateSituation() {
  const cost = externalCost(state);
  if (state.outcome) { state.situationTitle = "Появился устойчивый выход"; state.situationText = "Давление больше не определяет все варианты. Конфликт завершается без полного подчинения."; }
  else if (state.debt >= 2 && cost >= 7) { state.situationTitle = "Он связан собственной угрозой"; state.situationText = "Отступить трудно из-за репутации, продолжать дорого. Возникло окно для выхода с сохранением лица."; }
  else if (stressLoad(state) >= 2) { state.situationTitle = "Страх искажает оценку"; state.situationText = "Уступка кажется особенно привлекательной, а сопротивление — опаснее известных ресурсов. Информация и время вернут точность."; }
  else if (state.escalation >= 4) { state.situationTitle = "Угроза становится действием"; state.situationText = "Ставка высока. Немедленная безопасность важнее символического выигрыша."; }
  else if (state.field >= 2) { state.situationTitle = "Это уже не один на один"; state.situationText = "Союзники, свидетельства и правила меняют расчёт. Физическая сила прежняя, но её стратегическая ценность ниже."; }
  else { state.situationTitle = "Граница ещё подвижна"; state.situationText = "Он проверяет, станет ли разовая уступка правилом. Неизвестность всё ещё работает на него."; }
}

function checkEnd() {
  if (state.outcome || state.autonomy <= 1 || state.physicalSafety <= 2 || state.turn > SCENARIO.maxTurns) {
    state.ended = true;
    if (!state.outcome) state.outcome = state.autonomy <= 1 ? "submission" : state.physicalSafety <= 2 ? "breakdown" : state.autonomy >= 6 && state.longTermSafety >= 6 ? "contained" : "ambiguous";
    setTimeout(showResult, 650);
  }
}

function available(action) {
  if (action.id === "appeal") return state.turn >= 2;
  if (action.id === "coalition") return state.turn >= 3;
  if (action.id === "offerExit") return state.debt > 0;
  if (action.id === "document") return state.turn >= 2;
  return true;
}
function riskLabel(action) {
  const labels = ["", "низкий", "средний", "высокий"];
  return labels[clamp(action.risk + (action.assertive ? Math.floor(stressLoad(state) / 2) : 0), 1, 3)];
}
function renderMetric(container, label, value, known = true) {
  const row = document.createElement("div"), numeric = typeof value === "number";
  row.className = `metric-row${known ? "" : " unknown"}`;
  row.innerHTML = `<label>${label}</label><strong>${known ? value : "?"}</strong><div class="metric-bar"><i style="width:${known && numeric ? value * 10 : 0}%"></i></div>`;
  container.appendChild(row);
}

function render() {
  $("roundLabel").textContent = `ХОД ${Math.min(state.turn, SCENARIO.maxTurns)} / ${SCENARIO.maxTurns}`; $("stageName").textContent = SCENARIO.stages[state.stage];
  $("situationTitle").textContent = state.situationTitle; $("situationText").textContent = state.situationText; $("eventText").textContent = state.event;
  $("controlMarker").style.left = `${(state.control + 10) * 5}%`;
  $("controlValue").textContent = state.control === 0 ? "равновесие" : `${signed(Math.abs(state.control))} ${state.control > 0 ? "агрессору" : "защитнику"}`;
  const load = stressLoad(state);
  $("stressState").textContent = load >= 2 ? `Стресс искажает риск · нагрузка ${load}` : load === 1 ? "Самообладание под нагрузкой" : "Самообладание устойчиво";
  $("stressState").classList.toggle("stressed", load >= 1);

  const a = $("aggressorMetrics"); a.innerHTML = "";
  renderMetric(a, "Physical power", state.aggressor.power); renderMetric(a, "Reputation", state.aggressor.reputation);
  renderMetric(a, "Resolve", state.intel.resolve || "?", !!state.intel.resolve); renderMetric(a, "Allies nearby", state.intel.allies || "?", !!state.intel.allies);
  renderMetric(a, "Weapons", state.intel.weapons || "?", !!state.intel.weapons); renderMetric(a, "Fear", state.intel.fear || "?", !!state.intel.fear);
  const d = $("defenderMetrics"); d.innerHTML = "";
  renderMetric(d, "Resolve", state.defender.resolve); renderMetric(d, "Reputation", state.defender.reputation); renderMetric(d, "Self-control", state.defender.selfControl);

  $("knowledgeLabel").textContent = state.observations === 0 ? "Туманная" : state.observations < 3 ? "Вероятностная" : "Рабочая гипотеза";
  $("knowledgeFill").style.width = `${Math.min(100, 18 + state.observations * 25)}%`;
  $("signalList").innerHTML = state.signals.length ? state.signals.slice(0, 3).map(x => `<li>${x}</li>`).join("") : "<li>Пока только первое впечатление.</li>";
  const fieldNames = ["Один на один", "Сцена видима", "Коллективное поле", "Институциональное поле"];
  $("fieldLabel").textContent = fieldNames[clamp(state.field, 0, 3)];
  $("fieldDescription").textContent = state.field === 0 ? "Изоляция усиливает физическое преимущество агрессора." : state.field === 1 ? "Наблюдение повышает цену давления, но свидетелей можно увести или дискредитировать." : state.field === 2 ? "Коалиция сохраняется дольше текущей сцены." : "Правила и последствия ограничивают обе стороны.";
  const cost = externalCost(state);
  $("externalCostLabel").textContent = cost < 6 ? "Низкая" : cost < 10 ? "Средняя" : "Высокая"; $("externalCostFill").style.width = `${Math.min(100, cost / 15 * 100)}%`;
  $("debtLabel").textContent = state.debt === 0 ? "Reputation Debt: нет" : `Reputation Debt: ${state.debt} · просто отступить труднее`;
  $("coreMetrics").innerHTML = [["Danger", state.danger], ["Fear", state.defender.fear], ["Autonomy", state.autonomy]].map(([k,v]) => `<div class="core-metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
  const resources = [["Witnesses", state.witnesses], ["Evidence", state.evidence], ["Allies", state.defender.allies], ["Institution", state.defender.institution], ["Uncertainty", state.uncertainty], ["Rep. Debt", state.debt]];
  $("resourceStrip").innerHTML = resources.map(([k,v]) => `<div class="resource-item ${k === "Rep. Debt" ? "debt" : ""}"><span>${k}</span><strong>${v}</strong></div>`).join("");
  $("effectChips").innerHTML = state.effects.map(e => `<span class="effect-chip ${/−|отступает|exit|снижен|сохраняется/i.test(e) ? "good" : /\+|растёт|penalty/i.test(e) ? "bad" : ""}">${e}</span>`).join("");
  $("debugPanel").classList.toggle("hidden", !debugEnabled);
  $("debugText").textContent = state.debug || `Начальное состояние рассчитано функциями движка.\n${formulaLine(state)}\nStress load = max(0, Fear ${state.defender.fear} − Self-Control ${state.defender.selfControl}) = ${stressLoad(state)}.\nWorld seed: ${state.seed}.`;
  $("debugFormula").textContent = `P=${pressure(state)} · C=${externalCost(state)} · NET=${netIncentive(state)} · DEBT=${state.debt}`;

  const actions = $("actionGrid"); actions.innerHTML = "";
  SCENARIO.actions.forEach(action => {
    const distorted = action.assertive && load >= 2, btn = document.createElement("button");
    btn.className = `action-button${distorted ? " fear-distorted" : ""}`; btn.disabled = !available(action);
    const profile = action.profile.map(x => `<em class="${/^\+|^− Danger|^− Fear|^− Control|^− Escalation/.test(x) ? "up" : /^− Autonomy|^\+ Danger|^\+ Escalation|^\+ Debt|^\+ Future/.test(x) ? "down" : ""}">${x}</em>`).join("");
    btn.innerHTML = `<span class="action-icon">${action.icon}</span><span class="risk">риск: ${riskLabel(action)}</span><strong>${action.name}</strong><small>${action.hint}</small><span class="action-profile">${profile}</span>${distorted ? "<span class=\"fear-note\">Страх делает риск субъективно выше</span>" : ""}`;
    btn.addEventListener("click", () => takeAction(action.id)); actions.appendChild(btn);
  });
  $("historyCount").textContent = `${state.history.length} ${state.history.length === 1 ? "событие" : "событий"}`;
  $("historyList").innerHTML = state.history.map(h => `<li><strong>Ход ${h.turn} · ${h.action}</strong><br>${h.text}</li>`).join("");
}

const OUTCOMES = {
  "safe-exit": ["Безопасный выход", "Вы не выиграли спор — вы прекратили опасную сцену, сохранив возможность действовать дальше.", "В"],
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
  if (!state.used.has("offerExit") && state.debt > 0) return "Альтернативный путь: после роста External Cost предложить нейтральный выход.";
  return "Альтернативный путь: временная уступка могла сохранить безопасность сейчас, но потребовала бы восстановления автономии.";
}
function showResult() {
  $("gameView").classList.add("hidden"); $("resultView").classList.remove("hidden");
  const [name, text, seal] = OUTCOMES[state.outcome];
  $("resultTitle").textContent = name; $("resultSummary").textContent = "Здесь нет одного счёта победы. Итог разделяет безопасность сейчас и свободу в следующих столкновениях.";
  $("outcomeSeal").textContent = seal; $("outcomeName").textContent = name; $("outcomeText").textContent = text;
  const scores = { "Physical safety": state.physicalSafety, "Autonomy": state.autonomy, "Reputation": state.defender.reputation, "Long-term safety": state.longTermSafety, "Institutional control": state.defender.institution, "De-escalation": 10 - state.escalation, "Psychological reserve": 10 - state.psychologicalCost };
  $("scoreBars").innerHTML = Object.entries(scores).map(([k,v]) => `<div class="score-row"><span>${k}</span><div class="score-track"><i style="width:${clamp(v)*10}%"></i></div><strong>${clamp(v)}</strong></div>`).join("");
  const strategicExit = ["safe-exit", "face-saving", "deterrence", "institutional", "contained"].includes(state.outcome);
  $("lessonTitle").textContent = strategicExit ? "Как изменился расчёт сторон" : state.field >= 2 || state.defender.institution >= 2 ? "Как изменилось игровое поле" : "Почему поле осталось выгодным агрессору";
  $("causalChain").innerHTML = buildCausalChain().map(x => `<li>${x}</li>`).join("");
  const best = [...state.history].sort((a,b) => b.weight - a.weight)[0];
  $("turningPoint").innerHTML = best ? `<strong>Поворотный ход:</strong> ${best.action}. Он сильнее всего изменил следующий выбор обеих сторон.` : "<strong>Поворотный ход:</strong> сцена закончилась до формирования стратегии.";
  $("alternativeText").innerHTML = `<strong>${alternativeStrategy()}</strong><br>Скрытый профиль этой партии: ${state.world.id}; он был выбран до первого хода.`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startGame() { state = freshState(); $("introView").classList.add("hidden"); $("resultView").classList.add("hidden"); $("gameView").classList.remove("hidden"); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
function tickSound() {
  try { const ctx = new (window.AudioContext || window.webkitAudioContext)(), osc = ctx.createOscillator(), gain = ctx.createGain(); osc.frequency.value = 180; gain.gain.setValueAtTime(.025, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .08); osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .08); } catch (_) { /* optional */ }
}
function openModel() {
  $("modelFormulaBox").innerHTML = [
    `Pressure = Power × Credibility + Uncertainty × ${WEIGHTS.uncertainty} + positive Control × ${WEIGHTS.control} + Debt × ${WEIGHTS.debt} + Weapons × ${WEIGHTS.weapons}`,
    `External Cost = Witnesses × Reliability × ${WEIGHTS.witnesses} + Evidence × ${WEIGHTS.evidence} + Allies × ${WEIGHTS.allies} + Institution × Quality × ${WEIGHTS.institution} + Fearₐ × ${WEIGHTS.aggressorFear}`,
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

window.ConflictSimulator = { SCENARIO, WORLD_VARIANTS, WEIGHTS, freshState, pressure, externalCost, futureBenefit, netIncentive, stressLoad };
