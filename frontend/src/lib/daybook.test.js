import { buildDailyDaybook, buildDayActivity } from "./daybook";

const at = (ymd, h, m) => {
  const [y, mo, d] = ymd.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m, 0).toISOString();
};

test("same-day Record Payment counts as udhari vusool, not bill cash", () => {
  const billAt = at("2026-08-29", 2, 59);
  const vusoolAt = at("2026-08-29", 3, 53);
  const day = new Date(2026, 7, 29, 12, 0, 0);
  const db = buildDailyDaybook({
    day,
    invoices: [{
      type: "sale",
      invoiceNo: "INV20260018",
      customerName: "azad",
      date: billAt,
      grandTotal: 1000000,
      amountPending: 900000,
      payments: [
        { mode: "cash", amount: 3202, date: billAt },
        { mode: "online", amount: 10210, date: billAt },
        { mode: "cash", amount: 86588, date: vusoolAt },
      ],
    }],
  });
  expect(db.stats.udhariCollected).toBe(86588);
  expect(db.vusool).toHaveLength(1);
  expect(db.vusool[0].amount).toBe(86588);
  expect(db.vusool[0].detail).toContain("INV20260018");
  expect(db.stats.salesGross).toBe(1000000);
  expect(db.bills[0].cash).toBe(3202);
  expect(db.bills[0].online).toBe(10210);
  expect(db.bills[0].grandTotal).toBe(1000000);
});

test("checkout cash on today's bill is not vusool", () => {
  const billAt = at("2026-08-29", 10, 0);
  const day = new Date(2026, 7, 29, 12, 0, 0);
  const db = buildDailyDaybook({
    day,
    invoices: [{
      type: "sale",
      invoiceNo: "GST1",
      customerName: "A",
      date: billAt,
      grandTotal: 1000,
      amountPending: 0,
      payments: [{ mode: "cash", amount: 1000, date: billAt }],
    }],
  });
  expect(db.stats.udhariCollected).toBe(0);
  expect(db.vusool).toHaveLength(0);
  expect(db.stats.cashCollected).toBe(1000);
});

test("collection against an older bill is still vusool", () => {
  const oldBill = at("2026-08-20", 10, 0);
  const payAt = at("2026-08-29", 11, 0);
  const day = new Date(2026, 7, 29, 12, 0, 0);
  const db = buildDailyDaybook({
    day,
    invoices: [{
      type: "sale",
      invoiceNo: "OLD1",
      customerName: "B",
      date: oldBill,
      grandTotal: 500,
      amountPending: 200,
      payments: [
        { mode: "cash", amount: 200, date: oldBill },
        { mode: "cash", amount: 300, date: payAt },
      ],
    }],
  });
  expect(db.stats.udhariCollected).toBe(300);
  expect(db.bills).toHaveLength(0);
  expect(db.vusool[0].amount).toBe(300);
});

test("daily summary splits bills, returns, and credit convert", () => {
  const t = at("2026-08-29", 10, 0);
  const convAt = at("2026-08-29", 11, 0);
  const day = new Date(2026, 7, 29, 12, 0, 0);
  const db = buildDailyDaybook({
    day,
    invoices: [
      {
        type: "sale",
        invoiceNo: "INV1",
        customerName: "azad",
        date: t,
        grandTotal: 20000,
        amountPending: 0,
        payments: [
          { mode: "cash", amount: 10000, date: t },
          { mode: "return_adjust", amount: 10000, returnInvoiceNo: "RET1", date: convAt },
        ],
      },
      {
        type: "return",
        invoiceNo: "RET1",
        customerName: "azad",
        date: t,
        originalInvoiceNo: "OLD",
        refundTotal: 10000,
        settlement: "adjust_udhari",
        settlementDetail: { cash: 0, udhariAdjusted: 10000, storeCredit: 0 },
        settlementConvertedAt: convAt,
        settlementConvertedTo: "adjust_udhari",
        settlementConvertedAmount: 10000,
      },
    ],
  });
  expect(db.bills).toHaveLength(1);
  expect(db.returns).toHaveLength(1);
  expect(db.converts).toHaveLength(1);
  expect(db.stats.convertUdhari).toBe(10000);
  expect(db.converts[0].detail).toContain("udhari");
});

test("buildDayActivity lists vusool with cash-in sign", () => {
  const billAt = at("2026-08-29", 2, 59);
  const vusoolAt = at("2026-08-29", 3, 53);
  const day = new Date(2026, 7, 29, 12, 0, 0);
  const db = buildDailyDaybook({
    day,
    invoices: [{
      type: "sale",
      invoiceNo: "INV20260018",
      customerName: "azad",
      date: billAt,
      grandTotal: 1000000,
      amountPending: 900000,
      payments: [
        { mode: "cash", amount: 3202, date: billAt },
        { mode: "online", amount: 10210, date: billAt },
        { mode: "cash", amount: 86588, date: vusoolAt },
      ],
    }],
  });
  const events = buildDayActivity(db);
  const vusool = events.find((e) => e.kind === "payment");
  expect(vusool.amount).toBe(86588);
  expect(vusool.sign).toBe("+");
  expect(vusool.title).toBe("azad");
  expect(vusool.pdfKind).toBe("udhari-vusool");
  expect(vusool.allocations).toEqual([
    { invoiceId: undefined, invoiceNo: "INV20260018", amount: 86588 },
  ]);
  expect(events.find((e) => e.kind === "sale")?.udhari).toBe(900000);
  expect(events.find((e) => e.kind === "sale")?.pdfKind).toBe("invoice");
  expect(events.find((e) => e.kind === "sale")?.title).toBe("azad");
});

test("activity titles use customer name and expense note", () => {
  const t = at("2026-08-29", 10, 0);
  const day = new Date(2026, 7, 29, 12, 0, 0);
  const db = buildDailyDaybook({
    day,
    invoices: [{
      type: "sale",
      invoiceNo: "INV1",
      customerName: "azad",
      date: t,
      grandTotal: 1000,
      amountPending: 0,
      payments: [{ mode: "cash", amount: 1000, date: t }],
    }],
    expenses: [
      { date: t, amount: 99, mode: "cash", note: "chai" },
      { date: t, amount: 50, mode: "online", note: "  " },
    ],
  });
  const events = buildDayActivity(db);
  expect(events.find((e) => e.kind === "sale")?.title).toBe("azad");
  expect(events.find((e) => e.kind === "expense" && e.amount === 99)?.title).toBe("chai");
  expect(events.find((e) => e.kind === "expense" && e.amount === 50)?.title).toBe("Kharcha");
});
