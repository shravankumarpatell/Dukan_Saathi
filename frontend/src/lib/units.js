/**
 * Catalog / bill helpers on top of the unit master (uom.js).
 *
 * Rate is stored per product.unit. A bill line may use another allowed unit.
 * Box lines keep Box + Pcs + Alt+Q; every other line unit is a single qty field.
 */

import { formatTileSize, normalizeTileSize } from "./tileSizes";
import {
  CATEGORIES,
  allowedUnitsOf,
  categoryMeta,
  conversionProduct,
  defaultAllowedUnits,
  fromProductUnit,
  isSlabProduct,
  needsPackQty,
  needsTileFields,
  normalizeCategory,
  normalizeUnitCode,
  ratePerSqft,
  soldPieces,
  sqftPerBox,
  sqftPerPiece,
  suggestedUnits,
  toProductUnit,
  unitKind,
  unitShort,
  usesPieceStock,
} from "./uom";

export const UNIT_BOX = "box";
export const UNIT_PIECE = "piece";

export function normalizeUnit(unit) {
  return normalizeUnitCode(unit, UNIT_BOX);
}

/** True when this line/SKU uses Box + loose Pcs (priced per box). */
export function isBoxUnit(productOrItem) {
  const u = productOrItem?.unit;
  if (u == null || u === "") return true;
  return normalizeUnitCode(u, UNIT_BOX) === UNIT_BOX;
}

export function isPieceUnit(productOrItem) {
  return normalizeUnitCode(productOrItem?.unit, UNIT_BOX) === UNIT_PIECE;
}

export const TILE_ONLY_CATALOG_FIELDS = ["size", "piecesPerBox"];

export function isTileOnlyCatalogField(field) {
  return TILE_ONLY_CATALOG_FIELDS.includes(field);
}

export function catalogShowsSize(product) {
  return !!(categoryMeta(product?.category || normalizeCategory(product?.category, product?.unit)).needsSize
    || (isBoxUnit(product) && normalizeCategory(product?.category, product?.unit) === "tiles"));
}

export function catalogShowsPpb(product) {
  const cat = normalizeCategory(product?.category, product?.unit);
  return !!(categoryMeta(cat).needsPpb || isBoxUnit(product));
}

/** Price unit allowed for this category — never injects a leftover unit from the previous type. */
export function catalogUnitForCategory(category, unit) {
  const cat = normalizeCategory(category);
  const suggested = suggestedUnits(cat);
  const fallback = categoryMeta(cat).defaultUnit;
  const code = unit ? normalizeUnitCode(unit, fallback) : fallback;
  return suggested.includes(code) ? code : fallback;
}

export function applyCatalogCategoryChange(product, nextCat) {
  const cat = normalizeCategory(nextCat);
  const suggested = suggestedUnits(cat);
  const unit = catalogUnitForCategory(cat, product?.unit);
  return applyCatalogUnitChange({
    ...product,
    category: cat,
    allowedUnits: suggested,
  }, unit);
}

/**
 * Apply a price-unit change on a catalog form/row.
 * Piece (sanitary-style): drop size, force pcs/box to 1.
 * Box (tiles-style): drop the dummy pcs/box of 1 so the cashier fills the real value.
 */
export function applyCatalogUnitChange(product, nextUnit) {
  const unit = normalizeUnitCode(nextUnit, product?.unit || UNIT_BOX);
  const cat = normalizeCategory(product?.category, unit);
  const meta = categoryMeta(cat);
  const prev = product?.piecesPerBox;
  const stringy = typeof prev === "string" || prev === "" || prev == null;
  const showPpb = meta.needsPpb || unit === UNIT_BOX;
  const showSize = meta.needsSize;
  let allowed = Array.isArray(product?.allowedUnits) && product.allowedUnits.length
    ? [...new Set(product.allowedUnits.map((u) => normalizeUnitCode(u, unit)))]
    : defaultAllowedUnits(cat, unit);
  if (!allowed.includes(unit)) allowed = [unit, ...allowed];
  return {
    ...product,
    unit,
    category: cat,
    allowedUnits: allowed,
    piecesPerBox: showPpb
      ? (Number(prev) > 1 ? prev : "")
      : (stringy ? "1" : 1),
    size: showSize ? (product?.size || "") : "",
  };
}

export function piecesPerBoxOf(productOrItem) {
  if (isPieceUnit(productOrItem) && !categoryMeta(productOrItem?.category).needsPpb) return 1;
  const n = Number(productOrItem?.piecesPerBox);
  return n > 0 ? n : 1;
}

