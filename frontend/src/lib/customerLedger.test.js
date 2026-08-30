import {
  buildCustomerActivity,
  buildCustomerSummary,
  describePayment,
  invoicesForCustomer,
} from "./customerLedger";

const day = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 10, 0, 0).toISOString();
};

const customer = { id: "c1", name: "Ashok Kumar", totalPending: 500, storeCredit: 100 };

test("invoicesForCustomer matches id and legacy name", () => {
  const invoices = [
    { id: "i1", customerId: "c1", type: "sale" },
    { id: "i2", customerName: "Ashok Kumar", type: "sale" },
    { id: "i3", customerId: "c2", type: "sale" },
  ];
  expect(invoicesForCustomer(customer, invoices).map((i) => i.id)).toEqual(["i1", "i2"]);
});

test("buildCustomerSummary totals sales and returns", () => {
  const invoices = [
    { customerId: "c1", type: "sale", grandTotal: 1000, amountPending: 200 },
    { customerId: "c1", type: "return", refundTotal: 150 },
  ];
  const s = buildCustomerSummary(customer, invoices);
  expect(s.billCount).toBe(1);
  expect(s.returnCount).toBe(1);
  expect(s.totalSales).toBe(1000);
  expect(s.totalReturns).toBe(150);
  expect(s.pendingTotal).toBe(500);
});

test("describePayment distinguishes bill-time vs udhari collection", () => {
  const inv = { invoiceNo: "GST001", date: day("2026-08-10") };
  expect(describePayment({ mode: "cash", amount: 500, date: day("2026-08-10") }, inv).title).toBe("Bill par cash");
  expect(describePayment({ mode: "online", amount: 300, date: day("2026-08-15") }, inv).title).toBe("Udhari vusool · online");
  expect(describePayment({ mode: "return_adjust", amount: 200, returnInvoiceNo: "RET1" }, inv).title).toBe("Return se udhari adjust");
});

test("buildCustomerActivity includes bills, returns, and later payments only", () => {
  const invoices = [
    {
      id: "s1",
      customerId: "c1",
      type: "sale",
      invoiceNo: "GST001",
      date: day("2026-08-10"),
      grandTotal: 1000,
      amountPaid: 1000,
      amountPending: 0,
      paymentStatus: "paid",
      items: [{}],
      payments: [{ mode: "cash", amount: 1000, date: day("2026-08-10") }],
    },
    {
      id: "s2",
      customerId: "c1",
      type: "sale",
      invoiceNo: "GST002",
      date: day("2026-08-10"),
      grandTotal: 1000,
      amountPaid: 500,
      amountPending: 500,
      paymentStatus: "partial",
      items: [{}],
      payments: [
        { mode: "cash", amount: 500, date: day("2026-08-10") },
        { mode: "cash", amount: 200, date: day("2026-08-12") },
      ],
    },
    {
      id: "r1",
      customerId: "c1",
      type: "return",
      invoiceNo: "RET001",
      date: day("2026-08-11"),
      refundTotal: 150,
      settlement: "adjust_udhari",
      settlementDetail: { invoiceAllocations: [{ invoiceNo: "GST002", amount: 150 }] },
      originalInvoiceNo: "GST002",
    },
  ];
  const events = buildCustomerActivity(customer, invoices);
  expect(events.some((e) => e.kind === "sale" && e.invoiceNo === "GST001")).toBe(true);
  expect(events.find((e) => e.kind === "sale" && e.invoiceNo === "GST001")?.title).toBe("Ashok Kumar");
  expect(events.some((e) => e.kind === "return" && e.invoiceNo === "RET001")).toBe(true);
  expect(events.find((e) => e.kind === "return")?.title).toBe("Ashok Kumar");
  // Bill-time cash folded into bill row; only later udhari vusool is separate.
  expect(events.filter((e) => e.kind === "payment")).toHaveLength(1);
  const vusool = events.find((e) => e.kind === "payment");
  expect(vusool?.title).toBe("Ashok Kumar");
  expect(vusool?.pdfKind).toBe("udhari-vusool");
  expect(vusool?.detail).toContain("GST002");
  expect(vusool?.amount).toBe(200);
  const paidBill = events.find((e) => e.kind === "sale" && e.invoiceNo === "GST001");
  expect(paidBill.detail).toContain("cash");
  expect(paidBill.sign).toBe("+");
  expect(paidBill.amount).toBe(1000);
  expect(paidBill.udhari).toBe(0);
  const partial = events.find((e) => e.kind === "sale" && e.invoiceNo === "GST002");
  expect(partial.sign).toBe("+");
  expect(partial.amount).toBe(500);
  expect(partial.udhari).toBe(500);
  const ret = events.find((e) => e.kind === "return");
  expect(ret.sign).toBe("");
  expect(events.find((e) => e.kind === "payment")?.sign).toBe("+");
});

