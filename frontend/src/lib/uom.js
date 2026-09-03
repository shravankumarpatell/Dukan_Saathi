/**
 * Unit master, categories, and qty conversion to the product's price/stock unit.
 * Keep formulas in lockstep with backend/app/common/uom.py.
 *
 * Rate is always stored per product.unit. A bill line may use another unit;
 * toProductUnit converts that qty into product.unit so amount = qty × rate.
 */

export const SQM_TO_SQFT = 10.76391041671;
export const M_TO_FT = 3.280839895;
export const FT_TO_M = 1 / M_TO_FT;
export const IN_TO_M = 0.0254;
export const FT_TO_IN = 12;
export const KG_TO_G = 1000;
export const FT_MM = 304.8;

export const UNITS = {
  piece: { label: "Piece", short: "pcs", kind: "count" },
  box: { label: "Box", short: "box", kind: "count" },
  set: { label: "Set", short: "set", kind: "count" },
  sqft: { label: "Sq.ft", short: "sq.ft", kind: "area" },
  sqm: { label: "Sq.m", short: "sq.m", kind: "area" },
  mtr: { label: "Meter", short: "m", kind: "length" },
  rft: { label: "Running ft", short: "rft", kind: "length" },
  ft: { label: "Feet", short: "ft", kind: "length" },
  inch: { label: "Inch", short: "in", kind: "length" },
  kg: { label: "Kg", short: "kg", kind: "mass" },
  gm: { label: "Gram", short: "g", kind: "mass" },
  litre: { label: "Litre", short: "L", kind: "volume" },
  bag: { label: "Bag", short: "bag", kind: "count" },
  pack: { label: "Pack", short: "pack", kind: "count" },
  bundle: { label: "Bundle", short: "bundle", kind: "count" },
  slab: { label: "Slab", short: "slab", kind: "count" },
  roll: { label: "Roll", short: "roll", kind: "count" },
  pair: { label: "Pair", short: "pair", kind: "count" },
};

export const UNIT_CODES = Object.keys(UNITS);
const UNIT_CODE_SET = new Set(UNIT_CODES);
export const COUNT_PACK = new Set(["box", "set", "pack", "bundle", "bag", "pair", "slab", "roll"]);

const ALIASES = {
  pcs: "piece",
  pc: "piece",
  nos: "piece",
  no: "piece",
  sft: "sqft",
  "sq.ft": "sqft",
  "sq ft": "sqft",
  sqfeet: "sqft",
  "sq.m": "sqm",
  sqmtr: "sqm",
  m2: "sqm",
  meter: "mtr",
  metre: "mtr",
  mtrs: "mtr",
  m: "mtr",
  runningfeet: "rft",
  runningft: "rft",
  feet: "ft",
  foot: "ft",
  in: "inch",
  inches: "inch",
  kgs: "kg",
  g: "gm",
  grams: "gm",
  ltr: "litre",
  liter: "litre",
  l: "litre",
  bags: "bag",
  pk: "pack",
  pkt: "pack",
  sanitary: "piece",
  tiles: "box",
  tile: "box",
};

export function normalizeUnitCode(raw, defaultCode = "box") {
  if (raw == null || raw === "") return defaultCode;
  const t = String(raw).trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
  const compact = t.replace(/\s+/g, "").replace(/\./g, "");
  if (UNIT_CODE_SET.has(t)) return t;
  if (UNIT_CODE_SET.has(compact)) return compact;
  if (ALIASES[t]) return ALIASES[t];
  if (ALIASES[compact]) return ALIASES[compact];
  return UNIT_CODE_SET.has(defaultCode) ? defaultCode : "box";
}

export function unitKind(code) {
  return (UNITS[normalizeUnitCode(code, "piece")] || UNITS.piece).kind;
}

export function unitLabel(code) {
  return (UNITS[normalizeUnitCode(code, "piece")] || { label: code }).label;
}

export function unitShort(code) {
  return (UNITS[normalizeUnitCode(code, "piece")] || { short: code }).short;
}

