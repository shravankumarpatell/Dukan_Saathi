import { money, round2 } from "./calc";

/**
 * How a return was settled. Udhari / store credit are books entries (no ±).
 * Cash refund is money the shop actually handed over.
 */
export function settlementParts(detail) {
  const cash = round2(Number(detail?.cash) || 0);
  const udhari = round2(Number(detail?.udhariAdjusted) || 0);
  const credit = round2(Number(detail?.storeCredit) || 0);
  const parts = [];
  if (udhari > 0.01) parts.push({ key: "udhari", label: "Against udhari", amount: udhari, cashMove: 0 });
  if (credit > 0.01) parts.push({ key: "storeCredit", label: "Store credit", amount: credit, cashMove: 0 });
  if (cash > 0.01) parts.push({ key: "cash", label: "Cash refund", amount: cash, cashMove: -cash });
  return parts;
}

export function formatSettlementDetail(detail) {
  return settlementParts(detail)
    .map((p) => `${p.label} ${money(p.amount)}`)
    .join(" · ");
}

/** Cash the shop paid out on this return (0 if only udhari / store credit). */
export function returnCashMoved(detail) {
  return round2(Number(detail?.cash) || 0);
}

/** Store-credit slice moved on convert (cash or udhari). */
export function conversionTarget(inv) {
  const to = inv?.settlementConvertedTo;
  if (to === "cash" || to === "adjust_udhari") return to;
  if (!inv?.settlementConvertedAt) return null;
  const cash = round2(Number(inv?.settlementDetail?.cash) || 0);
  const credit = round2(Number(inv?.settlementDetail?.storeCredit) || 0);
  if (cash > 0.01 && credit < 0.01) return "cash";
  return "adjust_udhari";
}

export function conversionSlice(inv) {
  if (!inv?.settlementConvertedAt) return 0;
  const to = conversionTarget(inv);
  const stored = round2(Number(inv?.settlementConvertedAmount) || 0);
  const leftover = round2(Number(inv?.settlementDetail?.storeCredit) || 0);
  const cash = round2(Number(inv?.settlementDetail?.cash) || 0);

  if (to === "cash") {
    if (stored > 0.01) return stored;
    return cash;
  }

  // Udhari convert: recorded amount is what was absorbed (new). Older rows stored
  // the whole credit slice — peel leftover so the receipt is only the udhari cleared.
  if (stored > 0.01) {
    if (leftover > 0.01 && stored > leftover + 0.01) return round2(stored - leftover);
    if (leftover > 0.01 && Math.abs(stored - leftover) < 0.01) return 0;
    return stored;
  }
  return 0;
}

/** return_adjust lines on sales that were booked against this return. */
export function returnAdjustLines(returnInv, invoices = []) {
  const retNo = (returnInv?.invoiceNo || "").trim();
  if (!retNo) return [];
  const lines = [];
  for (const sale of invoices) {
    if ((sale?.type || "") !== "sale") continue;
    for (const p of sale.payments || []) {
      if ((p.mode || "") !== "return_adjust") continue;
      if ((p.returnInvoiceNo || "").trim() !== retNo) continue;
      lines.push({
        invoiceId: sale.id,
        invoiceNo: sale.invoiceNo,
        amount: round2(Number(p.amount) || 0),
        date: p.date || sale.date,
      });
    }
  }
  return lines;
}

/**
 * Store-credit → udhari convert that landed on a later bill.
 * Any return_adjust on a sale other than the original invoice is convert proof —
 * even when the return's booked udhari already equals that ₹10,000.
 */
export function udhariConvertEvidence(returnInv, invoices = []) {
  const lines = returnAdjustLines(returnInv, invoices);
  const origNo = (returnInv?.originalInvoiceNo || "").trim();
  const extraLines = origNo
    ? lines.filter((l) => (l.invoiceNo || "").trim() !== origNo)
    : [];
  let extra = round2(extraLines.reduce((s, l) => s + l.amount, 0));
  if (!origNo) {
    const payTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
    const booked = round2(Number(returnInv?.settlementDetail?.udhariAdjusted) || 0);
    extra = round2(Math.max(0, payTotal - booked));
  }
  const dated = [...extraLines].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return {
    amount: extra,
    bills: extraLines,
    date: dated[0]?.date || null,
  };
}

/** Amount to print on the convert receipt (stored slice, else inferred from bills). */
export function conversionAmountForActivity(inv, invoices = []) {
  const stored = conversionSlice(inv);
  const to = conversionTarget(inv);
  if (to === "cash") return stored;
  const evidence = udhariConvertEvidence(inv, invoices);
  return round2(Math.max(stored, evidence.amount));
}

/**
 * Settlement as it was on the original return day — before a later convert.
 * Convert receipts are a separate activity row; do not fold them into the return.
 */
export function settlementAtReturnTime(inv) {
  const sd = inv?.settlementDetail || {};
  const slice = conversionSlice(inv);
  if (!inv?.settlementConvertedAt || slice < 0.01) return sd;
  const to = conversionTarget(inv) || "cash";
  const cash = round2(Number(sd.cash) || 0);
  const udhari = round2(Number(sd.udhariAdjusted) || 0);
  const credit = round2(Number(sd.storeCredit) || 0);
  if (to === "cash") {
    return {
      ...sd,
      cash: round2(Math.max(0, cash - slice)),
      storeCredit: round2(credit + slice),
      udhariAdjusted: udhari,
    };
  }
  return {
    ...sd,
    cash,
    udhariAdjusted: round2(Math.max(0, udhari - slice)),
    storeCredit: round2(credit + slice),
  };
}

/**
 * Preview helper — same leftover split as backend allocate_return_across_invoices:
 * always clear original unpaid first, then FIFO other udhari when adjusting,
 * leftover becomes cash / store credit by mode.
 */
export function estimateReturnSettlementDetail({
  settlement,
  refund,
  originalPending = 0,
  totalPending = 0,
}) {
  let remaining = round2(refund);
  let udhari = 0;
  const orig = Math.min(remaining, Math.max(0, round2(originalPending)));
  udhari = round2(udhari + orig);
  remaining = round2(remaining - orig);
  if (settlement === "adjust_udhari" && remaining > 0) {
    const other = Math.max(0, round2(round2(totalPending) - round2(originalPending)));
    const extra = Math.min(remaining, other);
    udhari = round2(udhari + extra);
    remaining = round2(remaining - extra);
  }
  const detail = { cash: 0, udhariAdjusted: udhari, storeCredit: 0, invoiceAllocations: [] };
  if (settlement === "cash") detail.cash = remaining;
  else detail.storeCredit = remaining;
  return detail;
}
