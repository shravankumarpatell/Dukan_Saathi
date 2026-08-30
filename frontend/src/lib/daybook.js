import { round2 } from "./calc";
import {
  conversionAmountForActivity,
  conversionTarget,
  returnCashMoved,
  settlementAtReturnTime,
  udhariConvertEvidence,
} from "./settlement";

/** Local calendar day match (same as dashboard filters). */
export function sameLocalDay(iso, day = new Date()) {
  return new Date(iso).toDateString() === day.toDateString();
}

export function activityPartyTitle(name) {
  const n = String(name || "").trim();
  return n || "Walk-in";
}

export function activityExpenseTitle(note) {
  const n = String(note || "").trim();
  return n || "Kharcha";
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
  const cash = mode === "cash" ? returnCashOut(ret) : 0;
  const udhari = Number(ret?.settlementDetail?.udhariAdjusted) || 0;
  const credit = Number(ret?.settlementDetail?.storeCredit) || 0;
  if (mode === "cash") {
    const tag = udhari > 0.01 ? "against udhari + cash refund" : "cash refund";
    return { customerName: `${name} (${tag})`, grandTotal: -cash };
  }
  if (mode === "adjust_udhari") {
    const tag = credit > 0.01 ? "against udhari + store credit" : "against udhari";
    return { customerName: `${name} (${tag})`, grandTotal: 0 };
  }
  if (mode === "store_credit") {
    return { customerName: `${name} (store credit)`, grandTotal: 0 };
  }
  return { customerName: `${name} (cash refund)`, grandTotal: -cash };
}

/** Only cash leaving the drawer reduces Net Sales (not udhari / store credit). */
export function returnAmountAffectingSales(ret, modeOverride) {
  const mode = modeOverride || returnSettlementMode(ret);
  return mode === "cash" ? returnCashOut(ret) : 0;
}

const MONEY_IN_MODES = new Set(["cash", "online"]);

/** Skip ledger/synthetic modes that are not drawer collections. */
export function isMoneyInMode(mode) {
  const m = (mode || "cash").toLowerCase();
  return MONEY_IN_MODES.has(m);
}

function isMoneyInPayment(p) {
  return isMoneyInMode(p?.mode);
}

/**
 * When a payment was received.
 * Prefer payment.date (Record Payment / new bills). Legacy bill-time payments
 * without a date fall back to the invoice date.
 */
export function paymentReceivedAt(payment, invoice) {
  return payment?.date || invoice?.date;
}

/** Cash/online taken at bill checkout — folded into the bill, not vusool. */
export function isBillTimePayment(payment, invoice) {
  const mode = payment?.mode || "cash";
  if (mode === "return_adjust") return false;
  const payAt = paymentReceivedAt(payment, invoice);
  const invAt = invoice?.date;
  if (!sameLocalDay(payAt, new Date(invAt))) return false;
  const gap = Math.abs(new Date(payAt).getTime() - new Date(invAt).getTime());
  if (!Number.isFinite(gap)) return true;
  return gap <= 5 * 60 * 1000;
}

/** Cash + online the shop actually received when the bill was made. */
export function billTimeCashIn(payments, invoice) {
  return round2(
    (payments || [])
      .filter((p) => isBillTimePayment(p, invoice) && isMoneyInMode(p.mode))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  );
}

function billTimeByMode(payments, invoice, mode) {
  return round2(
    (payments || [])
      .filter((p) => isBillTimePayment(p, invoice) && (p.mode || "cash") === mode)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  );
}

function vusoolGroupKey(payment, invoice) {
  const mode = (payment?.mode || "cash").toLowerCase();
  const stamp = String(paymentReceivedAt(payment, invoice) || "").slice(0, 19);
  return `${mode}|${stamp}`;
}

function rupeeBit(label, amount) {
  return `${label} ${round2(amount).toLocaleString("en-IN")}`;
}

