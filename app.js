"use strict";

const SCENARIO = {
  id: "school-corridor",
  title: "Чужое правило",
  maxTurns: 10,
  stages: ["PROBE", "BOUNDARY TEST", "THREAT", "RESISTANCE", "PUNISHMENT", "ESCALATION", "COALITION", "DETERRENCE", "EXIT"],
  actors: {
    aggressor: { power: 7, reputation: 7, allies: 4, institution: 1, resolve: 7, weapons: 0, fear: 2, selfControl: 5 },
    defender: { power: 4, reputation: 2, allies: 2, institution: 0, resolve: 5, fear: 6, selfControl: 6 }
  },
  hidden: ["weapons", "resolve", "allies", "fear"],
  actions: [
    { id: "comply", icon: "↓", name: "Уступить", hint: "Снизить риск сейчас, отдав блокнот", risk: "низкий сейчас" },
    { id: "refuse", icon: "—", name: "Отказать", hint: "Не принять чужое правило", risk: "высокий" },
    { id: "delay", icon: "◷", name: "Тянуть время", hint: "Дождаться движения в коридоре", risk: "средний" },
    { id: "leave", icon: "↗", name: "Уйти", hint: "Попытаться физически выйти из сцены", risk: "средний" },
    { id: "witnesses", icon: "◎", name: "Искать свидетелей", hint: "Переместиться к открытым дверям", risk: "низкий" },
    { id: "document", icon: "▣", name: "Зафиксировать", hint: "Создать проверяемое свидетельство", risk: "средний" },
    { id: "appeal", icon: "⌂", name: "Обратиться к взрослым", hint: "Включить школьные правила", risk: "ответный" },
    { id: "coalition", icon: "⋈", name: "Собрать союз", hint: "Договориться с другими учениками", risk: "время" },
    { id: "boundary", icon: "□", name: "Обозначить границу", hint: "Ясно назвать неприемлемое", risk: "средний" },
    { id: "deescalate", icon: "≈", name: "Снизить градус", hint: "Не подчиниться и убрать повод", risk: "низкий" },
    { id: "observe", icon: "◇", name: "Наблюдать", hint: "Проверить блеф и окружение", risk: "время" },
    { id: "offerExit", icon: "↔", name: "Предложить выход", hint: "Дать отступить без потери лица", risk: "контекст" }
  ]
};

const $ = (id) => document.getElementById(id);
const clamp = (n, min = 0, max = 10) => Math.max(min, Math.min(max, n));
const signed = (n) => `${n > 0 ? "+" : ""}${n}`;

let state;
let debugEnabled = false;
let soundEnabled = true;

function freshState() {
  return {
    turn: 1, stage: 0, control: 3, autonomy: 8, escalation: 1, danger: 3,
    uncertainty: 7, evidence: 0, witnesses: 0, field: 0,
    aggressor: { ...SCENARIO.actors.aggressor }, defender: { ...SCENARIO.actors.defender },
    debt: 0, futureDemand: 3, physicalSafety: 8, longTermSafety: 5, psychologicalCost: 2,
    revealed: new Set(["power", "reputation"]), history: [], lastAction: null,
    situationTitle: "Он пробует границу",
    situationText: "Старший ученик преграждает путь и просит блокнот так, будто отказ не предусмотрен. Пока это звучит почти буднично — именно так проверяется граница.",
    event: "«Дай посмотреть блокнот. Я потом верну».", effects: [], debug: "Начальное давление = сила 7 × репутация 0.7 + неопределённость 2.1 + контроль 3 = 10.0",
    ended: false, outcome: null
  };
}

