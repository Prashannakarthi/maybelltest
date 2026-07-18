import { getAll, getOne, setRecord } from "../db.js";
import { el, inr, toast, openModal, closeModal, monthStr, MONTHS_SHORT } from "../utils.js";

let chartInstance = null;

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Overview"));

  const kpiGrid = el("div", { class: "kpi-grid" });
  root.appendChild(kpiGrid);
  kpiGrid.innerHTML = Array(6).fill(0).map(() =>
    `<div class="kpi-card"><div class="kpi-label">Loading…</div></div>`
  ).join("");

  const chartCard = el("div", { class: "card chart-card" }, [
    el("div", { class: "chart-head" }, [
      el("h3", {}, "Qty Sale vs Sale Value"),
      el("select", { id: "months-range" }, [
        el("option", { value: "3" }, "Last 3 months"),
        el("option", { value: "6", selected: "selected" }, "Last 6 months"),
        el("option", { value: "12" }, "Last 12 months"),
        el("option", { value: "24" }, "Last 24 months"),
      ]),
    ]),
    el("div", { class: "chart-container" }, el("canvas", { id: "sales-chart" })),
  ]);
  root.appendChild(chartCard);

  const [settingsDoc, stockCounter, allSales] = await Promise.all([
    getOne("settings", "app"),
    getOne("settings", "stockCounter"),
    getAll("dailySales"),
  ]);

  const targetValue = settingsDoc?.targetValue || 0;
  const stockQty = stockCounter?.qty || 0;
  const stockValue = stockCounter?.value || 0;

  const nowMonth = monthStr();
  const monthlySale = allSales
    .filter((s) => monthStr(s.date) === nowMonth)
    .reduce((sum, s) => sum + (Number(s.totalValue) || 0), 0);

  const achievedPct = targetValue > 0 ? Math.min(100, (monthlySale / targetValue) * 100) : 0;
  const pending = Math.max(0, targetValue - monthlySale);

  kpiGrid.innerHTML = "";
  kpiGrid.appendChild(kpiCard("Monthly Sale", inr(monthlySale), "This calendar month"));
  kpiGrid.appendChild(kpiCard("Current Stock Count", stockQty.toLocaleString("en-IN"), "Units on hand"));
  kpiGrid.appendChild(kpiCard("Current Stock Value", inr(stockValue), "At recorded cost"));
  kpiGrid.appendChild(
    kpiCard("Target Value", inr(targetValue), "Tap to edit", true, () => openTargetModal(targetValue))
  );
  kpiGrid.appendChild(targetAchievedCard(achievedPct, monthlySale, targetValue));
  kpiGrid.appendChild(kpiCard("Target Pending", inr(pending), targetValue ? "To reach this month's target" : "Set a target to track this"));

  root.querySelector("#months-range").addEventListener("change", (e) => drawChart(allSales, Number(e.target.value)));
  drawChart(allSales, 6);

  function openTargetModal(current) {
    const input = el("input", { type: "number", min: "0", step: "1", value: current || "" });
    const body = el("div", {}, [
      el("label", { class: "field" }, [el("span", {}, "Monthly Target Value (₹)"), input]),
      el("div", { class: "modal-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: closeModal }, "Cancel"),
        el("button", {
          class: "btn btn-primary",
          onclick: async () => {
            const val = Number(input.value) || 0;
            await setRecord("settings", "app", { targetValue: val });
            toast("Target updated", "success");
            closeModal();
            window.dispatchEvent(new Event("hashchange"));
          },
        }, "Save"),
      ]),
    ]);
    openModal("Set Monthly Target", body);
  }
}

function kpiCard(label, value, sub, clickable = false, onClick) {
  const card = el("div", { class: "kpi-card" + (clickable ? " editable" : "") }, [
    el("div", { class: "kpi-label" }, label),
    el("div", { class: "kpi-value" }, value),
    el("div", { class: "kpi-sub" }, sub),
  ]);
  if (clickable) {
    card.style.cursor = "pointer";
    card.addEventListener("click", onClick);
  }
  return card;
}

function targetAchievedCard(pct, monthlySale, target) {
  return el("div", { class: "kpi-card" }, [
    el("div", { class: "kpi-label" }, "Target Achieved"),
    el("div", { class: "kpi-value" }, pct.toFixed(0) + "%"),
    el("div", { class: "progress-wrap" }, [
      el("div", { class: "progress-track" }, el("div", { class: "progress-fill", style: `width:${pct}%` })),
      el("div", { class: "progress-label" }, [
        el("span", {}, inr(monthlySale)),
        el("span", {}, target ? inr(target) : "no target set"),
      ]),
    ]),
  ]);
}

function drawChart(allSales, months) {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ key: d.toISOString().slice(0, 7), label: `${MONTHS_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, qty: 0, value: 0 });
  }
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));
  allSales.forEach((s) => {
    const k = monthStr(s.date);
    if (byKey[k]) {
      byKey[k].qty += Number(s.saleQty) || 0;
      byKey[k].value += Number(s.totalValue) || 0;
    }
  });

  const ctx = document.getElementById("sales-chart");
  if (!ctx) return;
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    data: {
      labels: buckets.map((b) => b.label),
      datasets: [
        { type: "bar", label: "Qty Sold", data: buckets.map((b) => b.qty), backgroundColor: "#E3A72E", yAxisID: "y", borderRadius: 4, maxBarThickness: 34 },
        { type: "line", label: "Sale Value (₹)", data: buckets.map((b) => b.value), borderColor: "#1B2340", backgroundColor: "#1B2340", yAxisID: "y1", tension: 0.35, pointRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { position: "left", title: { display: true, text: "Qty" }, grid: { color: "#EFEEE6" } },
        y1: { position: "right", title: { display: true, text: "₹ Value" }, grid: { drawOnChartArea: false } },
      },
      plugins: { legend: { position: "bottom" } },
    },
  });
}