export function stockOnHand(product) {
  if (!product) return 0;
  return (Number(product.showroomQty) || 0) + (Number(product.godownQty) || 0) + (Number(product.stockQty) || 0);
}

export function stockAvailQty(product) {
  return Math.max(0, stockOnHand(product));
}

/** Total available stock converted to pieces (tiles: boxes × pcs/box). */
export function stockAvailPieces(product) {
  if (!product) return 0;
  const total = stockOnHand(product);
  if (isPieceUnit(product) || !usesPieceStock(product)) return Math.max(0, Math.round(total));
  return Math.max(0, Math.round(total * piecesPerBoxOf(product)));
}

export function lineSoldQty(item, product) {
  if (!item) return 0;
  const fields = conversionProduct(item, product || item);
  const unit = item.unit == null || item.unit === "" ? "box" : item.unit;
  return Math.max(0, toProductUnit(fields, unit, item.qty, item.pieces));
}

/** Pieces this line item consumes (tiles: boxes×ppb + loose). */
export function lineSoldPieces(item, product) {
  if (!item) return 0;
  return Math.max(0, soldPieces(item, product || item));
}

/** Comparable qty for remaining-returnable (pieces for tiles; product.unit otherwise). */
export function lineReturnQty(item, product) {
  const fields = conversionProduct(item, product);
  if (isSlabProduct(item) || isSlabProduct(product) || isSlabProduct(fields)) {
    return lineSoldQty(item, product);
  }
  const lineU = item?.unit == null || item.unit === "" ? "box" : normalizeUnitCode(item.unit, "box");
  const tileArea = unitKind(lineU) === "area" && sqftPerPiece(fields) > 0;
  if (usesPieceStock(fields) || lineU === "box" || lineU === "piece" || tileArea) {
    return lineSoldPieces(item, fields);
  }
  return lineSoldQty(item, product);
}

/** productId -> qty still returnable (sold − already returned). */
export function remainingReturnableByProduct(originalItems, priorReturnItems) {
  const sold = {};
  for (const it of originalItems || []) {
    if (!it?.productId) continue;
    sold[it.productId] = (sold[it.productId] || 0) + lineReturnQty(it);
  }
  for (const it of priorReturnItems || []) {
    if (!it?.productId) continue;
    sold[it.productId] = (sold[it.productId] || 0) - lineReturnQty(it);
  }
  const out = {};
  Object.entries(sold).forEach(([pid, n]) => {
    const rem = Math.max(0, n);
    out[pid] = Math.abs(rem - Math.round(rem)) < 1e-9 ? Math.round(rem) : rem;
  });
  return out;
}

/** Prior return invoices against a sale. */
export function priorReturnsForSale(sale, allInvoices) {
  if (!sale?.invoiceNo) return [];
  return (allInvoices || []).filter(
    (i) => i.type === "return" && i.originalInvoiceNo === sale.invoiceNo
  );
}

export function isSaleFullyReturned(sale, allInvoices) {
  const items = sale?.items || [];
  if (!items.length) return false;
  const priorItems = priorReturnsForSale(sale, allInvoices).flatMap((r) => r.items || []);
  const rem = remainingReturnableByProduct(items, priorItems);
  return Object.values(rem).every((v) => v <= 0);
}

/** Max refund still allowed (original grandTotal − prior refunds). */
export function remainingReturnableAmount(sale, allInvoices) {
  const grand = Number(sale?.grandTotal) || 0;
  const already = priorReturnsForSale(sale, allInvoices).reduce(
    (s, r) => s + (Number(r.refundTotal) || Number(r.grandTotal) || 0),
    0
  );
  return Math.max(0, Math.round((grand - already) * 100) / 100);
}

function sanitizeIntegerQty(raw) {
  let v = String(raw ?? "").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i);
  return v;
}

function sanitizeDecimalQty(raw) {
  let v = String(raw ?? "").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  return v;
}

/**
 * Clamp a sale qty/pieces edit so boxes×ppb + pieces never exceeds availPieces.
 * `field` is "qty" | "pieces". Returns the next { qty, pieces } string values.
 */
