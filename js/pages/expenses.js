import { getAll, addRecord, updateRecord, deleteRecord } from "../db.js";
import { el, inr, toast, todayStr, monthStr, fmtDate, openModal, closeModal, confirmDialog, loadingRow, emptyRow } from "../utils.js";

let allExpenses = [];
let recurringItems = [];
let viewMonth = monthStr();

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Expenses"));

  const alertHost = el("div", { id: "alert-host" });
  root.appendChild(alertHost);

  const toolbar = el("div", { class: "toolbar" }, [
    el("label", { class: "field", style: "margin:0" }, [
      el("span", {}, "Month"),
      el("input", { type: "month", value: viewMonth, onchange: (e) => { viewMonth = e.target.value; loadAndRender(); } }),
    ]),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-ghost", onclick: () => openRecurringManager() }, "Manage Recurring"),
    el("button", { class: "btn btn-primary", onclick: () => openExpenseModal() }, "＋ Add Expense"),
  ]);
  root.appendChild(toolbar);

  const tableWrap = el("div", { class: "table-wrap" }, el("table", {}, [
    el("thead", {}, el("tr", {}, ["Date", "Category / Description", "Type", "Amount", ""].map((h) => el("th", {}, h)))),
    el("tbody", { id: "exp-tbody" }, loadingRow(5)),
  ]));
  root.appendChild(tableWrap);

  const totalCard = el("div", { class: "card card-pad", style: "margin-top:14px;display:flex;justify-content:space-between;align-items:center" });
  root.appendChild(totalCard);

  recurringItems = await getAll("recurringExpenses");
  await loadAndRender();

  async function loadAndRender() {
    root.querySelector("#exp-tbody").innerHTML = loadingRow(5);
    allExpenses = await getAll("expenses", { where: [["month", "==", viewMonth]] });
    renderAlerts();
    renderTable();
  }

  function renderAlerts() {
    const active = recurringItems.filter((r) => r.active !== false);
    const presentCategories = new Set(allExpenses.filter((e) => e.isRecurring).map((e) => e.category));
    const missing = active.filter((r) => !presentCategories.has(r.category));
    alertHost.innerHTML = "";
    missing.forEach((r) => {
      alertHost.appendChild(el("div", { class: "alert-banner" }, [
        el("span", {}, `⚠ ${r.category} — not yet added this month`),
        el("button", { class: "btn btn-sm btn-gold", style: "margin-left:auto", onclick: () => openExpenseModal(null, r) }, "Add now"),
      ]));
    });
  }

  function renderTable() {
    const tbody = root.querySelector("#exp-tbody");
    const rows = [...allExpenses].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!rows.length) { tbody.innerHTML = emptyRow(5, "No expenses logged for this month."); }
    else {
      tbody.innerHTML = "";
      rows.forEach((exp) => {
        tbody.appendChild(el("tr", {}, [
          el("td", {}, fmtDate(exp.date)),
          el("td", {}, [exp.category, exp.description ? el("div", { class: "help-text" }, exp.description) : ""]),
          el("td", {}, el("span", { class: `badge ${exp.isRecurring ? "badge-catA" : "badge-catC"}` }, exp.isRecurring ? "Recurring" : "One-off")),
          el("td", { class: "num" }, inr(exp.amount)),
          el("td", {}, [
            el("button", { class: "icon-btn", title: "Edit", onclick: () => openExpenseModal(exp) }, el("span", { "data-ic": "edit" })),
            el("button", { class: "icon-btn", title: "Delete", onclick: () => handleDelete(exp) }, el("span", { "data-ic": "trash" })),
          ]),
        ]));
      });
      import("../icons.js").then((m) => m.hydrateIcons(tbody));
    }
    const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    totalCard.innerHTML = "";
    totalCard.appendChild(el("span", { class: "kpi-label" }, `Total for ${viewMonth}`));
    totalCard.appendChild(el("span", { class: "kpi-value" }, inr(total)));
  }

  async function handleDelete(exp) {
    const ok = await confirmDialog(`Delete this expense (${exp.category}, ${inr(exp.amount)})?`);
    if (!ok) return;
    await deleteRecord("expenses", exp.id);
    allExpenses = allExpenses.filter((e) => e.id !== exp.id);
    renderAlerts();
    renderTable();
    toast("Expense deleted", "success");
  }

  function openExpenseModal(exp, prefillRecurring) {
    const isEdit = !!exp;
    const date = el("input", { type: "date", value: exp?.date || todayStr() });
    const categorySelect = el("select", {}, [
      el("option", { value: "" }, "— One-off expense —"),
      ...recurringItems.map((r) => el("option", { value: r.category, selected: (exp?.category === r.category || prefillRecurring?.category === r.category) ? "selected" : undefined }, r.category)),
    ]);
    const customCategory = el("input", { placeholder: "Category name", value: exp && !exp.isRecurring ? exp.category : "" });
    const description = el("textarea", { rows: "2" }, exp?.description || "");
    const amount = el("input", { type: "number", min: "0", step: "0.01", required: "required", value: exp?.amount ?? (prefillRecurring?.defaultAmount ?? "") });
    const errorMsg = el("p", { class: "login-error" }, "");

    function toggleCustom() { customCategory.parentElement.style.display = categorySelect.value ? "none" : "block"; }
    categorySelect.addEventListener("change", toggleCustom);

    const form = el("form", { class: "form-grid" }, [
      el("label", { class: "field" }, [el("span", {}, "Date"), date]),
      el("label", { class: "field" }, [el("span", {}, "Recurring Category"), categorySelect]),
      el("label", { class: "field" }, [el("span", {}, "Or custom category"), customCategory]),
      el("label", { class: "field" }, [el("span", {}, "Amount (₹)"), amount]),
      el("label", { class: "field full" }, [el("span", {}, "Description (optional)"), description]),
      errorMsg,
      el("div", { class: "modal-actions full" }, [
        el("button", { type: "button", class: "btn btn-ghost", onclick: closeModal }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save Changes" : "Add Expense"),
      ]),
    ]);
    toggleCustom();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const category = categorySelect.value || customCategory.value.trim();
      if (!date.value || !category || amount.value === "") {
        errorMsg.textContent = "Date, category and amount are required.";
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
      try {
        const data = {
          date: date.value, month: monthStr(date.value), category,
          description: description.value.trim(), amount: Number(amount.value) || 0,
          isRecurring: !!categorySelect.value,
        };
        if (isEdit) {
          await updateRecord("expenses", exp.id, data);
          Object.assign(exp, data);
        } else {
          const id = await addRecord("expenses", data);
          allExpenses.push({ id, ...data });
        }
        renderAlerts();
        renderTable();
        closeModal();
        toast(isEdit ? "Expense updated" : "Expense added", "success");
      } catch (err) {
        console.error(err);
        errorMsg.textContent = "Could not save. Check your connection and try again.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? "Save Changes" : "Add Expense";
      }
    });

    openModal(isEdit ? "Edit Expense" : "Add Expense", form, { wide: true });
  }

  function openRecurringManager() {
    const list = el("div", { id: "recurring-list", style: "display:flex;flex-direction:column;gap:10px;margin-bottom:16px" });
    renderList();
    const newCat = el("input", { placeholder: "New category (e.g. Store Rent)" });
    const newAmt = el("input", { type: "number", min: "0", placeholder: "Default amount ₹" });
    const addBtn = el("button", { type: "button", class: "btn btn-gold" }, "Add Category");
    const body = el("div", {}, [
      list,
      el("div", { class: "form-grid" }, [
        el("label", { class: "field" }, [el("span", {}, "Category"), newCat]),
        el("label", { class: "field" }, [el("span", {}, "Default Amount"), newAmt]),
        el("div", { class: "full", style: "text-align:right" }, addBtn),
      ]),
    ]);
    addBtn.addEventListener("click", async () => {
      if (!newCat.value.trim()) { toast("Enter a category name", "warn"); return; }
      const id = await addRecord("recurringExpenses", { category: newCat.value.trim(), defaultAmount: Number(newAmt.value) || 0, active: true });
      recurringItems.push({ id, category: newCat.value.trim(), defaultAmount: Number(newAmt.value) || 0, active: true });
      newCat.value = ""; newAmt.value = "";
      renderList();
      renderAlerts();
    });

    function renderList() {
      list.innerHTML = "";
      if (!recurringItems.length) { list.appendChild(el("p", { class: "help-text" }, "No recurring items configured yet.")); return; }
      recurringItems.forEach((r) => {
        const amtInput = el("input", { type: "number", value: r.defaultAmount, style: "width:100px" });
        const activeToggle = el("input", { type: "checkbox", checked: r.active !== false ? "checked" : undefined });
        const row = el("div", { class: "card card-pad", style: "display:flex;align-items:center;gap:10px" }, [
          el("strong", { style: "flex:1" }, r.category),
          el("label", { style: "display:flex;align-items:center;gap:5px;font-size:12.5px" }, [activeToggle, "active"]),
          amtInput,
          el("button", { type: "button", class: "icon-btn", title: "Save" }, el("span", { "data-ic": "check" })),
          el("button", { type: "button", class: "icon-btn", title: "Delete" }, el("span", { "data-ic": "trash" })),
        ]);
        row.querySelector('[title="Save"]').addEventListener("click", async () => {
          await updateRecord("recurringExpenses", r.id, { defaultAmount: Number(amtInput.value) || 0, active: activeToggle.checked });
          r.defaultAmount = Number(amtInput.value) || 0;
          r.active = activeToggle.checked;
          toast("Saved", "success");
          renderAlerts();
        });
        row.querySelector('[title="Delete"]').addEventListener("click", async () => {
          const ok = await confirmDialog(`Remove "${r.category}" from recurring expenses? Past entries stay untouched.`);
          if (!ok) return;
          await deleteRecord("recurringExpenses", r.id);
          recurringItems = recurringItems.filter((x) => x.id !== r.id);
          renderList();
          renderAlerts();
        });
        list.appendChild(row);
        import("../icons.js").then((m) => m.hydrateIcons(row));
      });
    }

    openModal("Recurring Expense Setup", body, { wide: true });
  }
}
