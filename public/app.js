const databaseName = "tsukue-no-hi";
const databaseVersion = 1;
const projectVersion = 1;
const maximumMaterials = 20;
const maximumSessions = 3000;
const sessionKey = "tsukue-no-hi-session";
const visitKey = "tsukue-no-hi-last-visit";
const activeMaterialKey = "tsukue-no-hi-active-material";
const timerKey = "tsukue-no-hi-active-timer";
const settingsId = "desk";
const automatedQa =
  new URLSearchParams(window.location.search).get("qa") === "1" || navigator.webdriver === true;

/** @type {IDBDatabase} */
let database;
/** @type {Array<Material>} */
let materials = [];
/** @type {Array<StudySession>} */
let sessions = [];
/** @type {DeskSettings} */
let settings = { id: settingsId, targetName: "", targetDate: "", weeklyGoal: 420 };
let activeMaterialId = "";
let timerModeMinutes = 0;
let timerInterval = 0;
/** @type {StudyTimer|null} */
let timer = null;

/**
 * @typedef {Object} Material
 * @property {string} id
 * @property {string} name
 * @property {"amber"|"blue"|"green"|"rose"|"violet"|"slate"} color
 * @property {number} weeklyGoal
 * @property {string} unit
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} StudySession
 * @property {string} id
 * @property {string} materialId
 * @property {string} startedAt
 * @property {number} minutes
 * @property {number|null} quantity
 * @property {1|2|3} focus
 * @property {string} note
 * @property {number} createdAt
 */

/**
 * @typedef {Object} DeskSettings
 * @property {"desk"} id
 * @property {string} targetName
 * @property {string} targetDate
 * @property {number} weeklyGoal
 */

/**
 * @typedef {Object} StudyTimer
 * @property {string} materialId
 * @property {number} limitMinutes
 * @property {number} startedAt
 * @property {number} elapsedBefore
 * @property {boolean} running
 * @property {boolean} done
 */

const elements = {
  emptyDesk: document.querySelector("[data-empty-desk]"),
  studyRoom: document.querySelector("[data-study-room]"),
  materialDialog: document.querySelector("[data-material-dialog]"),
  materialDialogKicker: document.querySelector("[data-material-dialog-kicker]"),
  materialDialogTitle: document.querySelector("[data-material-dialog-title]"),
  sessionDialog: document.querySelector("[data-session-dialog]"),
  targetDialog: document.querySelector("[data-target-dialog]"),
  reviewDialog: document.querySelector("[data-review-dialog]"),
  timerMaterial: document.querySelector("[data-timer-material]"),
  timerFace: document.querySelector("[data-timer-face]"),
  timerClock: document.querySelector("[data-timer-clock]"),
  timerProgress: document.querySelector("[data-timer-progress]"),
  timerModeLabel: document.querySelector("[data-timer-mode-label]"),
  timerStatus: document.querySelector("[data-timer-status]"),
  timerNote: document.querySelector("[data-timer-note]"),
  materialList: document.querySelector("[data-material-list]"),
  materialCount: document.querySelector("[data-material-count]"),
  todayMinutes: document.querySelector("[data-today-minutes]"),
  todaySessions: document.querySelector("[data-today-sessions]"),
  weekMinutes: document.querySelector("[data-week-minutes]"),
  weekGoal: document.querySelector("[data-week-goal]"),
  streak: document.querySelector("[data-streak]"),
  totalDays: document.querySelector("[data-total-days]"),
  targetLabel: document.querySelector("[data-target-label]"),
  targetDays: document.querySelector("[data-target-days]"),
  weekRange: document.querySelector("[data-week-range]"),
  weekColumns: document.querySelector("[data-week-columns]"),
  balanceList: document.querySelector("[data-balance-list]"),
  sessionFilter: document.querySelector("[data-session-filter]"),
  sessionList: document.querySelector("[data-session-list]"),
  sessionEmpty: document.querySelector("[data-session-empty]"),
  reviewSummary: document.querySelector("[data-review-summary]"),
  heatBoard: document.querySelector("[data-heat-board]"),
  shareNames: document.querySelector("[data-share-names]"),
  shareCanvas: document.querySelector("[data-share-canvas]"),
  importFile: document.querySelector("[data-import-file]"),
};

const text = (value, maximum = 240) =>
  String(value ?? "")
    .replaceAll("\u0000", "")
    .trim()
    .slice(0, maximum);

const finiteNumber = (value, minimum, maximum, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) return fallback;
  return number;
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
const isIsoDateTime = (value) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value)) && value.includes("T");
const hasOnlyKeys = (value, allowedKeys) =>
  Object.keys(value).length === allowedKeys.length &&
  Object.keys(value).every((key) => allowedKeys.includes(key));

const localDay = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const atLocalNoon = (day) => new Date(`${day}T12:00:00`);
const addDays = (date, amount) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};
const startOfWeek = (date = new Date()) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const weekday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - weekday);
  return result;
};
const endOfDay = (date) => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};
const formatMinutes = (minutes) => {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded}分`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours}時間${remainder}分` : `${hours}時間`;
};
const formatShortDate = (day) =>
  new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric", weekday: "short" }).format(
    atLocalNoon(day),
  );
const materialById = (id) => materials.find((material) => material.id === id);
const colorLabels = {
  amber: "琥珀",
  blue: "青",
  green: "緑",
  rose: "赤",
  violet: "紫",
  slate: "墨",
};

