import { round2 } from "./calc";
import { returnSettlementMode, isBillTimePayment, paymentReceivedAt, isMoneyInMode, billTimeCashIn, activityPartyTitle } from "./daybook";
import { formatSettlementDetail, returnCashMoved, conversionTarget, conversionAmountForActivity, settlementAtReturnTime, udhariConvertEvidence } from "./settlement";

/** Invoices belonging to a party (id match, with name fallback for legacy bills). */
export function invoicesForCustomer(customer, invoices = []) {
  if (!customer) return [];
  const id = customer.id;
  const name = (customer.name || "").trim().toLowerCase();
  return invoices.filter((i) => {
    if (i.customerId && i.customerId === id) return true;
    if (!i.customerId && name && (i.customerName || "").trim().toLowerCase() === name) return true;
    return false;
  });
}

export function buildCustomerSummary(customer, invoices = []) {
  const mine = invoicesForCustomer(customer, invoices);
  const sales = mine.filter((i) => i.type === "sale");
  const returns = mine.filter((i) => i.type === "return");
  const totalSales = round2(sales.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0));
  const totalReturns = round2(
    returns.reduce((s, i) => s + (Number(i.refundTotal) || Number(i.grandTotal) || 0), 0)
  );
  const pendingBills = sales.filter((i) => (Number(i.amountPending) || 0) > 0.5);
  return {
    billCount: sales.length,
    returnCount: returns.length,
    totalSales,
    totalReturns,
    pendingBillCount: pendingBills.length,
    pendingTotal: round2(Number(customer?.totalPending) || 0),
    storeCredit: round2(Number(customer?.storeCredit) || 0),
  };
}

function summarizeBillPayments(payments, invoice) {
  const atBill = (payments || []).filter((p) => isBillTimePayment(p, invoice));
  const adjusts = (payments || []).filter((p) => (p.mode || "") === "return_adjust");
  const bits = [];
  if (atBill.length) {
    bits.push(
      atBill
        .map((p) => {
          const mode = p.mode === "online" ? "online" : p.mode === "credit" ? "credit" : "cash";
          return `${mode} ₹${round2(Number(p.amount) || 0).toLocaleString("en-IN")}`;
        })
        .join(" · ")
    );
  }
  if (adjusts.length) {
    bits.push(
      adjusts
        .map((p) => {
          const retNo = p.returnInvoiceNo ? ` ${p.returnInvoiceNo}` : "";
          return `return adjust${retNo} ₹${round2(Number(p.amount) || 0).toLocaleString("en-IN")}`;
        })
        .join(" · ")
    );
  }
  return bits.join(" · ");
}

const SETTLE_LABELS = {
  cash: "Cash refund",
  adjust_udhari: "Udhari adjust",
  store_credit: "Store credit",
};

/** Human-readable payment line for the activity feed. */
export function describePayment(payment, invoice) {
  const mode = payment?.mode || "cash";
  const invoiceNo = invoice?.invoiceNo || "";
  const amt = round2(Number(payment?.amount) || 0);
  if (mode === "return_adjust") {
    const retNo = payment.returnInvoiceNo || "return";
    return {
      kind: "payment",
      title: "Return se udhari adjust",
      detail: `${retNo} · bill ${invoiceNo}`,
      amount: amt,
      sign: "",
      mode,
      invoiceNo,
      returnInvoiceNo: payment.returnInvoiceNo,
    };
  }
  if (mode === "credit") {
    return {
      kind: "payment",
      title: "Store credit use",
      detail: `Bill ${invoiceNo}`,
      amount: amt,
      sign: "",
      mode,
      invoiceNo,
    };
  }
  const atBill = isBillTimePayment(payment, invoice);
  const label = mode === "online" ? "online" : "cash";
  if (atBill) {
    return {
      kind: "payment",
      title: `Bill par ${label}`,
      detail: invoiceNo,
      amount: amt,
      sign: "+",
      mode,
      invoiceNo,
    };
  }
  return {
    kind: "payment",
    title: `Udhari vusool · ${label}`,
    detail: `Bill ${invoiceNo}`,
    amount: amt,
    sign: "+",
    mode,
    invoiceNo,
    pdfKind: "udhari-vusool",
  };
}

