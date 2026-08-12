/**
 * Product selling unit for tiles & sanitaryware shops.
 *
 *  - unit "box"   → Tiles: billed as boxes + loose pieces (rate is per box)
 *  - unit "piece" → Sanitary: billed as pieces only (rate is per piece)
 *
 * Stock is stored in the product's selling unit:
 *  - tiles: stockQty = boxes (may be fractional when loose pieces exist)
 *  - sanitary: stockQty = pieces
 */

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

export function piecesPerBoxOf(productOrItem) {
  if (isPieceUnit(productOrItem)) return 1;
  const n = Number(productOrItem?.piecesPerBox);
  return n > 0 ? n : 1;
}

/** Short badge: "Tiles" | "Sanitary" */
export function unitKindLabel(productOrItem) {
  return isBoxUnit(productOrItem) ? "Tiles" : "Sanitary";
}

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

/** Meta line under a product name */
export function productMetaLine(product) {
  const parts = [product?.code, product?.company, product?.size].filter(Boolean);
  if (isBoxUnit(product)) {
    const ppb = piecesPerBoxOf(product);
    parts.push(`${ppb} pcs/box`);
    parts.push("Tiles");
  } else {
    parts.push("Sanitary");
  }
  return parts.join(" · ");
}

/**
 * Normalize product fields when saving.
 * Sanitary always has piecesPerBox = 1; tiles keep the given ppb (min 1).
 */
export function normalizeProductUnitFields(p) {
  const unit = normalizeUnit(p.unit);
  return {
    ...p,
    unit,
    piecesPerBox: unit === UNIT_PIECE ? 1 : Math.max(1, Number(p.piecesPerBox) || 1),
  };
}