test("unpaid bill shows unsigned udhari, not a plus", () => {
  const events = buildCustomerActivity(customer, [{
    id: "s3",
    customerId: "c1",
    type: "sale",
    invoiceNo: "GST003",
    date: day("2026-08-10"),
    grandTotal: 20000,
    amountPaid: 0,
    amountPending: 20000,
    paymentStatus: "pending",
    items: [{}],
    payments: [],
  }]);
  const bill = events.find((e) => e.invoiceNo === "GST003");
  expect(bill.sign).toBe("");
  expect(bill.amount).toBe(20000);
  expect(bill.udhari).toBe(0);
  expect(bill.amountKind).toBe("udhari");
});

test("mixed return shows unsigned udhari+credit then cash refund is signed", () => {
  const mixed = {
    id: "r2",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET100",
    date: day("2026-08-20"),
    refundTotal: 1000,
    settlement: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 500, storeCredit: 500 },
    originalInvoiceNo: "GST009",
  };
  const afterCash = {
    ...mixed,
    settlement: "cash",
    settlementDetail: { cash: 500, udhariAdjusted: 500, storeCredit: 0 },
  };
  const before = buildCustomerActivity(customer, [mixed]).find((e) => e.kind === "return");
  expect(before.sign).toBe("");
  expect(before.detail).toContain("Against udhari");
  expect(before.detail).toContain("Store credit");
  const after = buildCustomerActivity(customer, [afterCash]).find((e) => e.kind === "return");
  expect(after.sign).toBe("−");
  expect(after.amount).toBe(500);
  expect(after.detail).toContain("Cash refund");
  expect(after.detail).toContain("Against udhari");
});

test("converted store credit adds a receipt row; return stays as original settlement", () => {
  const converted = {
    id: "r3",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET200",
    date: day("2026-08-20"),
    refundTotal: 1000,
    settlement: "cash",
    settlementDetail: { cash: 500, udhariAdjusted: 500, storeCredit: 0 },
    settlementConvertedAt: day("2026-08-29"),
    settlementConvertedAmount: 500,
    settlementConvertedTo: "cash",
    originalInvoiceNo: "GST009",
  };
  const events = buildCustomerActivity(customer, [converted]);
  const ret = events.find((e) => e.kind === "return");
  const conv = events.find((e) => e.kind === "conversion");
  expect(ret.sign).toBe("");
  expect(ret.detail).toContain("Store credit");
  expect(ret.detail).toContain("Against udhari");
  expect(ret.pdfKind).toBe("invoice");
  expect(conv).toBeTruthy();
  expect(conv.sign).toBe("−");
  expect(conv.amount).toBe(500);
  expect(conv.detail).toContain("Store credit → cash");
  expect(conv.pdfKind).toBe("convert-receipt");
  expect(new Date(conv.date).getTime()).toBeGreaterThan(new Date(ret.date).getTime());
});

test("udhari convert receipt is unsigned in activity", () => {
  const converted = {
    id: "r4",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET201",
    date: day("2026-08-20"),
    refundTotal: 1000,
    settlement: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 1000, storeCredit: 0 },
    settlementConvertedAt: day("2026-08-29"),
    settlementConvertedAmount: 1000,
    settlementConvertedTo: "adjust_udhari",
  };
  const events = buildCustomerActivity(customer, [converted]);
  const conv = events.find((e) => e.kind === "conversion");
  expect(conv.sign).toBe("");
  expect(conv.amountKind).toBe("neutral");
  expect(conv.amount).toBe(1000);
  expect(conv.detail).toContain("Store credit → udhari");
});

