/**
 * Column fill / fill-down for the Add Stock grid.
 * Tile pcs/box of 1 is treated as empty (extractor dummy), matching applyCatalogUnitChange.
 */

import { normalizeTileSize } from "@/lib/tileSizes";
import {
  UNIT_BOX,
  UNIT_PIECE,
  applyCatalogUnitChange,
  isBoxUnit,
  isPieceUnit,
  isTileOnlyCatalogField,
  normalizeUnit,
} from "@/lib/units";

function sanitizeNumber(raw) {
  let v = String(raw ?? "").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  return v;
}

export const FILLABLE_FIELDS = ["unit", "company", "size", "piecesPerBox", "qty", "price"];

export const FIELD_LABELS = {
  unit: "Type",
  name: "Product name",
  code: "Code",
  company: "Company",
  size: "Size",
  piecesPerBox: "Pcs/box",
  qty: "Qty",
  price: "Price",
};

const NUMERIC_FIELDS = new Set(["qty", "price", "piecesPerBox"]);

export function isFillableField(field) {
  return FILLABLE_FIELDS.includes(field);
}

export function isRowEligible(row, field) {
  if (!row) return false;
  if (isTileOnlyCatalogField(field) && isPieceUnit(row)) return false;
  return true;
}

/** Empty for fill purposes: blank, or tile pcs/box dummy 1. */
export function isCellEmpty(row, field) {
  if (!row || field === "unit") return false;
  if (!isRowEligible(row, field)) return true;
  const raw = row[field];
  if (raw == null || String(raw).trim() === "") return true;
  if (field === "piecesPerBox" && isBoxUnit(row) && Number(raw) === 1) return true;
  return false;
}

export function coerceFillValue(field, value) {
  if (field === "unit") {
    const lower = String(value ?? "").toLowerCase();
    if (lower.startsWith("p") || lower.includes("sanit") || lower.includes("piece")) {
      return UNIT_PIECE;
    }
    return UNIT_BOX;
  }
  if (field === "size") {
    const trimmed = String(value ?? "").trim();
    return normalizeTileSize(trimmed) || trimmed;
  }
  if (NUMERIC_FIELDS.has(field)) return sanitizeNumber(value);
  return String(value ?? "").trim();
}

export function writeField(row, field, value) {
  if (!row) return row;
  if (field === "unit") return applyCatalogUnitChange(row, coerceFillValue("unit", value));
  if (!isRowEligible(row, field)) return row;
  return { ...row, [field]: coerceFillValue(field, value) };
}

export function selectedRowIds(rows, startIndex, endIndex) {
  const lo = Math.min(startIndex, endIndex);
  const hi = Math.max(startIndex, endIndex);
  return (rows || []).slice(lo, hi + 1).map((r) => r.id);
}

export function hasColumnRange(selection) {
  if (!selection || selection.startIndex == null || selection.endIndex == null) return false;
  return selection.startIndex !== selection.endIndex;
}

/**
 * @param {"empty"|"all"|"selected"} mode
 */
export function applyColumnFill({
  rows,
  field,
  value,
  mode = "empty",
  selectedIds = [],
}) {
  const list = rows || [];
  const selected = new Set((selectedIds || []).map(String));
  let count = 0;
  const next = list.map((row) => {
    if (!isRowEligible(row, field)) return row;
    if (mode === "selected" && !selected.has(String(row.id))) return row;
    if (mode === "empty" && !isCellEmpty(row, field)) return row;
    count += 1;
    return writeField(row, field, value);
  });
  return { rows: next, count };
}

/**
 * Copy the source cell down. With selectedIds, source is the top selected row;
 * targets are the rest of the selection. With none, source is startIndex and
 * targets are every eligible row below it (overwrite).
 */
export function fillDownFrom({ rows, field, startIndex = 0, selectedIds = [] }) {
  const list = rows || [];
  const selectedSet = new Set((selectedIds || []).map(String));
  const hasSel = selectedSet.size > 0;

  let sourceIndex = startIndex;
  let targetIndexes;

  if (hasSel) {
    const selected = list
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => selectedSet.has(String(r.id)));
    if (selected.length === 0) return { rows: list, count: 0 };
    sourceIndex = selected[0].i;
    targetIndexes = new Set(selected.slice(1).map((s) => s.i));
  } else {
    targetIndexes = new Set();
    for (let i = sourceIndex + 1; i < list.length; i += 1) {
      if (isRowEligible(list[i], field)) targetIndexes.add(i);
    }
  }

  const source = list[sourceIndex];
  if (!source || !isRowEligible(source, field)) return { rows: list, count: 0 };

  const value = field === "unit" ? normalizeUnit(source.unit) : source[field];
  let count = 0;
  const next = list.map((row, i) => {
    if (!targetIndexes.has(i) || !isRowEligible(row, field)) return row;
    count += 1;
    return writeField(row, field, value);
  });
  return { rows: next, count };
}

export function formatFillToast(count, field, value) {
  if (count <= 0) return "";
  if (field === "piecesPerBox") return `${count} tiles pe ${value} pcs/box`;
  if (field === "unit") {
    const kind = coerceFillValue("unit", value) === UNIT_PIECE ? "Sanitary" : "Tiles";
    return `${count} rows pe ${kind}`;
  }
  const label = FIELD_LABELS[field] || field;
  const shown = String(value ?? "").trim();
  return shown ? `${count} rows pe ${label}: ${shown}` : `${count} rows pe ${label}`;
}

/** Tile pcs/box from extract: keep only real counts (> 1). Sanitary stays 1. */
export function mapExtractedPiecesPerBox(unit, piecesPerBox) {
  if (normalizeUnit(unit) === UNIT_PIECE) return 1;
  return Number(piecesPerBox) > 1 ? piecesPerBox : "";
}