const makeSessionId = () => crypto.randomUUID();
let sessionId = makeSessionId();
let lastVisit = "";
try {
  const storedSession = localStorage.getItem(sessionKey) ?? "";
  sessionId = isUuid(storedSession) ? storedSession : makeSessionId();
  localStorage.setItem(sessionKey, sessionId);
  lastVisit = localStorage.getItem(visitKey) ?? "";
  localStorage.setItem(visitKey, localDay());
} catch {
  sessionId = makeSessionId();
}

const track = (name) => {
  if (automatedQa) return;
  void fetch("/api/events", {
    body: JSON.stringify({ name }),
    headers: {
      "content-type": "application/json",
      "x-tsukue-session": sessionId,
    },
    keepalive: true,
    method: "POST",
  }).catch(() => undefined);
};

const openDatabase = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const nextDatabase = request.result;
      const materialStore = nextDatabase.createObjectStore("materials", { keyPath: "id" });
      materialStore.createIndex("createdAt", "createdAt");
      const sessionStore = nextDatabase.createObjectStore("sessions", { keyPath: "id" });
      sessionStore.createIndex("materialId", "materialId");
      sessionStore.createIndex("startedAt", "startedAt");
      nextDatabase.createObjectStore("config", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const requestValue = (request) =>
  new Promise((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });

const transactionDone = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(undefined);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

const readAll = async (storeName) => {
  const transaction = database.transaction(storeName, "readonly");
  return requestValue(transaction.objectStore(storeName).getAll());
};

const putValue = async (storeName, value) => {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).put(value);
  await transactionDone(transaction);
};

const deleteValue = async (storeName, id) => {
  const transaction = database.transaction(storeName, "readwrite");
  transaction.objectStore(storeName).delete(id);
  await transactionDone(transaction);
};

const refreshData = async () => {
  materials = /** @type {Array<Material>} */ (await readAll("materials")).sort(
    (left, right) => left.createdAt - right.createdAt,
  );
  sessions = /** @type {Array<StudySession>} */ (await readAll("sessions")).sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt),
  );
  const configTransaction = database.transaction("config", "readonly");
  const savedSettings = await requestValue(configTransaction.objectStore("config").get(settingsId));
  if (savedSettings) settings = /** @type {DeskSettings} */ (savedSettings);
  if (!materialById(activeMaterialId)) activeMaterialId = materials[0]?.id ?? "";
  try {
    localStorage.setItem(activeMaterialKey, activeMaterialId);
  } catch {
    // The app remains usable when storage metadata cannot be written.
  }
};

const clear = (element) => element?.replaceChildren();
const node = (tag, className, content) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content !== undefined) element.textContent = String(content);
  return element;
};

const option = (value, label) => {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
};

const sessionsBetween = (start, end) =>
  sessions.filter((record) => {
    const time = Date.parse(record.startedAt);
    return time >= start.getTime() && time <= end.getTime();
  });
const totalMinutes = (records) => records.reduce((sum, record) => sum + record.minutes, 0);
const minutesForMaterial = (records, materialId) =>
  totalMinutes(records.filter((record) => record.materialId === materialId));

const weekContext = () => {
  const start = startOfWeek();
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const records = sessionsBetween(start, endOfDay(days[6]));
  return { start, days, records };
};

