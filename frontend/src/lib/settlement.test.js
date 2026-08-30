import {
  estimateReturnSettlementDetail,
  formatSettlementDetail,
  settlementParts,
  settlementAtReturnTime,
  udhariConvertEvidence,
} from "./settlement";

test("SKP: 1000 return against 500 udhari (paid 1500 bill) splits leftover to store credit", () => {
  const d = estimateReturnSettlementDetail({
    settlement: "adjust_udhari",
    refund: 1000,
    originalPending: 0,
    totalPending: 500,
  });
  expect(d.udhariAdjusted).toBe(500);
  expect(d.storeCredit).toBe(500);
  expect(d.cash).toBe(0);
  expect(formatSettlementDetail(d)).toContain("Against udhari");
  expect(formatSettlementDetail(d)).toContain("Store credit");
});

test("cash refund conversion keeps udhari and only signs cash", () => {
  const parts = settlementParts({ udhariAdjusted: 500, storeCredit: 0, cash: 500 });
  expect(parts.map((p) => p.key)).toEqual(["udhari", "cash"]);
  expect(parts.find((p) => p.key === "udhari").cashMove).toBe(0);
  expect(parts.find((p) => p.key === "cash").cashMove).toBe(-500);
});

test("settlementAtReturnTime peels cash convert off the original return", () => {
  const orig = settlementAtReturnTime({
    settlementConvertedAt: "2026-08-29T10:00:00.000Z",
    settlementConvertedAmount: 500,
    settlementConvertedTo: "cash",
    settlementDetail: { cash: 500, udhariAdjusted: 500, storeCredit: 0 },
  });
  expect(orig.cash).toBe(0);
  expect(orig.storeCredit).toBe(500);
  expect(orig.udhariAdjusted).toBe(500);
});

test("settlementAtReturnTime peels udhari convert even when leftover credit remains", () => {
  const orig = settlementAtReturnTime({
    settlementConvertedAt: "2026-08-29T10:00:00.000Z",
    settlementConvertedAmount: 400,
    settlementConvertedTo: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 400, storeCredit: 600 },
  });
  expect(orig.storeCredit).toBe(1000);
  expect(orig.udhariAdjusted).toBe(0);
  expect(orig.cash).toBe(0);
});

test("legacy full-credit convertedAmount peels only the absorbed udhari", () => {
  const orig = settlementAtReturnTime({
    settlementConvertedAt: "2026-08-29T10:00:00.000Z",
    settlementConvertedAmount: 1000,
    settlementConvertedTo: "adjust_udhari",
    settlementDetail: { cash: 0, udhariAdjusted: 400, storeCredit: 600 },
  });
  expect(orig.storeCredit).toBe(1000);
  expect(orig.udhariAdjusted).toBe(0);
});

test("udhariConvertEvidence keeps a later bill even when booked udhari already equals that amount", () => {
  const ret = {
    invoiceNo: "RET20260013",
    originalInvoiceNo: "INV20260011",
    settlementDetail: { udhariAdjusted: 10000, storeCredit: 13008005 },
  };
  const ev = udhariConvertEvidence(ret, [
    {
      type: "sale",
      invoiceNo: "INV20260016",
      payments: [{ mode: "return_adjust", amount: 10000, returnInvoiceNo: "RET20260013" }],
    },
  ]);
  expect(ev.amount).toBe(10000);
  expect(ev.bills.map((b) => b.invoiceNo)).toEqual(["INV20260016"]);
});
