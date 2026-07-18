// ============================================================
// db.js — talks to the Apps Script Web App (Google Sheets backend)
// ============================================================
// DATA MODEL — one Google Sheet tab per "collection", each with
// a header row (first column always "id") that grows automatically
// as new fields are written:
//   employees, attendance, dailySales, stockEntries, expenses,
//   recurringExpenses, feedback, feedbackMaster, settings, Sessions
// See Code.gs for the full backend implementation.
// ============================================================

import { APPS_SCRIPT_URL } from "./config.js";

const TOKEN_KEY = "maybell_token";

export async function apiCall(action, payload = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  let res;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // text/plain avoids a CORS preflight request, which Apps Script
      // Web Apps don't handle — this is the standard workaround.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, token, ...payload }),
    });
  } catch (err) {
    throw new Error("Couldn't reach the server. Check your internet connection.");
  }
  if (!res.ok) throw new Error("Server error (" + res.status + ")");
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json;
}

// ---------------- Auth ----------------
export async function login(password) {
  const res = await apiCall("login", { password });
  localStorage.setItem(TOKEN_KEY, res.token);
  return res;
}
export async function logout() {
  try { await apiCall("logout"); } catch (e) { /* ignore */ }
  localStorage.removeItem(TOKEN_KEY);
}
export async function verifyToken() {
  if (!localStorage.getItem(TOKEN_KEY)) return false;
  try {
    await apiCall("verify");
    return true;
  } catch (e) {
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
}

// ---------------- Generic CRUD ----------------
export async function getAll(colName, opts = {}) {
  const res = await apiCall("getAll", { collection: colName, where: opts.where, orderBy: opts.orderBy });
  let rows = res.rows || [];
  if (opts.limit) rows = rows.slice(0, opts.limit);
  return rows;
}

export async function getOne(colName, id) {
  const res = await apiCall("getOne", { collection: colName, id });
  return res.row;
}

export async function addRecord(colName, data) {
  const res = await apiCall("addRecord", { collection: colName, data });
  return res.id;
}

export async function setRecord(colName, id, data) {
  await apiCall("setRecord", { collection: colName, id, data });
  return id;
}

export async function updateRecord(colName, id, data) {
  await apiCall("updateRecord", { collection: colName, id, data });
}

export async function deleteRecord(colName, id) {
  await apiCall("deleteRecord", { collection: colName, id });
}

export async function clearCollection(colName) {
  await apiCall("clearCollection", { collection: colName });
}

// ---------------- File uploads (Google Drive, via Apps Script) ----------------
export async function uploadFile(fileName, file) {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("File is larger than 8MB — please choose a smaller file.");
  }
  const base64 = await fileToBase64(file);
  const res = await apiCall("uploadFile", { fileName, mimeType: file.type || "application/octet-stream", base64 });
  return { url: res.url, fileId: res.fileId };
}

export async function deleteFile(fileId) {
  if (!fileId) return;
  try { await apiCall("deleteFile", { fileId }); } catch (e) { /* ignore if already gone */ }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Compress an image client-side before upload (keeps Drive usage & upload time low)
export function compressImage(file, maxDim = 1400, quality = 0.75) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return resolve(file); // leave PDFs as-is
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width *= scale;
        height *= scale;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })),
        "image/jpeg",
        quality
      );
    };
    reader.readAsDataURL(file);
  });
}