/**
 * Day-book numbers that stay in sync with today's collections.
 *
 * - Net Sales / Kamayi = today's sales − cash refunds that hit this day
 * - Cash / Online Collected = all cash/online received today (bills + vusool), minus cash refunds
 * - Udhari vusool = later cash/online (not checkout), including same-day Record Payment
 * - Credit convert listed separately; cash convert still hits Cash Collected
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
  const vusoolItems = [];

  for (const inv of allSales) {
    for (const p of inv.payments || []) {
      if (!isMoneyInPayment(p)) continue;
      if (!sameLocalDay(paymentReceivedAt(p, inv), day)) continue;
      const amt = Number(p.amount) || 0;
      if ((p.mode || "cash") === "cash") cashIn += amt;
      if (p.mode === "online") onlineIn += amt;
      if (!isBillTimePayment(p, inv)) {
        udhariCollected += amt;
        vusoolItems.push({ p, inv });
      }
    }
  }

  cashIn = round2(cashIn);
  onlineIn = round2(onlineIn);
  udhariCollected = round2(udhariCollected);

  const vusoolGroups = new Map();
  for (const item of vusoolItems) {
    const key = vusoolGroupKey(item.p, item.inv);
    if (!vusoolGroups.has(key)) vusoolGroups.set(key, []);
    vusoolGroups.get(key).push(item);
  }
  const vusool = [...vusoolGroups.values()].map((items) => {
    const amount = round2(items.reduce((s, it) => s + (Number(it.p.amount) || 0), 0));
    const mode = (items[0].p.mode || "cash").toLowerCase() === "online" ? "online" : "cash";
    const against = items
      .map((it) => `${it.inv.invoiceNo || "Bill"} ${round2(Number(it.p.amount) || 0).toLocaleString("en-IN")}`)
      .join(" · ");
    return {
      date: paymentReceivedAt(items[0].p, items[0].inv),
      customerName: items[0].inv.customerName || "Walk-in",
      customerId: items[0].inv.customerId,
      invoiceNo: items.length === 1 ? (items[0].inv.invoiceNo || "") : "",
      mode,
      amount,
      detail: `${mode} · ${against}`,
      allocations: items.map((it) => ({
        invoiceId: it.inv.id,
        invoiceNo: it.inv.invoiceNo,
        amount: round2(Number(it.p.amount) || 0),
      })),
    };
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

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

  const bills = todaySales.map((i) => {
    const cash = billTimeByMode(i.payments, i, "cash");
    const online = billTimeByMode(i.payments, i, "online");
    const pending = round2(Number(i.amountPending) || 0);
    const bits = [];
    if (cash > 0.01) bits.push(rupeeBit("cash", cash));
    if (online > 0.01) bits.push(rupeeBit("online", online));
    if (pending > 0.5) bits.push(rupeeBit("udhari left", pending));
    return {
      id: i.id,
      date: i.date,
      invoiceNo: i.invoiceNo,
      customerName: i.customerName || "Walk-in",
      customerId: i.customerId,
      grandTotal: round2(Number(i.grandTotal) || 0),
      cash,
      online,
      pending,
      detail: bits.join(" · ") || "udhari",
    };
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  const returns = invoices
    .filter((r) => r.type === "return" && sameLocalDay(r.date, day))
    .map((ret) => {
      const sd = settlementAtReturnTime(ret);
      const cashOut = returnCashMoved(sd);
      const udhari = round2(Number(sd.udhariAdjusted) || 0);
      const credit = round2(Number(sd.storeCredit) || 0);
      const bits = [];
      if (udhari > 0.01) bits.push(rupeeBit("Against udhari", udhari));
      if (credit > 0.01) bits.push(rupeeBit("Store credit", credit));
      if (cashOut > 0.01) bits.push(rupeeBit("Cash refund", cashOut));
      let detail = bits.join(" · ");
      if (!detail) {
        if (cashOut > 0.01) detail = "cash refund";
        else if (udhari > 0.01) detail = "against udhari";
        else detail = "store credit";
      }
      if (ret.originalInvoiceNo) {
        detail = `${detail} · against ${ret.originalInvoiceNo}`;
      }
      return {
        id: ret.id,
        date: ret.date,
        invoiceNo: ret.invoiceNo,
        customerName: ret.customerName || "Walk-in",
        customerId: ret.customerId,
        amount: cashOut > 0.01 ? round2(-cashOut) : 0,
        detail,
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const converts = [];
  for (const ret of invoices) {
    if (ret.type !== "return") continue;
    const evidence = udhariConvertEvidence(ret, invoices);
    const convertedAmt = conversionAmountForActivity(ret, invoices);
    const to = conversionTarget(ret) || (evidence.amount > 0.01 ? "adjust_udhari" : "cash");
    const when = ret.settlementConvertedAt || evidence.date;
    if (convertedAmt < 0.01 || !when || !sameLocalDay(when, day)) continue;
    const toUdhari = to === "adjust_udhari";
    const leftover = round2(Number(ret.settlementDetail?.storeCredit) || 0);
    const leftoverBit = leftover > 0.01 ? ` · credit left ${leftover.toLocaleString("en-IN")}` : "";
    const billBit = evidence.bills.length
      ? ` · ${evidence.bills.map((b) => `${b.invoiceNo} ${b.amount.toLocaleString("en-IN")}`).join(" · ")}`
      : "";
    converts.push({
      id: ret.id,
      date: when,
      invoiceNo: ret.invoiceNo,
      customerName: ret.customerName || "Walk-in",
      customerId: ret.customerId,
      amount: toUdhari ? convertedAmt : round2(-convertedAmt),
      target: to,
      detail: toUdhari
        ? `Store credit -> udhari${billBit}${leftoverBit}`
        : `Store credit -> cash${ret.originalInvoiceNo ? ` · against ${ret.originalInvoiceNo}` : ""}`,
    });
  }
  converts.sort((a, b) => new Date(a.date) - new Date(b.date));

  const convertCash = round2(
    converts.filter((c) => c.target === "cash").reduce((s, c) => s + Math.abs(Number(c.amount) || 0), 0)
  );
  const convertUdhari = round2(
    converts.filter((c) => c.target === "adjust_udhari").reduce((s, c) => s + Math.abs(Number(c.amount) || 0), 0)
  );

  // Legacy combined list (bills + day-aware returns) for older PDF callers.
  const sales = [
    ...bills.map((i) => ({
      invoiceNo: i.invoiceNo,
      customerName: i.customerName,
      grandTotal: i.grandTotal,
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
      salesGross,
      salesRevenue,
      cashIn,
      onlineIn,
      cashCollected,
      onlineCollected,
      udhariAdded,
      udhariCollected,
      convertCash,
      convertUdhari,
      expensesTotal,
      cashExpenses,
      onlineExpenses,
      netCash,
      netOnline,
    },
    sales,
    bills,
    returns,
    vusool,
    converts,
    expenses: todayExp,
    salesGross,
    returnsTotal,
    todayCount: todaySales.length,
  };
}

/** Chronological shop activity for one day — same shape as customer activity rows. */
export function buildDayActivity(daybook) {
  const events = [];
  for (const b of daybook?.bills || []) {
    const cashIn = round2((Number(b.cash) || 0) + (Number(b.online) || 0));
    const pending = round2(Number(b.pending) || 0);
    let amount = round2(Number(b.grandTotal) || 0);
    let sign = "";
    let amountKind = "neutral";
    let udhari = 0;
    if (cashIn > 0.01) {
      amount = cashIn;
      sign = "+";
      amountKind = "cash-in";
      udhari = pending;
    } else if (pending > 0.5) {
      amount = pending;
      amountKind = "udhari";
    }
    events.push({
      kind: "sale",
      id: `day-bill-${b.invoiceNo}-${b.date}`,
      date: b.date,
      invoiceId: b.id,
      invoiceNo: b.invoiceNo,
      customerId: b.customerId,
      customerName: b.customerName,
      title: activityPartyTitle(b.customerName),
      detail: b.detail || "",
      amount,
      sign,
      amountKind,
      udhari,
      pdfKind: "invoice",
    });
  }
  for (const r of daybook?.returns || []) {
    const amt = round2(Number(r.amount) || 0);
    const cashOut = amt < -0.01;
    events.push({
      kind: "return",
      id: `day-ret-${r.invoiceNo}-${r.date}`,
      date: r.date,
      invoiceId: r.id,
      invoiceNo: r.invoiceNo,
      customerId: r.customerId,
      customerName: r.customerName,
      title: activityPartyTitle(r.customerName),
      detail: r.detail || "",
      amount: cashOut ? Math.abs(amt) : amt,
      sign: cashOut ? "−" : "",
      amountKind: cashOut ? "cash-out" : "neutral",
      udhari: 0,
      pdfKind: "invoice",
    });
  }
  for (const v of daybook?.vusool || []) {
    events.push({
      kind: "payment",
      id: `day-vusool-${v.invoiceNo}-${v.date}-${v.amount}`,
      date: v.date,
      invoiceNo: v.invoiceNo,
      customerId: v.customerId,
      customerName: v.customerName,
      title: activityPartyTitle(v.customerName),
      detail: v.detail || "",
      amount: round2(Number(v.amount) || 0),
      sign: "+",
      amountKind: "cash-in",
      mode: v.mode,
      udhari: 0,
      pdfKind: "udhari-vusool",
      allocations: v.allocations || [],
    });
  }
  for (const c of daybook?.converts || []) {
    const amt = round2(Number(c.amount) || 0);
    const cashOut = amt < -0.01;
    events.push({
      kind: "conversion",
      id: `day-conv-${c.invoiceNo}-${c.date}`,
      date: c.date,
      invoiceId: c.id,
      invoiceNo: c.invoiceNo,
      customerId: c.customerId,
      customerName: c.customerName,
      title: activityPartyTitle(c.customerName),
      detail: c.detail || "",
      amount: Math.abs(amt),
      sign: cashOut ? "−" : "",
      amountKind: cashOut ? "cash-out" : "neutral",
      udhari: 0,
      pdfKind: "convert-receipt",
      convertedTo: c.target,
    });
  }
  for (const e of daybook?.expenses || []) {
    events.push({
      kind: "expense",
      id: `day-exp-${e.date}-${e.note}-${e.amount}`,
      date: e.date,
      invoiceNo: "",
      title: activityExpenseTitle(e.note),
      detail: e.mode || "",
      amount: round2(Number(e.amount) || 0),
      sign: "−",
      amountKind: "cash-out",
      udhari: 0,
    });
  }
  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
}
