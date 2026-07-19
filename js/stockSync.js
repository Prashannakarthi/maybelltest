// ============================================================
// stockSync.js — thin wrappers around the atomic stock-counter
// endpoints implemented server-side in Code.gs (guarded there by
// a script-wide lock so concurrent saves from different devices
// can't corrupt the running qty/value totals).
// NOTE (assumption): per-sale cost-of-goods isn't tracked, so
// category B (customer sale/return) movements affect stock QTY
// only, not stock VALUE. Stock value is driven by category A/C/O
// entries (brand stock / transfers / opening balance), where a
// value is entered at the time of movement.
// ============================================================
import { apiCall, invalidateCollectionCache } from "./db.js";

export async function syncSaleStockEntry(dateStr, saleQty, returnQty) {
  const res = await apiCall("syncSaleStock", { date: dateStr, saleQty, returnQty });
  invalidateCollectionCache("stockEntries");
  invalidateCollectionCache("settings");
  return { qty: res.qty, value: res.value };
}

export async function applyManualStockEntry({ date, category, stockIn, stockOut, value, storeName, remarks }) {
  const res = await apiCall("applyManualStock", { date, category, stockIn, stockOut, value, storeName, remarks });
  invalidateCollectionCache("stockEntries");
  invalidateCollectionCache("settings");
  return { id: res.id, qty: res.qty, value: res.value };
}
