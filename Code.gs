/**
 * ============================================================
 * MAYBELL — Apps Script backend (Google Sheets as the database)
 * ============================================================
 * Setup:
 *  1. Create a new Google Sheet (any name). Copy its ID from the
 *     URL: https://docs.google.com/spreadsheets/d/<THIS PART>/edit
 *  2. Go to https://script.google.com/create to start a new
 *     standalone Apps Script project, and paste this whole file
 *     in as Code.gs (replacing the default content).
 *  3. Project Settings (gear icon) -> Script Properties -> add:
 *       SHEET_ID       = the spreadsheet ID from step 1
 *       APP_PASSWORD   = the single password you'll log in with
 *  4. Deploy -> New deployment -> type "Web app".
 *       Execute as:    Me
 *       Who has access: Anyone
 *     Click Deploy, authorize the permissions it asks for, then
 *     copy the Web App URL (ends in /exec).
 *  5. Paste that URL into js/config.js as APPS_SCRIPT_URL.
 *
 * Sheets (tabs) are created automatically the first time each
 * collection is written to: employees, attendance, dailySales,
 * stockEntries, expenses, recurringExpenses, feedback,
 * feedbackMaster, settings, Sessions.
 * ============================================================
 */

var SESSION_DAYS = 30;

function doGet(e) {
  return jsonOut_({ ok: true, message: "Maybell Sheets API is running." });
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;

    if (action !== "login" && !isValidToken_(body.token)) {
      return jsonOut_({ ok: false, error: "unauthorized" });
    }

    switch (action) {
      case "login":
        out = handleLogin_(body.password);
        break;
      case "verify":
        out = { ok: true };
        break;
      case "logout":
        revokeToken_(body.token);
        out = { ok: true };
        break;
      case "getAll":
        out = { ok: true, rows: getAll_(body.collection, body.where, body.orderBy) };
        break;
      case "getOne":
        out = { ok: true, row: getOne_(body.collection, body.id) };
        break;
      case "addRecord": {
        var newId = Utilities.getUuid();
        upsertRow_(body.collection, newId, body.data, false);
        out = { ok: true, id: newId };
        break;
      }
      case "setRecord":
        upsertRow_(body.collection, body.id, body.data, true);
        out = { ok: true, id: body.id };
        break;
      case "updateRecord":
        upsertRow_(body.collection, body.id, body.data, true);
        out = { ok: true };
        break;
      case "deleteRecord":
        deleteRow_(body.collection, body.id);
        out = { ok: true };
        break;
      case "clearCollection":
        clearCollection_(body.collection);
        out = { ok: true };
        break;
      case "uploadFile": {
        var uploaded = uploadFile_(body.fileName, body.mimeType, body.base64);
        out = { ok: true, url: uploaded.url, fileId: uploaded.fileId };
        break;
      }
      case "deleteFile":
        deleteFile_(body.fileId);
        out = { ok: true };
        break;
      case "syncSaleStock": {
        var r1 = syncSaleStock_(body.date, body.saleQty, body.returnQty);
        out = { ok: true, qty: r1.qty, value: r1.value };
        break;
      }
      case "applyManualStock": {
        var r2 = applyManualStock_(body);
        out = { ok: true, id: r2.id, qty: r2.qty, value: r2.value };
        break;
      }
      default:
        out = { ok: false, error: "unknown action: " + action };
    }
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return jsonOut_(out);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------- Auth ----------------
function handleLogin_(password) {
  var real = getProp_("APP_PASSWORD");
  if (!real) return { ok: false, error: "Server not configured: set APP_PASSWORD in Script Properties." };
  if (password !== real) return { ok: false, error: "Incorrect password." };
  var token = Utilities.getUuid();
  var expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  upsertRow_("Sessions", token, { token: token, expiresAt: expiresAt }, false);
  return { ok: true, token: token };
}

function isValidToken_(token) {
  if (!token) return false;
  var rows = sheetToObjects_(getSheet_("Sessions"));
  var now = Date.now();
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === token && Number(rows[i].expiresAt) > now) return true;
  }
  return false;
}

function revokeToken_(token) {
  deleteRow_("Sessions", token);
}

// ---------------- Generic sheet CRUD ----------------
function getSheet_(name) {
  var ss = SpreadsheetApp.openById(getProp_("SHEET_ID"));
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function ensureHeaders_(sheet, keys) {
  var lastCol = sheet.getLastColumn();
  var headers = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  if (headers.length === 0) {
    sheet.getRange(1, 1, 1, 1).setValue("id");
    headers = ["id"];
  }
  var missing = keys.filter(function (k) { return k && headers.indexOf(k) === -1; });
  if (missing.length) {
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    headers = headers.concat(missing);
  }
  // Force plain-text formatting so Sheets never silently reinterprets
  // date-like or number-like strings as Date/Number cell types.
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 500), Math.max(headers.length, 24)).setNumberFormat("@");
  return headers;
}

