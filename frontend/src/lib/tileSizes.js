/**
 * Indian tile sizes as a closed list.
 *
 * Cashiers used to type "2*2" or "12*18". Without a unit those look the same
 * to the computer — 2×2 is feet (floor) and 12×18 is inches (wall). Every
 * stored value therefore includes ft / in / mm, and the add-product UI is a
 * select, not a text box.
 *
 * Stored `size` is the `value` string, e.g. "2x2 ft" or "12x18 in".
 */

export const TILE_SIZES = [
  // Wall ceramic
  { value: "8x12 in", mm: [200, 300], group: "Wall", option: "8×12 in  ·  200×300 mm" },
  { value: "10x15 in", mm: [250, 375], group: "Wall", option: "10×15 in  ·  250×375 mm" },
  { value: "10x16 in", mm: [250, 400], group: "Wall", option: "10×16 in  ·  250×400 mm" },
  { value: "10x30 in", mm: [250, 750], group: "Wall", option: "10×30 in  ·  250×750 mm" },
  { value: "12x18 in", mm: [300, 450], group: "Wall", option: "12×18 in  ·  300×450 mm" },
  { value: "12x24 in", mm: [300, 600], group: "Wall", option: "12×24 in  ·  300×600 mm" },
  { value: "12x36 in", mm: [300, 900], group: "Wall", option: "12×36 in  ·  300×900 mm" },

  // Floor — square & rectangle
  { value: "1x1 ft", mm: [300, 300], group: "Floor", option: "1×1 ft  ·  300×300 mm" },
  { value: "16x16 in", mm: [400, 400], group: "Floor", option: "16×16 in  ·  400×400 mm" },
  { value: "16x32 in", mm: [400, 800], group: "Floor", option: "16×32 in  ·  400×800 mm" },
  { value: "2x2 ft", mm: [600, 600], group: "Floor", option: "2×2 ft  ·  600×600 mm" },
  { value: "2x4 ft", mm: [600, 1200], group: "Floor", option: "2×4 ft  ·  600×1200 mm" },
  { value: "32x32 in", mm: [800, 800], group: "Floor", option: "32×32 in  ·  800×800 mm" },
  { value: "1x1 m", mm: [1000, 1000], group: "Floor", option: "1×1 m  ·  1000×1000 mm" },
  { value: "4x4 ft", mm: [1200, 1200], group: "Floor", option: "4×4 ft  ·  1200×1200 mm" },

  // Wood-look plank
  { value: "6x36 in", mm: [150, 900], group: "Plank", option: "6×36 in  ·  150×900 mm" },
  { value: "8x40 in", mm: [200, 1000], group: "Plank", option: "8×40 in  ·  200×1000 mm" },
  { value: "8x48 in", mm: [200, 1200], group: "Plank", option: "8×48 in  ·  200×1200 mm" },
  { value: "8x56 in", mm: [200, 1400], group: "Plank", option: "8×56 in  ·  200×1400 mm" },
  { value: "1x4 ft", mm: [300, 1200], group: "Plank", option: "1×4 ft  ·  300×1200 mm" },

  // Large slabs
  { value: "800x1600 mm", mm: [800, 1600], group: "Slab", option: "800×1600 mm" },
  { value: "800x2400 mm", mm: [800, 2400], group: "Slab", option: "800×2400 mm" },
  { value: "4x6 ft", mm: [1200, 1800], group: "Slab", option: "4×6 ft  ·  1200×1800 mm" },
  { value: "4x8 ft", mm: [1200, 2400], group: "Slab", option: "4×8 ft  ·  1200×2400 mm" },
];

export const TILE_SIZE_GROUPS = ["Wall", "Floor", "Plank", "Slab", "Custom"];

const CUSTOM_KEY = "ds.customTileSizes";

const FT_MM = 304.8;
const IN_MM = 25.4;

const VALUE_INDEX = new Map(TILE_SIZES.map((s) => [s.value.toLowerCase(), s]));

function compactKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[*\u00d7]/g, "x")
    .replace(/\s+/g, "");
}

const ALIAS_INDEX = new Map();
for (const s of TILE_SIZES) {
  ALIAS_INDEX.set(compactKey(s.value), s);
  ALIAS_INDEX.set(`${s.mm[0]}x${s.mm[1]}`, s);
  ALIAS_INDEX.set(`${s.mm[1]}x${s.mm[0]}`, s);
  ALIAS_INDEX.set(`${s.mm[0]}x${s.mm[1]}mm`, s);
}

// Same physical tile, different shop slang.
[
  ["1x1.5ft", "12x18 in"],
  ["1.5x1ft", "12x18 in"],
  ["12x12in", "1x1 ft"],
  ["12x12", "1x1 ft"],
  ["24x24in", "2x2 ft"],
  ["24x24", "2x2 ft"],
  ["24x48in", "2x4 ft"],
  ["24x48", "2x4 ft"],
  ["48x24in", "2x4 ft"],
  ["1x2ft", "12x24 in"],
  ["2x1ft", "12x24 in"],
].forEach(([alias, value]) => {
  const s = VALUE_INDEX.get(value);
  if (s) ALIAS_INDEX.set(compactKey(alias), s);
});

function parseUnit(text) {
  const t = text.toLowerCase();
  if (/\bmm\b/.test(t)) return "mm";
  if (/\bcm\b/.test(t)) return "cm";
  if (/\b(in|inch|inches)\b/.test(t) || /["″]/.test(t)) return "in";
  if (/\b(ft|feet|foot)\b/.test(t) || /['′]/.test(t)) return "ft";
  if (/\bm\b/.test(t) && !/\bmm\b/.test(t)) return "m";
  return null;
}

function toMm(a, b, unit) {
  if (unit === "ft") return [a * FT_MM, b * FT_MM];
  if (unit === "in") return [a * IN_MM, b * IN_MM];
  if (unit === "cm") return [a * 10, b * 10];
  if (unit === "m") return [a * 1000, b * 1000];
  return [a, b];
}

function guessUnit(a, b) {
  if (Math.max(a, b) >= 100) return "mm";
  // 1, 1.5, 2, 2.5, 3, 4 — Indian shop "2x2" always means feet.
  if (Math.max(a, b) <= 5) return "ft";
  // 8x12, 12x18, 12x24, 32x32 — inches.
  return "in";
}

function formatDim(n) {
  const r = Math.round(Number(n) * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

export function loadCustomTileSizes() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((s) => s?.value && Array.isArray(s.mm) && s.mm.length === 2);
  } catch {
    return [];
  }
}

export function saveCustomTileSize(entry) {
  if (!entry?.value || !entry.mm) return;
  const key = compactKey(entry.value);
  if (TILE_SIZES.some((s) => compactKey(s.value) === key)) return;
  const list = loadCustomTileSizes();
  if (list.some((s) => compactKey(s.value) === key)) return;
  const next = [...list, {
    value: entry.value,
    mm: [Number(entry.mm[0]), Number(entry.mm[1])],
    group: "Custom",
    option: entry.option || entry.value,
  }];
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(next));
}

export function allTileSizes() {
  return [...TILE_SIZES, ...loadCustomTileSizes()];
}

function dimsClose(w, h, tw, th) {
  const ok = (a, t) => Math.abs(a - t) <= Math.max(6, t * 0.025);
  return (ok(w, tw) && ok(h, th)) || (ok(w, th) && ok(h, tw));
}

function matchMm(w, h, list = allTileSizes()) {
  let best = null;
  let bestDist = Infinity;
  for (const s of list) {
    const [tw, th] = s.mm;
    if (!dimsClose(w, h, tw, th)) continue;
    const dist = Math.min(Math.hypot(w - tw, h - th), Math.hypot(w - th, h - tw));
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  return best ? best.value : "";
}

/** Parse "2*2", "12x18 in", "600x600" into numbers + mm. */
export function parseTileDims(raw) {
  if (raw == null) return null;
  const original = String(raw).trim();
  if (!original) return null;
  const text = original
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/[*/]/g, "x")
    .replace(/\s*by\s*/g, "x");
  const nums = text.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length < 2) return null;
  const a = Number(nums[0]);
  const b = Number(nums[1]);
  if (!(a > 0) || !(b > 0)) return null;
  const unit = parseUnit(text) || guessUnit(a, b);
  const mm = toMm(a, b, unit);
  return { a, b, unit, mm };
}

/**
 * Map any cashier / sheet scribble onto a list value.
 * "2*2", "2x2", "600x600", "24x24" → "2x2 ft"
 * "12*18", "12x18", "300x450", "1x1.5 ft" → "12x18 in"
 * Unknown → "" (caller may keep the raw string as a one-off).
 */
export function normalizeTileSize(raw) {
  if (raw == null) return "";
  const original = String(raw).trim();
  if (!original) return "";

  const compact = compactKey(original);
  if (ALIAS_INDEX.has(compact)) return ALIAS_INDEX.get(compact).value;

  const exact = VALUE_INDEX.get(original.toLowerCase().replace(/×/g, "x").replace(/\s+/g, " "));
  if (exact) return exact.value;

  for (const s of loadCustomTileSizes()) {
    if (compactKey(s.value) === compact) return s.value;
    if (`${s.mm[0]}x${s.mm[1]}` === compact || `${s.mm[1]}x${s.mm[0]}` === compact) return s.value;
  }

  const dims = parseTileDims(original);
  if (!dims) return "";
  return matchMm(dims.mm[0], dims.mm[1]);
}

/** Display label: canonical list value, or the original if it is a one-off. */
export function formatTileSize(raw) {
  if (!raw) return "";
  return normalizeTileSize(raw) || String(raw).trim();
}

export function isKnownTileSize(raw) {
  return !!normalizeTileSize(raw);
}

/** If the typed query is a real size not in the list, return an entry to add. */
export function proposeCustomTileSize(query) {
  const t = String(query || "").trim();
  if (!t) return null;
  if (normalizeTileSize(t)) return null;
  const dims = parseTileDims(t);
  if (!dims) return null;
  const value = `${formatDim(dims.a)}x${formatDim(dims.b)} ${dims.unit}`;
  if (normalizeTileSize(value)) return null;
  const mm = [Math.round(dims.mm[0]), Math.round(dims.mm[1])];
  return {
    value,
    mm,
    group: "Custom",
    option: `${formatDim(dims.a)}×${formatDim(dims.b)} ${dims.unit}  ·  ${mm[0]}×${mm[1]} mm`,
  };
}

export function filterTileSizes(query, sizes = allTileSizes()) {
  const t = String(query || "").trim();
  if (!t) return sizes;
  const mapped = normalizeTileSize(t);
  const nq = compactKey(t);
  return sizes.filter((s) => {
    if (mapped && s.value === mapped) return true;
    return compactKey(`${s.value} ${s.option} ${s.mm[0]}x${s.mm[1]} ${s.group}`).includes(nq);
  });
}

/** Convert a stored size to inches for sq-ft math. */
export function tileSizeToInches(raw) {
  const known = allTileSizes().find((s) => s.value === normalizeTileSize(raw) || s.value === String(raw || "").trim());
  let mm = known?.mm;
  if (!mm) {
    const dims = parseTileDims(raw);
    if (dims) mm = dims.mm;
  }
  if (!mm) return { tileLenInch: 0, tileWidInch: 0 };
  return { tileLenInch: mm[0] / IN_MM, tileWidInch: mm[1] / IN_MM };
}

export const TILE_SIZE_PROMPT_VALUES = TILE_SIZES.map((s) => s.value).join(", ");
