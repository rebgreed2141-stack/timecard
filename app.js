const APP_KEY_PREFIX = "timecard_";
const NURSERY_STORAGE_KEY = "selectedNursery";
const DEFAULT_NURSERY = "m";
const NURSERY_CONFIG = {
  m: { label: "こどもの森保育園", staffFile: "./staff_m.json" },
  y: { label: "こどもの森You保育園", staffFile: "./staff_y.json" }
};

let staffMaster = [];
let currentNursery = DEFAULT_NURSERY;
let currentPayrollView = null;
let swRegistration = null;

const versionState = {
  current: "",
  latest: "",
  hasUpdate: false
};

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  setupNurserySettings();
  await loadStaffMaster();
  renderTodayLabel();
  renderStaffList();
  currentPayrollView = getPayrollMonthByDate(new Date());
  renderCalendar(currentPayrollView.year, currentPayrollView.month);
  setupAdminButtons();
  setupVersionButton();
  await setupVersionManagement();
});

function setupTabs() {
  const buttons = document.querySelectorAll(".tab-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      buttons.forEach((btn) => btn.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));

      button.classList.add("active");
      document.getElementById(`tab-${button.dataset.tab}`).classList.add("active");

      if (button.dataset.tab === "input") {
        renderTodayLabel();
        renderStaffList();
      }

      if (button.dataset.tab === "calendar") {
        renderCalendar(currentPayrollView.year, currentPayrollView.month);
      }

      if (button.dataset.tab === "version") {
        renderVersionPanel();
      }
    });
  });
}

async function loadStaffMaster() {
  const config = getNurseryConfig(currentNursery);
  const response = await fetch(config.staffFile);
  staffMaster = await response.json();
  staffMaster.sort((a, b) => a.id.localeCompare(b.id, "ja"));
  renderNurseryCurrent();
}

function setupNurserySettings() {
  currentNursery = getSavedNursery();

  const radios = document.querySelectorAll('input[name="nursery"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === currentNursery;
    radio.addEventListener("change", handleNurseryChange);
  });

  renderNurseryCurrent();
}

function getSavedNursery() {
  const saved = localStorage.getItem(NURSERY_STORAGE_KEY);
  return NURSERY_CONFIG[saved] ? saved : DEFAULT_NURSERY;
}

function getNurseryConfig(nurseryKey) {
  return NURSERY_CONFIG[nurseryKey] || NURSERY_CONFIG[DEFAULT_NURSERY];
}

function renderNurseryCurrent() {
  const el = document.getElementById("nursery-current");
  if (!el) return;

  const config = getNurseryConfig(currentNursery);
  el.textContent = `現在の設定：${config.label}`;
}

async function handleNurseryChange(event) {
  const selected = event.target.value;
  if (!NURSERY_CONFIG[selected]) return;

  if (selected === currentNursery) {
    renderNurseryCurrent();
    return;
  }

  const nextLabel = getNurseryConfig(selected).label;
  const ok = confirm(`保育園設定を${nextLabel}に変更しますか`);

  if (!ok) {
    syncNurseryRadio();
    return;
  }

  currentNursery = selected;
  localStorage.setItem(NURSERY_STORAGE_KEY, currentNursery);

  try {
    await loadStaffMaster();
    renderTodayLabel();
    renderStaffList();
    renderCalendar(currentPayrollView.year, currentPayrollView.month);
  } catch (error) {
    console.error(error);
    alert("職員データの読み込みに失敗しました");
    currentNursery = getSavedNursery();
    syncNurseryRadio();
    await loadStaffMaster();
    renderTodayLabel();
    renderStaffList();
    renderCalendar(currentPayrollView.year, currentPayrollView.month);
  }
}

function syncNurseryRadio() {
  const radios = document.querySelectorAll('input[name="nursery"]');
  radios.forEach((radio) => {
    radio.checked = radio.value === currentNursery;
  });
  renderNurseryCurrent();
}

