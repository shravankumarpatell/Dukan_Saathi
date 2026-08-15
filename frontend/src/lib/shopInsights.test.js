import { toYMD, fromYMD, addDays, alignedPreviousPeriod, startOfMonth, endOfMonth } from "./dates";
import {
  avgBill,
  bachatOf,
  buildDecisionNotes,
  buildShopInsights,
  collectionRate,
  emptyStats,
  pctChange,
  rangeForGrain,
  topProducts,
} from "./shopInsights";

const day = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 10, 0, 0).toISOString();
};

function sale({ ymd, total, pending = 0, payments, items, name = "A" }) {
  return {
    type: "sale",
    date: day(ymd),
    grandTotal: total,
    amountPending: pending,
    gstAmount: 0,
    customerName: name,
    items: items || [{ name: "Tile", qty: 1, rate: total, unit: "box", piecesPerBox: 4 }],
    payments: payments || [{ mode: "cash", amount: total - pending, date: day(ymd) }],
  };
}

test("pctChange handles zero previous without Infinity", () => {
  expect(pctChange(100, 0)).toBe(100);
  expect(pctChange(0, 0)).toBeNull();
  expect(pctChange(120, 100)).toBe(20);
});

test("alignedPreviousPeriod month compares the same days last month", () => {
  const start = fromYMD("2026-08-01");
  const end = fromYMD("2026-08-15");
  const prev = alignedPreviousPeriod(start, end, "month");
  expect(toYMD(prev.start)).toBe("2026-07-01");
  expect(toYMD(prev.end)).toBe("2026-07-15");
});

test("rangeForGrain month clamps to today", () => {
  const today = fromYMD("2026-08-15");
  const { start, end } = rangeForGrain({ grain: "month", monthYm: "2026-08", today });
  expect(toYMD(start)).toBe("2026-08-01");
  expect(toYMD(end)).toBe("2026-08-15");
});

test("buildShopInsights daily kamai minus karcha is bachat", () => {
  const invoices = [sale({ ymd: "2026-08-15", total: 1000 })];
  const expenses = [{ date: day("2026-08-15"), amount: 200, mode: "cash", note: "petrol" }];
  const { stats, bachat } = buildShopInsights({
    invoices,
    expenses,
    start: fromYMD("2026-08-15"),
    end: fromYMD("2026-08-15"),
    grain: "day",
    lookbackDays: 1,
  });
  expect(stats.salesRevenue).toBe(1000);
  expect(stats.expensesTotal).toBe(200);
  expect(bachat).toBe(800);
  expect(bachatOf(stats)).toBe(800);
});

test("buildShopInsights month sums days and compares prior window", () => {
  const invoices = [
    sale({ ymd: "2026-07-10", total: 400 }),
    sale({ ymd: "2026-08-10", total: 800 }),
  ];
  const today = fromYMD("2026-08-15");
  const { start, end } = rangeForGrain({ grain: "month", monthYm: "2026-08", today });
  const out = buildShopInsights({ invoices, expenses: [], start, end, grain: "month" });
  expect(out.stats.salesRevenue).toBe(800);
  expect(out.stats.bills).toBe(1);
  expect(out.prevStats.salesRevenue).toBe(400);
  expect(pctChange(out.stats.salesRevenue, out.prevStats.salesRevenue)).toBe(100);
});

test("topProducts uses line amount not qty*rate only", () => {
  const sales = [{
    type: "sale",
    items: [{ name: "Tile", qty: 1, pieces: 2, rate: 400, unit: "box", piecesPerBox: 4 }],
  }];
  const [row] = topProducts(sales);
  expect(row.revenue).toBe(600);
});

test("decision notes flag karcha above kamai", () => {
  const notes = buildDecisionNotes({
    stats: { ...emptyStats(), salesRevenue: 100, expensesTotal: 150, salesGross: 100, udhariAdded: 0 },
    prev: emptyStats(),
  });
  expect(notes.some((n) => n.tone === "bad")).toBe(true);
});

test("avgBill and collectionRate", () => {
  const stats = { ...emptyStats(), bills: 2, salesGross: 1000, cashCollected: 600, onlineCollected: 100 };
  expect(avgBill(stats)).toBe(500);
  expect(collectionRate(stats)).toBe(70);
});

test("December last-month range stays in previous year", () => {
  const today = fromYMD("2026-01-10");
  const ym = `${today.getFullYear() - (today.getMonth() === 0 ? 1 : 0)}-${String((today.getMonth() + 11) % 12 + 1).padStart(2, "0")}`;
  expect(ym).toBe("2025-12");
  const { start, end } = rangeForGrain({ grain: "month", monthYm: ym, today });
  expect(toYMD(start)).toBe("2025-12-01");
  expect(toYMD(end)).toBe("2025-12-31");
});

test("startOfMonth / endOfMonth helpers used by range", () => {
  expect(toYMD(startOfMonth(fromYMD("2026-08-15")))).toBe("2026-08-01");
  expect(toYMD(endOfMonth(fromYMD("2026-08-15")))).toBe("2026-08-31");
  expect(toYMD(addDays(fromYMD("2026-08-15"), -1))).toBe("2026-08-14");
});