export function clampSaleQtyFields({ product, qty, pieces, field, raw, availPieces, lineUnit }) {
  const code = lineUnit
    ? normalizeUnitCode(lineUnit, "box")
    : (product?.unit == null || product?.unit === "" ? "box" : normalizeUnitCode(product.unit, "box"));

  if (code !== "box") {
    const cleaned = sanitizeDecimalQty(raw);
    if (field === "pieces") return { qty: qty ?? "", pieces: "" };
    if (cleaned === "" || cleaned === ".") return { qty: cleaned, pieces: "" };
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { qty, pieces: "" };
    const availPU = availPieces != null && usesPieceStock(product)
      ? availPieces / piecesPerBoxOf(product)
      : (availPieces ?? stockAvailQty(product));
    const max = fromProductUnit(product, code, Math.max(0, availPU));
    const clamped = Math.min(Math.max(0, n), max > 0 ? max : 0);
    const rounded = Math.round(clamped * 10000) / 10000;
    return { qty: String(rounded), pieces: "" };
  }

  const cleaned = sanitizeIntegerQty(raw);
  const tile = isBoxUnit({ unit: code });
  const ppb = piecesPerBoxOf(product);
  const avail = Math.max(0, availPieces ?? stockAvailPieces(product));

  if (!tile) {
    if (cleaned === "" || cleaned === ".") return { qty: cleaned, pieces: "" };
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { qty, pieces: "" };
    return { qty: String(Math.min(Math.max(0, Math.floor(n)), avail)), pieces: "" };
  }

  const curPcs = field === "pieces" ? cleaned : (pieces ?? "");

  if (field === "qty") {
    if (cleaned === "" || cleaned === ".") return { qty: cleaned, pieces: pieces ?? "" };
    const pcsNum = Math.max(0, Math.floor(Number(pieces) || 0));
    const maxBoxes = Math.floor(Math.max(0, avail - pcsNum) / ppb);
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { qty, pieces: pieces ?? "" };
    const boxes = Math.min(Math.max(0, Math.floor(n)), maxBoxes);
    return { qty: String(boxes), pieces: pieces ?? "" };
  }

  if (cleaned === "" || cleaned === ".") return { qty: qty ?? "", pieces: cleaned };
  const boxesNum = Math.max(0, Math.floor(Number(qty) || 0));
  const maxPcs = Math.max(0, avail - boxesNum * ppb);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { qty: qty ?? "", pieces };
  const pcs = Math.min(Math.max(0, Math.floor(n)), maxPcs);
  return { qty: qty ?? "", pieces: String(pcs) };
}

function fmtQtyNumber(n) {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 10000) / 10000);
}

/** Short remaining label: "12b+3p" or "7 pcs" or "3.2 m". */
export function formatAvailLabel(product, availPieces = stockAvailPieces(product), lineUnit) {
  const code = lineUnit ? normalizeUnitCode(lineUnit, product?.unit || "box") : null;
  if (code && code !== "box" && code !== "piece") {
    const availPU = usesPieceStock(product)
      ? (availPieces ?? 0) / piecesPerBoxOf(product)
      : (availPieces ?? stockAvailQty(product));
    const inLine = fromProductUnit(product, code, Math.max(0, availPU));
    return `${fmtQtyNumber(inLine)} ${unitShort(code)}`;
  }
  if (isPieceUnit(product) || (code === "piece" && !isBoxUnit(product))) {
    return `${Math.max(0, Math.round(availPieces ?? stockAvailPieces(product)))} pcs`;
  }
  if (!usesPieceStock(product) && !isBoxUnit(product)) {
    return `${fmtQtyNumber(stockAvailQty(product))} ${unitShort(product?.unit)}`;
  }
  const ppb = piecesPerBoxOf(product);
  const pieces = Math.max(0, availPieces ?? 0);
  const boxes = Math.trunc(pieces / ppb);
  const pc = pieces - boxes * ppb;
  return pc > 0 ? `${boxes}b+${pc}p` : `${boxes}b`;
}

export function unitKindLabel(productOrItem) {
  const cat = normalizeCategory(productOrItem?.category, productOrItem?.unit);
  return CATEGORIES[cat]?.short || categoryMeta(cat).label;
}

export function unitKindChipClass(productOrItem) {
  const cat = normalizeCategory(productOrItem?.category, productOrItem?.unit);
  if (cat === "tiles") return "ds-chip ds-chip-tile";
  if (cat === "sanitaryware") return "ds-chip ds-chip-sanitary";
  return "ds-chip ds-chip-role";
}

export const CONTRACTOR_CHIP = "ds-chip ds-chip-role";

