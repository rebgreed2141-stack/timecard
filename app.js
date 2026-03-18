const APP_KEY_PREFIX = "timecard_";
let staffMaster = [];

document.addEventListener("DOMContentLoaded", async () => {
  setupTabs();
  await loadStaffMaster();
  renderStaffList();
  renderTodayList();
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

      if (button.dataset.tab === "list") {
        renderTodayList();
      }
    });
  });
}

async function loadStaffMaster() {
  const response = await fetch("./staff.json");
  staffMaster = await response.json();
  staffMaster.sort((a, b) => a.id.localeCompare(b.id, "ja"));
}

function renderStaffList() {
  const container = document.getElementById("staff-list");
  container.innerHTML = "";

  staffMaster.forEach((staff) => {
    const row = document.createElement("div");
    row.className = "staff-row";

    row.innerHTML = `
      <div class="staff-name">${staff.name}</div>
      <button class="action-btn clock-in-btn" onclick="handleRecord('${staff.id}','${staff.name}','in')">出勤</button>
      <button class="action-btn clock-out-btn" onclick="handleRecord('${staff.id}','${staff.name}','out')">退勤</button>
    `;

    container.appendChild(row);
  });
}

function handleRecord(id,name,type){
  const now = new Date();
  const dateKey = getDateKey(now);
  const time = formatTime(now);

  const ok = confirm(`${name}さんの${type==="in"?"出勤":"退勤"}を${time}で記録しますか`);
  if (!ok) return;

  const dayData = loadDayData(dateKey);
  if (!dayData.records[id]) {
    dayData.records[id] = { id,name,in:"",out:"" };
  }

  dayData.records[id][type] = time;

  saveDayData(dateKey, dayData);
  renderTodayList();
}

/* ===== ZIPバックアップ ===== */
async function backupCsv() {
  const zip = new JSZip();

  Object.keys(localStorage)
    .filter(k=>k.startsWith(APP_KEY_PREFIX))
    .forEach(k=>{
      zip.file(k+".json", localStorage.getItem(k));
    });

  const blob = await zip.generateAsync({type:"blob"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "timecard_backup.zip";
  a.click();
}

/* ===== ZIP復元 ===== */
function restoreCsv(e){
  const file = e.target.files[0];
  if(!file) return;

  JSZip.loadAsync(file).then(zip=>{
    const promises=[];

    zip.forEach((path,file)=>{
      promises.push(
        file.async("string").then(text=>{
          localStorage.setItem(path.replace(".json",""), text);
        })
      );
    });

    Promise.all(promises).then(()=>{
      renderTodayList();
      alert("復元完了");
    });
  });
}

function deleteAllData() {
  if (!confirm("全データ削除しますか")) return;

  Object.keys(localStorage)
    .filter(k=>k.startsWith(APP_KEY_PREFIX))
    .forEach(k=>localStorage.removeItem(k));

  renderTodayList();
}

/* ===== 共通 ===== */
function loadDayData(dateKey) {
  const raw = localStorage.getItem(APP_KEY_PREFIX + dateKey);
  if (!raw) return {records:{}};
  return JSON.parse(raw);
}

function saveDayData(dateKey, data) {
  localStorage.setItem(APP_KEY_PREFIX + dateKey, JSON.stringify(data));
}

function getDateKey(date) {
  return date.toISOString().slice(0,10);
}

function formatTime(date) {
  return date.toTimeString().slice(0,5);
}

function renderTodayList(){
  const today = new Date();
  const key = getDateKey(today);
  const data = loadDayData(key);

  document.getElementById("list-date-title").textContent =
    today.toLocaleDateString("ja-JP");

  const tbody = document.getElementById("list-body");
  tbody.innerHTML="";

  staffMaster.forEach(s=>{
    const r = data.records[s.id]||{};
    const tr = document.createElement("tr");

    tr.innerHTML=`
      <td>${s.name}</td>
      <td>${r.in||""}</td>
      <td>${r.out||""}</td>
    `;

    tbody.appendChild(tr);
  });
}

function setupAdminButtons() {
  document.getElementById("backup-btn").addEventListener("click", backupCsv);
  document.getElementById("restore-btn").addEventListener("click", () => {
    document.getElementById("restore-file").click();
  });
  document.getElementById("restore-file").addEventListener("change", restoreCsv);
  document.getElementById("delete-btn").addEventListener("click", deleteAllData);
}