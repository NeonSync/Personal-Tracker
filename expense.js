// script.js
// Full updated JS: Habits + Expenses + Calendar (localStorage only, no login)

(() => {
  // ====== CONFIG / HELPERS ======
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
      const raw = localStorage.getItem(k);
      return raw ? JSON.parse(raw) : fb;
    } catch (e) {
      console.warn("load error", e);
      return fb;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {
      console.warn("save error", e);
    }
  };

  const uid = () => crypto.randomUUID?.() ?? String(Math.random()).slice(2);

  // Week helpers (Monday-first)
  function weekDatesFor(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay(); // 0 Sun, 1 Mon...
    // compute Monday of the current week
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(d);
    monday.setDate(d.getDate() + mondayOffset);
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      arr.push(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(dt)
      );
    }
    return arr; // [mon .. sun]
  }

  // ====== STATE (localStorage-backed) ======
  let activities = load("activities", []); // {id, name, streak, lastDone}
  let finances = load("finances", []); // {id, type, desc, amount, dateISO}
  let habitLogs = load("habitLogs", {}); // { "2025-12-01": ["Gym","Pray"], ...}
  let monthlyBudget = load("monthlyBudget", null);

  // calendar state
  let currentCal = new Date();
  currentCal.setDate(1);

  // ====== DOM REFERENCES ======
  const qs = (s) => document.querySelector(s);
  const qsa = (s) => Array.from(document.querySelectorAll(s));

  // Habit DOM
  const activityForm = qs("#activity-form");
  const activityInput = qs("#activity-input");
  const activityList = qs("#activity-list");

  // Expense DOM
  const expenseForm = qs("#expense-form");
  const expenseDesc = qs("#expense-desc");
  const expenseAmount = qs("#expense-amount");
  const expenseTable = qs("#expense-table-body");
  const expenseSummary = qs("#expense-summary");
  const btnExpense = qs("#btn-expense");
  const btnIncome = qs("#btn-income");
  const budgetInput = qs("#budget-input");
  const budgetSaveBtn = qs("#budget-save");
  const budgetWarning = qs("#budget-warning");

  // Calendar DOM
  const openCalendarBtn = qs("#open-calendar");
  const overlay = qs("#calendar-overlay");
  const closeBtn = qs("#cal-close");
  const prevBtn = qs("#cal-prev");
  const nextBtn = qs("#cal-next");
  const calTitle = qs("#cal-title");
  const calGrid = qs("#calendar-grid");
  const dayDetails = qs("#day-details");

  // Defensive: ensure critical elements exist
  if (!activityList || !expenseTable || !overlay || !calGrid) {
    console.error("Missing expected DOM elements. Ensure your HTML IDs match.");
  }

  // ====== HABIT FUNCTIONS ======
  function renderActivities() {
    if (!activityList) return;
    activityList.innerHTML = "";

    if (!activities.length) {
      activityList.innerHTML = `<li class="item"><span class="muted">No habits yet. Add one above.</span></li>`;
      return;
    }

    const weekIso = weekDatesFor();
    activities.forEach((a) => {
      const doneToday = a.lastDone === todayStr();
      const li = document.createElement("li");
      li.className = "item habit-item";

      // Main row: name, meta, streak, actions
      const nameHtml = `<div class="name">${escapeHtml(a.name)}</div>`;
      const metaHtml = `<div class="meta">${a.lastDone ? `Last: ${a.lastDone}` : "Not done yet"}</div>`;
      const badgeHtml = `<div class="badge">🔥 Streak: ${a.streak || 0}</div>`;

      // Actions - keep button layout similar to previous design
      const doneBtnDisabled = doneToday ? "disabled" : "";
      const actionsHtml = `
        <div class="actions">
          <button class="success btn-done" ${doneBtnDisabled} data-id="${a.id}">Done</button>
          <button class="secondary btn-reset" data-id="${a.id}">Reset</button>
          <button class="danger btn-delete" data-id="${a.id}">Delete</button>
        </div>
      `;

      // Weekly row (small circles centered, day label below)
      const weekCells = weekIso
        .map((iso) => {
          const did = (habitLogs[iso] || []).includes(a.name);
          // pill with tick centered and day text below inside
          return `<div class="wk-cell" data-iso="${iso}" data-name="${escapeHtml(
            a.name
          )}">
            <div class="wk-circle">${did ? "✓" : ""}</div>
            <div class="wk-day">${formatDayShort(iso)}</div>
          </div>`;
        })
        .join("");

      li.innerHTML = `
        <div class="habit-top">
          <div class="habit-info">${nameHtml}${metaHtml}</div>
          ${badgeHtml}
        </div>
        ${actionsHtml}
        <div class="habit-week-row">${weekCells}</div>
      `;

      // Attach action listeners
      li.querySelector(".btn-done").addEventListener("click", () => markHabitDone(a.id));
      li.querySelector(".btn-reset").addEventListener("click", () => resetHabit(a.id));
      li.querySelector(".btn-delete").addEventListener("click", () => deleteHabit(a.id));

      // Clicking a week circle toggles that day's habit presence
      li.querySelectorAll(".wk-cell").forEach((wc) => {
        wc.addEventListener("click", (ev) => {
          const iso = wc.getAttribute("data-iso");
          toggleHabitOnDate(a.name, iso);
        });
      });

      activityList.appendChild(li);
    });
  }

  function addHabit(name) {
    name = name?.toString().trim();
    if (!name) return;
    // check case-insensitive unique
    if (activities.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
      alert("Habit already exists.");
      return;
    }
    const h = { id: uid(), name, streak: 0, lastDone: null };
    activities.push(h);
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
      a.streak = gap === 1 ? (a.streak || 0) + 1 : 1;
    }
    a.lastDone = today;

    if (!habitLogs[today]) habitLogs[today] = [];
    if (!habitLogs[today].includes(a.name)) habitLogs[today].push(a.name);

    save("activities", activities);
    save("habitLogs", habitLogs);
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
    const a = activities.find((x) => x.id === id);
    if (!a) return;
    // remove from activities
    activities = activities.filter((x) => x.id !== id);
    // also remove from habitLogs (all dates)
    Object.keys(habitLogs).forEach((iso) => {
      habitLogs[iso] = habitLogs[iso].filter((n) => n !== a.name);
      if (habitLogs[iso].length === 0) delete habitLogs[iso];
    });
    save("activities", activities);
    save("habitLogs", habitLogs);
    renderActivities();
  }

  function toggleHabitOnDate(name, iso) {
    if (!name || !iso) return;
    if (!habitLogs[iso]) habitLogs[iso] = [];
    const arr = habitLogs[iso];
    const idx = arr.findIndex((n) => n === name);
    if (idx >= 0) arr.splice(idx, 1);
    else arr.push(name);
    if (!habitLogs[iso].length) delete habitLogs[iso];
    save("habitLogs", habitLogs);

    // also update streak/lastDone for that habit if iso == today
    if (iso === todayStr()) {
      const a = activities.find((x) => x.name === name);
      if (a) {
        if (arr.includes(name)) {
          // marked today done
          if (!a.lastDone) a.streak = 1;
          else {
            const gap = diffDays(iso, a.lastDone);
            a.streak = gap === 1 ? (a.streak || 0) + 1 : 1;
          }
          a.lastDone = iso;
        } else {
          // unmarking today: reset lastDone if lastDone was today
          if (a.lastDone === iso) {
            a.lastDone = null;
            a.streak = 0;
          }
        }
        save("activities", activities);
      }
    }

    renderActivities();
  }

  // ====== EXPENSES ======
  function renderFinances() {
    if (!expenseTable) return;
    expenseTable.innerHTML = "";
    if (!finances.length) {
      expenseTable.innerHTML = `<tr><td colspan="5" class="muted">No entries yet.</td></tr>`;
    } else {
      finances
        .slice()
        .sort((a, b) => toUTC(b.dateISO) - toUTC(a.dateISO))
        .forEach((f) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${f.type === "income" ? "💰 Income" : "💸 Expense"}</td>
            <td>${escapeHtml(f.desc)}</td>
            <td>${Number(f.amount).toFixed(2)}</td>
            <td>${f.dateISO}</td>
            <td><button class="danger btn-del-fin" data-id="${f.id}">Delete</button></td>
          `;
          tr.querySelector(".btn-del-fin").addEventListener("click", () => deleteFinance(f.id));
          expenseTable.appendChild(tr);
        });
    }
    updateFinanceSummary();
    updateBudgetWarning();
  }

  function addFinance(type, desc, amount) {
    amount = Number(amount);
    desc = (desc || "").toString().trim();
    if (!desc || isNaN(amount) || amount <= 0) {
      alert("Enter valid description and amount.");
      return;
    }
    finances.push({
      id: uid(),
      type,
      desc,
      amount,
      dateISO: todayStr(),
    });
    save("finances", finances);
    renderFinances();
  }

  function deleteFinance(id) {
    finances = finances.filter((f) => f.id !== id);
    save("finances", finances);
    renderFinances();
  }

  function updateFinanceSummary() {
    if (!expenseSummary) return;
    const today = todayStr();
    const month = today.slice(0, 7);
    const todaySpent = finances
      .filter((f) => f.dateISO === today && f.type === "expense")
      .reduce((s, f) => s + f.amount, 0);
    let income = 0,
      expense = 0;
    finances.forEach((f) => {
      if (f.dateISO.startsWith(month)) {
        if (f.type === "income") income += f.amount;
        else expense += f.amount;
      }
    });
    const net = income - expense;
    expenseSummary.textContent = `Today Spent: ₹${todaySpent.toFixed(2)} | Month: Income ₹${income.toFixed(
      2
    )}, Spent ₹${expense.toFixed(2)} | Net: ₹${net.toFixed(2)}`;
  }

  // ====== BUDGET ======
  function updateBudgetWarning() {
    if (!budgetWarning) return;
    const month = todayStr().slice(0, 7);
    const spent = finances
      .filter((f) => f.type === "expense" && f.dateISO.startsWith(month))
      .reduce((s, f) => s + f.amount, 0);

    if (monthlyBudget && spent > monthlyBudget) {
      budgetWarning.classList.remove("hidden");
      budgetWarning.classList.add("danger");
      budgetWarning.textContent = `⚠ Budget Exceeded! Limit ₹${monthlyBudget.toFixed(2)} | Spent ₹${spent.toFixed(
        2
      )}`;
    } else if (monthlyBudget) {
      budgetWarning.classList.remove("hidden");
      budgetWarning.classList.remove("danger");
      budgetWarning.textContent = `Budget: ₹${monthlyBudget.toFixed(2)} | Spent: ₹${spent.toFixed(
        2
      )} | Remaining: ₹${(monthlyBudget - spent).toFixed(2)}`;
    } else {
      budgetWarning.classList.add("hidden");
    }
  }

  // ====== CALENDAR ======
  function openCalendar() {
    if (!overlay) return;
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    renderCalendar();
    // prevent underlying page scroll while modal open
    document.documentElement.classList.add("no-scroll");
  }

  function closeCalendar() {
    if (!overlay) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("no-scroll");
  }

  function renderCalendar() {
    if (!calGrid || !calTitle) return;
    const y = currentCal.getFullYear();
    const m = currentCal.getMonth();
    const monthName = new Intl.DateTimeFormat("en", { month: "long" }).format(currentCal);
    calTitle.textContent = `${monthName} ${y}`;

    calGrid.innerHTML = "";

    // weekdays header
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => {
      const el = document.createElement("div");
      el.className = "weekday";
      el.textContent = d;
      calGrid.appendChild(el);
    });

    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // blanks
    for (let i = 0; i < firstDay; i++) calGrid.appendChild(document.createElement("div"));

    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayCell = document.createElement("div");
      dayCell.className = "day";

      let pills = "";
      if (habitLogs[iso]) pills += `<span class="pill habit">✓ ${habitLogs[iso].length}</span>`;
      const spent = finances.filter((f) => f.type === "expense" && f.dateISO === iso).reduce((s, f) => s + f.amount, 0);
      if (spent > 0) pills += `<span class="pill spend">-₹${spent.toFixed(0)}</span>`;
      const income = finances.filter((f) => f.type === "income" && f.dateISO === iso).reduce((s, f) => s + f.amount, 0);
      if (income > 0) pills += `<span class="pill income">+₹${income.toFixed(0)}</span>`;

      dayCell.innerHTML = `<header><span>${d}</span></header><div class="pills">${pills}</div>`;
      dayCell.addEventListener("click", () => showDayDetails(iso));
      calGrid.appendChild(dayCell);
    }

    dayDetails.innerHTML = `<div class="muted">Tap a date to view details.</div>`;
  }

  function showDayDetails(date) {
    if (!dayDetails) return;
    const habits = habitLogs[date] || [];
    const spent = finances.filter((f) => f.type === "expense" && f.dateISO === date).reduce((s, f) => s + f.amount, 0);
    const income = finances.filter((f) => f.type === "income" && f.dateISO === date).reduce((s, f) => s + f.amount, 0);

    dayDetails.innerHTML = `
      <h4>${new Date(date).toDateString()}</h4>
      <div class="line"><span>Habits Done</span><span>${habits.length}</span></div>
      <div class="muted">${habits.join(", ") || "None"}</div>
      <div class="line"><span>Spent</span><span>₹${spent.toFixed(2)}</span></div>
      <div class="line"><span>Income</span><span>₹${income.toFixed(2)}</span></div>
    `;
  }

  // ====== EVENTS & UI BINDINGS ======
  // Activity add
  if (activityForm) {
    activityForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = activityInput?.value || "";
      addHabit(v);
      if (activityInput) activityInput.value = "";
    });
  }

  // Expense add
  if (expenseForm) {
    expenseForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const type = (btnIncome && btnIncome.classList.contains("active")) ? "income" : "expense";
      addFinance(type, expenseDesc?.value, expenseAmount?.value);
      if (expenseDesc) expenseDesc.value = "";
      if (expenseAmount) expenseAmount.value = "";
    });
  }

  // Toggle Expense/Income buttons
  if (btnExpense) {
    btnExpense.addEventListener("click", () => {
      btnExpense.classList.add("active");
      btnIncome && btnIncome.classList.remove("active");
    });
  }
  if (btnIncome) {
    btnIncome.addEventListener("click", () => {
      btnIncome.classList.add("active");
      btnExpense && btnExpense.classList.remove("active");
    });
  }

  // Budget save
  if (budgetSaveBtn) {
    budgetSaveBtn.addEventListener("click", () => {
      const val = Number(budgetInput?.value);
      if (isNaN(val) || val <= 0) monthlyBudget = null;
      else monthlyBudget = val;
      save("monthlyBudget", monthlyBudget);
      updateBudgetWarning();
    });
  }

  // Calendar open/close
  if (openCalendarBtn) openCalendarBtn.addEventListener("click", openCalendar);
  if (closeBtn) closeBtn.addEventListener("click", closeCalendar);

  // Close if clicking outside modal content
  if (overlay) {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeCalendar();
    });
  }

  // ESC to close modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (overlay && !overlay.classList.contains("hidden")) closeCalendar();
    }
  });

  if (prevBtn) prevBtn.addEventListener("click", () => {
    currentCal.setMonth(currentCal.getMonth() - 1);
    currentCal.setDate(1);
    renderCalendar();
  });
  if (nextBtn) nextBtn.addEventListener("click", () => {
    currentCal.setMonth(currentCal.getMonth() + 1);
    currentCal.setDate(1);
    renderCalendar();
  });

  // ====== UTIL ======
  function formatDayShort(iso) {
    // returns Mon / Tue single short label (user wanted day names under circle)
    const d = new Date(iso + "T00:00:00");
    return new Intl.DateTimeFormat("en", { weekday: "short" }).format(d);
  }

  function escapeHtml(s) {
    return (s || "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ====== INIT ======
  function init() {
    // Ensure monthlyBudget is a number or null
    if (monthlyBudget === undefined) monthlyBudget = null;

    renderActivities();
    renderFinances();
    updateBudgetWarning();

    // populate budget input
    if (budgetInput) budgetInput.value = monthlyBudget ?? "";

    // ensure calendar is hidden on start
    if (overlay) overlay.classList.add("hidden");

    // Small UX: if income button present, ensure expense active by default
    if (btnExpense && btnIncome) {
      btnExpense.classList.add("active");
      btnIncome.classList.remove("active");
    }
  }

  init();

  // expose for debugging (optional)
  window._pt_debug = {
    activities,
    finances,
    habitLogs,
    saveState: () => {
      save("activities", activities);
      save("finances", finances);
      save("habitLogs", habitLogs);
      save("monthlyBudget", monthlyBudget);
    },
  };
})();
