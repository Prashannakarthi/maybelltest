import { getAll, batchUpsert } from "../db.js";
import { el, toast, todayStr } from "../utils.js";

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Mark Attendance"));

  const employees = await getAll("employees", { orderBy: ["name", "asc"] });
  const activeEmployees = employees.filter((e) => !e.lastDate);

  const dateInput = el("input", { type: "date", value: todayStr() });
  const saveBtn = el("button", { class: "btn btn-primary" }, "Save Attendance");
  const rowsHost = el("div", { id: "mark-rows", style: "display:flex;flex-direction:column;gap:8px;margin-top:14px" });

  const markCard = el("div", { class: "card card-pad" }, [
    el("div", { style: "display:flex;align-items:flex-end;gap:14px;flex-wrap:wrap" }, [
      el("label", { class: "field", style: "margin:0" }, [el("span", {}, "Date"), dateInput]),
      el("div", { class: "help-text", style: "margin-bottom:9px" }, "Everyone defaults to Present — tap to switch anyone who's absent, then save once."),
    ]),
    rowsHost,
    el("div", { style: "margin-top:14px;text-align:right" }, saveBtn),
  ]);
  root.appendChild(markCard);

  const rowState = new Map(); // employeeId -> "Present" | "Absent"

  async function loadRowsForDate() {
    rowsHost.innerHTML = `<div class="loading-cell" style="padding:20px 0"><span class="spinner"></span> Loading…</div>`;
    if (!activeEmployees.length) {
      rowsHost.innerHTML = `<p class="help-text">No active employees yet — add one on the Employees page first.</p>`;
      return;
    }
    const existing = await getAll("attendance", { where: [["date", "==", dateInput.value]] });
    const existingByEmp = Object.fromEntries(existing.map((r) => [r.employeeId, r.status]));

    rowState.clear();
    rowsHost.innerHTML = "";
    activeEmployees.forEach((emp) => {
      const status = existingByEmp[emp.id] || "Present"; // default to Present
      rowState.set(emp.id, status);

      const presentBtn = el("button", { type: "button", class: "btn btn-sm " + (status === "Present" ? "btn-gold" : "btn-ghost") }, "Present");
      const absentBtn = el("button", { type: "button", class: "btn btn-sm " + (status === "Absent" ? "btn-gold" : "btn-ghost") }, "Absent");
      presentBtn.addEventListener("click", () => { rowState.set(emp.id, "Present"); presentBtn.className = "btn btn-sm btn-gold"; absentBtn.className = "btn btn-sm btn-ghost"; });
      absentBtn.addEventListener("click", () => { rowState.set(emp.id, "Absent"); absentBtn.className = "btn btn-sm btn-gold"; presentBtn.className = "btn btn-sm btn-ghost"; });

      rowsHost.appendChild(el("div", { style: "display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid var(--line)" }, [
        el("span", { style: "flex:1;font-size:14px" }, emp.name),
        presentBtn, absentBtn,
      ]));
    });
  }

  dateInput.addEventListener("change", loadRowsForDate);

  saveBtn.addEventListener("click", async () => {
    if (!dateInput.value || !activeEmployees.length) { toast("Nothing to save", "warn"); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const records = activeEmployees.map((emp) => ({
        id: `${emp.id}_${dateInput.value}`,
        merge: true,
        data: { employeeId: emp.id, employeeName: emp.name, date: dateInput.value, status: rowState.get(emp.id) || "Present" },
      }));
      await batchUpsert("attendance", records);
      toast("Attendance saved", "success");
      if (monthEmpSelect.value === "" ) loadCalendar();
      else loadCalendar();
    } catch (err) {
      console.error(err);
      toast("Could not save attendance", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Attendance";
    }
  });

  // ---------------- Month view ----------------
  root.appendChild(el("div", { class: "section-title" }, "Monthly View"));
  const monthEmpSelect = el("select", {}, [
    el("option", { value: "" }, "All employees"),
    ...employees.map((e) => el("option", { value: e.id }, e.name)),
  ]);
  const monthInput = el("input", { type: "month", value: todayStr().slice(0, 7) });
  const filterRow = el("div", { class: "toolbar" }, [
    el("label", { class: "field", style: "margin:0" }, [el("span", {}, "Employee"), monthEmpSelect]),
    el("label", { class: "field", style: "margin:0" }, [el("span", {}, "Month"), monthInput]),
  ]);
  root.appendChild(filterRow);

  const calendarWrap = el("div", { class: "table-wrap", id: "calendar-wrap" });
  root.appendChild(calendarWrap);

  monthEmpSelect.addEventListener("change", loadCalendar);
  monthInput.addEventListener("change", loadCalendar);

  async function loadCalendar() {
    calendarWrap.innerHTML = `<div class="loading-cell" style="padding:30px"><span class="spinner"></span> Loading…</div>`;
    const month = monthInput.value;
    const all = await getAll("attendance", { where: [["date", ">=", `${month}-01`], ["date", "<=", `${month}-31`]] });
    const filtered = monthEmpSelect.value ? all.filter((a) => a.employeeId === monthEmpSelect.value) : all;

    if (monthEmpSelect.value) {
      renderSingleEmployeeCalendar(month, filtered);
    } else {
      renderAllEmployeesSummary(month, all, employees);
    }
  }

  function renderSingleEmployeeCalendar(month, records) {
    const byDate = Object.fromEntries(records.map((r) => [r.date, r.status]));
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const firstDow = new Date(y, m - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(el("div", { class: "cal-cell cal-blank" }));
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${month}-${String(d).padStart(2, "0")}`;
      const status = byDate[dateStr];
      const cls = status === "Present" ? "cal-present" : status === "Absent" ? "cal-absent" : "cal-none";
      cells.push(el("div", { class: `cal-cell ${cls}` }, [el("div", { class: "cal-day" }, String(d))]));
    }
    const present = records.filter((r) => r.status === "Present").length;
    const absent = records.filter((r) => r.status === "Absent").length;
    calendarWrap.innerHTML = "";
    calendarWrap.className = "";
    calendarWrap.appendChild(el("div", { class: "card card-pad" }, [
      el("div", { style: "display:flex;gap:16px;margin-bottom:14px;font-size:13.5px" }, [
        el("span", {}, [el("span", { class: "badge badge-present" }, "Present"), ` ${present} days`]),
        el("span", {}, [el("span", { class: "badge badge-absent" }, "Absent"), ` ${absent} days`]),
      ]),
      el("div", { class: "cal-grid" }, cells),
    ]));
  }

  function renderAllEmployeesSummary(month, records, allEmps) {
    const grouped = {};
    records.forEach((r) => {
      grouped[r.employeeId] = grouped[r.employeeId] || { present: 0, absent: 0 };
      if (r.status === "Present") grouped[r.employeeId].present++;
      else grouped[r.employeeId].absent++;
    });
    calendarWrap.className = "table-wrap";
    const rows = allEmps.map((e) => {
      const g = grouped[e.id] || { present: 0, absent: 0 };
      return el("tr", {}, [
        el("td", {}, e.name),
        el("td", { class: "num" }, String(g.present)),
        el("td", { class: "num" }, String(g.absent)),
        el("td", { class: "num" }, String(g.present + g.absent)),
      ]);
    });
    calendarWrap.innerHTML = "";
    calendarWrap.appendChild(el("table", {}, [
      el("thead", {}, el("tr", {}, ["Employee", "Present", "Absent", "Marked"].map((h) => el("th", {}, h)))),
      el("tbody", {}, rows.length ? rows : []),
    ]));
    if (!rows.length) calendarWrap.querySelector("tbody").innerHTML = `<tr><td colspan="4" class="empty-cell">No employees yet.</td></tr>`;
  }

  const style = document.createElement("style");
  style.textContent = `
    .cal-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
    .cal-cell{ aspect-ratio:1; border-radius:8px; display:flex; align-items:flex-start; justify-content:flex-start; padding:6px; font-size:12px; }
    .cal-blank{ background:transparent; }
    .cal-none{ background:#F1F1EC; color:#9AA; }
    .cal-present{ background: var(--teal-bg); color: var(--teal); font-weight:700; }
    .cal-absent{ background: var(--rose-bg); color: var(--rose); font-weight:700; }
  `;
  root.appendChild(style);

  loadRowsForDate();
  loadCalendar();
}
