// ============================================================
// utils.js — formatting + small reusable UI helpers
// ============================================================

export function inr(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStr(dateStr) {
  return (dateStr || todayStr()).slice(0, 7);
}

export function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === undefined || c === null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
}

let toastTimer;
export function toast(msg, kind = "info") {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `toast show toast-${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}

export function confirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = el("div", { class: "modal-overlay" });
    const box = el("div", { class: "modal confirm-modal" }, [
      el("p", {}, message),
      el("div", { class: "modal-actions" }, [
        el("button", { class: "btn btn-ghost", onclick: () => close(false) }, "Cancel"),
        el("button", { class: "btn btn-danger", onclick: () => close(true) }, "Confirm"),
      ]),
    ]);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    function close(val) {
      overlay.remove();
      resolve(val);
    }
  });
}

export function openModal(titleText, contentNode, opts = {}) {
  const overlay = el("div", { class: "modal-overlay" });
  const box = el("div", { class: `modal ${opts.wide ? "modal-wide" : ""}` }, [
    el("div", { class: "modal-head" }, [
      el("h3", {}, titleText),
      el("button", { class: "modal-close", onclick: () => overlay.remove() }, "✕"),
    ]),
    el("div", { class: "modal-body" }, contentNode),
  ]);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && opts.dismissable !== false) overlay.remove();
  });
  return overlay;
}

export function closeModal() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.remove());
}

export function loadingRow(colspan = 6) {
  return `<tr><td colspan="${colspan}" class="loading-cell"><span class="spinner"></span> Loading…</td></tr>`;
}

export function emptyRow(colspan = 6, msg = "No records yet.") {
  return `<tr><td colspan="${colspan}" class="empty-cell">${msg}</td></tr>`;
}

// simple client-side search + sort + paginate for arrays of objects
export function paginate(arr, page, pageSize) {
  const start = (page - 1) * pageSize;
  return arr.slice(start, start + pageSize);
}

export function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  triggerDownload(blob, filename);
}

export function downloadCSV(rows, filename) {
  if (!rows.length) {
    toast("Nothing to export", "warn");
    return;
  }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h] === undefined || r[h] === null ? "" : String(r[h]);
          return `"${v.replace(/"/g, '""')}"`;
        })
        .join(",")
    ),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  triggerDownload(blob, filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
