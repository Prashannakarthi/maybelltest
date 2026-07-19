import { getAll, getOne } from "../db.js";
import { el, inr, fmtDate, todayStr, monthStr, downloadCSV, loadingRow, emptyRow } from "../utils.js";

const REPORTS = [
  { id: "daily-sales", title: "A. Daily Sales Report", desc: "Every sales entry in the chosen range." },
  { id: "month-sales", title: "B. Month-wise Sales Report", desc: "Sales totals by month, with target & achievement %." },
  { id: "stock-report", title: "C. Stock In/Out Report", desc: "Movements by category, A/B/C/O." },
  { id: "profit", title: "D. Profit Analysis Report", desc: "Sales minus expenses over a period." },
  { id: "expense-analysis", title: "E. Expenses Analysis Report", desc: "By category, recurring vs one-off." },
  { id: "feedback-report", title: "F. Customer Feedback Report", desc: "By status, priority and repeat type." },
  { id: "month-end", title: "G. Month-End Summary", desc: "Sales vs target, expenses & stock for one month." },
];

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Reports"));
  const grid = el("div", { class: "report-grid" });
  REPORTS.forEach((r) => {
    const tile = el("div", { class: "card report-tile" }, [el("h4", {}, r.title), el("p", {}, r.desc)]);
    tile.addEventListener("click", () => openReport(r.id, r.title));
    grid.appendChild(tile);
  });
  root.appendChild(grid);

  const resultHost = el("div", { id: "report-result" });
  root.appendChild(resultHost);

  async function openReport(id, title) {
    resultHost.innerHTML = "";
    resultHost.appendChild(el("div", { class: "section-title" }, title));

    const isMonthOnly = id === "month-end";
    const from = el("input", { type: "date", value: firstOfMonth() });
    const to = el("input", { type: "date", value: todayStr() });
    const monthPick = el("input", { type: "month", value: monthStr() });
    const runBtn = el("button", { class: "btn btn-primary" }, "Run Report");
    const exportBtn = el("button", { class: "btn btn-ghost" }, "Export CSV");

    const filterRow = el("div", { class: "toolbar" }, isMonthOnly
      ? [el("label", { class: "field", style: "margin:0" }, [el("span", {}, "Month"), monthPick]), runBtn, exportBtn]
      : [
          el("label", { class: "field", style: "margin:0" }, [el("span", {}, "From"), from]),
          el("label", { class: "field", style: "margin:0" }, [el("span", {}, "To"), to]),
          runBtn, exportBtn,
        ]);
    resultHost.appendChild(filterRow);

    const outputHost = el("div", {});
    resultHost.appendChild(outputHost);
    let lastRows = [];

    async function run() {
      outputHost.innerHTML = `<div class="table-wrap"><table><tbody>${loadingRow(4)}</tbody></table></div>`;
      const range = isMonthOnly ? { from: `${monthPick.value}-01`, to: `${monthPick.value}-31` } : { from: from.value, to: to.value };
      const { columns, rows, summary } = await buildReport(id, range);
      lastRows = rows;
      outputHost.innerHTML = "";
      if (summary) outputHost.appendChild(summary);
      if (!rows.length) {
        outputHost.appendChild(el("div", { class: "table-wrap" }, el("table", {}, el("tbody", {}, el("tr", {}, el("td", { class: "empty-cell" }, "No data in this range."))))));
        return;
      }
      const table = el("table", {}, [
        el("thead", {}, el("tr", {}, columns.map((c) => el("th", {}, c)))),
        el("tbody", {}, rows.map((r) => el("tr", {}, columns.map((c) => el("td", { class: typeof r[c] === "number" ? "num" : "" }, formatCell(r[c])))))),
      ]);
      outputHost.appendChild(el("div", { class: "table-wrap" }, table));
    }

    exportBtn.addEventListener("click", () => downloadCSV(lastRows, `${id}_${isMonthOnly ? monthPick.value : from.value + "_to_" + to.value}.csv`));
    runBtn.addEventListener("click", run);
    run();
  }
}

function formatCell(v) {
  if (typeof v === "number") return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return v ?? "—";
}

function firstOfMonth() { return monthStr() + "-01"; }