const ACTION_RULES = {
  comply(s) {
    const highDanger = s.danger >= 7;
    apply(s, { "defender.fear": -2, danger: -3, autonomy: -2, futureDemand: 2, "aggressor.reputation": 1, control: 2, longTermSafety: -2, psychologicalCost: 1 });
    return result("Вы отдаёте блокнот. Напряжение падает — но требование становится работающим правилом.", ["Fear −2", "Danger −3", "Autonomy −2", "Будущие требования +2"], `Уступка: немедленная безопасность ${highDanger ? "была приоритетом" : "куплена ценой автономии"}.`);
  },
  refuse(s) {
    const support = s.witnesses + s.defender.allies + s.defender.institution;
    const shock = support >= 7 ? 1 : 3;
    apply(s, { "defender.fear": shock, autonomy: 1, control: support >= 7 ? -2 : 1, escalation: 1, danger: support >= 7 ? 0 : 2, "defender.reputation": 1, psychologicalCost: 1 });
    s.debt += 2;
    return result(support >= 7 ? "Вы отказываете при заметной поддержке. Угроза перестаёт быть частным делом." : "Вы прямо отказываете. Граница ясна, но теперь агрессор должен решить, подтверждать ли угрозу.", [`Fear ${signed(shock)}`, "Autonomy +1", "Reputation Debt +2", `Danger ${signed(support >= 7 ? 0 : 2)}`], `Опора = свидетели ${s.witnesses} + союзники ${s.defender.allies} + институт ${s.defender.institution} = ${support}.`);
  },
  delay(s) {
    const gain = s.turn >= 4 ? 2 : 1;
    apply(s, { control: -gain, "defender.fear": -1, witnesses: gain, uncertainty: -1, psychologicalCost: 1 });
    return result("Вы не соглашаетесь и не бросаете вызов — задаёте вопросы и выигрываете время. В коридоре появляются люди.", [`Control ${signed(-gain)}`, `Witnesses +${gain}`, "Uncertainty −1", "Psychological cost +1"], `Ценность времени растёт по мере приближения взрослых: модификатор хода = ${gain}.`);
  },
  leave(s) {
    const chance = clamp(7 - s.control + s.witnesses + s.defender.allies / 2, 1, 9);
    if (chance >= 5) {
      apply(s, { control: -3, danger: -2, "defender.fear": -2, autonomy: 1, longTermSafety: 1 });
      s.outcome = "safe-exit";
      return result("Вы выходите к людной лестнице. Конфликт прекращается, не став решением вопроса о статусе.", ["Control −3", "Danger −2", "Autonomy +1", "Безопасный выход"], `Шанс выхода = 7 − control ${s.control + 3} + witnesses ${s.witnesses} + allies/2 = ${chance}.`);
    }
    apply(s, { control: 2, danger: 2, "defender.fear": 2, escalation: 1, physicalSafety: -1 });
    return result("Он блокирует путь. Попытка уйти не сработала и показала, что пространство пока контролирует он.", ["Control +2 агрессору", "Danger +2", "Fear +2", "Safety −1"], `Шанс выхода ${chance}/10: контроль агрессора перевесил доступные маршруты.`);
  },
  witnesses(s) {
    const gain = s.turn <= 3 ? 2 : 3;
    apply(s, { witnesses: gain, field: 1, uncertainty: -1, control: -2, "defender.fear": -1, longTermSafety: 1 });
    return result("Вы смещаетесь к открытой двери класса и говорите громче. Теперь ситуация видима другим.", [`Witnesses +${gain}`, "Control −2", "Fear −1", "Long-term safety +1"], `Смена поля: приватность давления уменьшена на ${gain}; физическая сила не изменилась, её полезность — да.`);
  },
  document(s) {
    const visibleRisk = s.witnesses === 0 ? 2 : 0;
    apply(s, { evidence: 3, uncertainty: -2, "defender.fear": visibleRisk, control: -1, danger: visibleRisk, longTermSafety: 2 });
    return result(visibleRisk ? "Вы начинаете запись. Он замечает это и злится, но теперь у конфликта появляется след." : "При свидетелях вы фиксируете требование. Отрицать произошедшее становится труднее.", ["Evidence +3", "Uncertainty −2", `Immediate danger ${signed(visibleRisk)}`, "Long-term safety +2"], `Риск фиксации = ${s.witnesses === 0 ? "+2 без свидетелей" : "0 при свидетелях"}. Доказательства повышают будущую цену давления.`);
  },
  appeal(s) {
    const proof = s.evidence + s.witnesses;
    const gain = proof >= 4 ? 4 : 2;
    apply(s, { "defender.institution": gain, control: -3, "defender.allies": 1, "defender.fear": -1, longTermSafety: gain, danger: proof >= 4 ? -2 : 1, field: 2 });
    if (proof >= 4) s.outcome = "institutional";
    return result(proof >= 4 ? "Свидетельства делают обращение конкретным. Дежурный учитель вмешивается, и конфликт переходит в поле правил." : "Вы обращаетесь к взрослому. Пока доказательств мало, вмешательство неполное, а риск ответа остаётся.", [`Institution +${gain}`, "Control −3", "Allies +1", `Danger ${signed(proof >= 4 ? -2 : 1)}`], `Сила обращения: evidence ${s.evidence} + witnesses ${s.witnesses} = ${proof}; институциональный прирост = ${gain}.`);
  },
  coalition(s) {
    const gain = s.turn >= 3 ? 3 : 2;
    apply(s, { "defender.allies": gain, control: -2, field: 2, longTermSafety: 2, "defender.fear": -1, futureDemand: -1 });
    return result("Вы договариваетесь идти вместе с теми, кого он уже пробовал давить. Личная проблема становится общей.", [`Allies +${gain}`, "Control −2", "Future demands −1", "Long-term safety +2"], `Коалиция масштабируется от накопленного опыта: прирост союзников = ${gain}.`);
  },
  boundary(s) {
    const credible = s.witnesses + s.defender.allies + s.defender.reputation;
    apply(s, { autonomy: 1, "defender.reputation": 1, control: credible >= 7 ? -2 : 0, escalation: credible >= 7 ? 0 : 1, "defender.fear": credible >= 7 ? -1 : 1 });
    s.debt += 1;
    return result(credible >= 7 ? "Вы коротко называете границу — и за словами видна опора. Требование теряет безусловность." : "Вы называете границу. Она сохраняет автономию, но без достаточной опоры повышает ставку.", ["Autonomy +1", "Reputation +1", `Control ${signed(credible >= 7 ? -2 : 0)}`, `Fear ${signed(credible >= 7 ? -1 : 1)}`], `Достоверность границы = witnesses ${s.witnesses} + allies ${s.defender.allies} + reputation ${s.defender.reputation} = ${credible}.`);
  },
  deescalate(s) {
    apply(s, { escalation: -1, danger: -2, control: -1, "defender.fear": -1, autonomy: s.autonomy < 5 ? -1 : 0 });
    return result("Вы не отдаёте вещь, но предлагаете закончить разговор без публичного вызова. Температура снижается.", ["Escalation −1", "Danger −2", "Fear −1", "Control −1"], `Деэскалация снижает температуру, но не создаёт внешней опоры. Autonomy modifier = ${s.autonomy < 5 ? -1 : 0}.`);
  },
  observe(s) {
    const revealable = SCENARIO.hidden.filter(k => !s.revealed.has(k));
    const key = revealable[0];
    if (key) s.revealed.add(key);
    apply(s, { uncertainty: -2, "defender.fear": -1, control: 1, psychologicalCost: 1 });
    const labels = { weapons: "оружия нет", resolve: "его решимость заметно ниже репутации", allies: "его друзья сейчас не рядом", fear: "он боится вмешательства взрослых" };
    return result(`Вы следите за руками, взглядом и коридором. Новая информация: ${key ? labels[key] : "блеф уже почти прозрачен"}.`, ["Uncertainty −2", "Fear −1", "Control +1 агрессору", key ? `Revealed: ${key}` : "No new hidden data"], `Наблюдение покупает информацию временем: открыто ${key || "всё"}, но контроль временно +1 агрессору.`);
  },
  offerExit(s) {
    const cost = externalCost(s);
    const works = s.debt > 0 && cost >= 7;
    if (works) {
      apply(s, { escalation: -2, danger: -3, control: -3, "defender.fear": -2, longTermSafety: 2 });
      s.outcome = "face-saving";
      return result("Вы оставляете ему нейтральный повод закончить разговор: «Учитель идёт, разойдёмся». Он отступает, не признавая поражения.", ["Face-saving exit", "Danger −3", "Escalation −2", "Long-term safety +2"], `Выход принят: reputation debt ${s.debt} > 0 и внешняя цена ${cost} ≥ 7.`);
    }
    apply(s, { control: 1, "defender.fear": 1, autonomy: -1 });
    return result("Цена продолжения для него ещё невелика. Предложение звучит как просьба и не меняет его расчёт.", ["Control +1 агрессору", "Fear +1", "Autonomy −1"], `Выход не принят: debt ${s.debt}, внешняя цена ${cost}; нужно debt > 0 и cost ≥ 7.`);
  }
};

