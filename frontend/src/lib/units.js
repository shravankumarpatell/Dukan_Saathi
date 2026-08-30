/**
 * Product selling unit for tiles & sanitaryware shops.
 *
 *  - unit "box"   → Tiles: billed as boxes + loose pieces (rate is per box)
 *  - unit "piece" → Sanitary: billed as pieces only (rate is per piece)
 *
 * Stock is stored in the product's selling unit:
 *  - tiles: stockQty = boxes (may be fractional when loose pieces exist)
 *  - sanitary: stockQty = pieces
 *
 * Canonical catalog fields (every product form must follow this):
 *  Always: unit, name, code, company, sellPrice, stockQty, lowStockThreshold
 *  Tiles only: size, piecesPerBox
 *  Sanitary: size empty, piecesPerBox always 1 (never shown)
 *
 * Bill / return lines:
 *  Always: qty (boxes or pcs), rate, amount
 *  Tiles only: pieces (loose pcs), sq-ft calculator
 */

import { formatTileSize, normalizeTileSize } from "./tileSizes";

export const UNIT_BOX = "box";
export const UNIT_PIECE = "piece";

export function normalizeUnit(unit) {
  return unit === UNIT_PIECE ? UNIT_PIECE : UNIT_BOX;
}

/** True for tiles — always show Box + Pcs fields, regardless of piecesPerBox. */
export function isBoxUnit(productOrItem) {
  return normalizeUnit(productOrItem?.unit) === UNIT_BOX;
}

export function isPieceUnit(productOrItem) {
  return normalizeUnit(productOrItem?.unit) === UNIT_PIECE;
}

/** Catalog fields that exist only for tiles. Hidden + cleared for sanitary. */
export const TILE_ONLY_CATALOG_FIELDS = ["size", "piecesPerBox"];

export function isTileOnlyCatalogField(field) {
  return TILE_ONLY_CATALOG_FIELDS.includes(field);
}

/**
 * Apply a Type change on a catalog form/row.
 * Sanitary: drop size, force pcs/box to 1.
 * Tiles: drop the dummy pcs/box of 1 so the cashier fills the real value.
 */
export function applyCatalogUnitChange(product, nextUnit) {
  const unit = normalizeUnit(nextUnit);
  const tile = unit === UNIT_BOX;
  const prev = product?.piecesPerBox;
  const stringy = typeof prev === "string" || prev === "" || prev == null;
  return {
    ...product,
    unit,
    piecesPerBox: tile
      ? (Number(prev) > 1 ? prev : "")
      : (stringy ? "1" : 1),
    size: tile ? (product?.size || "") : "",
  };
}

export function piecesPerBoxOf(productOrItem) {
  if (isPieceUnit(productOrItem)) return 1;
  const n = Number(productOrItem?.piecesPerBox);
  return n > 0 ? n : 1;
}

/** Total available stock converted to pieces (tiles: boxes × pcs/box). */
export function stockAvailPieces(product) {
  if (!product) return 0;
  const total = (Number(product.showroomQty) || 0) + (Number(product.godownQty) || 0) + (Number(product.stockQty) || 0);
  if (isPieceUnit(product)) return Math.max(0, Math.round(total));
  return Math.max(0, Math.round(total * piecesPerBoxOf(product)));
}

/** Pieces this line item consumes (tiles: boxes×ppb + loose). */
export function lineSoldPieces(item) {
  if (!item) return 0;
  if (isPieceUnit(item)) return Math.max(0, Math.round(Number(item.qty) || 0));
  const ppb = piecesPerBoxOf(item);
  return Math.max(0, Math.round((Number(item.qty) || 0) * ppb + (Number(item.pieces) || 0)));
}

