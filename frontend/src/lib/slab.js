/**
 * Unique-slab area math. Keep formulas in lockstep with backend/app/common/slab.py.
 *
 * A lot is many L×W pieces. Billable qty is Σ area in product.unit (usually sq.ft).
 * Leftover individual pieces are not stocked — only remaining sq.ft of the quality.
 */

import { SQM_TO_SQFT, normalizeUnitCode, productUnitOf, toProductUnit } from "./uom";

export const CM2_PER_SQFT = 30.48 * 30.48; // 929.0304
export const IN2_PER_SQFT = 144;
export const MEASURE_UNITS = ["cm", "inch", "ft"];
export const AREA_UNITS = ["sqft", "sqm"];
export { isSlabProduct, SLAB_CATEGORIES } from "./uom";

export function normalizeMeasureUnit(raw, defaultCode = "ft") {
  const t = String(raw || "").trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  const compact = t.replace(/\s+/g, "").replace(/\./g, "");
  if (t === "cm" || compact === "cm" || compact === "cms" || compact === "centimeter" || compact === "centimetre") {
    return "cm";
  }
  if (t === "inch" || compact === "in" || compact === "inch" || compact === "inches") return "inch";
  if (t === "ft" || compact === "ft" || compact === "feet" || compact === "foot") return "ft";
  return defaultCode === "cm" || defaultCode === "inch" || defaultCode === "ft" ? defaultCode : "ft";
}

export function normalizeAreaUnit(raw, defaultCode = "sqft") {
  const u = normalizeUnitCode(raw, defaultCode);
  return u === "sqm" ? "sqm" : "sqft";
}

export function roundArea(n, decimals = 4) {
  const f = 10 ** decimals;
  return Math.round((Number(n) || 0) * f) / f;
}

/** Display area the way the estimate sheets do (3 dp: 92.625, 0.087). */
export function formatArea(n) {
  const v = Number(n) || 0;
  if (!Number.isFinite(v)) return "0";
  const t = Math.round(v * 1000) / 1000;
  if (Number.isInteger(t)) return String(t);
  return String(t);
}

export function rowAreaSqft(length, width, measureUnit = "ft") {
  const L = Number(length) || 0;
  const W = Number(width) || 0;
  if (!(L > 0 && W > 0)) return 0;
  const raw = L * W;
  const u = normalizeMeasureUnit(measureUnit);
  if (u === "ft") return raw;
  if (u === "inch") return raw / IN2_PER_SQFT;
  if (u === "cm") return raw / CM2_PER_SQFT;
  return raw;
}

function rowLength(row) {
  if (!row || typeof row !== "object") return 0;
  return row.length ?? row.l ?? 0;
}

function rowWidth(row) {
  if (!row || typeof row !== "object") return 0;
  return row.width ?? row.w ?? 0;
}

export function filledRows(rows) {
  return (rows || []).filter((r) => Number(rowLength(r)) > 0 && Number(rowWidth(r)) > 0);
}

export function totalAreaSqft(rows, measureUnit = "ft") {
  return filledRows(rows).reduce(
    (s, r) => s + rowAreaSqft(rowLength(r), rowWidth(r), measureUnit),
    0,
  );
}

export function totalArea(rows, measureUnit = "ft", areaUnit = "sqft") {
  const sqft = totalAreaSqft(rows, measureUnit);
  return normalizeAreaUnit(areaUnit) === "sqm" ? sqft / SQM_TO_SQFT : sqft;
}

export function measurementsPayload(rows, measureUnit = "ft") {
  const mu = normalizeMeasureUnit(measureUnit);
  return filledRows(rows).map((r) => {
    const length = Number(rowLength(r));
    const width = Number(rowWidth(r));
    return {
      length,
      width,
      area: roundArea(rowAreaSqft(length, width, mu), 4),
    };
  });
}

export function emptyMeasureRows(n = 8) {
  return Array.from({ length: n }, () => ({ length: "", width: "" }));
}

export function padMeasureRows(rows, min = 8) {
  const next = (rows || []).map((r) => ({
    length: rowLength(r) === "" || rowLength(r) == null ? "" : String(rowLength(r)),
    width: rowWidth(r) === "" || rowWidth(r) == null ? "" : String(rowWidth(r)),
  }));
  while (next.length < min) next.push({ length: "", width: "" });
  return next;
}

export function hasMeasurements(item) {
  const m = item?.measurements;
  return Array.isArray(m) && m.some((r) => Number(rowLength(r)) > 0 && Number(rowWidth(r)) > 0);
}

/**
 * Persist qty + rate in product.unit.
 * uiRate is ₹ per areaUnit (the footer rate on the estimate).
 */
export function slabLineQtyRate({ rows, measureUnit, areaUnit, product, uiRate }) {
  const dest = productUnitOf(product, "sqft");
  const au = normalizeAreaUnit(areaUnit);
  const area = totalArea(rows, measureUnit, au);
  const qty = toProductUnit({ ...product, unit: dest }, au, area);
  const rateRaw = Number(uiRate) || 0;
  let rate = rateRaw;
  if (au !== dest && qty > 0) {
    rate = (area * rateRaw) / qty;
  }
  return {
    qty: roundArea(qty, 4),
    unit: dest,
    rate: Math.round(rate * 100) / 100,
    area,
    areaUnit: au,
  };
}

/** Convert a displayed ₹/area rate when the cashier toggles Sq.ft ↔ Sq.m. */
export function convertAreaRate(rate, fromUnit, toUnit) {
  const from = normalizeAreaUnit(fromUnit);
  const to = normalizeAreaUnit(toUnit);
  const r = Number(rate) || 0;
  if (from === to) return r;
  if (from === "sqft" && to === "sqm") return r * SQM_TO_SQFT;
  if (from === "sqm" && to === "sqft") return r / SQM_TO_SQFT;
  return r;
}

export function applyMeasurementsToLine(item, product) {
  const rows = item?.measurements;
  if (!Array.isArray(rows) || !rows.some((r) => Number(rowLength(r)) > 0 && Number(rowWidth(r)) > 0)) {
    return item;
  }
  const mu = normalizeMeasureUnit(item.measureUnit || item.measure_unit || "ft");
  const au = normalizeAreaUnit(item.areaUnit || item.area_unit || "sqft");
  const dest = productUnitOf(product || item, "sqft");
  const area = totalArea(rows, mu, au);
  const qty = toProductUnit({ ...(product || {}), ...(item || {}), unit: dest }, au, area);
  return {
    ...item,
    qty: roundArea(qty, 4),
    unit: dest,
    measureUnit: mu,
    areaUnit: au,
    measurements: measurementsPayload(rows, mu),
    lotNo: item.lotNo || item.lot_no || "",
  };
}
