import { getAll, addRecord, updateRecord, deleteRecord } from "../db.js";
import { el, toast, todayStr, fmtDate, openModal, closeModal, confirmDialog, loadingRow, emptyRow, debounce, compareDates } from "../utils.js";

let allFeedback = [];
let masterList = [];
let statusFilter = "all";
let priorityFilter = "all";
let sortKey = "date";

const STATUSES = ["Pending", "Informed to Brand", "Done"];
const PRIORITIES = ["High", "Medium", "Low"];

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Customer Feedback"));

  const toolbar = el("div", { class: "toolbar" }, [
    el("select", { onchange: (e) => { statusFilter = e.target.value; renderTable(); } }, [
      el("option", { value: "all" }, "All statuses"),
      ...STATUSES.map((s) => el("option", { value: s }, s)),
    ]),
    el("select", { onchange: (e) => { priorityFilter = e.target.value; renderTable(); } }, [
      el("option", { value: "all" }, "All priorities"),
      ...PRIORITIES.map((p) => el("option", { value: p }, p)),
    ]),
    el("select", { onchange: (e) => { sortKey = e.target.value; renderTable(); } }, [
      el("option", { value: "date" }, "Sort: Newest first"),
      el("option", { value: "priority" }, "Sort: Priority"),
    ]),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-primary", onclick: () => openFeedbackModal() }, "＋ Add Feedback"),
  ]);
  root.appendChild(toolbar);

  const fbTbody = el("tbody", { id: "fb-tbody" });
  fbTbody.innerHTML = loadingRow(6);
  root.appendChild(el("div", { class: "table-wrap" }, el("table", {}, [
    el("thead", {}, el("tr", {}, ["Date", "Feedback", "Repeats", "Priority", "Status", ""].map((h) => el("th", {}, h)))),
    fbTbody,
  ])));

  [allFeedback, masterList] = await Promise.all([
    getAll("feedback"),
    getAll("feedbackMaster"),
  ]);
  renderTable();

  function renderTable() {
    const tbody = root.querySelector("#fb-tbody");
    let rows = allFeedback.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (priorityFilter !== "all" && f.priority !== priorityFilter) return false;
      return true;
    });
    if (sortKey === "priority") {
      const order = { High: 0, Medium: 1, Low: 2 };
      rows.sort((a, b) => order[a.priority] - order[b.priority]);
    } else {
      rows.sort((a, b) => compareDates(b.date, a.date));
    }
    if (!rows.length) { tbody.innerHTML = emptyRow(6, "No feedback logged yet."); return; }
    tbody.innerHTML = "";
    rows.forEach((f) => {
      const masterEntry = masterList.find((m) => m.id === f.feedbackMasterId);
      const repeatCount = masterEntry?.count || 1;
      tbody.appendChild(el("tr", {}, [
        el("td", {}, fmtDate(f.date)),
        el("td", {}, f.descriptionText),
        el("td", { class: "num" }, repeatCount > 1 ? el("span", { class: "badge badge-medium" }, `×${repeatCount}`) : "1"),
        el("td", {}, el("span", { class: `badge badge-${f.priority?.toLowerCase()}` }, f.priority)),
        el("td", {}, statusPill(f)),
        el("td", {}, [
          el("button", { class: "icon-btn", title: "Edit", onclick: () => openFeedbackModal(f) }, el("span", { "data-ic": "edit" })),
          el("button", { class: "icon-btn", title: "Delete", onclick: () => handleDelete(f) }, el("span", { "data-ic": "trash" })),
        ]),
      ]));
    });
    import("../icons.js").then((m) => m.hydrateIcons(tbody));
  }

  function statusPill(f) {
    const cls = f.status === "Done" ? "badge-done" : f.status === "Informed to Brand" ? "badge-informed" : "badge-pending";
    const select = el("select", { class: `badge ${cls}`, style: "border:none;font-weight:700;" }, STATUSES.map((s) => el("option", { value: s, selected: s === f.status ? "selected" : undefined }, s)));
    select.addEventListener("change", async () => {
      await updateRecord("feedback", f.id, { status: select.value });
      f.status = select.value;
      toast("Status updated", "success");
    });
    return select;
  }

  async function handleDelete(f) {
    const ok = await confirmDialog("Delete this feedback entry?");
    if (!ok) return;
    await deleteRecord("feedback", f.id);
    allFeedback = allFeedback.filter((x) => x.id !== f.id);
    const master = masterList.find((m) => m.id === f.feedbackMasterId);
    if (master && master.count > 1) {
      master.count -= 1;
      await updateRecord("feedbackMaster", master.id, { count: master.count });
    }
    renderTable();
    toast("Feedback deleted", "success");
  }

  function openFeedbackModal(f) {
    const isEdit = !!f;
    const date = el("input", { type: "date", value: f?.date || todayStr() });
    const descInput = el("input", { placeholder: "Start typing feedback description…", value: f?.descriptionText || "", autocomplete: "off" });
    const suggestionsBox = el("div", { class: "autocomplete-list", style: "display:none" });
    const wrap = el("div", { class: "autocomplete-wrap" }, [descInput, suggestionsBox]);
    let chosenMasterId = f?.feedbackMasterId || null;

    descInput.addEventListener("input", debounce(() => {
      chosenMasterId = null;
      const val = descInput.value.toLowerCase().trim();
      if (!val) { suggestionsBox.style.display = "none"; return; }
      const matches = masterList.filter((m) => m.text.toLowerCase().includes(val)).slice(0, 6);
      suggestionsBox.innerHTML = "";
      matches.forEach((m) => {
        const opt = el("div", {}, `${m.text} (×${m.count})`);
        opt.addEventListener("click", () => { descInput.value = m.text; chosenMasterId = m.id; suggestionsBox.style.display = "none"; });
        suggestionsBox.appendChild(opt);
      });
      suggestionsBox.style.display = matches.length ? "block" : "none";
    }, 180));
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) suggestionsBox.style.display = "none"; });

    const priority = el("select", {}, PRIORITIES.map((p) => el("option", { value: p, selected: (f?.priority === p || (!f && p === "Medium")) ? "selected" : undefined }, p)));
    const status = el("select", {}, STATUSES.map((s) => el("option", { value: s, selected: (f?.status === s || (!f && s === "Pending")) ? "selected" : undefined }, s)));
    const errorMsg = el("p", { class: "login-error" }, "");

    const form = el("form", { class: "form-grid" }, [
      el("label", { class: "field" }, [el("span", {}, "Date"), date]),
      el("label", { class: "field" }, [el("span", {}, "Priority"), priority]),
      el("label", { class: "field full" }, [el("span", {}, "Description"), wrap, el("div", { class: "help-text" }, "Pick a suggestion to track repeats, or type a new one.")]),
      el("label", { class: "field" }, [el("span", {}, "Status"), status]),
      errorMsg,
      el("div", { class: "modal-actions full" }, [
        el("button", { type: "button", class: "btn btn-ghost", onclick: closeModal }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save Changes" : "Add Feedback"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!date.value || !descInput.value.trim()) {
        errorMsg.textContent = "Date and description are required.";
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
      try {
        let masterId = chosenMasterId;
        const text = descInput.value.trim();
        if (!masterId) {
          const existingMaster = masterList.find((m) => m.text.toLowerCase() === text.toLowerCase());
          if (existingMaster) {
            masterId = existingMaster.id;
            if (!isEdit || f.feedbackMasterId !== masterId) {
              existingMaster.count = (existingMaster.count || 0) + 1;
              await updateRecord("feedbackMaster", masterId, { count: existingMaster.count });
            }
          } else {
            masterId = await addRecord("feedbackMaster", { text, count: 1 });
            masterList.push({ id: masterId, text, count: 1 });
          }
        }
        const data = { date: date.value, descriptionText: text, feedbackMasterId: masterId, priority: priority.value, status: status.value };
        if (isEdit) {
          await updateRecord("feedback", f.id, data);
          Object.assign(f, data);
        } else {
          const id = await addRecord("feedback", data);
          allFeedback.push({ id, ...data });
        }
        renderTable();
        closeModal();
        toast(isEdit ? "Feedback updated" : "Feedback added", "success");
      } catch (err) {
        console.error(err);
        errorMsg.textContent = "Could not save. Check your connection and try again.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? "Save Changes" : "Add Feedback";
      }
    });

    openModal(isEdit ? "Edit Feedback" : "Add Customer Feedback", form, { wide: true });
  }
}
