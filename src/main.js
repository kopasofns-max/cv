import { demoStrategy } from "./demo.js";

const byId = (id) => document.getElementById(id);
const form = byId("strategy-form");
const submitButton = byId("submit-button");
const formMessage = byId("form-message");
const loading = byId("loading");
const result = byId("result");
const report = byId("report");
const resultTitle = byId("result-title");
const resultSummary = byId("result-summary");
const demoBadge = byId("demo-badge");
const toast = byId("toast");
const workerUrl = String(window.STRATEGY_CONFIG?.workerUrl || "").trim().replace(/\/$/, "");

let currentStrategy = null;
let toastTimer;
let requestController;

const glowCursor = byId("glow-cursor");
if (glowCursor && window.matchMedia("(hover: hover)").matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let cursorX = mouseX;
  let cursorY = mouseY;
  document.addEventListener("mousemove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;
    glowCursor.style.opacity = "1";
  });
  document.documentElement.addEventListener("mouseleave", () => { glowCursor.style.opacity = "0"; });
  const animateCursor = () => {
    cursorX += (mouseX - cursorX) * 0.1;
    cursorY += (mouseY - cursorY) * 0.1;
    glowCursor.style.left = `${cursorX}px`;
    glowCursor.style.top = `${cursorY}px`;
    window.requestAnimationFrame(animateCursor);
  };
  animateCursor();
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function appendList(parent, items, className = "clean-list") {
  const list = make("ul", className);
  (Array.isArray(items) ? items : []).forEach((item) => list.append(make("li", "", item)));
  parent.append(list);
  return list;
}

function addBlock(number, title, description) {
  const section = make("section", "report-block");
  const header = make("div", "report-block-header");
  header.append(make("span", "report-number", number));
  const heading = make("div");
  heading.append(make("h3", "", title));
  if (description) heading.append(make("p", "", description));
  header.append(heading);
  const body = make("div", "report-block-body");
  section.append(header, body);
  report.append(section);
  return body;
}