test("udhari convert with leftover credit shows only absorbed amount, not remaining credit", () => {
  const converted = {
    id: "r6",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET203",
    date: day("2026-08-20"),
    refundTotal: 13018005,
    settlement: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 20000, storeCredit: 13008005 },
    settlementConvertedAt: day("2026-08-29"),
    settlementConvertedAmount: 10000,
    settlementConvertedTo: "adjust_udhari",
    originalInvoiceNo: "INV20260011",
  };
  const events = buildCustomerActivity(customer, [converted]);
  const conv = events.find((e) => e.kind === "conversion");
  const ret = events.find((e) => e.kind === "return");
  expect(conv.amount).toBe(10000);
  expect(conv.detail).toContain("credit left");
  expect(conv.detail).not.toContain("INV20260011");
  expect(ret.detail).toContain("Store credit");
  expect(ret.detail).toContain("Against udhari");
});

test("legacy convert that stored leftover credit as the amount is hidden", () => {
  const events = buildCustomerActivity(customer, [{
    id: "r7",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET204",
    date: day("2026-08-20"),
    refundTotal: 13018005,
    settlement: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 10000, storeCredit: 13008005 },
    settlementConvertedAt: day("2026-08-29"),
    settlementConvertedAmount: 13008005,
    settlementConvertedTo: "adjust_udhari",
  }]);
  expect(events.find((e) => e.kind === "conversion")).toBeUndefined();
});

test("udhari convert receipt is rebuilt from return_adjust on a later bill", () => {
  const ret = {
    id: "r13",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET20260013",
    date: day("2026-08-28"),
    refundTotal: 13018005,
    settlement: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 10000, storeCredit: 13008005 },
    settlementConvertedAt: day("2026-08-29"),
    settlementConvertedAmount: 0,
    settlementConvertedTo: "adjust_udhari",
    originalInvoiceNo: "INV20260011",
  };
  const originalSale = {
    id: "s11",
    customerId: "c1",
    type: "sale",
    invoiceNo: "INV20260011",
    date: day("2026-08-20"),
    grandTotal: 10000,
    amountPaid: 10000,
    amountPending: 0,
    paymentStatus: "paid",
    items: [{}],
    payments: [{ mode: "return_adjust", amount: 10000, returnInvoiceNo: "RET20260013", date: day("2026-08-28") }],
  };
  const laterSale = {
    id: "s16",
    customerId: "c1",
    type: "sale",
    invoiceNo: "INV20260016",
    date: day("2026-08-29"),
    grandTotal: 20000,
    amountPaid: 20000,
    amountPending: 0,
    paymentStatus: "paid",
    items: [{}],
    payments: [
      { mode: "cash", amount: 5000, date: day("2026-08-29") },
      { mode: "online", amount: 5000, date: day("2026-08-29") },
      { mode: "return_adjust", amount: 10000, returnInvoiceNo: "RET20260013", date: day("2026-08-29") },
    ],
  };
  const events = buildCustomerActivity(customer, [ret, originalSale, laterSale]);
  const conv = events.find((e) => e.kind === "conversion" && e.invoiceNo === "RET20260013");
  const bill = events.find((e) => e.kind === "sale" && e.invoiceNo === "INV20260016");
  const retRow = events.find((e) => e.kind === "return" && e.invoiceNo === "RET20260013");
  expect(conv.amount).toBe(10000);
  expect(conv.pdfKind).toBe("convert-receipt");
  expect(conv.detail).toContain("INV20260016");
  expect(conv.detail).toContain("credit left");
  expect(bill.detail).toContain("return adjust");
  expect(bill.detail).toContain("10,000");
  expect(retRow.detail).toContain("Against udhari");
  expect(retRow.detail).toContain("Store credit");
});