const streakDays = () => {
  const studyDays = new Set(sessions.map((record) => localDay(record.startedAt)));
  if (!studyDays.size) return 0;
  let cursor = new Date();
  if (!studyDays.has(localDay(cursor))) cursor = addDays(cursor, -1);
  let streak = 0;
  while (studyDays.has(localDay(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

const fillMaterialForm = (form, material) => {
  if (!(form instanceof HTMLFormElement)) return;
  const fields = form.elements;
  fields.namedItem("materialId").value = material?.id ?? "";
  fields.namedItem("name").value = material?.name ?? "";
  fields.namedItem("color").value = material?.color ?? "amber";
  fields.namedItem("weeklyGoal").value = String(material?.weeklyGoal ?? 180);
  fields.namedItem("unit").value = material?.unit ?? "";
  const label = form.querySelector("[data-material-submit-label]");
  if (label) label.textContent = material ? "背表紙を直す" : "机に一冊置く";
  const state = form.querySelector("[data-material-state]");
  if (state) state.textContent = "";
};

const fillSessionForm = (form) => {
  if (!(form instanceof HTMLFormElement)) return;
  form.reset();
  const fields = form.elements;
  fields.namedItem("date").value = localDay();
  fields.namedItem("startedTime").value = new Date().toTimeString().slice(0, 5);
  fields.namedItem("minutes").value = "25";
  const select = form.querySelector("[data-session-material]");
  if (select instanceof HTMLSelectElement) {
    clear(select);
    materials.forEach((material) => select.append(option(material.id, material.name)));
    select.value = activeMaterialId || materials[0]?.id || "";
  }
  const state = form.querySelector("[data-session-state]");
  if (state) state.textContent = "";
};

const fillTargetForm = (form) => {
  if (!(form instanceof HTMLFormElement)) return;
  const fields = form.elements;
  fields.namedItem("name").value = settings.targetName;
  fields.namedItem("date").value = settings.targetDate;
  fields.namedItem("weeklyGoal").value = String(settings.weeklyGoal);
  const state = form.querySelector("[data-target-state]");
  if (state) state.textContent = "";
};

const renderSelects = () => {
  if (elements.timerMaterial instanceof HTMLSelectElement) {
    clear(elements.timerMaterial);
    materials.forEach((material) =>
      elements.timerMaterial.append(option(material.id, material.name)),
    );
    elements.timerMaterial.value = activeMaterialId || materials[0]?.id || "";
  }
  if (elements.sessionFilter instanceof HTMLSelectElement) {
    const selected = elements.sessionFilter.value;
    clear(elements.sessionFilter);
    elements.sessionFilter.append(option("", "すべての教材"));
    materials.forEach((material) =>
      elements.sessionFilter.append(option(material.id, material.name)),
    );
    if (materials.some((material) => material.id === selected)) {
      elements.sessionFilter.value = selected;
    }
  }
};

const renderStats = () => {
  const today = localDay();
  const todayRecords = sessions.filter((record) => localDay(record.startedAt) === today);
  const { records: weekRecords } = weekContext();
  const weekTotal = totalMinutes(weekRecords);
  if (elements.todayMinutes)
    elements.todayMinutes.textContent = formatMinutes(totalMinutes(todayRecords));
  if (elements.todaySessions) {
    elements.todaySessions.textContent = todayRecords.length
      ? `${todayRecords.length}回の記録`
      : "記録なし";
  }
  if (elements.weekMinutes) elements.weekMinutes.textContent = formatMinutes(weekTotal);
  if (elements.weekGoal) {
    const goal = settings.weeklyGoal;
    elements.weekGoal.textContent = goal
      ? `${Math.min(100, Math.round((weekTotal / goal) * 100))}% / ${formatMinutes(goal)}`
      : "目安を設定できます";
  }
  if (elements.streak) elements.streak.textContent = `${streakDays()}日`;
  if (elements.totalDays) {
    elements.totalDays.textContent = `学習日は${new Set(sessions.map((record) => localDay(record.startedAt))).size}日`;
  }
  if (elements.targetLabel) elements.targetLabel.textContent = settings.targetName || "目標日";
  if (elements.targetDays) {
    if (!settings.targetDate) {
      elements.targetDays.textContent = "未設定";
    } else {
      const difference = Math.ceil(
        (atLocalNoon(settings.targetDate).getTime() - atLocalNoon(localDay()).getTime()) / 86400000,
      );
      elements.targetDays.textContent =
        difference > 0
          ? `あと${difference}日`
          : difference === 0
            ? "今日"
            : `${Math.abs(difference)}日前`;
    }
  }
};

const renderMaterials = () => {
  clear(elements.materialList);
  if (elements.materialCount) {
    elements.materialCount.textContent = `${materials.length} / ${maximumMaterials}`;
  }
  const { records: weekRecords } = weekContext();
  materials.forEach((material) => {
    const minutes = minutesForMaterial(weekRecords, material.id);
    const progress = material.weeklyGoal
      ? Math.min(100, Math.round((minutes / material.weeklyGoal) * 100))
      : 0;
    const article = node("article", "book-row");
    article.dataset.color = material.color;
    if (material.id === activeMaterialId) article.dataset.active = "true";
    const selectButton = node("button", "book-select");
    selectButton.type = "button";
    selectButton.dataset.selectMaterial = material.id;
    const spine = node("span", "book-spine");
    spine.append(node("i"));
    const copy = node("span", "book-copy");
    copy.append(node("strong", "", material.name));
    copy.append(
      node(
        "small",
        "",
        material.weeklyGoal
          ? `${formatMinutes(minutes)} / ${formatMinutes(material.weeklyGoal)}`
          : `${formatMinutes(minutes)} / 目安なし`,
      ),
    );
    const meter = node("span", "book-meter");
    const fill = node("i");
    fill.style.width = `${progress}%`;
    meter.append(fill);
    copy.append(meter);
    selectButton.append(spine, copy);
    const edit = node("button", "book-edit", "編集");
    edit.type = "button";
    edit.dataset.editMaterial = material.id;
    edit.setAttribute("aria-label", `${material.name}を編集`);
    article.append(selectButton, edit);
    elements.materialList?.append(article);
  });
};

const renderWeek = () => {
  clear(elements.weekColumns);
  const { start, days, records } = weekContext();
  if (elements.weekRange) {
    elements.weekRange.textContent = `${start.getMonth() + 1}/${start.getDate()} — ${
      days[6].getMonth() + 1
    }/${days[6].getDate()}`;
  }
  const dayTotals = days.map((day) =>
    totalMinutes(records.filter((record) => localDay(record.startedAt) === localDay(day))),
  );
  const maximum = Math.max(settings.weeklyGoal / 5, ...dayTotals, 60);
  days.forEach((day, index) => {
    const column = node("article", "week-column");
    if (localDay(day) === localDay()) column.dataset.today = "true";
    const barWell = node("div", "day-bar-well");
    const bar = node("span", "day-bar");
    bar.style.height = `${Math.max(dayTotals[index] ? 8 : 0, (dayTotals[index] / maximum) * 100)}%`;
    barWell.append(bar);
    column.append(
      node("strong", "", dayTotals[index] ? formatMinutes(dayTotals[index]) : "—"),
      barWell,
      node("span", "", new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(day)),
      node("small", "", `${day.getMonth() + 1}/${day.getDate()}`),
    );
    elements.weekColumns?.append(column);
  });
};

const renderBalance = () => {
  clear(elements.balanceList);
  const { records } = weekContext();
  const totals = materials.map((material) => ({
    material,
    minutes: minutesForMaterial(records, material.id),
  }));
  const maximum = Math.max(...totals.map((item) => item.minutes), 1);
  totals.forEach(({ material, minutes }) => {
    const row = node("article", "balance-row");
    row.dataset.color = material.color;
    const label = node("div", "balance-label");
    label.append(node("strong", "", material.name), node("span", "", formatMinutes(minutes)));
    const meter = node("div", "balance-meter");
    const fill = node("span");
    fill.style.width = `${(minutes / maximum) * 100}%`;
    meter.append(fill);
    row.append(label, meter);
    elements.balanceList?.append(row);
  });
};

const renderSessions = () => {
  clear(elements.sessionList);
  const filter =
    elements.sessionFilter instanceof HTMLSelectElement ? elements.sessionFilter.value : "";
  const visible = sessions.filter((record) => !filter || record.materialId === filter).slice(0, 30);
  if (elements.sessionEmpty instanceof HTMLElement)
    elements.sessionEmpty.hidden = visible.length > 0;
  visible.forEach((record) => {
    const material = materialById(record.materialId);
    if (!material) return;
    const article = node("article", "session-row");
    article.dataset.color = material.color;
    const date = new Date(record.startedAt);
    const stamp = node("div", "session-stamp");
    stamp.append(
      node(
        "strong",
        "",
        new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(date),
      ),
      node("span", "", new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date)),
    );
    const marker = node("span", "session-marker");
    const copy = node("div", "session-copy");
    const title = node("div", "session-title");
    title.append(
      node("strong", "", material.name),
      node("span", "", formatMinutes(record.minutes)),
    );
    copy.append(title);
    const details = [];
    if (record.quantity !== null) details.push(`${record.quantity}${material.unit || ""}`);
    details.push(["重い", "普通", "進んだ"][record.focus - 1]);
    copy.append(node("small", "", details.join(" · ")));
    if (record.note) copy.append(node("p", "", record.note));
    const remove = node("button", "session-delete", "削除");
    remove.type = "button";
    remove.dataset.deleteSession = record.id;
    remove.setAttribute(
      "aria-label",
      `${material.name}の${formatMinutes(record.minutes)}記録を削除`,
    );
    article.append(stamp, marker, copy, remove);
    elements.sessionList?.append(article);
  });
};

const heatLevel = (minutes) => {
  if (minutes === 0) return "0";
  if (minutes < 25) return "1";
  if (minutes < 60) return "2";
  if (minutes < 120) return "3";
  return "4";
};

const renderReview = () => {
  clear(elements.reviewSummary);
  clear(elements.heatBoard);
  const today = atLocalNoon(localDay());
  const start = addDays(startOfWeek(today), -77);
  const days = Array.from({ length: 84 }, (_, index) => addDays(start, index));
  const dayTotals = new Map(
    days.map((day) => [
      localDay(day),
      totalMinutes(sessions.filter((record) => localDay(record.startedAt) === localDay(day))),
    ]),
  );
  const twelveWeekTotal = [...dayTotals.values()].reduce((sum, value) => sum + value, 0);
  const activeDays = [...dayTotals.values()].filter((value) => value > 0).length;
  const bestDay = Math.max(...dayTotals.values(), 0);
  const summaryItems = [
    ["12週間", formatMinutes(twelveWeekTotal)],
    ["学習日", `${activeDays}日`],
    ["一日の最多", formatMinutes(bestDay)],
    ["全記録", `${sessions.length}回`],
  ];
  summaryItems.forEach(([label, value]) => {
    const card = node("article");
    card.append(node("span", "", label), node("strong", "", value));
    elements.reviewSummary?.append(card);
  });
  days.forEach((day) => {
    const minutes = dayTotals.get(localDay(day)) ?? 0;
    const cell = node("span", "heat-cell");
    cell.dataset.level = heatLevel(minutes);
    cell.title = `${formatShortDate(localDay(day))}: ${formatMinutes(minutes)}`;
    cell.setAttribute("aria-label", cell.title);
    elements.heatBoard?.append(cell);
  });
};

const render = async () => {
  const hasMaterials = materials.length > 0;
  if (elements.emptyDesk instanceof HTMLElement) elements.emptyDesk.hidden = hasMaterials;
  if (elements.studyRoom instanceof HTMLElement) elements.studyRoom.hidden = !hasMaterials;
  renderSelects();
  renderStats();
  renderMaterials();
  renderWeek();
  renderBalance();
  renderSessions();
  renderReview();
  renderTimer();
};

const persistTimer = () => {
  try {
    if (timer) localStorage.setItem(timerKey, JSON.stringify(timer));
    else localStorage.removeItem(timerKey);
  } catch {
    // Timer still works while this page remains open.
  }
};

const elapsedMilliseconds = () => {
  if (!timer) return 0;
  return timer.elapsedBefore + (timer.running ? Date.now() - timer.startedAt : 0);
};

const restoreTimer = () => {
  try {
    const value = JSON.parse(localStorage.getItem(timerKey) ?? "null");
    if (
      value &&
      hasOnlyKeys(value, [
        "materialId",
        "limitMinutes",
        "startedAt",
        "elapsedBefore",
        "running",
        "done",
      ]) &&
      isUuid(value.materialId) &&
      Number.isFinite(value.limitMinutes) &&
      value.limitMinutes >= 0 &&
      value.limitMinutes <= 1440 &&
      Number.isFinite(value.startedAt) &&
      Number.isFinite(value.elapsedBefore) &&
      value.elapsedBefore >= 0 &&
      typeof value.running === "boolean" &&
      typeof value.done === "boolean"
    ) {
      timer = value;
      timerModeMinutes = value.limitMinutes;
    }
  } catch {
    timer = null;
  }
};

const timerDisplayMilliseconds = () => {
  const elapsed = elapsedMilliseconds();
  if (!timer?.limitMinutes) return elapsed;
  return Math.max(0, timer.limitMinutes * 60000 - elapsed);
};

const renderTimer = () => {
  const elapsed = elapsedMilliseconds();
  if (timer?.running && timer.limitMinutes > 0 && elapsed >= timer.limitMinutes * 60000) {
    timer.elapsedBefore = timer.limitMinutes * 60000;
    timer.running = false;
    timer.done = true;
    persistTimer();
  }
  const display = Math.floor(timerDisplayMilliseconds() / 1000);
  const hours = Math.floor(display / 3600);
  const minutes = Math.floor((display % 3600) / 60);
  const seconds = display % 60;
  if (elements.timerClock) {
    elements.timerClock.textContent =
      hours > 0
        ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
            seconds,
          ).padStart(2, "0")}`
        : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  const circumference = 2 * Math.PI * 52;
  if (elements.timerProgress instanceof SVGCircleElement) {
    let ratio;
    if (timer?.limitMinutes) ratio = Math.min(1, elapsed / (timer.limitMinutes * 60000));
    else ratio = (elapsed % 3600000) / 3600000;
    elements.timerProgress.style.strokeDasharray = String(circumference);
    elements.timerProgress.style.strokeDashoffset = String(circumference * (1 - ratio));
  }
  if (elements.timerModeLabel) {
    elements.timerModeLabel.textContent = timerModeMinutes
      ? `${timerModeMinutes}分の灯り`
      : "計った分だけ積む";
  }
  if (elements.timerStatus) {
    elements.timerStatus.textContent = timer?.done
      ? "時間になりました"
      : timer?.running
        ? "学習中"
        : timer
          ? "一時停止"
          : "待機中";
  }
  if (elements.timerFace instanceof HTMLElement) {
    elements.timerFace.dataset.running = timer?.running ? "true" : "false";
    elements.timerFace.dataset.done = timer?.done ? "true" : "false";
  }
  document.querySelectorAll("[data-timer-minutes]").forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.setAttribute(
        "aria-pressed",
        String(Number(button.dataset.timerMinutes) === timerModeMinutes),
      );
      button.disabled = Boolean(timer);
    }
  });
  const start = document.querySelector("[data-action='timer-start']");
  const pause = document.querySelector("[data-action='timer-pause']");
  const finish = document.querySelector("[data-action='timer-finish']");
  const reset = document.querySelector("[data-action='timer-reset']");
  if (start instanceof HTMLButtonElement) {
    start.hidden = Boolean(timer?.running);
    start.textContent = timer ? "再開する" : "始める";
  }
  if (pause instanceof HTMLButtonElement) pause.hidden = !timer?.running;
  if (finish instanceof HTMLButtonElement) {
    finish.disabled = !timer || elapsed < 30000;
  }
  if (reset instanceof HTMLButtonElement) reset.disabled = !timer;
  if (elements.timerMaterial instanceof HTMLSelectElement) {
    elements.timerMaterial.disabled = Boolean(timer);
    if (timer && materialById(timer.materialId)) elements.timerMaterial.value = timer.materialId;
  }
  if (elements.timerNote) {
    elements.timerNote.textContent = timer?.done
      ? "おつかれさまでした。「記録する」で今日の棚へ積めます。"
      : timer?.running
        ? `${materialById(timer.materialId)?.name ?? "教材"}を開いています。画面を閉じても開始時刻は端末に残ります。`
        : "画面を閉じても開始時刻をこの端末に残します。通知やカメラの許可は求めません。";
  }
};

const startTimer = () => {
  const selected =
    elements.timerMaterial instanceof HTMLSelectElement
      ? elements.timerMaterial.value
      : activeMaterialId;
  if (!materialById(selected)) return;
  activeMaterialId = selected;
  if (timer) {
    timer.startedAt = Date.now();
    timer.running = true;
    timer.done = false;
  } else {
    timer = {
      materialId: selected,
      limitMinutes: timerModeMinutes,
      startedAt: Date.now(),
      elapsedBefore: 0,
      running: true,
      done: false,
    };
  }
  persistTimer();
  renderTimer();
};

const pauseTimer = () => {
  if (!timer?.running) return;
  timer.elapsedBefore = elapsedMilliseconds();
  timer.running = false;
  persistTimer();
  renderTimer();
};

const resetTimer = () => {
  if (!timer || !confirm("いま計っている時間を取り消しますか？")) return;
  timer = null;
  persistTimer();
  renderTimer();
};

const finishTimer = async () => {
  if (!timer || elapsedMilliseconds() < 30000) return;
  const wasLimit = timer.limitMinutes > 0;
  const minutes = Math.max(
    1,
    Math.min(
      1440,
      Math.round(
        (wasLimit && timer.done ? timer.limitMinutes * 60000 : elapsedMilliseconds()) / 60000,
      ),
    ),
  );
  const record = {
    id: crypto.randomUUID(),
    materialId: timer.materialId,
    startedAt: new Date(
      timer.startedAt - Math.min(timer.elapsedBefore, minutes * 60000),
    ).toISOString(),
    minutes,
    quantity: null,
    focus: 2,
    note: "",
    createdAt: Date.now(),
  };
  await putValue("sessions", record);
  timer = null;
  persistTimer();
  track("timer_completed");
  await refreshData();
  await render();
};

const formulaSafe = (value) => {
  const string = String(value ?? "");
  return /^[=+\-@]/.test(string) ? `'${string}` : string;
};
const csvCell = (value) => `"${formulaSafe(value).replaceAll('"', '""')}"`;
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const exportCsv = () => {
  const rows = [
    ["日付", "開始時刻", "教材・科目", "学習分", "進んだ量", "単位", "手ごたえ", "次に開く場所"],
    ...sessions
      .slice()
      .reverse()
      .map((record) => {
        const material = materialById(record.materialId);
        const date = new Date(record.startedAt);
        return [
          localDay(date),
          date.toTimeString().slice(0, 5),
          material?.name ?? "",
          record.minutes,
          record.quantity ?? "",
          material?.unit ?? "",
          ["重い", "普通", "進んだ"][record.focus - 1],
          record.note,
        ];
      }),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `tsukue-${localDay()}.csv`);
};

const exportProject = () => {
  const project = {
    format: "tsukue-no-hi",
    version: projectVersion,
    exportedAt: new Date().toISOString(),
    materials,
    sessions,
    settings,
  };
  downloadBlob(
    new Blob([JSON.stringify(project)], { type: "application/json" }),
    `tsukue-no-hi-${localDay()}.tsukue`,
  );
  track("project_exported");
};

const materialKeys = ["id", "name", "color", "weeklyGoal", "unit", "createdAt", "updatedAt"];
const studySessionKeys = [
  "id",
  "materialId",
  "startedAt",
  "minutes",
  "quantity",
  "focus",
  "note",
  "createdAt",
];
const settingsKeys = ["id", "targetName", "targetDate", "weeklyGoal"];
const projectKeys = ["format", "version", "exportedAt", "materials", "sessions", "settings"];

const validImportedMaterial = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  hasOnlyKeys(value, materialKeys) &&
  isUuid(value.id) &&
  typeof value.name === "string" &&
  value.name.length >= 1 &&
  value.name.length <= 48 &&
  Object.hasOwn(colorLabels, value.color) &&
  Number.isFinite(value.weeklyGoal) &&
  value.weeklyGoal >= 0 &&
  value.weeklyGoal <= 10080 &&
  typeof value.unit === "string" &&
  value.unit.length <= 16 &&
  Number.isFinite(value.createdAt) &&
  Number.isFinite(value.updatedAt);

const validImportedSession = (value, materialIds) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  hasOnlyKeys(value, studySessionKeys) &&
  isUuid(value.id) &&
  isUuid(value.materialId) &&
  materialIds.has(value.materialId) &&
  isIsoDateTime(value.startedAt) &&
  Number.isInteger(value.minutes) &&
  value.minutes >= 1 &&
  value.minutes <= 1440 &&
  (value.quantity === null ||
    (Number.isFinite(value.quantity) && value.quantity >= 0 && value.quantity <= 99999)) &&
  [1, 2, 3].includes(value.focus) &&
  typeof value.note === "string" &&
  value.note.length <= 240 &&
  Number.isFinite(value.createdAt);

const validImportedSettings = (value) =>
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  hasOnlyKeys(value, settingsKeys) &&
  value.id === settingsId &&
  typeof value.targetName === "string" &&
  value.targetName.length <= 48 &&
  (value.targetDate === "" || isDate(value.targetDate)) &&
  Number.isFinite(value.weeklyGoal) &&
  value.weeklyGoal >= 0 &&
  value.weeklyGoal <= 10080;

const importProject = async (file) => {
  if (file.size > 2 * 1024 * 1024) throw new Error("読み込みファイルは2MB以下にしてください。");
  const project = JSON.parse(await file.text());
  if (
    !project ||
    typeof project !== "object" ||
    Array.isArray(project) ||
    !hasOnlyKeys(project, projectKeys) ||
    project.format !== "tsukue-no-hi" ||
    project.version !== projectVersion ||
    typeof project.exportedAt !== "string" ||
    Number.isNaN(Date.parse(project.exportedAt)) ||
    !Array.isArray(project.materials) ||
    !Array.isArray(project.sessions) ||
    project.materials.length > maximumMaterials ||
    project.sessions.length > maximumSessions ||
    !validImportedSettings(project.settings)
  ) {
    throw new Error("机の灯の編集用ファイルではないか、上限を超えています。");
  }
  if (!project.materials.every(validImportedMaterial)) {
    throw new Error("教材データが正しくありません。");
  }
  const materialIds = new Set(project.materials.map((material) => material.id));
  const sessionIds = new Set(project.sessions.map((record) => record.id));
  if (
    materialIds.size !== project.materials.length ||
    sessionIds.size !== project.sessions.length
  ) {
    throw new Error("重複したIDがあります。");
  }
  if (!project.sessions.every((record) => validImportedSession(record, materialIds))) {
    throw new Error("学習記録が正しくありません。");
  }
  if (!confirm("現在の記録を、読み込んだファイルの内容で置き換えますか？")) return;
  const transaction = database.transaction(["materials", "sessions", "config"], "readwrite");
  const materialStore = transaction.objectStore("materials");
  const sessionStore = transaction.objectStore("sessions");
  const configStore = transaction.objectStore("config");
  materialStore.clear();
  sessionStore.clear();
  configStore.clear();
  project.materials.forEach((material) => materialStore.put(material));
  project.sessions.forEach((record) => sessionStore.put(record));
  configStore.put(project.settings);
  await transactionDone(transaction);
  timer = null;
  persistTimer();
  activeMaterialId = project.materials[0]?.id ?? "";
  track("project_imported");
  await refreshData();
  await render();
  elements.reviewDialog?.close();
};

const saveShareCard = async () => {
  if (!(elements.shareCanvas instanceof HTMLCanvasElement)) return;
  const context = elements.shareCanvas.getContext("2d");
  if (!context) return;
  const canvas = elements.shareCanvas;
  const gradient = context.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, "#17233a");
  gradient.addColorStop(1, "#0c1323");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(241, 186, 92, 0.12)";
  context.beginPath();
  context.arc(845, 115, 290, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f1ba5c";
  context.beginPath();
  context.moveTo(905, 70);
  context.lineTo(1035, 70);
  context.lineTo(1080, 160);
  context.lineTo(860, 160);
  context.closePath();
  context.fill();
  context.strokeStyle = "#d9a64e";
  context.lineWidth = 16;
  context.beginPath();
  context.moveTo(970, 160);
  context.quadraticCurveTo(900, 290, 820, 370);
  context.stroke();
  context.fillStyle = "#f1ba5c";
  context.fillRect(745, 370, 170, 22);
  context.fillStyle = "#f7f0df";
  context.font = "600 28px system-ui, sans-serif";
  context.fillText("机の灯", 72, 80);
  context.font = "700 54px system-ui, sans-serif";
  context.fillText("今週、机に灯った時間", 72, 158);
  const { days, records } = weekContext();
  const weekTotal = totalMinutes(records);
  context.fillStyle = "#f1ba5c";
  context.font = "800 92px system-ui, sans-serif";
  context.fillText(formatMinutes(weekTotal), 72, 270);
  const namesIncluded =
    elements.shareNames instanceof HTMLInputElement && elements.shareNames.checked;
  if (namesIncluded) {
    const ranked = materials
      .map((material) => ({
        name: material.name,
        minutes: minutesForMaterial(records, material.id),
      }))
      .filter((item) => item.minutes > 0)
      .sort((left, right) => right.minutes - left.minutes)
      .slice(0, 3);
    context.fillStyle = "#c8d0dc";
    context.font = "500 25px system-ui, sans-serif";
    context.fillText(
      ranked
        .map((item) => item.name)
        .join("  ·  ")
        .slice(0, 56),
      74,
      320,
    );
  } else {
    context.fillStyle = "#9aa8ba";
    context.font = "500 24px system-ui, sans-serif";
    context.fillText("教材名とメモを出さない学習札", 74, 320);
  }
  const totals = days.map((day) =>
    totalMinutes(records.filter((record) => localDay(record.startedAt) === localDay(day))),
  );
  const maximum = Math.max(...totals, 60);
  totals.forEach((minutes, index) => {
    const x = 74 + index * 86;
    const height = Math.max(minutes ? 9 : 2, (minutes / maximum) * 150);
    context.fillStyle = minutes ? "#f1ba5c" : "#354158";
    context.beginPath();
    context.roundRect(x, 505 - height, 54, height, 9);
    context.fill();
    context.fillStyle = "#b8c1ce";
    context.font = "600 18px system-ui, sans-serif";
    context.fillText(
      new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(days[index]),
      x + 8,
      540,
    );
  });
  context.fillStyle = "#77869a";
  context.font = "500 20px system-ui, sans-serif";
  context.fillText("tsukue-no-hi.yhay81.com", 72, 592);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob) {
    downloadBlob(blob, `tsukue-no-hi-${localDay()}.png`);
    track("share_card_saved");
  }
};

const saveMaterial = async (form) => {
  const data = new FormData(form);
  const id = text(data.get("materialId"), 36);
  const existing = materialById(id);
  if (!existing && materials.length >= maximumMaterials) {
    throw new Error(`教材は${maximumMaterials}件までです。`);
  }
  const name = text(data.get("name"), 48);
  if (!name) throw new Error("教材・科目を入力してください。");
  const color = text(data.get("color"), 12);
  const weeklyGoal = finiteNumber(data.get("weeklyGoal"), 0, 10080, 0);
  const unit = text(data.get("unit"), 16);
  const now = Date.now();
  const material = {
    id: existing?.id ?? crypto.randomUUID(),
    name,
    color: Object.hasOwn(colorLabels, color) ? color : "amber",
    weeklyGoal: Math.round(weeklyGoal ?? 0),
    unit,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await putValue("materials", material);
  activeMaterialId = material.id;
  if (!existing) track("material_created");
  await refreshData();
  await render();
  form.closest("dialog")?.close();
};

const saveSession = async (form) => {
  if (sessions.length >= maximumSessions) {
    throw new Error(
      `学習記録は${maximumSessions}件までです。編集用保存後に古い記録を整理してください。`,
    );
  }
  const data = new FormData(form);
  const materialId = text(data.get("materialId"), 36);
  if (!materialById(materialId)) throw new Error("教材を選んでください。");
  const date = text(data.get("date"), 10);
  const startedTime = text(data.get("startedTime"), 5);
  if (!isDate(date)) throw new Error("正しい日付を入力してください。");
  if (startedTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startedTime)) {
    throw new Error("正しい時刻を入力してください。");
  }
  const minutes = finiteNumber(data.get("minutes"), 1, 1440);
  if (minutes === null) throw new Error("学んだ時間は1〜1440分で入力してください。");
  const quantity = finiteNumber(data.get("quantity"), 0, 99999);
  const focus = Number(data.get("focus"));
  const record = {
    id: crypto.randomUUID(),
    materialId,
    startedAt: new Date(`${date}T${startedTime || "12:00"}:00`).toISOString(),
    minutes: Math.round(minutes),
    quantity,
    focus: [1, 2, 3].includes(focus) ? focus : 2,
    note: text(data.get("note"), 240),
    createdAt: Date.now(),
  };
  await putValue("sessions", record);
  activeMaterialId = materialId;
  track("session_added");
  await refreshData();
  await render();
  form.closest("dialog")?.close();
};

const saveTarget = async (form) => {
  const data = new FormData(form);
  const targetDate = text(data.get("date"), 10);
  if (targetDate && !isDate(targetDate)) throw new Error("正しい目標日を入力してください。");
  settings = {
    id: settingsId,
    targetName: text(data.get("name"), 48),
    targetDate,
    weeklyGoal: Math.round(finiteNumber(data.get("weeklyGoal"), 0, 10080, 0) ?? 0),
  };
  await putValue("config", settings);
  await render();
  form.closest("dialog")?.close();
};

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.matches("[data-material-form]")) {
    event.preventDefault();
    void saveMaterial(form).catch((error) => {
      const state = form.querySelector("[data-material-state]");
      if (state)
        state.textContent = error instanceof Error ? error.message : "保存できませんでした。";
    });
  }
  if (form.matches("[data-session-form]")) {
    event.preventDefault();
    void saveSession(form).catch((error) => {
      const state = form.querySelector("[data-session-state]");
      if (state)
        state.textContent = error instanceof Error ? error.message : "保存できませんでした。";
    });
  }
  if (form.matches("[data-target-form]")) {
    event.preventDefault();
    void saveTarget(form).catch((error) => {
      const state = form.querySelector("[data-target-state]");
      if (state)
        state.textContent = error instanceof Error ? error.message : "保存できませんでした。";
    });
  }
});