function apply(obj, changes) {
  Object.entries(changes).forEach(([path, delta]) => {
    const parts = path.split(".");
    if (parts.length === 1) obj[path] = (obj[path] || 0) + delta;
    else obj[parts[0]][parts[1]] = (obj[parts[0]][parts[1]] || 0) + delta;
  });
  ["autonomy", "danger", "uncertainty", "escalation", "physicalSafety", "longTermSafety", "psychologicalCost", "futureDemand"].forEach(k => obj[k] = clamp(obj[k]));
  [obj.aggressor, obj.defender].forEach(actor => Object.keys(actor).forEach(k => actor[k] = clamp(actor[k])));
  obj.control = clamp(obj.control, -10, 10);
}

function result(text, effects, debug) { return { text, effects, debug }; }

function externalCost(s) {
  return Math.round(s.witnesses * 1.2 + s.evidence * 1.4 + s.defender.allies * .5 + s.defender.institution * 1.4 + s.aggressor.fear);
}

function pressure(s) {
  const credibility = (s.aggressor.reputation + s.aggressor.resolve) / 20;
  return +(s.aggressor.power * credibility + s.uncertainty * .3 + Math.max(0, s.control) * .35 + s.debt * .4).toFixed(1);
}

function aggressorResponse(s) {
  const cost = externalCost(s);
  const p = pressure(s);
  const net = +(p - cost * .55).toFixed(1);
  let response;
  if (s.outcome) return { text: "Конфликт получил выход.", effects: [], debug: `Pressure ${p}; external cost ${cost}; ранее сработал выход.` };
  if (cost >= 12 && s.debt <= 2) {
    apply(s, { control: -3, danger: -2, "aggressor.fear": 2, escalation: -1, longTermSafety: 1 });
    s.outcome = "deterrence";
    response = result("Он оценивает свидетелей, доказательства и возможные последствия — и прекращает давление.", ["Агрессор отступает", "Control −3", "Danger −2"], `ИИ: pressure ${p} − cost ${cost}×0.55 = ${net}. Высокая внешняя цена и малый долг репутации → отступление.`);
  } else if (cost >= 8 && s.debt > 0) {
    apply(s, { danger: -1, control: -1, "aggressor.fear": 1 });
    response = result("Он повторяет требование, но не усиливает его. Видно, что ему нужен способ выйти, не потеряв лицо.", ["Aggressor Fear +1", "Danger −1", "Открыт Face-Saving Exit"], `ИИ: net pressure ${net}. Цена высока (${cost}), но reputation debt ${s.debt} мешает просто отступить.`);
  } else if (net > 3.5 && s.control >= 2) {
    const punish = s.debt >= 3 && s.escalation >= 3;
    apply(s, { escalation: 1, danger: punish ? 2 : 1, "defender.fear": punish ? 2 : 1, control: 1, physicalSafety: punish ? -2 : 0, "aggressor.reputation": punish ? 1 : 0 });
    response = result(punish ? "Он толкает вас плечом и выхватывает блокнот, подтверждая угрозу действием." : "Он повышает голос и превращает просьбу в условие: «Отдай — или будет хуже».", punish ? ["Safety −2", "Fear +2", "Reputation агрессора +1", "Escalation +1"] : ["Fear +1", "Danger +1", "Control +1", "Reputation Debt растёт"], `ИИ: net pressure ${net} > 3.5 и control ${s.control - 1} ≥ 2 → ${punish ? "исполнение угрозы" : "эскалация"}.`);
    if (!punish) s.debt += 1;
  } else {
    apply(s, { control: -1, "aggressor.fear": 1, danger: -1 });
    response = result("Он повторяет требование, но следит за окружением. Давление уже не выглядит безусловным.", ["Control −1", "Aggressor Fear +1", "Danger −1"], `ИИ: net pressure ${net} недостаточно для дорогой эскалации → удержание позиции.`);
  }
  return response;
}

