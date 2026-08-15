import { round2 } from "./calc";

/** Local calendar day match (same as dashboard filters). */
export function sameLocalDay(iso, day = new Date()) {
  return new Date(iso).toDateString() === day.toDateString();
}

/** Cash leaving the drawer for a return (uses settlementDetail after edits). */
export function returnCashOut(ret) {
  const detail = ret?.settlementDetail;
  if (detail && typeof detail.cash === "number") return round2(detail.cash || 0);
  if ((ret?.settlement || "") === "cash") return round2(Number(ret.refundTotal) || Number(ret.grandTotal) || 0);
  return 0;
}

export function returnRefundAmount(ret) {
  return round2(Number(ret?.refundTotal) || Number(ret?.grandTotal) || 0);
}

/** Settlement used for day-book display (handles legacy docs). */
export function returnSettlementMode(ret) {
  const mode = (ret?.settlement || "").trim();
  if (mode === "adjust_udhari" || mode === "store_credit" || mode === "cash") return mode;
  const detail = ret?.settlementDetail;
  if (detail && Number(detail.storeCredit) > 0.01) return "store_credit";
  if (detail && Number(detail.udhariAdjusted) > 0.01) return "adjust_udhari";
  if (detail && Number(detail.cash) > 0.01) return "cash";
  return "cash";
}

/**
 * How this return should appear on a given calendar day.
 * - Conversion day (settlementConvertedAt): show current settlement (cash / udhari).
 * - Original create day after a later conversion: keep showing store_credit so
 *   history does not rewrite into a cash refund.
 * - Otherwise: current settlement on create day only.
 * Returns null when the return does not belong on that day.
 */
export function returnModeForDay(ret, day = new Date()) {
  if (!ret || ret.type !== "return") return null;
  const convertedAt = ret.settlementConvertedAt;
  const createdOnDay = sameLocalDay(ret.date, day);
  const convertedOnDay = !!(convertedAt && sameLocalDay(convertedAt, day));
  const mode = returnSettlementMode(ret);

  if (convertedOnDay) return mode;
  if (!createdOnDay) return null;
  // Created today but later converted away from store credit — original day stays credit.
  if (convertedAt && mode !== "store_credit") return "store_credit";
  return mode;
}

/**
 * Sales Details row for a return (optional mode override for day-aware display).
 */
export function returnDaybookRow(ret, modeOverride) {
  const name = ret?.customerName || "Walk-in";
  const mode = modeOverride || returnSettlementMode(ret);
  if (mode === "adjust_udhari") {
    return { customerName: `${name} (against udhari)`, grandTotal: 0 };
  }
  if (mode === "store_credit") {
    return { customerName: `${name} (store credit)`, grandTotal: 0 };
  }
  return { customerName: `${name} (cash refund)`, grandTotal: -returnRefundAmount(ret) };
}

/** Only cash returns reduce Net Sales in the day-book (matches Sales Details amounts). */
export function returnAmountAffectingSales(ret, modeOverride) {
  const mode = modeOverride || returnSettlementMode(ret);
  return mode === "cash" ? returnRefundAmount(ret) : 0;
}

const MONEY_IN_MODES = new Set(["cash", "online"]);

/** Skip ledger/synthetic modes that are not drawer collections. */
function isMoneyInPayment(p) {
  const mode = (p?.mode || "").toLowerCase();
  return MONEY_IN_MODES.has(mode);
}

/**
 * When a payment was received.
 * Prefer payment.date (Record Payment / new bills). Legacy bill-time payments
 * without a date fall back to the invoice date.
 */
function paymentReceivedAt(payment, invoice) {
  return payment?.date || invoice?.date;
}

/**
 * Day-book numbers that stay in sync with Sales Details + today's collections.
 *
 * - Net Sales / Kamayi = today's sales − today's returns (= Sales Details sum)
 * - Cash / Online Collected = all cash/online payments received today
 *   (new bills + udhari collections on older bills), minus cash refunds
 * - Udhari Collected Today = cash+online received today against bills not created today
 * - Converted store-credit → cash counts on settlementConvertedAt day
 */
export function buildDailyDaybook({ invoices = [], expenses = [], day = new Date() } = {}) {
  const todaySales = invoices.filter((i) => i.type === "sale" && sameLocalDay(i.date, day));
  const allSales = invoices.filter((i) => i.type === "sale");
  const todayExp = expenses.filter((e) => sameLocalDay(e.date, day));

  // Returns that belong on this day (create and/or conversion), with day-local mode.
  const todayReturnRows = [];
  for (const r of invoices) {
    if (r.type !== "return") continue;
    const mode = returnModeForDay(r, day);
    if (!mode) continue;
    todayReturnRows.push({ ret: r, mode });
  }

  const salesGross = round2(todaySales.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0));
  const returnsTotal = round2(
    todayReturnRows.reduce((s, { ret, mode }) => s + returnAmountAffectingSales(ret, mode), 0)
  );
  const salesRevenue = round2(salesGross - returnsTotal);

  let cashIn = 0;
  let onlineIn = 0;
  let udhariCollected = 0;

  for (const inv of allSales) {
    const billIsToday = sameLocalDay(inv.date, day);
    for (const p of inv.payments || []) {
      if (!isMoneyInPayment(p)) continue;
      if (!sameLocalDay(paymentReceivedAt(p, inv), day)) continue;
      const amt = Number(p.amount) || 0;
      if (p.mode === "cash") cashIn += amt;
      if (p.mode === "online") onlineIn += amt;
      // Collection against an older pending bill
      if (!billIsToday) udhariCollected += amt;
    }
  }

  cashIn = round2(cashIn);
  onlineIn = round2(onlineIn);
  udhariCollected = round2(udhariCollected);

  const cashRefunds = round2(
    todayReturnRows.reduce((s, { ret, mode }) => (
      mode === "cash" ? s + returnCashOut(ret) : s
    ), 0)
  );
  const cashCollected = round2(cashIn - cashRefunds);
  const onlineCollected = onlineIn;

  const udhariAdded = round2(todaySales.reduce((s, i) => s + (Number(i.amountPending) || 0), 0));
  const cashExpenses = round2(todayExp
    .filter((e) => (e.mode || "cash") === "cash")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const onlineExpenses = round2(todayExp
    .filter((e) => (e.mode || "") === "online")
    .reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const expensesTotal = round2(todayExp.reduce((s, e) => s + (Number(e.amount) || 0), 0));
  const netCash = round2(cashCollected - cashExpenses);
  const netOnline = round2(onlineCollected - onlineExpenses);

  const sales = [
    ...todaySales.map((i) => ({
      invoiceNo: i.invoiceNo,
      customerName: i.customerName || "Walk-in",
      grandTotal: Number(i.grandTotal) || 0,
      date: i.date,
    })),
    ...todayReturnRows.map(({ ret, mode }) => {
      const row = returnDaybookRow(ret, mode);
      return {
        invoiceNo: ret.invoiceNo,
        customerName: row.customerName,
        grandTotal: row.grandTotal,
        date: ret.settlementConvertedAt && sameLocalDay(ret.settlementConvertedAt, day)
          ? ret.settlementConvertedAt
          : ret.date,
      };
    }),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    stats: {
      salesRevenue,
      cashCollected,
      onlineCollected,
      udhariAdded,
      udhariCollected,
      expensesTotal,
      cashExpenses,
      onlineExpenses,
      netCash,
      netOnline,
    },
    sales,
    expenses: todayExp,
    salesGross,
    returnsTotal,
    todayCount: todaySales.length,
  };
}