function findRowIndexById_(sheet, id) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return -1;
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var idCol = headers.indexOf("id");
  if (idCol === -1) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var data = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function upsertRow_(collection, id, data, merge) {
  var sheet = getSheet_(collection);
  var keys = Object.keys(data || {});
  var headers = ensureHeaders_(sheet, keys.concat(["id"]));
  var rowIdx = findRowIndexById_(sheet, id);
  var rowObj = {};
  if (merge && rowIdx !== -1) {
    var existingVals = sheet.getRange(rowIdx, 1, 1, headers.length).getValues()[0];
    headers.forEach(function (h, i) { rowObj[h] = existingVals[i]; });
  }
  headers.forEach(function (h) {
    if (data && Object.prototype.hasOwnProperty.call(data, h)) {
      var v = data[h];
      rowObj[h] = v === null || v === undefined ? "" : v;
    }
  });
  rowObj["id"] = id;
  var rowArr = headers.map(function (h) { return Object.prototype.hasOwnProperty.call(rowObj, h) ? rowObj[h] : ""; });
  if (rowIdx === -1) {
    sheet.appendRow(rowArr);
  } else {
    sheet.getRange(rowIdx, 1, 1, headers.length).setValues([rowArr]);
  }
}

function deleteRow_(collection, id) {
  var sheet = getSheet_(collection);
  var idx = findRowIndexById_(sheet, id);
  if (idx !== -1) sheet.deleteRow(idx);
}

function clearCollection_(collection) {
  var sheet = getSheet_(collection);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
}

function sheetToObjects_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var rowArr = data[r];
    var blank = rowArr.every(function (c) { return c === "" || c === null; });
    if (blank) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      obj[headers[c]] = coerce_(rowArr[c]);
    }
    rows.push(obj);
  }
  return rows;
}

function coerce_(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  if (typeof v === "number") return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function getAll_(collection, wheres, orderBy) {
  var rows = sheetToObjects_(getSheet_(collection));
  if (wheres && wheres.length) {
    wheres.forEach(function (w) {
      var field = w[0], op = w[1], val = w[2];
      rows = rows.filter(function (r) {
        var rv = r[field];
        if (rv === null || rv === undefined) return false;
        if (op === "==") return rv == val;
        if (op === ">=") return rv >= val;
        if (op === "<=") return rv <= val;
        return true;
      });
    });
  }
  if (orderBy && orderBy.length) {
    var field = orderBy[0], dir = orderBy[1] || "asc";
    rows.sort(function (a, b) {
      var av = a[field], bv = b[field];
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (av < bv) return dir === "asc" ? -1 : 1;
      return dir === "asc" ? 1 : -1;
    });
  }
  return rows;
}

function getOne_(collection, id) {
  var rows = getAll_(collection);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) return rows[i];
  }
  return null;
}

// ---------------- Drive file uploads (Aadhar proofs) ----------------
function getOrCreateFolder_() {
  var name = "Maybell Aadhar Files";
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

function uploadFile_(fileName, mimeType, base64) {
  var folder = getOrCreateFolder_();
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mimeType || "application/octet-stream", fileName || "upload");
  var file = folder.createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { url: file.getUrl(), fileId: file.getId() };
}

function deleteFile_(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e) { /* already gone */ }
}

// ---------------- Stock counter (locked, atomic) ----------------
function syncSaleStock_(date, saleQty, returnQty) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var entryId = "saleB_" + date;
    var existing = getOne_("stockEntries", entryId);
    var counter = getOne_("settings", "stockCounter") || { qty: 0, value: 0 };
    var prevIn = existing ? Number(existing.stockIn) || 0 : 0;
    var prevOut = existing ? Number(existing.stockOut) || 0 : 0;
    var newIn = Number(returnQty) || 0;
    var newOut = Number(saleQty) || 0;
    var deltaQty = (newIn - newOut) - (prevIn - prevOut);
    var newQty = (Number(counter.qty) || 0) + deltaQty;

    upsertRow_("stockEntries", entryId, {
      date: date, category: "B", stockIn: newIn, stockOut: newOut, value: 0,
      cumulativeQty: newQty, cumulativeValue: Number(counter.value) || 0,
      remarks: "Auto-generated from Daily Sales", autoGenerated: true,
    }, true);
    upsertRow_("settings", "stockCounter", { qty: newQty, value: Number(counter.value) || 0 }, true);
    return { qty: newQty, value: Number(counter.value) || 0 };
  } finally {
    lock.releaseLock();
  }
}

function applyManualStock_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var counter = getOne_("settings", "stockCounter") || { qty: 0, value: 0 };
    var deltaQty = (Number(p.stockIn) || 0) - (Number(p.stockOut) || 0);
    var deltaValue = (p.category === "A" || p.category === "C")
      ? (Number(p.value) || 0) * (Number(p.stockIn) > 0 ? 1 : -1)
      : 0;
    var newQty = (Number(counter.qty) || 0) + deltaQty;
    var newValue = Math.max(0, (Number(counter.value) || 0) + deltaValue);
    var entryId = "entry_" + new Date().getTime();

    upsertRow_("stockEntries", entryId, {
      date: p.date, category: p.category, storeName: p.storeName || "",
      stockIn: Number(p.stockIn) || 0, stockOut: Number(p.stockOut) || 0,
      value: Number(p.value) || 0, cumulativeQty: newQty, cumulativeValue: newValue,
      remarks: p.remarks || "", autoGenerated: false,
    }, false);
    upsertRow_("settings", "stockCounter", { qty: newQty, value: newValue }, true);
    return { id: entryId, qty: newQty, value: newValue };
  } finally {
    lock.releaseLock();
  }
}

// ---------------- Script Properties helpers ----------------
function getProp_(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}
function setProp_(key, val) {
  PropertiesService.getScriptProperties().setProperty(key, val);
}