function takeAction(id) {
  if (state.ended) return;
  const action = SCENARIO.actions.find(a => a.id === id);
  const before = snapshot();
  const player = ACTION_RULES[id](state);
  const ai = aggressorResponse(state);
  state.lastAction = id;
  state.event = `${player.text} ${ai.text}`;
  state.effects = [...player.effects, ...ai.effects].slice(0, 6);
  state.debug = `${player.debug}\n${ai.debug}\n\nSTATE Δ: ${diff(before, snapshot())}`;
  state.history.unshift({ turn: state.turn, action: action.name, text: state.event });
  state.turn += 1;
  state.stage = clamp(Math.max(state.stage, state.escalation), 0, SCENARIO.stages.length - 1);
  updateSituation();
  checkEnd();
  if (soundEnabled) tickSound();
  render();
}

function snapshot() {
  return { control: state.control, autonomy: state.autonomy, escalation: state.escalation, danger: state.danger, fear: state.defender.fear, uncertainty: state.uncertainty, witnesses: state.witnesses, evidence: state.evidence, institution: state.defender.institution, allies: state.defender.allies };
}

function diff(a, b) {
  return Object.keys(a).filter(k => a[k] !== b[k]).map(k => `${k} ${signed(b[k] - a[k])}`).join(" · ") || "без численных изменений";
}