function renderTodayLabel() {
  const el = document.getElementById("today-label");
  const now = new Date();
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][now.getDay()];
  el.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日（${weekday}）`;
}

function renderStaffList() {
  const container = document.getElementById("staff-list");
  container.innerHTML = "";

  const today = new Date();
  const dateKey = getDateKey(today);
  const dayData = loadDayData(dateKey);

  staffMaster.forEach((staff) => {
    const record = normalizeRecord(
      dayData.records[staff.id] || {
        id: staff.id,
        name: staff.name,
        in: "",
        out: "",
        history: { in: [], out: [] }
      },
      staff
    );

    const row = document.createElement("div");
    row.className = "staff-row";

    row.innerHTML = `
      <div class="staff-name">${escapeHtml(staff.name)}</div>

      <div class="record-block in-block">
        <button class="action-btn clock-in-btn" onclick="handleRecord('${staff.id}','${escapeJs(staff.name)}','in')">出勤</button>
        <span class="time-value">${record.in || "--:--"}</span>
        <button
          class="back-btn"
          onclick="handleUndo('${staff.id}','${escapeJs(staff.name)}','in')"
          ${record.history.in.length > 0 ? "" : "disabled"}
        >戻る</button>
      </div>

      <div class="record-gap"></div>

      <div class="record-block out-block">
        <button class="action-btn clock-out-btn" onclick="handleRecord('${staff.id}','${escapeJs(staff.name)}','out')">退勤</button>
        <span class="time-value">${record.out || "--:--"}</span>
        <button
          class="back-btn"
          onclick="handleUndo('${staff.id}','${escapeJs(staff.name)}','out')"
          ${record.history.out.length > 0 ? "" : "disabled"}
        >戻る</button>
      </div>
    `;

    container.appendChild(row);
  });
}

function handleRecord(id, name, type) {
  const now = new Date();
  const dateKey = getDateKey(now);
  const time = formatTime(now);
  const label = type === "in" ? "出勤" : "退勤";

  const ok = confirm(`${name}さんの${label}を${time}で記録しますか`);
  if (!ok) return;

  const dayData = loadDayData(dateKey);

  if (!dayData.records[id]) {
    dayData.records[id] = normalizeRecord({
      id,
      name,
      in: "",
      out: "",
      history: { in: [], out: [] }
    });
  }

  const record = normalizeRecord(dayData.records[id], { id, name });
  record.history[type].push(record[type] || "");
  record[type] = time;
  dayData.records[id] = record;

  saveDayData(dateKey, dayData);
  renderTodayLabel();
  renderStaffList();
  renderCalendar(currentPayrollView.year, currentPayrollView.month);
}

function handleUndo(id, name, type) {
  const today = new Date();
  const dateKey = getDateKey(today);
  const label = type === "in" ? "出勤" : "退勤";
  const dayData = loadDayData(dateKey);
  const record = dayData.records[id] ? normalizeRecord(dayData.records[id], { id, name }) : null;

  if (!record) return;
  if (!Array.isArray(record.history[type]) || record.history[type].length === 0) return;

  const ok = confirm(`${name}さんの${label}を1つ前の状態に戻しますか`);
  if (!ok) return;

  const previousValue = record.history[type].pop();
  record[type] = previousValue || "";

  if (!record.in && !record.out && record.history.in.length === 0 && record.history.out.length === 0) {
    delete dayData.records[id];
  } else {
    dayData.records[id] = record;
  }

  saveDayData(dateKey, dayData);
  renderTodayLabel();
  renderStaffList();
  renderCalendar(currentPayrollView.year, currentPayrollView.month);
}

async function backupCsv() {
  try {
    const zip = new JSZip();
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(APP_KEY_PREFIX))
      .sort();

    keys.forEach((storageKey) => {
      const dateKey = storageKey.slice(APP_KEY_PREFIX.length);
      const dayData = loadDayData(dateKey);
      const csvText = buildCsvText(dateKey, dayData);
      zip.file(`${storageKey}.csv`, csvText);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timecard_backup.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error(error);
    alert("バックアップに失敗しました");
  }
}

async function restoreCsv(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const zip = await JSZip.loadAsync(file);
    const jobs = [];

    zip.forEach((path, fileEntry) => {
      if (fileEntry.dir) return;
      if (!path.toLowerCase().endsWith(".csv")) return;

      jobs.push(
        fileEntry.async("string").then((text) => {
          const storageKey = path.replace(/^.*\//, "").replace(/\.csv$/i, "");
          if (!storageKey.startsWith(APP_KEY_PREFIX)) return;

          const dateKey = storageKey.slice(APP_KEY_PREFIX.length);
          const dayData = parseCsvTextToDayData(text, dateKey);
          saveDayData(dateKey, dayData);
        })
      );
    });

    await Promise.all(jobs);

    renderTodayLabel();
    renderStaffList();
    renderCalendar(currentPayrollView.year, currentPayrollView.month);
    document.getElementById("restore-file").value = "";
    alert("復元完了");
  } catch (error) {
    console.error(error);
    alert("復元に失敗しました");
    document.getElementById("restore-file").value = "";
  }
}

function deleteAllData() {
  if (!confirm("全データ削除しますか")) return;

  Object.keys(localStorage)
    .filter((k) => k.startsWith(APP_KEY_PREFIX))
    .forEach((k) => localStorage.removeItem(k));

  renderTodayLabel();
  renderStaffList();
  renderCalendar(currentPayrollView.year, currentPayrollView.month);
}

function loadDayData(dateKey) {
  const raw = localStorage.getItem(APP_KEY_PREFIX + dateKey);
  if (!raw) return { records: {} };

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { records: {} };
    }

    if (!parsed.records || typeof parsed.records !== "object") {
      parsed.records = {};
    }

    Object.keys(parsed.records).forEach((id) => {
      parsed.records[id] = normalizeRecord(parsed.records[id]);
    });

    return parsed;
  } catch (error) {
    return { records: {} };
  }
}

function saveDayData(dateKey, data) {
  localStorage.setItem(APP_KEY_PREFIX + dateKey, JSON.stringify(data));
}

function normalizeRecord(record, fallbackStaff = null) {
  const safeRecord = record && typeof record === "object" ? record : {};
  const safeHistory = safeRecord.history && typeof safeRecord.history === "object" ? safeRecord.history : {};

  return {
    id: safeRecord.id || (fallbackStaff && fallbackStaff.id) || "",
    name: safeRecord.name || (fallbackStaff && fallbackStaff.name) || "",
    in: safeRecord.in || "",
    out: safeRecord.out || "",
    history: {
      in: Array.isArray(safeHistory.in) ? safeHistory.in : [],
      out: Array.isArray(safeHistory.out) ? safeHistory.out : []
    }
  };
}

function buildCsvText(dateKey, dayData) {
  const header = ["date", "id", "name", "clock_in", "clock_out"];
  const csvDate = formatDateKeyForCsv(dateKey);
  const lines = [header.map(toCsvCell).join(",")];

  staffMaster.forEach((staff) => {
    const record = dayData.records[staff.id];
    if (!record) return;

    const normalized = normalizeRecord(record, staff);
    lines.push(
      [csvDate, normalized.id, normalized.name, normalized.in, normalized.out]
        .map(toCsvCell)
        .join(",")
    );
  });

  const remainingIds = Object.keys(dayData.records)
    .filter((id) => !staffMaster.some((staff) => staff.id === id))
    .sort((a, b) => a.localeCompare(b, "ja"));

  remainingIds.forEach((id) => {
    const normalized = normalizeRecord(dayData.records[id]);
    lines.push(
      [csvDate, normalized.id, normalized.name, normalized.in, normalized.out]
        .map(toCsvCell)
        .join(",")
    );
  });

  return "\uFEFF" + lines.join("\r\n");
}

function parseCsvTextToDayData(csvText, fallbackDateKey) {
  const rows = parseCsvRows(csvText);
  const dayData = { records: {} };

  if (rows.length === 0) return dayData;

  const header = rows[0].map((v) => normalizeHeader(v));
  const colIndex = {
    date: header.indexOf("date"),
    id: header.indexOf("id"),
    name: header.indexOf("name"),
    clockIn: header.indexOf("clock_in"),
    clockOut: header.indexOf("clock_out")
  };

  const normalizedFallbackDateKey = normalizeCsvDateToKey(fallbackDateKey) || fallbackDateKey;

  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (row.length === 1 && String(row[0] || "").trim() === "") continue;

    const id = cleanCsvText(getCsvValue(row, colIndex.id));
    if (!id) continue;

    const rawRowDate = cleanCsvText(getCsvValue(row, colIndex.date));
    const normalizedRowDateKey = normalizeCsvDateToKey(rawRowDate) || normalizedFallbackDateKey;

    if (normalizedRowDateKey !== normalizedFallbackDateKey) continue;

    const name = cleanCsvText(getCsvValue(row, colIndex.name));
    const clockIn = normalizeTimeText(getCsvValue(row, colIndex.clockIn));
    const clockOut = normalizeTimeText(getCsvValue(row, colIndex.clockOut));

    dayData.records[id] = normalizeRecord({
      id,
      name,
      in: clockIn,
      out: clockOut,
      history: { in: [], out: [] }
    });
  }

  return dayData;
}

function parseCsvRows(text) {
  const cleaned = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const ch = cleaned[i];
    const next = cleaned[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (ch === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim().toLowerCase();
}

function getCsvValue(row, index) {
  if (index < 0 || index >= row.length) return "";
  return row[index] || "";
}

function cleanCsvText(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim();
}

function toCsvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeTimeText(value) {
  const text = cleanCsvText(value);
  if (!text) return "";

  const match = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return "";

  const hh = String(Number(match[1])).padStart(2, "0");
  const mm = String(Number(match[2])).padStart(2, "0");
  return `${hh}:${mm}`;
}

function normalizeCsvDateToKey(value) {
  const text = cleanCsvText(value);
  if (!text) return "";

  const normalized = text
    .replace(/[.\-]/g, "/")
    .replace(/\s+/g, "");

  const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return "";

  const y = match[1];
  const m = match[2].padStart(2, "0");
  const d = match[3].padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateKeyForCsv(dateKey) {
  const normalized = normalizeCsvDateToKey(dateKey);
  if (!normalized) return "";

  const [y, m, d] = normalized.split("-");
  return `${y}/${m}/${d}`;
}

function getDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(date) {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function getPayrollMonthByDate(date) {
  const base = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let year = base.getFullYear();
  let month = base.getMonth() + 1;

  if (base.getDate() >= 21) {
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return { year, month };
}

function getPayrollRange(year, month) {
  const startMonthIndex = month - 2;
  const start = new Date(year, startMonthIndex, 21);
  const end = new Date(year, month - 1, 20);
  return { start, end };
}

function renderCalendar(year, month) {
  currentPayrollView = { year, month };

  const title = document.getElementById("calendar-title");
  const period = document.getElementById("calendar-period");
  const grid = document.getElementById("calendar-grid");

  title.textContent = `${year}年${month}月`;
  const { start, end } = getPayrollRange(year, month);
  period.textContent = `${formatMonthDay(start)} ～ ${formatMonthDay(end)}`;

  const calendarStart = getCalendarStart(start);
  const calendarEnd = getCalendarEnd(end);
  const cells = [];

  for (let cursor = new Date(calendarStart); cursor <= calendarEnd; cursor.setDate(cursor.getDate() + 1)) {
    cells.push(buildCalendarCell(new Date(cursor), start, end));
  }

  grid.innerHTML = cells.join("");
}

function buildCalendarCell(cellDate, rangeStart, rangeEnd) {
  const inPeriod = cellDate >= rangeStart && cellDate <= rangeEnd;
  const dateKey = getDateKey(cellDate);
  const dayData = loadDayData(dateKey);
  const marks = buildDayMarks(dayData);
  const isToday = dateKey === getDateKey(new Date());
  const weekdayIndex = (cellDate.getDay() + 6) % 7;
  const weekdayLabel = ["月", "火", "水", "木", "金", "土", "日"][weekdayIndex];

  return `
    <div class="calendar-cell ${inPeriod ? "" : "is-outside"} ${isToday ? "is-today" : ""}">
      <div class="calendar-date-row">
        <span class="calendar-date">${cellDate.getMonth() + 1}/${cellDate.getDate()}</span>
        <span class="calendar-weekday">(${weekdayLabel})</span>
      </div>
      <div class="calendar-marks">${marks || ""}</div>
    </div>
  `;
}

function buildDayMarks(dayData) {
  const items = [];

  staffMaster.forEach((staff) => {
    const record = dayData.records[staff.id];
    if (!record) return;

    const mark = getRecordMark(record);
    if (!mark) return;

    items.push(
      `<div class="calendar-mark-item"><span class="mark-symbol ${mark === "▲" ? "mark-alert" : "mark-complete"}">${mark}</span><span class="mark-name">${escapeHtml(staff.name)}</span></div>`
    );
  });

  return items.join("");
}

function getRecordMark(record) {
  const hasIn = !!record.in;
  const hasOut = !!record.out;

  if (hasIn && hasOut) return "●";
  if (hasIn || hasOut) return "▲";
  return "";
}

function getCalendarStart(date) {
  const result = new Date(date);
  const mondayIndex = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - mondayIndex);
  return result;
}

function getCalendarEnd(date) {
  const result = new Date(date);
  const mondayIndex = (result.getDay() + 6) % 7;
  const sundayOffset = 6 - mondayIndex;
  result.setDate(result.getDate() + sundayOffset);
  return result;
}

function movePayrollMonth(diff) {
  let { year, month } = currentPayrollView;
  month += diff;

  while (month < 1) {
    month += 12;
    year -= 1;
  }

  while (month > 12) {
    month -= 12;
    year += 1;
  }

  renderCalendar(year, month);
}

function formatMonthDay(date) {
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeJs(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

function setupAdminButtons() {
  document.getElementById("backup-btn").addEventListener("click", backupCsv);
  document.getElementById("restore-btn").addEventListener("click", () => {
    document.getElementById("restore-file").click();
  });
  document.getElementById("restore-file").addEventListener("change", restoreCsv);
  document.getElementById("delete-btn").addEventListener("click", deleteAllData);
  document.getElementById("prev-month-btn").addEventListener("click", () => movePayrollMonth(-1));
  document.getElementById("next-month-btn").addEventListener("click", () => movePayrollMonth(1));
}

function setupVersionButton() {
  document.getElementById("update-btn").addEventListener("click", async () => {
    if (!swRegistration) return;

    try {
      await swRegistration.update();
    } catch (error) {
      return;
    }

    const waitingWorker = swRegistration.waiting;
    if (!waitingWorker) {
      await refreshVersionInfo();
      return;
    }

    await activateWaitingWorker(waitingWorker);
  });
}

async function setupVersionManagement() {
  if (!("serviceWorker" in navigator)) {
    versionState.current = await fetchVersionFromNetwork();
    versionState.latest = "最新です";
    versionState.hasUpdate = false;
    renderVersionPanel();
    return;
  }

  swRegistration = await navigator.serviceWorker.register("./sw.js");
  await refreshVersionInfo();
}

async function refreshVersionInfo() {
  versionState.current = await getCurrentVersion();

  if (swRegistration && swRegistration.waiting) {
    versionState.latest = await getLatestVersion();
    versionState.hasUpdate = !!versionState.latest && versionState.latest !== versionState.current;

    if (!versionState.hasUpdate) {
      versionState.latest = "最新です";
    }
  } else {
    versionState.latest = "最新です";
    versionState.hasUpdate = false;
  }

  renderVersionPanel();
}

async function activateWaitingWorker(waitingWorker) {
  await new Promise((resolve) => {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(finish, 4000);

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      () => {
        clearTimeout(timer);
        finish();
      },
      { once: true }
    );

    try {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } catch (error) {
      clearTimeout(timer);
      finish();
    }
  });

  window.location.reload();
}

function renderVersionPanel() {
  const currentEl = document.getElementById("current-version");
  const latestEl = document.getElementById("latest-version");
  const updateBtn = document.getElementById("update-btn");

  currentEl.textContent = versionState.current || "取得できません";
  latestEl.textContent = versionState.latest || "取得できません";
  updateBtn.disabled = !versionState.hasUpdate;
}

async function getCurrentVersion() {
  const controlledVersion = await getVersionFromActiveServiceWorker();
  if (controlledVersion) return controlledVersion;

  const cachedVersion = await fetchVersionFromNetwork("reload");
  if (cachedVersion) return cachedVersion;

  return "取得できません";
}

async function getLatestVersion() {
  const networkVersion = await fetchVersionFromNetwork();
  if (networkVersion) return networkVersion;

  const waitingVersion = await getVersionFromWaitingServiceWorker();
  if (waitingVersion) return waitingVersion;

  return "取得できません";
}

async function fetchVersionFromNetwork(cacheMode = "no-store") {
  try {
    const response = await fetch("./version.json", { cache: cacheMode });
    if (!response.ok) return "";
    const data = await response.json();
    return normalizeVersionValue(data && data.version);
  } catch (error) {
    return "";
  }
}

async function getVersionFromActiveServiceWorker() {
  if (!navigator.serviceWorker.controller) return "";
  return requestVersionFromWorker(navigator.serviceWorker.controller);
}

async function getVersionFromWaitingServiceWorker() {
  if (!swRegistration || !swRegistration.waiting) return "";
  return requestVersionFromWorker(swRegistration.waiting);
}

function requestVersionFromWorker(worker) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(""), 2000);

    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(normalizeVersionValue(event.data && event.data.version));
    };

    try {
      worker.postMessage({ type: "GET_VERSION" }, [channel.port2]);
    } catch (error) {
      clearTimeout(timer);
      resolve("");
    }
  });
}

function normalizeVersionValue(value) {
  const text = String(value || "").trim();
  return text || "";
}
