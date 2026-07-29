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

// The token lives in sessionStorage by default (cleared when the tab/
// browser closes) so the app never silently logs someone back in on a
// fresh browser session. "Remember me" opts into localStorage instead,
// which survives restarts. getToken() checks both so either mode works
// transparently everywhere else in the app.
function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || null;
}
function setToken(token, remember) {
  if (remember) {
    localStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
    localStorage.removeItem(TOKEN_KEY);
  }
}
function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

export async function apiCall(action, payload = {}) {
  const token = getToken();
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

// ---------------- Read cache ----------------
// Apps Script round-trips are the main source of load delay, and most
// pages re-fetch the same slow-changing lists (employees, recurring
// expenses, etc.) every time they're opened. Cache reads briefly and
// wipe the cache for a collection the moment it's written to, so data
// is never stale but repeat navigation feels instant.
const CACHE_TTL_MS = 60000;
const cache = new Map();

function cacheKey(action, payload) {
  return action + ":" + JSON.stringify(payload);
}
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.ts > CACHE_TTL_MS) { cache.delete(key); return undefined; }
  return hit.value;
}
function cacheSet(key, value) {
  cache.set(key, { value, ts: Date.now() });
}
function invalidateCollection(colName) {
  for (const key of cache.keys()) {
    if (key.startsWith("getAll:") || key.startsWith("getOne:")) {
      if (key.includes(`"collection":"${colName}"`)) cache.delete(key);
    }
  }
}

export function invalidateCollectionCache(colName) {
  invalidateCollection(colName);
}
export async function login(password, remember = false) {
  const res = await apiCall("login", { password });
  setToken(res.token, remember);
  return res;
}
export async function logout() {
  try { await apiCall("logout"); } catch (e) { /* ignore */ }
  clearToken();
  cache.clear();
}
// Returns true only after the server has explicitly confirmed a valid,
// unexpired session for a token we're holding. Any missing token, network
// failure, or server rejection is treated as NOT authenticated — there is
// no fallback path that returns true without a confirmed server check.
export async function verifyToken() {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await apiCall("verify");
    return res.ok === true;
  } catch (e) {
    clearToken();
    return false;
  }
}

// ---------------- Generic CRUD ----------------
export async function getAll(colName, opts = {}) {
  const payload = { collection: colName, where: opts.where, orderBy: opts.orderBy };
  const key = cacheKey("getAll", payload);
  if (!opts.skipCache) {
    const cached = cacheGet(key);
    if (cached) return opts.limit ? cached.slice(0, opts.limit) : cached;
  }
  const res = await apiCall("getAll", payload);
  const rows = res.rows || [];
  cacheSet(key, rows);
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

export async function getOne(colName, id) {
  const payload = { collection: colName, id };
  const key = cacheKey("getOne", payload);
  const cached = cacheGet(key);
  if (cached !== undefined) return cached;
  const res = await apiCall("getOne", payload);
  cacheSet(key, res.row);
  return res.row;
}

export async function addRecord(colName, data) {
  const res = await apiCall("addRecord", { collection: colName, data });
  invalidateCollection(colName);
  return res.id;
}

export async function setRecord(colName, id, data) {
  await apiCall("setRecord", { collection: colName, id, data });
  invalidateCollection(colName);
  return id;
}

export async function updateRecord(colName, id, data) {
  await apiCall("updateRecord", { collection: colName, id, data });
  invalidateCollection(colName);
}

export async function deleteRecord(colName, id) {
  await apiCall("deleteRecord", { collection: colName, id });
  invalidateCollection(colName);
}

export async function clearCollection(colName) {
  await apiCall("clearCollection", { collection: colName });
  invalidateCollection(colName);
}

// Save many records to the same collection in a single round trip —
// used for bulk attendance marking and backup restores.
export async function batchUpsert(colName, records) {
  const res = await apiCall("batchUpsert", { collection: colName, records });
  invalidateCollection(colName);
  return res.count;
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