function renderStrategy(strategy, isDemo = false) {
  currentStrategy = strategy;
  report.replaceChildren();
  resultTitle.textContent = strategy.strategyTitle;
  resultSummary.textContent = strategy.summary;
  demoBadge.hidden = !isDemo;

  const assumptionsList = byId("assumptions-list");
  assumptionsList.replaceChildren();
  (strategy.assumptions || []).forEach((item) => assumptionsList.append(make("li", "", item)));
  byId("assumptions-panel").hidden = !strategy.assumptions?.length;

  const focus = addBlock("01", "Фокус и метрики", "Сначала определяем, что считаем результатом и как отличим рост от дорогой суеты.");
  const focusGrid = make("div", "focus-grid");
  const focusMain = make("div");
  focusMain.append(make("p", "focus-goal", strategy.focus.goal));
  const metrics = make("div", "metrics-table");
  (strategy.focus.targets || []).forEach((item) => {
    const row = make("div", "metric-row");
    row.append(make("strong", "", item.metric), make("span", "", item.logic));
    metrics.append(row);
  });
  focusMain.append(metrics);
  const focusSide = make("div");
  const metricBox = make("div", "focus-metric");
  metricBox.append(make("small", "", "Главная метрика"), make("strong", "", strategy.focus.primaryMetric));
  focusSide.append(metricBox, make("p", "subhead", "Ограничения"));
  focusSide.querySelector(".subhead").style.marginTop = "24px";
  appendList(focusSide, strategy.focus.guardrails);
  focusGrid.append(focusMain, focusSide);
  focus.append(focusGrid);

  const audience = addBlock("02", "Три сегмента аудитории", "Не «мужчины и женщины 18–45», а разные ситуации, боли и причины выбрать вас.");
  const audienceGrid = make("div", "audience-grid");
  (strategy.audience || []).forEach((segment) => {
    const card = make("article", "audience-card");
    card.append(make("h4", "", segment.name));
    [["Боли", segment.pains], ["Триггеры", segment.triggers], ["Барьеры", segment.barriers]].forEach(([label, items]) => {
      const group = make("div", "audience-group");
      group.append(make("strong", "", label));
      appendList(group, items, "");
      card.append(group);
    });
    card.append(make("p", "audience-message", segment.message));
    audienceGrid.append(card);
  });
  audience.append(audienceGrid);

  const positioning = addBlock("03", "Позиционирование и офферы", "Что обещаем, чем это отличается от альтернатив и какие доказательства ещё нужно собрать.");
  positioning.append(make("p", "positioning-lead", strategy.positioning.promise));
  const positioningGrid = make("div", "positioning-grid");
  const difference = make("div");
  difference.append(make("p", "subhead", "Отличие"), make("p", "", strategy.positioning.differentiation));
  const proof = make("div");
  proof.append(make("p", "subhead", "Что нужно доказать"));
  appendList(proof, strategy.positioning.proofNeeded);
  positioningGrid.append(difference, proof);
  positioning.append(positioningGrid);
  const offers = make("div", "offers-list");
  (strategy.positioning.offers || []).forEach((offer) => {
    const row = make("div", "offer-row");
    const content = make("div");
    content.append(make("strong", "", offer.segment));
    const offerText = make("div");
    offerText.append(make("strong", "", offer.offer));
    const landing = make("span", "", offer.landing);
    row.append(content, offerText, landing);
    offers.append(row);
  });
  positioning.append(offers);

  const channels = addBlock("04", "Каналы и связки", "Канал сам по себе не стратегия. Важна цепочка: аудитория → оффер → посадочная → дожим.");
  const channelList = make("div", "channel-list");
  (strategy.channels || []).forEach((channel) => {
    const row = make("article", "channel-row");
    const name = make("div");
    name.append(make("h4", "", channel.name), make("p", "channel-reason", channel.why));
    const audienceInfo = make("div");
    const audienceText = make("p");
    audienceText.append(make("strong", "", "Аудитория"), document.createTextNode(channel.audience));
    const offerText = make("p");
    offerText.append(make("strong", "", "Оффер"), document.createTextNode(channel.offer));
    audienceInfo.append(audienceText, offerText);
    const funnel = make("div");
    const funnelText = make("p");
    funnelText.append(make("strong", "", "Связка"), document.createTextNode(channel.funnel));
    funnel.append(funnelText, make("p", "channel-test", `Первый тест: ${channel.firstTest}`));
    row.append(name, audienceInfo, funnel);
    channelList.append(row);
  });
  channels.append(channelList);

  const creatives = addBlock("05", "Примеры креативов", "Не готовые шедевры, а конкретные отправные точки для первых тестов.");
  const creativeGrid = make("div", "creative-grid");
  (strategy.creatives || []).forEach((creative) => {
    const card = make("article", "creative-card");
    card.append(make("span", "creative-channel", creative.channel), make("h4", "", creative.hook), make("p", "", creative.text), make("span", "creative-cta", `CTA: ${creative.cta}`));
    creativeGrid.append(card);
  });
  creatives.append(creativeGrid);

  const plan = addBlock("06", "План на 30 дней", "Последовательность: измерить → запустить → сравнить → оставить работающее.");
  const planGrid = make("div", "plan-grid");
  (strategy.plan || []).forEach((period) => {
    const item = make("article", "plan-period");
    item.append(make("h4", "", period.period));
    appendList(item, period.actions, "");
    item.append(make("p", "plan-deliverable", period.deliverable));
    planGrid.append(item);
  });
  plan.append(planGrid);

  const economics = addBlock("07", "Экономика и контроль", "Какие цифры собирать и когда остановиться, если гипотеза не подтверждается.");
  const economicsGrid = make("div", "economics-grid");
  const formulas = make("div");
  formulas.append(make("p", "subhead", "Формулы"));
  const formulaList = make("div", "formula-list");
  (strategy.economics.metrics || []).forEach((metric) => {
    const row = make("div", "formula-row");
    row.append(make("strong", "", metric.name), make("span", "", metric.formula));
    formulaList.append(row);
  });
  formulas.append(formulaList);
  const data = make("div");
  data.append(make("p", "subhead", "Данные для проверки"));
  appendList(data, strategy.economics.dataNeeded);
  economicsGrid.append(formulas, data);
  economics.append(economicsGrid);
  const stops = make("div");
  stops.style.marginTop = "36px";
  stops.append(make("p", "subhead", "Стоп-правила"));
  appendList(stops, strategy.economics.stopRules);
  economics.append(stops);
  const questions = make("div");
  questions.style.marginTop = "36px";
  questions.append(make("p", "subhead", "Вопросы, которые закроют пробелы"));
  appendList(questions, strategy.openQuestions, "questions-list");
  economics.append(questions);

  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => resultTitle.focus({ preventScroll: true }), 400);
}