/** productId -> pieces still returnable (sold − already returned). */
export function remainingReturnableByProduct(originalItems, priorReturnItems) {
  const sold = {};
  for (const it of originalItems || []) {
    if (!it?.productId) continue;
    sold[it.productId] = (sold[it.productId] || 0) + lineSoldPieces(it);
  }
  for (const it of priorReturnItems || []) {
    if (!it?.productId) continue;
    sold[it.productId] = (sold[it.productId] || 0) - lineSoldPieces(it);
  }
  const out = {};
  Object.entries(sold).forEach(([pid, n]) => { out[pid] = Math.max(0, Math.round(n)); });
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

/**
 * Clamp a sale qty/pieces edit so boxes×ppb + pieces never exceeds availPieces.
 * `field` is "qty" | "pieces". Returns the next { qty, pieces } string values.
 * Pass `availPieces` to subtract qty already reserved on the bill.
 */
export function clampSaleQtyFields({ product, qty, pieces, field, raw, availPieces }) {
  const cleaned = sanitizeQtyRaw(raw);
  const tile = isBoxUnit(product);
  const ppb = piecesPerBoxOf(product);
  const avail = Math.max(0, availPieces ?? stockAvailPieces(product));

  if (!tile) {
    // Sanitary: qty is pieces.
    if (cleaned === "" || cleaned === ".") return { qty: cleaned, pieces: "" };
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return { qty, pieces: "" };
    return { qty: String(Math.min(Math.max(0, Math.floor(n)), avail)), pieces: "" };
  }

  const curQty = field === "qty" ? cleaned : (qty ?? "");
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

  // field === pieces
  if (cleaned === "" || cleaned === ".") return { qty: qty ?? "", pieces: cleaned };
  const boxesNum = Math.max(0, Math.floor(Number(qty) || 0));
  const maxPcs = Math.max(0, avail - boxesNum * ppb);
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { qty: qty ?? "", pieces };
  const pcs = Math.min(Math.max(0, Math.floor(n)), maxPcs);
  return { qty: qty ?? "", pieces: String(pcs) };
}

function sanitizeQtyRaw(raw) {
  let v = String(raw ?? "").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  // Qty/pieces are whole numbers in practice — drop decimals for clamping UX.
  if (i !== -1) v = v.slice(0, i);
  return v;
}

/** Short remaining label: "12b+3p" or "7 pcs". */
export function formatAvailLabel(product, availPieces = stockAvailPieces(product)) {
  if (isPieceUnit(product)) return `${Math.max(0, availPieces)} pcs`;
  const ppb = piecesPerBoxOf(product);
  const boxes = Math.trunc(Math.max(0, availPieces) / ppb);
  const pc = Math.max(0, availPieces) - boxes * ppb;
  return pc > 0 ? `${boxes}b+${pc}p` : `${boxes}b`;
}

/** Short badge: "Tiles" | "Sanitary" */
export function unitKindLabel(productOrItem) {
  return isBoxUnit(productOrItem) ? "Tiles" : "Sanitary";
}

/** Chip classes — mint for tiles, cool cyan for sanitary. Never amber. */
export function unitKindChipClass(productOrItem) {
  return isBoxUnit(productOrItem) ? "ds-chip ds-chip-tile" : "ds-chip ds-chip-sanitary";
}

export const CONTRACTOR_CHIP = "ds-chip ds-chip-role";

/** Form option label: "Tiles · Boxes + Pcs" | "Sanitary · Pieces" */
export function unitOptionLabel(unit) {
  return normalizeUnit(unit) === UNIT_BOX ? "Tiles · Boxes + Pcs" : "Sanitary · Pieces";
}

/** Rate field suffix */
export function rateSuffix(productOrItem) {
  return isBoxUnit(productOrItem) ? "/box" : "/pc";
}

/** Primary qty field label on bill/return forms */
export function qtyFieldLabel(productOrItem) {
  return isBoxUnit(productOrItem) ? "Box" : "Pcs";
}

/** Stock quantity unit word */
export function stockUnitWord(productOrItem) {
  return isBoxUnit(productOrItem) ? "boxes" : "pcs";
}

/**
 * Human stock label for lists / search.
 * Tiles with fractional stock → "12b+3p"; sanitary → "7 pcs".
 */
export function formatStockLabel(product, piecesBreakdownFn) {
  const total = (product.showroomQty || 0) + (product.godownQty || 0) + (product.stockQty || 0);
  if (isPieceUnit(product)) return `${Math.round(total)} pcs`;
  const ppb = piecesPerBoxOf(product);
  if (typeof piecesBreakdownFn === "function") {
    const bd = piecesBreakdownFn(total, ppb);
    return `${bd.boxes}b${bd.loose ? `+${bd.loose}p` : ""}`;
  }
  return `${total} box`;
}

/**
 * Invoice / PDF qty line: "2 box + 3 pc" or "5 pcs".
 * For piece items, quantity lives in `qty` (not `pieces`).
 */
export function formatQtyLabel(item) {
  if (isPieceUnit(item)) {
    const n = Number(item.qty) || 0;
    return `${n} pcs`;
  }
  const boxes = Number(item.qty) || 0;
  const pcs = Number(item.pieces) || 0;
  if (pcs > 0) return `${boxes} box + ${pcs} pc`;
  return `${boxes} box`;
}

/** Meta line under a product name — size and pcs/box only for tiles. */
export function productMetaLine(product, { includeKind = true } = {}) {
  const parts = [product?.code, product?.company].filter(Boolean);
  if (isBoxUnit(product)) {
    const size = formatTileSize(product?.size);
    if (size) parts.push(size);
    parts.push(`${piecesPerBoxOf(product)} pcs/box`);
    if (includeKind) parts.push("Tiles");
  } else if (includeKind) {
    parts.push("Sanitary");
  }
  return parts.join(" · ");
}

/**
 * Normalize product fields when saving.
 * Sanitary: piecesPerBox = 1 and size cleared. Tiles keep size and ppb (min 1).
 */
export function normalizeProductUnitFields(p) {
  const unit = normalizeUnit(p.unit);
  const tile = unit === UNIT_BOX;
  return {
    ...p,
    unit,
    piecesPerBox: tile ? Math.max(1, Number(p.piecesPerBox) || 1) : 1,
    size: tile ? (normalizeTileSize(p.size) || String(p.size || "").trim()) : "",
  };
}
