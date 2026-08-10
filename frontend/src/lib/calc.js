// Core business math: GST, e-way bill, sq-ft calculator (area or L×W, box+pieces),
// money-in-words, formatting, and per-item amount (boxes + loose pieces).
export const GST_DEFAULT = 18;
export const GST_SLABS = [0, 5, 12, 18, 28, 40];
export const EWAY_THRESHOLD = 50000;

export function money(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

// Amount for a line item that may be boxes (qty) + loose pieces.
export function itemAmount(it) {
  const rate = Number(it.rate) || 0;
  const qty = Number(it.qty) || 0;
  const ppb = Number(it.piecesPerBox) || 1;
  const pieces = Number(it.pieces) || 0;
  const piecePrice = it.unit === "box" && ppb ? rate / ppb : rate;
  return round2(qty * rate + pieces * piecePrice);
}

// Breakdown a (possibly fractional) box quantity into whole boxes + loose pieces.
export function piecesBreakdown(qtyBoxes, piecesPerBox) {
  const ppb = Number(piecesPerBox) || 1;
  const totalPieces = Math.round((Number(qtyBoxes) || 0) * ppb);
  const boxes = Math.floor(totalPieces / ppb);
  const loose = totalPieces - boxes * ppb;
  return { totalPieces, boxes, loose, ppb };
}

export function numberToWordsINR(amount) {
  const num = Math.floor(Number(amount) || 0);
  if (num === 0) return "Zero Rupees Only";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (n) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : ""));
  const three = (n) => { const h = Math.floor(n / 100); const r = n % 100; return (h ? a[h] + " Hundred" + (r ? " " : "") : "") + (r ? two(r) : ""); };
  let n = num, w = "";
  const cr = Math.floor(n / 10000000); n %= 10000000;
  const la = Math.floor(n / 100000); n %= 100000;
  const th = Math.floor(n / 1000); n %= 1000;
  if (cr) w += three(cr) + " Crore ";
  if (la) w += two(la) + " Lakh ";
  if (th) w += two(th) + " Thousand ";
  if (n) w += three(n) + " ";
  return w.trim() + " Rupees Only";
}

// Sq-ft calculator: accepts a direct area OR length×width; returns tiles, boxes + loose pieces, price.
export function sqftCalc({ roomArea, roomLengthFt, roomWidthFt, tileLenInch, tileWidInch, piecesPerBox, ratePerBox, wastagePct = 5 }) {
  const area = roomArea && Number(roomArea) > 0 ? Number(roomArea) : (Number(roomLengthFt) || 0) * (Number(roomWidthFt) || 0);
  const tileArea = ((Number(tileLenInch) || 0) / 12) * ((Number(tileWidInch) || 0) / 12);
  if (!area || !tileArea) return { roomArea: round2(area || 0), tileArea: round2(tileArea || 0), tilesNeeded: 0, boxesNeeded: 0, loosePieces: 0, ppb: Number(piecesPerBox) || 1, price: 0 };
  const withW = area * (1 + (Number(wastagePct) || 0) / 100);
  const tilesNeeded = Math.ceil(withW / tileArea);
  const ppb = Number(piecesPerBox) || 1;
  const boxesNeeded = Math.floor(tilesNeeded / ppb);
  const loosePieces = tilesNeeded - boxesNeeded * ppb;
  const piecePrice = ratePerBox && ppb ? Number(ratePerBox) / ppb : 0;
  const price = round2(boxesNeeded * (Number(ratePerBox) || 0) + loosePieces * piecePrice);
  return { roomArea: round2(area), tileArea: round2(tileArea), tilesNeeded, boxesNeeded, loosePieces, ppb, price };
}

export function genInvoiceNo(seq, gstEnabled, prefix) {
  const yr = new Date().getFullYear();
  const nn = String(seq).padStart(4, "0");
  const p = prefix || (gstEnabled ? "GST" : "INV");
  return `${p}${yr}${nn}`;
}

export function computeBillTotals(draft) {
  const items = draft.items || [];
  const subtotal = round2(items.reduce((s, it) => s + itemAmount(it), 0));
  let discountOff = 0;
  if (draft.discount && Number(draft.discount.value) > 0) {
    discountOff = draft.discount.type === "percent" ? round2(subtotal * (Number(draft.discount.value) / 100)) : round2(Number(draft.discount.value));
  }
  const taxable = round2(subtotal - discountOff);
  const gstRate = draft.gstEnabled ? (Number(draft.gstRate) || GST_DEFAULT) : 0;
  const gstAmount = round2(taxable * (gstRate / 100));
  const grandTotal = round2(taxable + gstAmount);
  const payments = draft.payments || [];
  const amountPaid = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const amountPending = round2(grandTotal - amountPaid);
  const ewayRequired = grandTotal >= EWAY_THRESHOLD;
  let paymentStatus = "paid";
  if (amountPending > 0.5 && amountPaid > 0.5) paymentStatus = "partial";
  else if (amountPending > 0.5) paymentStatus = "pending";
  return { subtotal, discountOff, taxable, gstRate, gstAmount, grandTotal, amountPaid, amountPending, ewayRequired, paymentStatus };
}

export function todayISO() { return new Date().toISOString(); }
export function fmtDate(iso) { try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return iso; } }