function setError(fieldName, message) {
  const field = byId(fieldName);
  const error = byId(`${fieldName}-error`);
  field.setAttribute("aria-invalid", message ? "true" : "false");
  error.textContent = message || "";
  error.hidden = !message;
}

function validateForm() {
  const business = byId("business").value.trim();
  const goal = byId("goal").value.trim();
  setError("business", business.length < 30 ? "Добавьте хотя бы пару конкретных деталей — минимум 30 символов." : "");
  setError("goal", goal.length < 5 ? "Сформулируйте цель: что именно должно измениться?" : "");
  if (business.length < 30) byId("business").focus();
  else if (goal.length < 5) byId("goal").focus();
  return business.length >= 30 && goal.length >= 5;
}

function showFormMessage(message) {
  formMessage.textContent = message;
  formMessage.hidden = !message;
}

function setLoading(active) {
  submitButton.disabled = active;
  submitButton.querySelector("span").textContent = active ? "Генерируем…" : "Собрать стратегию";
  loading.hidden = !active;
  if (active) {
    result.hidden = true;
    showFormMessage("");
    loading.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function getPayload() {
  const data = new FormData(form);
  return Object.fromEntries(data.entries());
}

async function requestStrategy(payload) {
  requestController = new AbortController();
  const timeout = window.setTimeout(() => requestController.abort(), 90000);
  try {
    const response = await fetch(`${workerUrl}/api/strategy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: requestController.signal
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(data?.error?.message || "Сервис вернул ошибку. Попробуйте ещё раз.");
      error.status = response.status;
      throw error;
    }
    if (!data?.strategy?.strategyTitle || !Array.isArray(data.strategy.audience) || !data.strategy.economics) {
      throw new Error("Ответ получен, но его структура неполная. Попробуйте сгенерировать стратегию ещё раз.");
    }
    return data.strategy;
  } finally {
    window.clearTimeout(timeout);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateForm()) return;
  if (!workerUrl) {
    showFormMessage("В этом превью API ещё не подключён. Нажмите «Демо-результат», чтобы посмотреть полный отчёт. Для реальной генерации нужно указать адрес Cloudflare Worker в config.js.");
    return;
  }
  setLoading(true);
  try {
    const strategy = await requestStrategy(getPayload());
    renderStrategy(strategy, false);
  } catch (error) {
    const message = error.name === "AbortError"
      ? "Gemini отвечает дольше обычного. Запрос остановлен через 90 секунд — попробуйте ещё раз."
      : error.status === 429
        ? "Слишком много запросов подряд. Подождите минуту и повторите."
        : error.message || "Не удалось создать стратегию. Проверьте соединение и попробуйте ещё раз.";
    showFormMessage(message);
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  } finally {
    setLoading(false);
  }
});

byId("business").addEventListener("input", (event) => {
  byId("business-count").textContent = `${event.target.value.length} / 1800`;
  if (event.target.value.trim().length >= 30) setError("business", "");
});
byId("goal").addEventListener("input", (event) => {
  if (event.target.value.trim().length >= 5) setError("goal", "");
});
form.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") form.requestSubmit();
});

byId("example-button").addEventListener("click", () => {
  const example = {
    business: "Кофейня «Север» в Волгограде, работает два года рядом с офисным кварталом. Продаём кофе, завтраки и десерты. Основные гости — сотрудники соседних офисов и жители района. Есть предзаказ через сообщения сообщества.",
    offer: "Средний чек 420 ₽, маржинальность около 65%",
    geography: "Волгоград, радиус пешей доступности",
    goal: "Увеличить выручку и число заказов по будням до 12:00",
    budget: "60 000 ₽ на первый месяц, включая тесты",
    current: "Ведём VK и обновляем геосервисы. Рекламу в Директе не запускали. Выручку по каналам пока не разделяем.",
    website: ""
  };
  Object.entries(example).forEach(([name, value]) => { byId(name).value = value; });
  byId("business-count").textContent = `${example.business.length} / 1800`;
  setError("business", "");
  setError("goal", "");
  showFormMessage("");
  byId("business").focus();
});

byId("demo-button").addEventListener("click", () => {
  if (requestController) requestController.abort();
  setLoading(false);
  showFormMessage("");
  renderStrategy(structuredClone(demoStrategy), true);
});

function strategyToMarkdown(s) {
  const lines = [`# ${s.strategyTitle}`, "", s.summary, "", "## Что проверить", ...(s.assumptions || []).map((x) => `- ${x}`), "", "## 01. Фокус и метрики", "", s.focus.goal, "", `**Главная метрика:** ${s.focus.primaryMetric}`, "", "### Показатели", ...(s.focus.targets || []).map((x) => `- **${x.metric}:** ${x.logic}`), "", "### Ограничения", ...(s.focus.guardrails || []).map((x) => `- ${x}`), "", "## 02. Аудитория"];
  (s.audience || []).forEach((x) => lines.push("", `### ${x.name}`, `- Боли: ${x.pains.join("; ")}`, `- Триггеры: ${x.triggers.join("; ")}`, `- Барьеры: ${x.barriers.join("; ")}`, `- Сообщение: ${x.message}`));
  lines.push("", "## 03. Позиционирование и офферы", "", s.positioning.promise, "", s.positioning.differentiation, "", "### Доказательства", ...(s.positioning.proofNeeded || []).map((x) => `- ${x}`), "", "### Офферы");
  (s.positioning.offers || []).forEach((x) => lines.push(`- **${x.segment}:** ${x.offer}. Посадочная: ${x.landing}`));
  lines.push("", "## 04. Каналы и связки");
  (s.channels || []).forEach((x) => lines.push("", `### ${x.name}`, `- Почему: ${x.why}`, `- Аудитория: ${x.audience}`, `- Оффер: ${x.offer}`, `- Связка: ${x.funnel}`, `- Первый тест: ${x.firstTest}`));
  lines.push("", "## 05. Креативы");
  (s.creatives || []).forEach((x) => lines.push("", `### ${x.channel}: ${x.hook}`, x.text, `**CTA:** ${x.cta}`));
  lines.push("", "## 06. План на 30 дней");
  (s.plan || []).forEach((x) => lines.push("", `### ${x.period}`, ...(x.actions || []).map((a) => `- ${a}`), `**Результат:** ${x.deliverable}`));
  lines.push("", "## 07. Экономика и контроль", "", "### Формулы", ...(s.economics.metrics || []).map((x) => `- **${x.name}:** ${x.formula}`), "", "### Данные", ...(s.economics.dataNeeded || []).map((x) => `- ${x}`), "", "### Стоп-правила", ...(s.economics.stopRules || []).map((x) => `- ${x}`), "", "### Открытые вопросы", ...(s.openQuestions || []).map((x) => `- ${x}`), "", "---", "Черновик создан с помощью ИИ. Цифры и решения требуют проверки на данных бизнеса.");
  return lines.join("\n");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3200);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = make("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("copy failed");
}

byId("copy-button").addEventListener("click", async () => {
  if (!currentStrategy) return;
  try {
    await copyText(strategyToMarkdown(currentStrategy));
    showToast("Стратегия скопирована в Markdown");
  } catch {
    showToast("Не удалось скопировать. Используйте скачивание Markdown.");
  }
});

byId("download-button").addEventListener("click", () => {
  if (!currentStrategy) return;
  const blob = new Blob([strategyToMarkdown(currentStrategy)], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = make("a");
  link.href = url;
  link.download = `${currentStrategy.strategyTitle.replace(/[\\/:*?"<>|]/g, "").slice(0, 70) || "стратегия"}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Файл Markdown сохранён");
});

byId("print-button").addEventListener("click", () => window.print());
byId("reset-button").addEventListener("click", () => {
  currentStrategy = null;
  result.hidden = true;
  report.replaceChildren();
  form.reset();
  byId("business-count").textContent = "0 / 1800";
  setError("business", "");
  setError("goal", "");
  showFormMessage("");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  window.setTimeout(() => byId("business").focus({ preventScroll: true }), 350);
});