function vusoolGroupKey(payment, invoice) {
  const mode = (payment?.mode || "cash").toLowerCase();
  const stamp = String(paymentReceivedAt(payment, invoice) || "").slice(0, 19);
  return `${mode}|${stamp}`;
}

/** Sorted activity feed: bills, returns, and every payment line with bill refs. */
export function buildCustomerActivity(customer, invoices = []) {
  const mine = invoicesForCustomer(customer, invoices);
  const events = [];
  const vusoolItems = [];

  for (const inv of mine) {
    if (inv.type === "sale") {
      const status = inv.paymentStatus || "pending";
      const billPay = summarizeBillPayments(inv.payments, inv);
      const detailParts = [
        `${inv.items?.length || 0} item${(inv.items?.length || 0) === 1 ? "" : "s"}`,
        status,
      ];
      if (billPay) detailParts.push(billPay);
      const cashIn = billTimeCashIn(inv.payments, inv);
      const pending = round2(Number(inv.amountPending) || 0);
      let amount = round2(Number(inv.grandTotal) || 0);
      let sign = "";
      let udhari = 0;
      let amountKind = "neutral";
      if (cashIn > 0.01) {
        amount = cashIn;
        sign = "+";
        udhari = pending;
        amountKind = "cash-in";
      } else if (pending > 0.5) {
        amount = pending;
        amountKind = "udhari";
      }
      events.push({
        kind: "sale",
        date: inv.date,
        id: `sale-${inv.id}`,
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        title: activityPartyTitle(customer?.name || inv.customerName),
        detail: detailParts.join(" · "),
        amount,
        sign,
        udhari,
        amountKind,
        paid: round2(Number(inv.amountPaid) || 0),
        pending,
        status,
        invoice: inv,
      });
      (inv.payments || []).forEach((p, pi) => {
        if (isBillTimePayment(p, inv)) return;
        if ((p.mode || "") === "return_adjust") return;
        if (isMoneyInMode(p.mode)) {
          vusoolItems.push({ p, inv, pi });
          return;
        }
        const desc = describePayment(p, inv);
        events.push({
          ...desc,
          date: paymentReceivedAt(p, inv),
          id: `pay-${inv.id}-${pi}-${p.mode}-${p.amount}`,
          invoiceId: inv.id,
          invoice: inv,
        });
      });
    } else if (inv.type === "return") {
      const settle = returnSettlementMode(inv);
      const sd = settlementAtReturnTime(inv);
      let detail = formatSettlementDetail(sd);
      if (!detail) {
        detail = SETTLE_LABELS[settle] || settle;
        const alloc = sd.invoiceAllocations || [];
        if (settle === "adjust_udhari" && alloc.length) {
          detail = alloc.map((a) => `${a.invoiceNo}: ₹${a.amount}`).join(" · ");
        }
      }
      if (inv.originalInvoiceNo) {
        detail = detail ? `${detail} · against ${inv.originalInvoiceNo}` : `against ${inv.originalInvoiceNo}`;
      }
      const cashMoved = returnCashMoved(sd);
      const refundAmt = round2(Number(inv.refundTotal) || Number(inv.grandTotal) || 0);
      events.push({
        kind: "return",
        date: inv.date,
        id: `ret-${inv.id}`,
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNo,
        title: activityPartyTitle(customer?.name || inv.customerName),
        detail,
        amount: cashMoved > 0.01 ? cashMoved : refundAmt,
        sign: cashMoved > 0.01 ? "−" : "",
        amountKind: cashMoved > 0.01 ? "cash-out" : "neutral",
        udhari: 0,
        pdfKind: "invoice",
        settlement: settle,
        originalInvoiceNo: inv.originalInvoiceNo,
        invoice: inv,
      });
      const evidence = udhariConvertEvidence(inv, mine);
      const convertedAmt = conversionAmountForActivity(inv, mine);
      const to = conversionTarget(inv) || (evidence.amount > 0.01 ? "adjust_udhari" : "cash");
      if (convertedAmt > 0.01 && (inv.settlementConvertedAt || evidence.amount > 0.01)) {
        const toUdhari = to === "adjust_udhari";
        const leftover = round2(Number(inv.settlementDetail?.storeCredit) || 0);
        const leftoverBit = leftover > 0.01
          ? ` · credit left ₹${leftover.toLocaleString("en-IN")}`
          : "";
        const billBit = evidence.bills.length
          ? ` · ${evidence.bills.map((b) => `${b.invoiceNo} ₹${b.amount.toLocaleString("en-IN")}`).join(" · ")}`
          : "";
        events.push({
          kind: "conversion",
          date: inv.settlementConvertedAt || evidence.date || inv.date,
          id: `conv-${inv.id}`,
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNo,
          title: activityPartyTitle(customer?.name || inv.customerName),
          detail: toUdhari
            ? `Store credit → udhari${billBit}${leftoverBit}`
            : `Store credit → cash${inv.originalInvoiceNo ? ` · against ${inv.originalInvoiceNo}` : ""}`,
          amount: convertedAmt,
          sign: toUdhari ? "" : "−",
          amountKind: toUdhari ? "neutral" : "cash-out",
          udhari: 0,
          pdfKind: "convert-receipt",
          convertedTo: to,
          settlement: to,
          originalInvoiceNo: inv.originalInvoiceNo,
          invoice: inv,
        });
      }
    }
  }

  // If a later bill has return_adjust but the return row didn't emit a convert
  // (booked udhari already equalled that ₹10k), still add the receipt.
  const haveConv = new Set(
    events.filter((e) => e.kind === "conversion").map((e) => e.invoiceNo)
  );
  for (const sale of mine) {
    if (sale.type !== "sale") continue;
    for (const p of sale.payments || []) {
      if ((p.mode || "") !== "return_adjust") continue;
      const retNo = (p.returnInvoiceNo || "").trim();
      if (!retNo || haveConv.has(retNo)) continue;
      const ret = mine.find((r) => r.type === "return" && (r.invoiceNo || "").trim() === retNo);
      const origNo = (ret?.originalInvoiceNo || "").trim();
      if (origNo && origNo === (sale.invoiceNo || "").trim()) continue;
      const amt = round2(Number(p.amount) || 0);
      if (amt < 0.01) continue;
      haveConv.add(retNo);
      events.push({
        kind: "conversion",
        date: p.date || sale.date,
        id: `conv-pay-${sale.id}-${retNo}`,
        invoiceId: ret?.id || sale.id,
        invoiceNo: retNo,
        title: activityPartyTitle(customer?.name || ret?.customerName || sale.customerName),
        detail: `Store credit → udhari · ${sale.invoiceNo} ₹${amt.toLocaleString("en-IN")}`,
        amount: amt,
        sign: "",
        amountKind: "neutral",
        udhari: 0,
        pdfKind: "convert-receipt",
        convertedTo: "adjust_udhari",
        settlement: "adjust_udhari",
        originalInvoiceNo: ret?.originalInvoiceNo,
        invoice: ret || sale,
      });
    }
  }

  const vusoolGroups = new Map();
  for (const item of vusoolItems) {
    const key = vusoolGroupKey(item.p, item.inv);
    if (!vusoolGroups.has(key)) vusoolGroups.set(key, []);
    vusoolGroups.get(key).push(item);
  }
  for (const [key, items] of vusoolGroups) {
    const amount = round2(items.reduce((s, it) => s + (Number(it.p.amount) || 0), 0));
    if (amount < 0.01) continue;
    const mode = (items[0].p.mode || "cash").toLowerCase();
    const label = mode === "online" ? "online" : "cash";
    const allocations = items.map((it) => ({
      invoiceId: it.inv.id,
      invoiceNo: it.inv.invoiceNo,
      amount: round2(Number(it.p.amount) || 0),
    }));
    const billBit = allocations
      .map((a) => `${a.invoiceNo} ₹${a.amount.toLocaleString("en-IN")}`)
      .join(" · ");
    events.push({
      kind: "payment",
      title: activityPartyTitle(customer?.name || items[0].inv.customerName),
      detail: `${label} · ${billBit}`,
      amount,
      sign: "+",
      amountKind: "cash-in",
      udhari: 0,
      pdfKind: "udhari-vusool",
      mode,
      invoiceNo: items.length === 1 ? items[0].inv.invoiceNo : "",
      allocations,
      remainingUdhari: round2(Number(customer?.totalPending) || 0),
      date: paymentReceivedAt(items[0].p, items[0].inv),
      id: `vusool-${key}-${items.map((it) => it.inv.id).join("-")}`,
      invoiceId: items[0].inv.id,
      invoice: items[0].inv,
    });
  }

  return events.sort((a, b) => new Date(b.date) - new Date(a.date));
}