async function buildReport(id, { from, to }) {
  switch (id) {
    case "daily-sales": {
      const sales = (await getAll("dailySales")).filter((s) => inRange(s.date, from, to)).sort((a, b) => (a.date < b.date ? -1 : 1));
      return {
        columns: ["Date", "Bill Count", "Sale Qty", "Sale Value", "Return Qty", "Return Value", "Total Value"],
        rows: sales.map((s) => ({ Date: fmtDate(s.date), "Bill Count": s.billCount || 0, "Sale Qty": s.saleQty || 0, "Sale Value": s.saleValue || 0, "Return Qty": s.returnQty || 0, "Return Value": s.returnValue || 0, "Total Value": s.totalValue || 0 })),
      };
    }
    case "month-sales": {
      const [sales, targets] = await Promise.all([getAll("dailySales"), getAll("targets")]);
      const filtered = sales.filter((s) => inRange(s.date, from, to));
      const targetByMonth = Object.fromEntries(targets.map((t) => [t.month, Number(t.targetValue) || 0]));
      const byMonth = {};
      filtered.forEach((s) => {
        const m = monthStr(s.date);
        byMonth[m] = byMonth[m] || { Month: m, "Sale Qty": 0, "Sale Value": 0, "Return Value": 0, "Total Value": 0 };
        byMonth[m]["Sale Qty"] += s.saleQty || 0;
        byMonth[m]["Sale Value"] += s.saleValue || 0;
        byMonth[m]["Return Value"] += s.returnValue || 0;
        byMonth[m]["Total Value"] += s.totalValue || 0;
      });
      const rows = Object.values(byMonth).sort((a, b) => (a.Month < b.Month ? -1 : 1)).map((r) => {
        const target = targetByMonth[r.Month] || 0;
        const achievedPct = target > 0 ? Math.round((r["Total Value"] / target) * 100) : null;
        return { ...r, Target: target, "Achieved %": achievedPct === null ? "—" : achievedPct };
      });
      return { columns: ["Month", "Sale Qty", "Sale Value", "Return Value", "Total Value", "Target", "Achieved %"], rows };
    }
    case "stock-report": {
      const entries = (await getAll("stockEntries")).filter((s) => inRange(s.date, from, to)).sort((a, b) => (a.date < b.date ? -1 : 1));
      const byCat = { A: { In: 0, Out: 0 }, B: { In: 0, Out: 0 }, C: { In: 0, Out: 0 }, O: { In: 0, Out: 0 } };
      entries.forEach((e) => { if (byCat[e.category]) { byCat[e.category].In += e.stockIn || 0; byCat[e.category].Out += e.stockOut || 0; } });
      const summary = el("div", { class: "kpi-grid", style: "grid-template-columns:repeat(4,1fr);margin-bottom:14px" }, ["A", "B", "C", "O"].map((c) =>
        el("div", { class: "kpi-card" }, [el("div", { class: "kpi-label" }, `Category ${c}`), el("div", { class: "kpi-value", style: "font-size:16px" }, `IN ${byCat[c].In} / OUT ${byCat[c].Out}`)])
      ));
      return {
        columns: ["Date", "Category", "In", "Out", "Balance Qty", "Remarks"],
        rows: entries.map((e) => ({ Date: fmtDate(e.date), Category: e.category, In: e.stockIn || 0, Out: e.stockOut || 0, "Balance Qty": e.cumulativeQty ?? "", Remarks: e.remarks || "" })),
        summary,
      };
    }
    case "profit": {
      const [sales, expenses] = await Promise.all([getAll("dailySales"), getAll("expenses")]);
      const s = sales.filter((x) => inRange(x.date, from, to));
      const e = expenses.filter((x) => inRange(x.date, from, to));
      const totalSales = s.reduce((sum, x) => sum + (Number(x.totalValue) || 0), 0);
      const totalExpenses = e.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
      const profit = totalSales - totalExpenses;
      const summary = el("div", { class: "kpi-grid", style: "grid-template-columns:repeat(3,1fr);margin-bottom:14px" }, [
        kpi("Total Sales", inr(totalSales)), kpi("Total Expenses", inr(totalExpenses)), kpi("Net Profit", inr(profit)),
      ]);
      return {
        columns: ["Metric", "Amount"],
        rows: [{ Metric: "Total Sales", Amount: totalSales }, { Metric: "Total Expenses", Amount: totalExpenses }, { Metric: "Net Profit (before cost of goods)", Amount: profit }],
        summary,
      };
    }
    case "expense-analysis": {
      const expenses = (await getAll("expenses")).filter((x) => inRange(x.date, from, to));
      const byCat = {};
      expenses.forEach((x) => {
        byCat[x.category] = byCat[x.category] || { Category: x.category, Type: x.isRecurring ? "Recurring" : "One-off", Amount: 0 };
        byCat[x.category].Amount += Number(x.amount) || 0;
      });
      return { columns: ["Category", "Type", "Amount"], rows: Object.values(byCat).sort((a, b) => b.Amount - a.Amount) };
    }
    case "feedback-report": {
      const feedback = (await getAll("feedback")).filter((x) => inRange(x.date, from, to));
      const byStatus = {}; const byPriority = {}; const byDesc = {};
      feedback.forEach((f) => {
        byStatus[f.status] = (byStatus[f.status] || 0) + 1;
        byPriority[f.priority] = (byPriority[f.priority] || 0) + 1;
        byDesc[f.descriptionText] = (byDesc[f.descriptionText] || 0) + 1;
      });
      const summary = el("div", { class: "kpi-grid", style: "grid-template-columns:repeat(3,1fr);margin-bottom:14px" }, [
        kpi("Total Feedback", String(feedback.length)),
        kpi("Pending", String(byStatus["Pending"] || 0)),
        kpi("High Priority", String(byPriority["High"] || 0)),
      ]);
      const rows = Object.entries(byDesc).sort((a, b) => b[1] - a[1]).map(([desc, count]) => ({ "Feedback Type": desc, Occurrences: count }));
      return { columns: ["Feedback Type", "Occurrences"], rows, summary };
    }
    case "month-end": {
      const month = from.slice(0, 7);
      const [sales, expenses, stock, target] = await Promise.all([getAll("dailySales"), getAll("expenses"), getAll("stockEntries"), getOne("targets", month)]);
      const s = sales.filter((x) => monthStr(x.date) === month);
      const e = expenses.filter((x) => x.month === month);
      const st = stock.filter((x) => monthStr(x.date) === month);
      const totalSales = s.reduce((sum, x) => sum + (Number(x.totalValue) || 0), 0);
      const totalExpenses = e.reduce((sum, x) => sum + (Number(x.amount) || 0), 0);
      const netIn = st.reduce((sum, x) => sum + (Number(x.stockIn) || 0), 0);
      const netOut = st.reduce((sum, x) => sum + (Number(x.stockOut) || 0), 0);
      const targetValue = target?.targetValue || 0;
      const achievedPct = targetValue > 0 ? Math.round((totalSales / targetValue) * 100) : null;
      const summary = el("div", { class: "kpi-grid" }, [
        kpi("Total Sales", inr(totalSales)), kpi("Target", targetValue ? inr(targetValue) : "Not set"),
        kpi("Target Achieved", achievedPct === null ? "—" : achievedPct + "%"),
        kpi("Total Expenses", inr(totalExpenses)), kpi("Net (Sales − Expenses)", inr(totalSales - totalExpenses)),
        kpi("Net Stock Change", `${netIn - netOut >= 0 ? "+" : ""}${netIn - netOut} (In ${netIn} / Out ${netOut})`),
      ]);
      return {
        columns: ["Metric", "Value"],
        rows: [
          { Metric: "Total Sales", Value: totalSales }, { Metric: "Target", Value: targetValue },
          { Metric: "Target Achieved %", Value: achievedPct === null ? "—" : achievedPct },
          { Metric: "Total Expenses", Value: totalExpenses },
          { Metric: "Net (Sales − Expenses)", Value: totalSales - totalExpenses },
          { Metric: "Stock In (units)", Value: netIn }, { Metric: "Stock Out (units)", Value: netOut },
        ],
        summary,
      };
    }
    default:
      return { columns: [], rows: [] };
  }
}

function kpi(label, value) {
  return el("div", { class: "kpi-card" }, [el("div", { class: "kpi-label" }, label), el("div", { class: "kpi-value", style: "font-size:17px" }, value)]);
}

function inRange(date, from, to) {
  if (!date) return false;
  return date >= from && date <= to;
}
