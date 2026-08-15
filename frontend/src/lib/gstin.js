/**
 * Indian GSTIN helpers — format + mod-36 checksum (offline).
 * This proves the number is structurally valid; it does NOT look up GSTN
 * to confirm the taxpayer is registered (that needs a GSP / portal API).
 */

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Valid Indian GST state / UT codes (01–38, plus a few special). */
const STATE_CODES = new Set([
  "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "26", "27", "28", "29", "30", "31",
  "32", "33", "34", "35", "36", "37", "38",
]);

export function normalizeGstin(raw) {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function checksumChar(first14) {
  let sum = 0;
  let factor = 1;
  for (let i = 0; i < 14; i++) {
    const code = ALPHABET.indexOf(first14[i]);
    if (code < 0) return null;
    const product = factor * code;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 1 ? 2 : 1;
  }
  return ALPHABET[(36 - (sum % 36)) % 36];
}

/**
 * @returns {{ ok: true, gstin: string } | { ok: false, error: string }}
 */
export function validateGstin(raw, { required = true } = {}) {
  const gstin = normalizeGstin(raw);
  if (!gstin) {
    if (required) return { ok: false, error: "GST enabled hai — GSTIN bharna zaroori hai" };
    return { ok: true, gstin: "" };
  }
  if (gstin.length !== 15) {
    return { ok: false, error: "GSTIN 15 characters ka hona chahiye" };
  }
  if (!GSTIN_RE.test(gstin)) {
    return { ok: false, error: "GSTIN format galat hai (state + PAN + entity + Z + check)" };
  }
  if (!STATE_CODES.has(gstin.slice(0, 2))) {
    return { ok: false, error: "GSTIN ka state code valid nahi hai" };
  }
  const expected = checksumChar(gstin.slice(0, 14));
  if (!expected || expected !== gstin[14]) {
    return { ok: false, error: "GSTIN check digit galat hai — number dobara check karein" };
  }
  return { ok: true, gstin };
}
