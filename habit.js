// ===== HELPERS & STORAGE =====
const TIMEZONE = "Asia/Kolkata";

const todayStr = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const toUTC = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const diffDays = (a, b) => Math.round((toUTC(a) - toUTC(b)) / 86400000);

const load = (k, fb) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fb;
  } catch {
    return fb;
  }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ===== STATE =====
let activities = load("activities", []); // {id, name, streak, lastDone}
let habitLogs = load("habitLogs", {});   // { "YYYY-MM-DD": ["Gym", "Pray"] }

// ===== DOM =====
const activityForm = document.getElementById("activity-form");
const activityInput = document.getElementById("activity-input");
const activityList = document.getElementById("activity-list");

// ===== WEEK CALC (current week Mon–Sun) =====
function getCurrentWeekDates() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon...
  const diffToMonday = (day + 6) % 7; // convert so Monday is 0
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const iso = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    dates.push({ iso, label: d.toLocaleDateString("en-GB", { weekday: "short" }) });
  }
  return dates;
}

// ===== HABIT RENDER =====
function renderActivities() {
  activityList.innerHTML = "";

  if (!activities.length) {
    activityList.innerHTML =
      `<li class="item"><span class="muted">No habits yet. Add one above.</span></li>`;
    return;
  }

  const week = getCurrentWeekDates();

  activities.forEach((a) => {
    const doneToday = a.lastDone === todayStr();
    const li = document.createElement("li");
    li.className = "item";

    // Weekly circles
    const weekCircles = week
      .map((d) => {
        const done = (habitLogs[d.iso] || []).includes(a.name);
        return `<div class="week-day-circle ${done ? "done" : ""}">
                  ${done ? "✅" : ""}
                </div>`;
      })
      .join("");

    const weekLabels = week
      .map((d) => `<span>${d.label[0]}</span>`) // first letter of day
      .join("");

    li.innerHTML = `
      <div>
        <div class="name">${a.name}</div>
        <div class="meta">${a.lastDone ? `Last: ${a.lastDone}` : "Not done yet"}</div>
      </div>

      <div class="badge">🔥 Streak: ${a.streak}</div>

      <div class="actions">
        <button class="success" ${doneToday ? "disabled" : ""} data-action="done">Done</button>
        <button class="secondary" data-action="reset">Reset</button>
        <button class="danger" data-action="delete">Delete</button>
      </div>

      <div class="week-row">
        <div class="week-days">
          ${weekCircles}
        </div>
        <div class="week-labels">
          ${weekLabels}
        </div>
      </div>
    `;

    li.querySelector('[data-action="done"]').onclick = () => markHabitDone(a.id);
    li.querySelector('[data-action="reset"]').onclick = () => resetHabit(a.id);
    li.querySelector('[data-action="delete"]').onclick = () => deleteHabit(a.id);

    activityList.appendChild(li);
  });
}

function addHabit(name) {
  name = name.trim();
  if (!name) return;
  if (activities.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    alert("Habit already exists.");
    return;
  }
  activities.push({ id: crypto.randomUUID(), name, streak: 0, lastDone: null });
  save("activities", activities);
  renderActivities();
}

function markHabitDone(id) {
  const a = activities.find((x) => x.id === id);
  if (!a) return;
  const today = todayStr();

  if (a.lastDone === today) return;

  if (!a.lastDone) a.streak = 1;
  else {
    const gap = diffDays(today, a.lastDone);
    a.streak = gap === 1 ? a.streak + 1 : 1;
  }
  a.lastDone = today;

  if (!habitLogs[today]) habitLogs[today] = [];
  if (!habitLogs[today].includes(a.name)) habitLogs[today].push(a.name);

  save("habitLogs", habitLogs);
  save("activities", activities);
  renderActivities();
}

function resetHabit(id) {
  const a = activities.find((x) => x.id === id);
  if (!a) return;
  a.streak = 0;
  a.lastDone = null;
  save("activities", activities);
  renderActivities();
}

function deleteHabit(id) {
  activities = activities.filter((a) => a.id !== id);
  save("activities", activities);
  renderActivities();
}

// ===== EVENTS =====
activityForm.addEventListener("submit", (e) => {
  e.preventDefault();
  addHabit(activityInput.value);
  activityInput.value = "";
});

// ===== INIT =====
renderActivities();
