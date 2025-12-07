/*****************
 *  LOCAL STORAGE HELPERS
 *****************/
const load = (k, fb) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fb; }
  catch { return fb; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));


/*****************
 *  DATA
 *****************/
let activities = load("activities", []);
let finances = load("finances", []);
let habitLogs = load("habitLogs", {});
let monthlyBudget = load("monthlyBudget", null);

let expenseType = "expense";

const TIMEZONE = "Asia/Kolkata";
const todayStr = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());

const toUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);


/*****************
 *  WEEK HELPERS
 *****************/
function getCurrentWeekDates() {
  const now = new Date();
  let day = now.getDay(); // Sun=0
  let monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));

  let days = [];
  for (let i = 0; i < 7; i++) {
    let d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d)
    );
  }
  return days;
}

const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];


/*****************
 *  RENDER HABITS
 *****************/
function renderActivities() {
  const list = document.getElementById("activity-list");
  list.innerHTML = "";

  if (!activities.length) {
    list.innerHTML = `<li class="item"><span class="muted">No habits yet.</span></li>`;
    return;
  }

  const weekDates = getCurrentWeekDates();

  activities.forEach(h => {
    const doneToday = h.lastDone === todayStr();

    let weeklyHTML = "";
    weekDates.forEach((date, i) => {
      const done = habitLogs[date]?.includes(h.name);
      weeklyHTML += `
        <div class="week-box">
          <div class="week-circle">${done ? "✔️" : ""}</div>
          <div class="week-label">${weekDays[i]}</div>
        </div>
      `;
    });

    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div>
        <div class="name">${h.name}</div>
        <div class="meta">${h.lastDone ? `Last: ${h.lastDone}` : "Not done yet"}</div>
      </div>

      <div class="badge">🔥 Streak: ${h.streak}</div>

      <div class="actions">
        <button class="success" ${doneToday ? "disabled" : ""}>Done</button>
        <button class="secondary">Reset</button>
        <button class="danger">Delete</button>
      </div>

      <div class="weekly-row">${weeklyHTML}</div>
    `;

    li.querySelector(".success").onclick = () => markHabitDone(h.id);
    li.querySelector(".secondary").onclick = () => resetHabit(h.id);
    li.querySelector(".danger").onclick = () => deleteHabit(h.id);

    list.appendChild(li);
  });
}

function addHabit(name) {
  name = name.trim();
  if (!name) return;
  if (activities.some(a => a.name.toLowerCase() === name.toLowerCase())) {
    alert("Habit already exists.");
    return;
  }

  activities.push({
    id: crypto.randomUUID(),
    name,
    streak: 0,
    lastDone: null,
  });

  save("activities", activities);
  renderActivities();
}

function markHabitDone(id) {
  const h = activities.find(a => a.id === id);
  if (!h) return;

  const today = todayStr();

  if (!h.lastDone) h.streak = 1;
  else {
    const gap = diffDays(today, h.lastDone);
    h.streak = gap === 1 ? h.streak + 1 : 1;
  }
  h.lastDone = today;

  if (!habitLogs[today]) habitLogs[today] = [];
  if (!habitLogs[today].includes(h.name)) habitLogs[today].push(h.name);

  save("activities", activities);
  save("habitLogs", habitLogs);
  renderActivities();
}

function resetHabit(id) {
  const h = activities.find(a => a.id === id);
  if (!h) return;

  h.streak = 0;
  h.lastDone = null;

  save("activities", activities);
  renderActivities();
}

function deleteHabit(id) {
  activities = activities.filter(h => h.id !== id);
  save("activities", activities);
  renderActivities();
}


/*****************
 *  EXPENSE FUNCTIONS (same)
 *****************/
function renderFinances() {
  const tbody = document.getElementById("expense-table-body");
  const summary = document.getElementById("expense-summary");
  tbody.innerHTML = "";

  if (!finances.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">No entries yet.</td></tr>`;
  } else {
    finances.forEach(f => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${f.type === "income" ? "💰 Income" : "💸 Expense"}</td>
        <td>${f.desc}</td>
        <td>${f.amount.toFixed(2)}</td>
        <td>${f.dateISO}</td>
        <td><button class="danger">Delete</button></td>
      `;
      tr.querySelector("button").onclick = () => deleteFinance(f.id);
      tbody.appendChild(tr);
    });
  }

  updateFinanceSummary();
}

function addFinance(type, desc, amount) {
  amount = Number(amount);
  if (!desc.trim() || isNaN(amount) || amount <= 0) {
    alert("Enter valid description and amount.");
    return;
  }

  finances.push({
    id: crypto.randomUUID(),
    type,
    desc: desc.trim(),
    amount,
    dateISO: todayStr(),
  });

  save("finances", finances);
  renderFinances();
}

function deleteFinance(id) {
  finances = finances.filter(f => f.id !== id);
  save("finances", finances);
  renderFinances();
}

function updateFinanceSummary() {
  const today = todayStr();
  const month = today.slice(0, 7);

  let income = 0, expense = 0;

  finances.forEach(f => {
    if (f.dateISO.startsWith(month)) {
      if (f.type === "income") income += f.amount;
      else expense += f.amount;
    }
  });

  document.getElementById("expense-summary").textContent =
    `Month Income: ₹${income} | Spent: ₹${expense} | Net: ₹${income - expense}`;
}


/*****************
 *  EVENTS
 *****************/
document.getElementById("activity-form").addEventListener("submit", e => {
  e.preventDefault();
  addHabit(document.getElementById("activity-input").value);
  document.getElementById("activity-input").value = "";
});

document.getElementById("expense-form").addEventListener("submit", e => {
  e.preventDefault();
  addFinance(
    expenseType,
    document.getElementById("expense-desc").value,
    document.getElementById("expense-amount").value
  );
  document.getElementById("expense-desc").value = "";
  document.getElementById("expense-amount").value = "";
});

document.getElementById("btn-expense").addEventListener("click", () => {
  expenseType = "expense";
  document.getElementById("btn-expense").classList.add("active");
  document.getElementById("btn-income").classList.remove("active");
});

document.getElementById("btn-income").addEventListener("click", () => {
  expenseType = "income";
  document.getElementById("btn-income").classList.add("active");
  document.getElementById("btn-expense").classList.remove("active");
});


/*****************
 * INIT
 *****************/
renderActivities();
renderFinances();
