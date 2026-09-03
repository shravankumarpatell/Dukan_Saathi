/**
 * Saved slab measurement worksheets (local to this browser).
 * New Bill reads a pending worksheet only when the cashier is ready to collect.
 */

import { toYMD } from "./dates";
import {
  emptyMeasureRows,
  filledRows,
  measurementsPayload,
  padMeasureRows,
  slabLineQtyRate,
} from "./slab";

export const SLAB_FORMS_KEY = "ds_slab_forms";
export const SLAB_DRAFT_KEY = "ds_slab_draft";
export const SLAB_PENDING_BILL_KEY = "ds_bill_from_slab";
export const SLAB_MAX_ROWS = 700;
export const SLAB_PAGE_SIZE = 25;
export const SLAB_DEFAULT_ROWS = 10;

export function emptySlabForm() {
  return {
    id: "",
    savedAt: "",
    partyName: "",
    date: toYMD(),
    quality: "",
    productId: "",
    vehicleNo: "",
    lotNo: "",
    measureUnit: "ft",
    areaUnit: "sqft",
    startingRow: 1,
    rows: emptyMeasureRows(SLAB_DEFAULT_ROWS),
    rate: "",
  };
}

export function clampRowCount(n) {
  const v = Math.floor(Number(n) || 0);
  if (v < 1) return 1;
  if (v > SLAB_MAX_ROWS) return SLAB_MAX_ROWS;
  return v;
}

export function normalizeSlabForm(raw) {
  const base = emptySlabForm();
  if (!raw || typeof raw !== "object") return base;
  const startingRow = Math.max(1, Math.floor(Number(raw.startingRow) || 1));
  const rows = padMeasureRows(raw.rows || [], 1);
  return {
    ...base,
    ...raw,
    startingRow,
    rows: rows.slice(0, SLAB_MAX_ROWS),
    measureUnit: raw.measureUnit === "cm" || raw.measureUnit === "inch" ? raw.measureUnit : "ft",
    areaUnit: raw.areaUnit === "sqm" ? "sqm" : "sqft",
    rate: raw.rate == null ? "" : String(raw.rate),
    partyName: String(raw.partyName || ""),
    quality: String(raw.quality || ""),
    productId: String(raw.productId || ""),
    vehicleNo: String(raw.vehicleNo || ""),
    lotNo: String(raw.lotNo || ""),
    date: String(raw.date || base.date),
  };
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota / private mode */ }
}

export function loadSavedSlabForms() {
  const list = readJson(SLAB_FORMS_KEY, []);
  if (!Array.isArray(list)) return [];
  return list.map(normalizeSlabForm).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

const normKey = (s) => String(s || "").trim().toLowerCase();

/** Identity used to spot duplicate worksheets: party + quality + vehicle + lot. */
export function slabDupKey(form) {
  return [normKey(form?.partyName), normKey(form?.quality), normKey(form?.vehicleNo), normKey(form?.lotNo)].join("|");
}

/** A form is only deduped once it has a party or quality — blank drafts stay unique. */
function isDedupable(form) {
  return !!(normKey(form?.partyName) || normKey(form?.quality));
}

export function saveSlabForm(form) {
  const next = normalizeSlabForm(form);
  const existing = loadSavedSlabForms();
  // Re-save in place when editing (id match) or when party+quality+vehicle+lot
  // already exist, so the same worksheet never piles up as duplicates.
  let target = next.id ? existing.find((f) => f.id === next.id) : null;
  if (!target && isDedupable(next)) {
    const key = slabDupKey(next);
    target = existing.find((f) => slabDupKey(f) === key) || null;
  }
  next.id = target?.id || `slab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  next.savedAt = new Date().toISOString();
  next.date = target?.date || toYMD();
  const rest = existing.filter((f) => f.id !== next.id);
  writeJson(SLAB_FORMS_KEY, [next, ...rest]);
  return next;
}

export function deleteSlabForm(id) {
  writeJson(SLAB_FORMS_KEY, loadSavedSlabForms().filter((f) => f.id !== id));
}

export function loadSlabDraft() {
  const raw = readJson(SLAB_DRAFT_KEY, null);
  return raw ? normalizeSlabForm(raw) : null;
}

export function saveSlabDraft(form) {
  writeJson(SLAB_DRAFT_KEY, normalizeSlabForm(form));
}

export function clearSlabDraft() {
  try { localStorage.removeItem(SLAB_DRAFT_KEY); } catch { /* ignore */ }
}

export function setPendingSlabBill(payload) {
  try {
    sessionStorage.setItem(SLAB_PENDING_BILL_KEY, JSON.stringify(payload));
  } catch { /* ignore */ }
}

export function consumePendingSlabBill() {
  try {
    const raw = sessionStorage.getItem(SLAB_PENDING_BILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(SLAB_PENDING_BILL_KEY);
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function slabFormHasPieces(form) {
  return filledRows(form?.rows).length > 0;
}

export function slabFormToBillLine(form, product) {
  if (!product?.id) return null;
  const f = normalizeSlabForm(form);
  if (!slabFormHasPieces(f)) return null;
  const line = slabLineQtyRate({
    rows: f.rows,
    measureUnit: f.measureUnit,
    areaUnit: f.areaUnit,
    product,
    uiRate: Number(f.rate) || 0,
  });
  if (!(line.qty > 0) || !(line.rate > 0)) return null;
  return {
    productId: product.id,
    name: product.name,
    qty: line.qty,
    pieces: "",
    unit: line.unit,
    productUnit: product.unit,
    packQty: product.packQty,
    category: product.category,
    allowedUnits: product.allowedUnits,
    rate: line.rate,
    piecesPerBox: 1,
    size: "",
    lotNo: f.lotNo || "",
    measureUnit: f.measureUnit,
    areaUnit: f.areaUnit,
    startingRow: f.startingRow,
    measurements: measurementsPayload(f.rows, f.measureUnit),
  };
}

export async function sharePdfBlob(blob, filename, title) {
  if (!blob) return "missing";
  const file = new File([blob], filename || "estimate.pdf", { type: "application/pdf" });
  if (typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: title || filename, text: title || filename });
    return "shared";
  }
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename || "estimate.pdf";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* ignore */ } }, 4000);
  return "downloaded";
}
