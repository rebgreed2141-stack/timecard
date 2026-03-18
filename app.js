const APP_KEY_PREFIX = "timecard_";
let staffMaster = [];
let currentPayrollView = null;

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  await loadStaffMaster();
  renderTodayLabel();
  renderStaffList();
  currentPayrollView = getPayrollMonthByDate(new Date());
  renderCalendar(currentPayrollView.year, currentPayrollView.month);
  setupAdminButtons();
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
    });
  });
}

async function loadStaffMaster() {
  const response = await fetch("./staff.json");
  staffMaster = await response.json();
  staffMaster.sort((a, b) => a.id.localeCompare(b.id, "ja"));
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
    const record = dayData.records[staff.id] || {
      id: staff.id,
      name: staff.name,
      in: "",
      out: "",
      history: { in: [], out: [] }
    };

    if (!record.history) {
      record.history = { in: [], out: [] };
    }
    if (!Array.isArray(record.history.in)) {
      record.history.in = [];
    }
    if (!Array.isArray(record.history.out)) {
      record.history.out = [];
    }

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
    dayData.records[id] = {
      id,
      name,
      in: "",
      out: "",
      history: { in: [], out: [] }
    };
  }

  const record = dayData.records[id];

  if (!record.history) {
    record.history = { in: [], out: [] };
  }
  if (!Array.isArray(record.history.in)) {
    record.history.in = [];
  }
  if (!Array.isArray(record.history.out)) {
    record.history.out = [];
  }

  record.history[type].push(record[type] || "");
  record[type] = time;

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
  const record = dayData.records[id];

  if (!record) return;
  if (!record.history) return;
  if (!Array.isArray(record.history[type]) || record.history[type].length === 0) return;

  const ok = confirm(`${name}さんの${label}を1つ前の状態に戻しますか`);
  if (!ok) return;

  const previousValue = record.history[type].pop();
  record[type] = previousValue || "";

  if (!record.in && !record.out && record.history.in.length === 0 && record.history.out.length === 0) {
    delete dayData.records[id];
  }

  saveDayData(dateKey, dayData);
  renderTodayLabel();
  renderStaffList();
  renderCalendar(currentPayrollView.year, currentPayrollView.month);
}

async function backupCsv() {
  const zip = new JSZip();

  Object.keys(localStorage)
    .filter((k) => k.startsWith(APP_KEY_PREFIX))
    .forEach((k) => {
      zip.file(k + ".json", localStorage.getItem(k));
    });

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "timecard_backup.zip";
  a.click();
}

function restoreCsv(e) {
  const file = e.target.files[0];
  if (!file) return;

  JSZip.loadAsync(file).then((zip) => {
    const promises = [];

    zip.forEach((path, fileEntry) => {
      promises.push(
        fileEntry.async("string").then((text) => {
          localStorage.setItem(path.replace(".json", ""), text);
        })
      );
    });

    Promise.all(promises).then(() => {
      renderTodayLabel();
      renderStaffList();
      renderCalendar(currentPayrollView.year, currentPayrollView.month);
      document.getElementById("restore-file").value = "";
      alert("復元完了");
    });
  });
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

    Object.values(parsed.records).forEach((record) => {
      if (!record.history) {
        record.history = { in: [], out: [] };
      }
      if (!Array.isArray(record.history.in)) {
        record.history.in = [];
      }
      if (!Array.isArray(record.history.out)) {
        record.history.out = [];
      }
      if (!record.in) {
        record.in = "";
      }
      if (!record.out) {
        record.out = "";
      }
    });

    return parsed;
  } catch (error) {
    return { records: {} };
  }
}

function saveDayData(dateKey, data) {
  localStorage.setItem(APP_KEY_PREFIX + dateKey, JSON.stringify(data));
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