function updateSituation() {
  const cost = externalCost(state);
  if (state.outcome) {
    state.situationTitle = "Появился выход";
    state.situationText = "Давление больше не определяет все доступные варианты. Конфликт может завершиться без подчинения.";
  } else if (cost >= 8 && state.debt > 0) {
    state.situationTitle = "Цена давления выросла";
    state.situationText = "Он уже связан собственной угрозой, но внешние последствия делают её исполнение дорогим. Сейчас особенно важен выход с сохранением лица.";
  } else if (state.escalation >= 4) {
    state.situationTitle = "Угроза становится действием";
    state.situationText = "Ставка высока. Немедленная безопасность важнее символического выигрыша, но поле всё ещё можно расширить.";
  } else if (state.field >= 2) {
    state.situationTitle = "Это уже не один на один";
    state.situationText = "Союзники, свидетельства и правила меняют расчёт сторон. Его физическая сила осталась прежней, но стоит меньше.";
  } else {
    state.situationTitle = "Граница ещё подвижна";
    state.situationText = "Он проверяет, станет ли разовая уступка постоянным правилом. Неизвестность всё ещё работает на него.";
  }
}

function checkEnd() {
  if (state.outcome || state.autonomy <= 1 || state.physicalSafety <= 2 || state.turn > SCENARIO.maxTurns) {
    state.ended = true;
    if (!state.outcome) {
      if (state.autonomy <= 1) state.outcome = "submission";
      else if (state.physicalSafety <= 2) state.outcome = "breakdown";
      else state.outcome = state.autonomy >= 6 && state.longTermSafety >= 6 ? "contained" : "ambiguous";
    }
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

function renderMetric(container, label, value, known = true) {
  const row = document.createElement("div");
  row.className = `metric-row${known ? "" : " unknown"}`;
  row.innerHTML = `<label>${label}</label><strong>${known ? value : "?"}</strong><div class="metric-bar"><i style="width:${known ? value * 10 : 0}%"></i></div>`;
  container.appendChild(row);
}

function render() {
  $("roundLabel").textContent = `ХОД ${Math.min(state.turn, SCENARIO.maxTurns)} / ${SCENARIO.maxTurns}`;
  $("stageName").textContent = SCENARIO.stages[state.stage];
  $("situationTitle").textContent = state.situationTitle;
  $("situationText").textContent = state.situationText;
  $("eventText").textContent = state.event;
  $("controlMarker").style.left = `${(state.control + 10) * 5}%`;
  $("controlValue").textContent = state.control === 0 ? "равновесие" : `${signed(Math.abs(state.control))} ${state.control > 0 ? "агрессору" : "защитнику"}`;

  const a = $("aggressorMetrics"); a.innerHTML = "";
  renderMetric(a, "Physical power", state.aggressor.power, true);
  renderMetric(a, "Reputation", state.aggressor.reputation, true);
  renderMetric(a, "Allies", state.aggressor.allies, state.revealed.has("allies"));
  renderMetric(a, "Resolve", state.aggressor.resolve, state.revealed.has("resolve"));
  renderMetric(a, "Weapons", state.aggressor.weapons, state.revealed.has("weapons"));
  renderMetric(a, "Fear", state.aggressor.fear, state.revealed.has("fear"));

  const d = $("defenderMetrics"); d.innerHTML = "";
  renderMetric(d, "Resolve", state.defender.resolve);
  renderMetric(d, "Allies", state.defender.allies);
  renderMetric(d, "Institution", state.defender.institution);
  renderMetric(d, "Reputation", state.defender.reputation);
  renderMetric(d, "Self-control", state.defender.selfControl);

  const known = 2 + SCENARIO.hidden.filter(k => state.revealed.has(k)).length;
  $("knowledgeLabel").textContent = known <= 2 ? "Низкое" : known <= 4 ? "Частичное" : "Высокое";
  $("knowledgeFill").style.width = `${known / 6 * 100}%`;

  const fieldNames = ["Один на один", "Свидетели рядом", "Расширенное поле", "Институциональное поле"];
  $("fieldLabel").textContent = fieldNames[clamp(state.field, 0, 3)];
  $("fieldDescription").textContent = state.field === 0 ? "Изоляция усиливает физическое преимущество агрессора." : state.field === 1 ? "Наблюдение повышает цену открытого давления." : state.field === 2 ? "Союзники и доказательства меняют баланс ресурсов." : "Правила и последствия ограничивают обе стороны.";

  const core = $("coreMetrics");
  core.innerHTML = [["Fear", state.defender.fear], ["Autonomy", state.autonomy], ["Danger", state.danger], ["Uncertainty", state.uncertainty]].map(([k,v]) => `<div class="core-metric"><span>${k}</span><strong>${v}</strong></div>`).join("");

  $("effectChips").innerHTML = state.effects.map(e => `<span class="effect-chip ${/−|отступает|выход|снижен/i.test(e) ? "good" : /\+|растёт/i.test(e) ? "bad" : ""}">${e}</span>`).join("");
  $("debugPanel").classList.toggle("hidden", !debugEnabled);
  $("debugText").textContent = state.debug;
  $("debugFormula").textContent = `P=${pressure(state)} · C=${externalCost(state)} · DEBT=${state.debt}`;

  const actions = $("actionGrid"); actions.innerHTML = "";
  SCENARIO.actions.forEach(action => {
    const btn = document.createElement("button");
    btn.className = "action-button";
    btn.disabled = !available(action);
    btn.innerHTML = `<span class="action-icon">${action.icon}</span><span class="risk">${action.risk}</span><strong>${action.name}</strong><small>${action.hint}</small>`;
    btn.addEventListener("click", () => takeAction(action.id));
    actions.appendChild(btn);
  });

  $("historyCount").textContent = `${state.history.length} ${state.history.length === 1 ? "событие" : "событий"}`;
  $("historyList").innerHTML = state.history.map(h => `<li><strong>Ход ${h.turn} · ${h.action}</strong><br>${h.text}</li>`).join("");
}

const OUTCOMES = {
  "safe-exit": ["Безопасный выход", "Вы не выиграли спор — вы прекратили опасную сцену, сохранив возможность действовать дальше.", "В"],
  "face-saving": ["Выход без поражения", "Цена давления выросла, а нейтральный повод позволил агрессору остановиться, не подтверждая угрозу.", "↔"],
  deterrence: ["Сдерживание", "Ожидаемая цена продолжения стала выше выгоды. Давление прекратилось без исполнения угрозы.", "С"],
  institutional: ["Институциональное решение", "Конфликт перешёл из личного противостояния в поле правил, свидетельств и последствий.", "И"],
  contained: ["Устойчивое сдерживание", "Вы сохранили автономию и создали условия, в которых повторное давление стало менее выгодным.", "У"],
  submission: ["Система контроля", "Немедленный риск снизился ценой почти полной автономии. Разовое требование стало правилом.", "К"],
  breakdown: ["Опасная эскалация", "Физическая безопасность резко ухудшилась. Стратегическая задача теперь — выход и внешняя помощь.", "!"],
  ambiguous: ["Хрупкое равновесие", "Открытый конфликт закончился, но причины давления и риск повторения сохранились.", "≈"]
};

function showResult() {
  $("gameView").classList.add("hidden");
  $("resultView").classList.remove("hidden");
  const [name, text, seal] = OUTCOMES[state.outcome];
  $("resultTitle").textContent = name;
  $("resultSummary").textContent = "Здесь нет одного счёта победы. Посмотрите, что сохранилось сейчас и что изменилось для следующего конфликта.";
  $("outcomeSeal").textContent = seal;
  $("outcomeName").textContent = name;
  $("outcomeText").textContent = text;
  const scores = {
    "Physical safety": state.physicalSafety,
    "Autonomy": state.autonomy,
    "Reputation": state.defender.reputation,
    "Long-term safety": state.longTermSafety,
    "Institutional control": state.defender.institution,
    "De-escalation": 10 - state.escalation,
    "Psychological reserve": 10 - state.psychologicalCost
  };
  $("scoreBars").innerHTML = Object.entries(scores).map(([k,v]) => `<div class="score-row"><span>${k}</span><div class="score-track"><i style="width:${clamp(v)*10}%"></i></div><strong>${clamp(v)}</strong></div>`).join("");
  const fieldChanged = state.field >= 2 || state.defender.institution >= 3;
  $("lessonTitle").textContent = fieldChanged ? "Вы меняли структуру ситуации" : "Вы действовали внутри чужого поля";
  $("lessonText").textContent = fieldChanged ? "Ваши сильнейшие ходы не увеличивали физическую силу. Они добавляли время, наблюдение, союзников и проверяемые последствия." : "Большинство решений оставляло конфликт изолированным и срочным. В таком поле неопределённость и физическое преимущество агрессора стоят дороже.";
  const best = [...state.history].reverse().find(h => /Свидетел|Зафиксировать|Обратиться|Собрать союз|Предложить выход/.test(h.action));
  $("turningPoint").innerHTML = best ? `<strong>Поворотный ход:</strong> ${best.action}. Именно здесь изменились не только числа, но и тип игры.` : `<strong>Упущенная возможность:</strong> добавить свидетелей, доказательства или союзников до прямого столкновения.`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startGame() {
  state = freshState();
  $("introView").classList.add("hidden");
  $("resultView").classList.add("hidden");
  $("gameView").classList.remove("hidden");
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function tickSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.frequency.value = 180; gain.gain.setValueAtTime(.025, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .08);
    osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .08);
  } catch (_) { /* sound is optional */ }
}

function openModel() { $("modelDialog").showModal(); }
$("startButton").addEventListener("click", startGame);
$("restartButton").addEventListener("click", startGame);
$("playAgainButton").addEventListener("click", startGame);
$("modelButton").addEventListener("click", openModel);
$("resultModelButton").addEventListener("click", openModel);
$("closeModelButton").addEventListener("click", () => $("modelDialog").close());
$("debugButton").addEventListener("click", () => { debugEnabled = !debugEnabled; $("debugButton").textContent = `Explain: ${debugEnabled ? "вкл" : "выкл"}`; $("debugButton").setAttribute("aria-pressed", debugEnabled); if (state) render(); });
$("soundButton").addEventListener("click", () => { soundEnabled = !soundEnabled; $("soundButton").textContent = soundEnabled ? "◉" : "○"; $("soundButton").setAttribute("aria-pressed", soundEnabled); });
$("historyToggle").addEventListener("click", () => { const list = $("historyList"); const open = list.classList.toggle("hidden") === false; $("historyToggle").setAttribute("aria-expanded", open); });
$("modelDialog").addEventListener("click", e => { if (e.target === $("modelDialog")) $("modelDialog").close(); });

window.ConflictSimulator = { SCENARIO, freshState, pressure, externalCost };