export const CATEGORIES = {
  tiles: {
    label: "Tiles",
    short: "Tiles",
    suggestedUnits: ["box", "piece", "sqft", "sqm"],
    defaultUnit: "box",
    needsSize: true,
    needsPpb: true,
  },
  sanitaryware: {
    label: "Sanitaryware",
    short: "Sanitary",
    suggestedUnits: ["piece", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  plumbing_fittings: {
    label: "Bathroom & plumbing fittings",
    short: "Fittings",
    suggestedUnits: ["piece", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  bathroom_accessories: {
    label: "Bathroom accessories",
    short: "Accessories",
    suggestedUnits: ["piece", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  bathtubs_shower: {
    label: "Bathtubs & shower",
    short: "Bath",
    suggestedUnits: ["piece", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  natural_stone: {
    label: "Natural stone",
    short: "Stone",
    suggestedUnits: ["sqft", "sqm"],
    defaultUnit: "sqft",
    needsSize: false,
    needsPpb: false,
    needsSlab: true,
  },
  engineered_stone: {
    label: "Engineered / artificial stone",
    short: "Quartz",
    suggestedUnits: ["sqft", "sqm"],
    defaultUnit: "sqft",
    needsSize: false,
    needsPpb: false,
    needsSlab: true,
  },
  kitchen: {
    label: "Kitchen products",
    short: "Kitchen",
    suggestedUnits: ["piece", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  tile_installation: {
    label: "Tile installation materials",
    short: "Install",
    suggestedUnits: ["bag", "kg", "litre", "piece", "box"],
    defaultUnit: "bag",
    needsSize: false,
    needsPpb: false,
    needsPack: true,
  },
  laying_accessories: {
    label: "Tile laying / construction accessories",
    short: "Tools",
    suggestedUnits: ["piece", "box", "pack", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  flooring_alternatives: {
    label: "Flooring & wall alternatives",
    short: "Flooring",
    suggestedUnits: ["sqft", "box", "piece"],
    defaultUnit: "box",
    needsSize: true,
    needsPpb: true,
  },
  bathroom_furniture: {
    label: "Bathroom furniture",
    short: "Furniture",
    suggestedUnits: ["piece", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  water_utility: {
    label: "Water / utility products",
    short: "Water",
    suggestedUnits: ["piece", "set"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
  plumbing_construction: {
    label: "Plumbing / construction products",
    short: "Plumbing",
    suggestedUnits: ["piece", "mtr", "ft", "kg", "box"],
    defaultUnit: "mtr",
    needsSize: false,
    needsPpb: false,
  },
  hardware: {
    label: "Hardware / miscellaneous",
    short: "Hardware",
    suggestedUnits: ["piece", "box", "pack", "mtr", "kg"],
    defaultUnit: "piece",
    needsSize: false,
    needsPpb: false,
  },
};

export const CATEGORY_CODES = Object.keys(CATEGORIES);

export function normalizeCategory(raw, unit) {
  const t = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (CATEGORIES[t]) return t;
  const aliases = {
    tile: "tiles",
    sanitary: "sanitaryware",
    fittings: "plumbing_fittings",
    accessories: "bathroom_accessories",
    bathtub: "bathtubs_shower",
    stone: "natural_stone",
    quartz: "engineered_stone",
    adhesive: "tile_installation",
    grout: "tile_installation",
    spc: "flooring_alternatives",
    pipe: "plumbing_construction",
    misc: "hardware",
  };
  if (aliases[t]) return aliases[t];
  const u = unit ? normalizeUnitCode(unit, "box") : "box";
  return u === "piece" ? "sanitaryware" : "tiles";
}

export const SLAB_CATEGORIES = new Set(["natural_stone", "engineered_stone"]);

export function isSlabProduct(product) {
  const raw = typeof product === "string" ? product : product?.category;
  if (raw == null || raw === "") return false;
  return SLAB_CATEGORIES.has(normalizeCategory(raw));
}

export function categoryMeta(code) {
  return CATEGORIES[normalizeCategory(code)] || CATEGORIES.tiles;
}

export function suggestedUnits(category) {
  return [...categoryMeta(category).suggestedUnits];
}

export function defaultAllowedUnits(category, unit) {
  const cat = normalizeCategory(category, unit);
  const units = [...CATEGORIES[cat].suggestedUnits];
  const u = unit ? normalizeUnitCode(unit, CATEGORIES[cat].defaultUnit) : CATEGORIES[cat].defaultUnit;
  if (!units.includes(u)) units.unshift(u);
  return units;
}

export function needsTileFields(product) {
  const cat = normalizeCategory(product?.category, product?.unit);
  const meta = CATEGORIES[cat] || CATEGORIES.tiles;
  if (meta.needsSize || meta.needsPpb) return true;
  return normalizeUnitCode(product?.unit, "box") === "box" && cat === "tiles";
}

export function needsPackQty(product) {
  const cat = normalizeCategory(product?.category, product?.unit);
  if (CATEGORIES[cat]?.needsPack) return true;
  const u = normalizeUnitCode(product?.unit, categoryMeta(cat).defaultUnit);
  if (u === "box" || u === "piece") return false;
  return COUNT_PACK.has(u);
}

export function conversionProduct(item, product) {
  const destRaw = item?.productUnit || item?.product_unit || product?.productUnit || product?.product_unit || product?.unit;
  let dest = destRaw;
  if (dest == null || dest === "") {
    const lu = item?.unit == null || item?.unit === "" ? "box" : normalizeUnitCode(item.unit, "box");
    dest = lu === "box" || lu === "piece" ? lu : "box";
  }
  return {
    unit: normalizeUnitCode(dest, "box"),
    size: item?.size || product?.size || "",
    piecesPerBox: item?.piecesPerBox ?? product?.piecesPerBox ?? 1,
    packQty: item?.packQty ?? product?.packQty ?? 1,
    category: item?.category || product?.category || "",
  };
}

export function piecesPerBoxOfProduct(product) {
  const n = Number(product?.piecesPerBox);
  return n > 0 ? n : 1;
}

export function packQtyOf(product) {
  const n = Number(product?.packQty);
  return n > 0 ? n : 1;
}

export function productUnitOf(product, defaultCode = "box") {
  const dest = product?.productUnit || product?.product_unit || product?.unit;
  if (dest == null || dest === "") return defaultCode;
  return normalizeUnitCode(dest, defaultCode);
}

/** Nominal size math: "2x2 ft" → 4 sq.ft (not 600 mm). */
export function sqftPerPiece(productOrSize) {
  const size = String(typeof productOrSize === "string" ? productOrSize : productOrSize?.size || "").trim();
  if (!size) return 0;
  const text = size.toLowerCase().replace(/×/g, "x").replace(/\*/g, "x");
  const nums = text.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return 0;
  const a = Number(nums[0]);
  const b = Number(nums[1]);
  if (!(a > 0 && b > 0)) return 0;
  if (/\bmm\b/.test(text)) return (a / FT_MM) * (b / FT_MM);
  if (/\bcm\b/.test(text)) return (a / 30.48) * (b / 30.48);
  if (/\b(m|meter|metre)\b/.test(text) && !/\bmm\b/.test(text)) return a * b * SQM_TO_SQFT;
  if (/\b(in|inch|inches)\b/.test(text) || text.includes('"')) return (a / FT_TO_IN) * (b / FT_TO_IN);
  return a * b;
}

export function sqftPerBox(product) {
  const spp = sqftPerPiece(product);
  return spp > 0 ? spp * piecesPerBoxOfProduct(product) : 0;
}

export function ratePerSqft(product, rate) {
  const u = productUnitOf(product);
  const spb = u === "box" ? sqftPerBox(product) : sqftPerPiece(product);
  if (!(spb > 0)) return 0;
  const r = Number(rate != null ? rate : product?.sellPrice) || 0;
  return r / spb;
}

function toSqft(unit, qty) {
  return normalizeUnitCode(unit, "sqft") === "sqm" ? qty * SQM_TO_SQFT : qty;
}
function fromSqft(unit, sqft) {
  return normalizeUnitCode(unit, "sqft") === "sqm" ? sqft / SQM_TO_SQFT : sqft;
}
function toMeters(unit, qty) {
  const u = normalizeUnitCode(unit, "mtr");
  if (u === "ft" || u === "rft") return qty * FT_TO_M;
  if (u === "inch") return qty * IN_TO_M;
  return qty;
}
function fromMeters(unit, meters) {
  const u = normalizeUnitCode(unit, "mtr");
  if (u === "ft" || u === "rft") return meters * M_TO_FT;
  if (u === "inch") return meters / IN_TO_M;
  return meters;
}
function toKg(unit, qty) {
  return normalizeUnitCode(unit, "kg") === "gm" ? qty / KG_TO_G : qty;
}
function fromKg(unit, kg) {
  return normalizeUnitCode(unit, "kg") === "gm" ? kg * KG_TO_G : kg;
}

function countToPieces(product, unit, qty, loose = 0) {
  const u = normalizeUnitCode(unit, "piece");
  const ppb = piecesPerBoxOfProduct(product);
  const pq = packQtyOf(product);
  if (u === "piece") return qty;
  if (u === "box") return qty * ppb + loose;
  if (COUNT_PACK.has(u)) return qty * pq;
  return qty;
}

function piecesToCount(product, unit, pieces) {
  const u = normalizeUnitCode(unit, "piece");
  const ppb = piecesPerBoxOfProduct(product);
  const pq = packQtyOf(product);
  if (u === "piece") return pieces;
  if (u === "box") return ppb ? pieces / ppb : pieces;
  if (COUNT_PACK.has(u)) return pq ? pieces / pq : pieces;
  return pieces;
}

export function toProductUnit(product, lineUnit, qty, loosePieces = 0) {
  const q = Number(qty) || 0;
  const loose = Number(loosePieces) || 0;
  const dest = productUnitOf(product, "box");
  const src = lineUnit == null || lineUnit === "" ? "box" : normalizeUnitCode(lineUnit, "box");

  if (src === dest) {
    if (src === "box") return q + (piecesPerBoxOfProduct(product) ? loose / piecesPerBoxOfProduct(product) : 0);
    return q;
  }

  const sk = unitKind(src);
  const dk = unitKind(dest);

  if (sk === "area" && dk === "area") return fromSqft(dest, toSqft(src, q));
  if (sk === "length" && dk === "length") return fromMeters(dest, toMeters(src, q));
  if (sk === "mass" && dk === "mass") return fromKg(dest, toKg(src, q));
  if (sk === "volume" && dk === "volume") return q;

  if (sk === "count" && dk === "count") {
    return piecesToCount(product, dest, countToPieces(product, src, q, loose));
  }

  if (sk === "area" || dk === "area") {
    const spp = sqftPerPiece(product);
    if (!(spp > 0)) return 0;
    if (sk === "area") {
      const pieces = toSqft(src, q) / spp;
      return piecesToCount(product, dest, pieces);
    }
    const pieces = countToPieces(product, src, q, loose);
    return fromSqft(dest, pieces * spp);
  }

  if (
    (sk === "mass" && (src === "kg" || src === "gm") && COUNT_PACK.has(dest)) ||
    (dk === "mass" && (dest === "kg" || dest === "gm") && COUNT_PACK.has(src))
  ) {
    const pq = packQtyOf(product);
    if (!(pq > 0)) return 0;
    if (sk === "mass") return toKg(src, q) / pq;
    return fromKg(dest, q * pq);
  }

  if ((sk === "mass" && dk === "count") || (sk === "count" && dk === "mass")) {
    const pq = packQtyOf(product);
    if (!(pq > 0)) return 0;
    if (sk === "mass") return toKg(src, q) / pq;
    return fromKg(dest, q * pq);
  }

  return 0;
}

export function linePriceQty(item, product) {
  const fields = conversionProduct(item, product);
  const unit = item?.unit == null || item?.unit === "" ? "box" : item.unit;
  return toProductUnit(fields, unit, item?.qty, item?.pieces);
}

export function fromProductUnit(product, lineUnit, qtyInProductUnit) {
  const destLine = lineUnit == null || lineUnit === "" ? "box" : normalizeUnitCode(lineUnit, "box");
  const srcUnit = productUnitOf(product, "box");
  return toProductUnit(
    {
      unit: destLine,
      size: product?.size || "",
      piecesPerBox: piecesPerBoxOfProduct(product),
      packQty: packQtyOf(product),
    },
    srcUnit,
    qtyInProductUnit,
    0,
  );
}

export function usesPieceStock(product) {
  const u = productUnitOf(product, "box");
  return u === "box" || u === "piece";
}

export function soldPieces(item, product) {
  const merged = { ...conversionProduct(item, product), ...(item || {}) };
  const unit = normalizeUnitCode(item?.unit, "box");
  const qty = Number(item?.qty) || 0;
  const loose = Number(item?.pieces) || 0;
  const kind = unitKind(unit);
  if (kind === "area") {
    const spp = sqftPerPiece(merged);
    if (!(spp > 0)) return 0;
    return Math.round(toSqft(unit, qty) / spp);
  }
  if (unit === "piece") return Math.round(qty);
  if (unit === "box") {
    return Math.round(qty * piecesPerBoxOfProduct(merged) + loose);
  }
  if (kind === "count") return Math.round(countToPieces(merged, unit, qty, loose));
  return 0;
}

export function allowedUnitsOf(product) {
  const raw = product?.allowedUnits;
  if (Array.isArray(raw) && raw.length) {
    const out = [...new Set(raw.map((u) => normalizeUnitCode(u, productUnitOf(product))))];
    return out;
  }
  return defaultAllowedUnits(product?.category, product?.unit);
}