document.addEventListener("click", (event) => {
  const target =
    event.target instanceof Element ? event.target.closest("button, [data-action]") : null;
  if (!(target instanceof HTMLElement)) return;
  if (target.matches("[data-close-dialog]")) target.closest("dialog")?.close();
  const action = target.dataset.action;
  if (action === "open-material") {
    fillMaterialForm(elements.materialDialog?.querySelector("[data-material-form]"), null);
    if (elements.materialDialogKicker) elements.materialDialogKicker.textContent = "NEW MATERIAL";
    if (elements.materialDialogTitle) elements.materialDialogTitle.textContent = "教材を置く";
    elements.materialDialog?.showModal();
  }
  if (action === "open-session") {
    fillSessionForm(elements.sessionDialog?.querySelector("[data-session-form]"));
    elements.sessionDialog?.showModal();
  }
  if (action === "open-target") {
    fillTargetForm(elements.targetDialog?.querySelector("[data-target-form]"));
    elements.targetDialog?.showModal();
  }
  if (action === "open-review") {
    renderReview();
    elements.reviewDialog?.showModal();
    track("review_opened");
  }
  if (action === "timer-start") startTimer();
  if (action === "timer-pause") pauseTimer();
  if (action === "timer-reset") resetTimer();
  if (action === "timer-finish") void finishTimer();
  if (action === "export-csv") exportCsv();
  if (action === "export-project") exportProject();
  if (action === "save-share-card") void saveShareCard();
  if (action === "print") {
    track("printed");
    window.print();
  }
  if (target.dataset.timerMinutes !== undefined) {
    timerModeMinutes = Number(target.dataset.timerMinutes);
    renderTimer();
  }
  if (target.dataset.selectMaterial) {
    activeMaterialId = target.dataset.selectMaterial;
    try {
      localStorage.setItem(activeMaterialKey, activeMaterialId);
    } catch {
      // Selection remains active for this page.
    }
    renderSelects();
    renderMaterials();
  }
  if (target.dataset.editMaterial) {
    const material = materialById(target.dataset.editMaterial);
    if (material) {
      fillMaterialForm(elements.materialDialog?.querySelector("[data-material-form]"), material);
      if (elements.materialDialogKicker) elements.materialDialogKicker.textContent = "EDIT SPINE";
      if (elements.materialDialogTitle) elements.materialDialogTitle.textContent = "背表紙を直す";
      elements.materialDialog?.showModal();
    }
  }
  if (target.dataset.deleteSession) {
    const record = sessions.find((candidate) => candidate.id === target.dataset.deleteSession);
    const material = record ? materialById(record.materialId) : null;
    if (
      record &&
      confirm(`${material?.name ?? "教材"}の${formatMinutes(record.minutes)}記録を削除しますか？`)
    ) {
      void deleteValue("sessions", record.id).then(async () => {
        await refreshData();
        await render();
      });
    }
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target === elements.sessionFilter) renderSessions();
  if (target === elements.timerMaterial && target instanceof HTMLSelectElement) {
    activeMaterialId = target.value;
    renderMaterials();
  }
  if (target === elements.importFile && target instanceof HTMLInputElement) {
    const file = target.files?.[0];
    target.value = "";
    if (file) {
      void importProject(file).catch((error) => {
        alert(error instanceof Error ? error.message : "読み込めませんでした。");
      });
    }
  }
});

database = /** @type {IDBDatabase} */ (await openDatabase());
try {
  activeMaterialId = localStorage.getItem(activeMaterialKey) ?? "";
} catch {
  activeMaterialId = "";
}
restoreTimer();
await refreshData();
const firstMaterialForm = document.querySelector("[data-empty-desk] [data-material-form]");
if (firstMaterialForm instanceof HTMLFormElement) fillMaterialForm(firstMaterialForm, null);
await render();
track("visited");
if (lastVisit && lastVisit !== localDay()) track("returned");
timerInterval = window.setInterval(renderTimer, 1000);
window.addEventListener("beforeunload", () => window.clearInterval(timerInterval));

if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
