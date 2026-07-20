import { getAll, setRecord, deleteRecord } from "../db.js";
import { el, inr, toast, confirmDialog, monthStr, loadingRow, emptyRow } from "../utils.js";

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Monthly Target"));

  const currentMonth = monthStr();
  const monthInput = el("input", { type: "month", value: currentMonth });
  const amountInput = el("input", { type: "number", min: "0", step: "1", placeholder: "e.g. 250000" });
  const saveBtn = el("button", { class: "btn btn-primary" }, "Save Target");
  const formCard = el("div", { class: "card card-pad" }, [
    el("p", { class: "help-text" }, "Set a sales target for any month. The Dashboard always shows progress against the current month's target automatically."),
    el("div", { class: "form-grid" }, [
      el("label", { class: "field" }, [el("span", {}, "Month"), monthInput]),
      el("label", { class: "field" }, [el("span", {}, "Target Value (₹)"), amountInput]),
      el("div", { class: "full", style: "text-align:right" }, saveBtn),
    ]),
  ]);
  root.appendChild(formCard);

  root.appendChild(el("div", { class: "section-title" }, "Target History"));
  const tbody = el("tbody", { id: "target-tbody" });
  tbody.innerHTML = loadingRow(6);
  root.appendChild(el("div", { class: "table-wrap" }, el("table", {}, [
    el("thead", {}, el("tr", {}, ["Month", "Target Value", "Actual Sale", "Achieved %", "", ""].map((h) => el("th", {}, h)))),
    tbody,
  ])));

  let [targets, allSales] = await Promise.all([
    getAll("targets", { orderBy: ["month", "desc"] }),
    getAll("dailySales"),
  ]);

  function actualSaleForMonth(month) {
    return allSales
      .filter((s) => monthStr(s.date) === month)
      .reduce((sum, s) => sum + (Number(s.totalValue) || 0), 0);
  }

  renderTable();
  prefillForm();

  monthInput.addEventListener("change", prefillForm);

  function prefillForm() {
    const existing = targets.find((t) => t.month === monthInput.value);
    amountInput.value = existing ? existing.targetValue : "";
  }

  saveBtn.addEventListener("click", async () => {
    if (!monthInput.value) { toast("Choose a month", "warn"); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const value = Number(amountInput.value) || 0;
      await setRecord("targets", monthInput.value, { month: monthInput.value, targetValue: value });
      const idx = targets.findIndex((t) => t.month === monthInput.value);
      if (idx >= 0) targets[idx].targetValue = value;
      else targets.unshift({ id: monthInput.value, month: monthInput.value, targetValue: value });
      targets.sort((a, b) => (a.month < b.month ? 1 : -1));
      renderTable();
      toast("Target saved", "success");
    } catch (err) {
      console.error(err);
      toast("Could not save target", "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Target";
    }
  });

  function renderTable() {
    if (!targets.length) { tbody.innerHTML = emptyRow(6, "No targets set yet."); return; }
    tbody.innerHTML = "";
    targets.forEach((t) => {
      const isCurrent = t.month === currentMonth;
      const actual = actualSaleForMonth(t.month);
      const target = Number(t.targetValue) || 0;
      const pct = target > 0 ? Math.round((actual / target) * 100) : null;
      const pctBadgeClass = pct === null ? "badge-inactive" : pct >= 100 ? "badge-present" : pct >= 75 ? "badge-medium" : "badge-absent";

      tbody.appendChild(el("tr", {}, [
        el("td", {}, [t.month, isCurrent ? el("span", { class: "badge badge-active", style: "margin-left:8px" }, "Current") : ""]),
        el("td", { class: "num" }, inr(target)),
        el("td", { class: "num" }, inr(actual)),
        el("td", {}, el("span", { class: `badge ${pctBadgeClass}` }, pct === null ? "no target" : `${pct}%`)),
        el("td", {}, el("button", { class: "btn btn-sm btn-ghost", onclick: () => { monthInput.value = t.month; amountInput.value = t.targetValue; amountInput.focus(); } }, "Edit")),
        el("td", {}, el("button", { class: "icon-btn", title: "Delete", onclick: () => handleDelete(t) }, el("span", { "data-ic": "trash" }))),
      ]));
    });
    import("../icons.js").then((m) => m.hydrateIcons(tbody));
  }

  async function handleDelete(t) {
    const ok = await confirmDialog(`Delete the target for ${t.month}? This can't be undone.`);
    if (!ok) return;
    try {
      await deleteRecord("targets", t.id);
      targets = targets.filter((x) => x.id !== t.id);
      renderTable();
      if (monthInput.value === t.month) amountInput.value = "";
      toast("Target deleted", "success");
    } catch (err) {
      console.error(err);
      toast("Could not delete target", "error");
    }
  }
}