export function unitOptionLabel(unit) {
  const u = normalizeUnitCode(unit, UNIT_BOX);
  if (u === UNIT_BOX) return "Tiles · Boxes + Pcs";
  if (u === UNIT_PIECE) return "Sanitary · Pieces";
  return unitShort(u);
}

export function rateSuffix(productOrItem) {
  return `/${unitShort(productOrItem?.productUnit || productOrItem?.unit || "box")}`;
}

export function qtyFieldLabel(productOrItem, lineUnit) {
  const u = lineUnit || productOrItem?.unit;
  if (u == null || u === "" || normalizeUnitCode(u, "box") === "box") return "Box";
  if (normalizeUnitCode(u, "box") === "piece") return "Pcs";
  return unitShort(u);
}

export function stockUnitWord(productOrItem) {
  return unitShort(productOrItem?.unit || "box");
}

export function derivedSqftRateLabel(product, rate) {
  const r = ratePerSqft(product, rate);
  if (!(r > 0)) return "";
  return `≈ ₹${Math.round(r * 100) / 100}/sq.ft`;
}

/**
 * Human stock label for lists / search.
 */
export function formatStockLabel(product, piecesBreakdownFn) {
  const total = stockOnHand(product);
  if (isPieceUnit(product)) return `${Math.round(total)} pcs`;
  if (!usesPieceStock(product)) return `${fmtQtyNumber(total)} ${unitShort(product?.unit)}`;
  const ppb = piecesPerBoxOf(product);
  if (typeof piecesBreakdownFn === "function") {
    const bd = piecesBreakdownFn(total, ppb);
    return `${bd.boxes}b${bd.loose ? `+${bd.loose}p` : ""}`;
  }
  return `${fmtQtyNumber(total)} box`;
}

/**
 * Invoice / PDF qty line: "2 box + 3 pc", "16 sq.ft", "5 pcs".
 */
export function formatQtyLabel(item) {
  const unit = item?.unit == null || item.unit === "" ? "box" : normalizeUnitCode(item.unit, "box");
  if (unit === "piece") {
    const n = Number(item.qty) || 0;
    return `${n} pcs`;
  }
  if (unit === "box") {
    const boxes = Number(item.qty) || 0;
    const pcs = Number(item.pieces) || 0;
    if (pcs > 0) return `${boxes} box + ${pcs} pc`;
    return `${boxes} box`;
  }
  return `${fmtQtyNumber(item.qty)} ${unitShort(unit)}`;
}

export function productMetaLine(product, { includeKind = true } = {}) {
  const parts = [product?.code, product?.company].filter(Boolean);
  const cat = normalizeCategory(product?.category, product?.unit);
  const meta = categoryMeta(cat);
  if (product?.lotNo) parts.push(`Lot ${product.lotNo}`);
  if (meta.needsSize || isBoxUnit(product)) {
    const size = formatTileSize(product?.size);
    if (size) parts.push(size);
  }
  if (meta.needsPpb || isBoxUnit(product)) {
    parts.push(`${piecesPerBoxOf(product)} pcs/box`);
  }
  if (includeKind) parts.push(unitKindLabel(product));
  const sqft = derivedSqftRateLabel(product, product?.sellPrice);
  if (sqft) parts.push(sqft);
  return parts.join(" · ");
}

export function normalizeProductUnitFields(p) {
  const unit = normalizeUnitCode(p.unit, UNIT_BOX);
  const category = normalizeCategory(p.category, unit);
  const meta = categoryMeta(category);
  let allowed = allowedUnitsOf({ ...p, unit, category });
  if (!allowed.includes(unit)) allowed = [unit, ...allowed];
  const showPpb = meta.needsPpb || unit === UNIT_BOX;
  const showSize = meta.needsSize;
  return {
    ...p,
    unit,
    category,
    allowedUnits: allowed,
    piecesPerBox: showPpb ? Math.max(1, Number(p.piecesPerBox) || 1) : 1,
    size: showSize
      ? (normalizeTileSize(p.size) || String(p.size || "").trim())
      : (unit === UNIT_PIECE ? "" : String(p.size || "").trim()),
    packQty: Math.max(0.0001, Number(p.packQty) || 1),
  };
}

export {
  allowedUnitsOf,
  defaultAllowedUnits,
  isSlabProduct,
  needsPackQty,
  needsTileFields,
  normalizeCategory,
  fromProductUnit,
  sqftPerBox,
};
