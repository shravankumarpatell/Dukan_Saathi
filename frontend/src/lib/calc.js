// Core business math: GST, e-way bill, sq-ft tile calculator, money-in-words, formatting.
// Rates verified June 2026: ceramic tiles & sanitaryware => 18% GST (HSN 6907/6908/6910).
// E-way bill threshold => Rs 50,000 consignment value (inter-state; most states same intra-state).

export const GST_DEFAULT = 18;
export const GST_SLABS = [0, 5, 12, 18, 28, 40];
export const EWAY_THRESHOLD = 50000;

export function money(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Indian numbering system amount-to-words (Rupees only).
export function numberToWordsINR(amount) {
  const num = Math.floor(Number(amount) || 0);
  if (num === 0) return "Zero Rupees Only";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const twoDigits = (n) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : ""));
  const threeDigits = (n) => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h ? a[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
  };
  let n = num;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;
  let words = "";
  if (crore) words += threeDigits(crore) + " Crore ";
  if (lakh) words += twoDigits(lakh) + " Lakh ";
  if (thousand) words += twoDigits(thousand) + " Thousand ";
  if (hundred) words += threeDigits(hundred) + " ";
  return words.trim() + " Rupees Only";
}

// Sq-ft calculator: given a room area and a tile size, work out tiles/boxes/price.
export function sqftCalc({ roomLengthFt, roomWidthFt, tileLenInch, tileWidInch, piecesPerBox, ratePerBox, wastagePct = 5 }) {
  const roomArea = (Number(roomLengthFt) || 0) * (Number(roomWidthFt) || 0); // sq-ft
  const tileArea = ((Number(tileLenInch) || 0) / 12) * ((Number(tileWidInch) || 0) / 12); // sq-ft per tile
  if (!roomArea || !tileArea) {
    return { roomArea, tileArea, tilesNeeded: 0, boxesNeeded: 0, ppb: piecesPerBox, price: 0 };
  }
  const withWastage = roomArea * (1 + (Number(wastagePct) || 0) / 100);
  const tilesNeeded = Math.ceil(withWastage / tileArea);
  const ppb = Number(piecesPerBox) || 1;
  const boxesNeeded = Math.ceil(tilesNeeded / ppb);
  const price = round2(boxesNeeded * (Number(ratePerBox) || 0));
  return { roomArea: round2(roomArea), tileArea: round2(tileArea), tilesNeeded, boxesNeeded, ppb, price };
}

export function genInvoiceNo(seq, gstEnabled) {
  const yr = new Date().getFullYear();
  const nn = String(seq).padStart(4, "0");
  return `${gstEnabled ? "GST" : "INV"}/${yr}/${nn}`;
}

// Compute all bill totals from a draft (items, discount, gst, payments).
export function computeBillTotals(draft) {
  const items = draft.items || [];
  const subtotal = round2(items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0));
  let discountOff = 0;
  if (draft.discount && Number(draft.discount.value) > 0) {
    discountOff = draft.discount.type === "percent"
      ? round2(subtotal * (Number(draft.discount.value) / 100))
      : round2(Number(draft.discount.value));
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

export function todayISO() {
  return new Date().toISOString();
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
