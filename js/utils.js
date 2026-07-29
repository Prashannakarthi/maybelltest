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

// ---------------- Dates ----------------
// Every date in this app is stored, compared, and filtered as a plain
// "YYYY-MM-DD" string — never a Date object. toISODate() is the single
// place that normalizes anything that might not already be in that shape
// (a stray Date object, an ISO datetime string with a time/zone suffix,
// etc.) so every other date function/page can trust its input is clean.
// Every page should go through these functions rather than constructing
// its own `new Date(...)` from a stored date string.
export function toISODate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return localParts_(value);
  }
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; // already clean — the normal case
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})T/); // e.g. a serialized Date with a time/zone suffix
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(str);
  if (isNaN(parsed.getTime())) return null;
  return localParts_(parsed);
}

function localParts_(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayStr() {
  return localParts_(new Date()); // local calendar date — NOT toISOString(), which is UTC and can be a day off
}

export function monthStr(value) {
  const iso = toISODate(value) || todayStr();
  return iso.slice(0, 7);
}

export function fmtDate(value) {
  const iso = toISODate(value);
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// String comparison of two normalized "YYYY-MM-DD" values sorts correctly
// in chronological order — use this everywhere instead of building Date
// objects just to compare, so comparisons and display always agree.
export function compareDates(a, b) {
  const ai = toISODate(a), bi = toISODate(b);
  if (ai === bi) return 0;
  if (!ai) return 1;
  if (!bi) return -1;
  return ai < bi ? -1 : 1;
}

export function isDateInRange(value, from, to) {
  const iso = toISODate(value);
  if (!iso) return false;
  return iso >= from && iso <= to;
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
