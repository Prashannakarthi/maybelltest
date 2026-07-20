import { getAll, setRecord, deleteRecord } from "../db.js";
import { syncSaleStockEntry, deleteSaleStockEntry } from "../stockSync.js";
import { el, inr, toast, todayStr, fmtDate, openModal, closeModal, confirmDialog, loadingRow, emptyRow, debounce, compareDates } from "../utils.js";

let allSales = [];
let searchTerm = "";
let page = 1;
const PAGE_SIZE = 12;

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Daily Sales"));

  const toolbar = el("div", { class: "toolbar" }, [
    el("input", { class: "search", placeholder: "Search by date (YYYY-MM-DD)…", oninput: debounce((e) => { searchTerm = e.target.value; page = 1; renderTable(); }, 250) }),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-primary", onclick: () => openSaleModal() }, "＋ Add / Edit Entry"),
  ]);
  root.appendChild(toolbar);

  const salesTbody = el("tbody", { id: "sales-tbody" });
  salesTbody.innerHTML = loadingRow(9);
  root.appendChild(el("div", { class: "table-wrap" }, el("table", {}, [
    el("thead", {}, el("tr", {}, ["Date", "Bills", "Bill No Range", "Sale Qty", "Sale Value", "Return Qty", "Return Value", "Total Value", ""].map((h) => el("th", {}, h)))),
    salesTbody,
  ])));
  const paginationEl = el("div", { class: "pagination" });
  root.appendChild(paginationEl);

  allSales = await getAll("dailySales", { orderBy: ["date", "desc"] });
  renderTable();

  function renderTable() {
    const tbody = root.querySelector("#sales-tbody");
    let rows = allSales.filter((s) => !searchTerm || s.date.includes(searchTerm));
    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    if (!pageRows.length) { tbody.innerHTML = emptyRow(9, "No sales entries yet."); }
    else {
      tbody.innerHTML = "";
      pageRows.forEach((s) => {
        tbody.appendChild(el("tr", {}, [
          el("td", {}, fmtDate(s.date)),
          el("td", { class: "num" }, String(s.billCount ?? "—")),
          el("td", { class: "num" }, `${s.billFrom ?? ""}–${s.billTo ?? ""}`),
          el("td", { class: "num" }, String(s.saleQty ?? 0)),
          el("td", { class: "num" }, inr(s.saleValue)),
          el("td", { class: "num" }, String(s.returnQty ?? 0)),
          el("td", { class: "num" }, inr(s.returnValue)),
          el("td", { class: "num" }, inr(s.totalValue)),
          el("td", {}, [
            el("button", { class: "icon-btn", title: "Edit", onclick: () => openSaleModal(s) }, el("span", { "data-ic": "edit" })),
            el("button", { class: "icon-btn", title: "Delete", onclick: () => handleDelete(s) }, el("span", { "data-ic": "trash" })),
          ]),
        ]));
      });
      import("../icons.js").then((m) => m.hydrateIcons(tbody));
    }

    paginationEl.innerHTML = "";
    paginationEl.appendChild(el("button", { disabled: page <= 1 ? "disabled" : undefined, onclick: () => { page--; renderTable(); } }, "‹ Prev"));
    paginationEl.appendChild(el("span", {}, `Page ${page} of ${totalPages}`));
    paginationEl.appendChild(el("button", { disabled: page >= totalPages ? "disabled" : undefined, onclick: () => { page++; renderTable(); } }, "Next ›"));
  }

  async function handleDelete(sale) {
    const ok = await confirmDialog(`Delete the sales entry for ${fmtDate(sale.date)}? This also removes its linked stock movement and reverses it from the running stock totals. This can't be undone.`);
    if (!ok) return;
    try {
      await deleteRecord("dailySales", sale.id);
      await deleteSaleStockEntry(sale.date);
      allSales = allSales.filter((s) => s.id !== sale.id);
      renderTable();
      toast("Entry deleted", "success");
    } catch (err) {
      console.error(err);
      toast("Could not delete entry", "error");
    }
  }

  function openSaleModal(sale) {
    const isEdit = !!sale;
    const date = el("input", { type: "date", value: sale?.date || todayStr(), disabled: isEdit ? "disabled" : undefined });
    const billCount = el("input", { type: "number", min: "0", value: sale?.billCount ?? "" });
    const billFrom = el("input", { type: "text", value: sale?.billFrom ?? "" });
    const billTo = el("input", { type: "text", value: sale?.billTo ?? "" });
    const saleQty = el("input", { type: "number", min: "0", value: sale?.saleQty ?? "" });
    const saleValue = el("input", { type: "number", min: "0", step: "0.01", value: sale?.saleValue ?? "" });
    const returnQty = el("input", { type: "number", min: "0", value: sale?.returnQty ?? "0" });
    const returnValue = el("input", { type: "number", min: "0", step: "0.01", value: sale?.returnValue ?? "0" });
    const totalPreview = el("div", { class: "kpi-value", style: "font-size:19px" }, inr((Number(sale?.saleValue) || 0) - (Number(sale?.returnValue) || 0)));
    const errorMsg = el("p", { class: "login-error" }, "");

    function recalcTotal() {
      const t = (Number(saleValue.value) || 0) - (Number(returnValue.value) || 0);
      totalPreview.textContent = inr(t);
    }
    [saleValue, returnValue].forEach((i) => i.addEventListener("input", recalcTotal));

    const form = el("form", { class: "form-grid" }, [
      el("label", { class: "field" }, [el("span", {}, "Date"), date]),
      el("label", { class: "field" }, [el("span", {}, "Total Bill Count"), billCount]),
      el("label", { class: "field" }, [el("span", {}, "Bill No From"), billFrom]),
      el("label", { class: "field" }, [el("span", {}, "Bill No To"), billTo]),
      el("label", { class: "field" }, [el("span", {}, "Sale Qty (units)"), saleQty]),
      el("label", { class: "field" }, [el("span", {}, "Sale Value (₹)"), saleValue]),
      el("label", { class: "field" }, [el("span", {}, "Return Qty (units)"), returnQty]),
      el("label", { class: "field" }, [el("span", {}, "Return Value (₹)"), returnValue]),
      el("div", { class: "field full" }, [el("span", {}, "Total Value (auto)"), totalPreview]),
      errorMsg,
      el("div", { class: "modal-actions full" }, [
        el("button", { type: "button", class: "btn btn-ghost", onclick: closeModal }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save Changes" : "Add Entry"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!date.value || saleValue.value === "") {
        errorMsg.textContent = "Date and Sale Value are required.";
        return;
      }
      const dateVal = sale?.date || date.value;
      const existing = allSales.find((s) => s.date === dateVal);
      if (!isEdit && existing) {
        errorMsg.textContent = "An entry already exists for this date — edit it instead.";
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
      try {
        const totalValue = (Number(saleValue.value) || 0) - (Number(returnValue.value) || 0);
        const data = {
          date: dateVal,
          billCount: Number(billCount.value) || 0,
          billFrom: billFrom.value.trim(),
          billTo: billTo.value.trim(),
          saleQty: Number(saleQty.value) || 0,
          saleValue: Number(saleValue.value) || 0,
          returnQty: Number(returnQty.value) || 0,
          returnValue: Number(returnValue.value) || 0,
          totalValue,
        };
        await setRecord("dailySales", dateVal, data);
        await syncSaleStockEntry(dateVal, data.saleQty, data.returnQty);

        const idx = allSales.findIndex((s) => s.date === dateVal);
        if (idx >= 0) allSales[idx] = { ...allSales[idx], ...data };
        else allSales.unshift({ id: dateVal, ...data });
        allSales.sort((a, b) => compareDates(b.date, a.date));

        renderTable();
        closeModal();
        toast("Sales entry saved", "success");
      } catch (err) {
        console.error(err);
        errorMsg.textContent = "Could not save. Check your connection and try again.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? "Save Changes" : "Add Entry";
      }
    });

    openModal(isEdit ? `Edit Sales — ${fmtDate(sale.date)}` : "Add Daily Sales Entry", form, { wide: true });
  }
}