test("udhari convert receipt appears when only the later bill has return_adjust", () => {
  const ret = {
    id: "r13b",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET20260013",
    date: day("2026-08-28"),
    refundTotal: 13018005,
    settlement: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 10000, storeCredit: 13008005 },
    originalInvoiceNo: "INV20260011",
  };
  const laterSale = {
    id: "s16b",
    customerId: "c1",
    type: "sale",
    invoiceNo: "INV20260016",
    date: day("2026-08-29"),
    grandTotal: 20000,
    amountPaid: 20000,
    amountPending: 0,
    paymentStatus: "paid",
    items: [{}],
    payments: [
      { mode: "cash", amount: 5000, date: day("2026-08-29") },
      { mode: "online", amount: 5000, date: day("2026-08-29") },
      { mode: "return_adjust", amount: 10000, returnInvoiceNo: "RET20260013", date: day("2026-08-29") },
    ],
  };
  const events = buildCustomerActivity(customer, [ret, laterSale]);
  const conv = events.find((e) => e.kind === "conversion" && e.invoiceNo === "RET20260013");
  expect(conv).toBeTruthy();
  expect(conv.amount).toBe(10000);
  expect(conv.detail).toContain("INV20260016");
});

test("legacy cash convert with only convertedAt still gets a receipt row", () => {
  const events = buildCustomerActivity(customer, [{
    id: "r5",
    customerId: "c1",
    type: "return",
    invoiceNo: "RET202",
    date: day("2026-08-20"),
    refundTotal: 500,
    settlement: "cash",
    settlementDetail: { cash: 500, udhariAdjusted: 0, storeCredit: 0 },
    settlementConvertedAt: day("2026-08-29"),
  }]);
  const conv = events.find((e) => e.kind === "conversion");
  expect(conv.convertedTo).toBe("cash");
  expect(conv.sign).toBe("−");
  expect(conv.amount).toBe(500);
});

test("same-day later collection is udhari vusool, not folded into the bill", () => {
  const billAt = new Date(2026, 7, 10, 10, 0, 0).toISOString();
  const later = new Date(2026, 7, 10, 16, 0, 0).toISOString();
  const events = buildCustomerActivity(customer, [{
    id: "s-same",
    customerId: "c1",
    type: "sale",
    invoiceNo: "GST010",
    date: billAt,
    grandTotal: 1000,
    amountPaid: 700,
    amountPending: 300,
    paymentStatus: "partial",
    items: [{}],
    payments: [
      { mode: "cash", amount: 500, date: billAt },
      { mode: "cash", amount: 200, date: later },
    ],
  }]);
  const bill = events.find((e) => e.kind === "sale");
  expect(bill.amount).toBe(500);
  expect(bill.udhari).toBe(300);
  const vusool = events.find((e) => e.kind === "payment");
  expect(vusool.title).toBe("Ashok Kumar");
  expect(vusool.amount).toBe(200);
  expect(vusool.pdfKind).toBe("udhari-vusool");
});

test("same-time cash across bills is one udhari vusool receipt", () => {
  const stamp = day("2026-08-20");
  const events = buildCustomerActivity(customer, [
    {
      id: "a",
      customerId: "c1",
      type: "sale",
      invoiceNo: "INV1",
      date: day("2026-08-01"),
      grandTotal: 1000,
      amountPaid: 400,
      amountPending: 600,
      paymentStatus: "partial",
      items: [{}],
      payments: [
        { mode: "cash", amount: 200, date: day("2026-08-01") },
        { mode: "cash", amount: 200, date: stamp },
      ],
    },
    {
      id: "b",
      customerId: "c1",
      type: "sale",
      invoiceNo: "INV2",
      date: day("2026-08-02"),
      grandTotal: 500,
      amountPaid: 100,
      amountPending: 400,
      paymentStatus: "partial",
      items: [{}],
      payments: [{ mode: "cash", amount: 100, date: stamp }],
    },
  ]);
  const pays = events.filter((e) => e.kind === "payment");
  expect(pays).toHaveLength(1);
  expect(pays[0].title).toBe("Ashok Kumar");
  expect(pays[0].pdfKind).toBe("udhari-vusool");
  expect(pays[0].amount).toBe(300);
  expect(pays[0].sign).toBe("+");
  expect(pays[0].allocations.map((a) => a.invoiceNo).sort()).toEqual(["INV1", "INV2"]);
  expect(pays[0].remainingUdhari).toBe(500);
});
