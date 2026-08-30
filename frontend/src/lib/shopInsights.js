import { itemAmount, lineUnits, round2 } from "./calc";
import { isPieceUnit } from "./units";
import { buildDailyDaybook } from "./daybook";
import {
  addDays,
  clampToToday,
  eachDay,
  eachMonth,
  endOfMonth,
  endOfYear,
  fmtDayLabel,
  fmtMonthLabel,
  fromYM,
  fromYMD,
  inLocalRange,
  maxDate,
  minDate,
  alignedPreviousPeriod,
  startOfMonth,
  startOfYear,
  toYMD,
} from "./dates";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function emptyStats() {
  return {
    salesRevenue: 0,
    cashCollected: 0,
    onlineCollected: 0,
    cashIn: 0,
    onlineIn: 0,
    udhariAdded: 0,
    udhariCollected: 0,
    convertCash: 0,
    convertUdhari: 0,
    expensesTotal: 0,
    cashExpenses: 0,
    onlineExpenses: 0,
    netCash: 0,
    netOnline: 0,
    salesGross: 0,
    returnsTotal: 0,
    bills: 0,
  };
}

export function addStats(a, b) {
  const o = emptyStats();
  for (const k of Object.keys(o)) o[k] = round2((Number(a?.[k]) || 0) + (Number(b?.[k]) || 0));
  return o;
}

export function pctChange(curr, prev) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (p === 0 && c === 0) return null;
  if (p === 0) return c > 0 ? 100 : -100;
  return round2(((c - p) / Math.abs(p)) * 100);
}

export function bachatOf(stats) {
  return round2((Number(stats?.salesRevenue) || 0) - (Number(stats?.expensesTotal) || 0));
}

export function avgBill(stats) {
  const n = Number(stats?.bills) || 0;
  if (!n) return 0;
  return round2((Number(stats.salesGross) || 0) / n);
}

/** Paisa that actually came in vs sale booked (includes old udhari collected). */
export function collectionRate(stats) {
  const booked = Number(stats?.salesGross) || 0;
  const inHand = (Number(stats?.cashIn ?? stats?.cashCollected) || 0)
    + (Number(stats?.onlineIn ?? stats?.onlineCollected) || 0);
  if (booked <= 0) return null;
  return round2((inHand / booked) * 100);
}

function dayRow(invoices, expenses, day) {
  const db = buildDailyDaybook({ invoices, expenses, day });
  return {
    ymd: toYMD(day),
    label: fmtDayLabel(day),
    kamai: db.stats.salesRevenue,
    karcha: db.stats.expensesTotal,
    bachat: bachatOf(db.stats),
    bills: db.todayCount,
    stats: {
      ...db.stats,
      salesGross: db.salesGross,
      returnsTotal: db.returnsTotal,
      bills: db.todayCount,
    },
  };
}

function sumRows(rows) {
  return rows.reduce((acc, row) => addStats(acc, row.stats), emptyStats());
}

export function rangeForGrain({ grain, dayYmd, monthYm, year, today = new Date() }) {
  if (grain === "day") {
    const d = fromYMD(dayYmd || toYMD(today));
    return { start: d, end: d };
  }
  if (grain === "month") {
    const m = fromYM(monthYm || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
    return { start: startOfMonth(m), end: clampToToday(endOfMonth(m), today) };
  }
  const y = Number(year) || today.getFullYear();
  const start = startOfYear(new Date(y, 0, 1));
  return { start, end: clampToToday(endOfYear(start), today) };
}

function seriesForGrain(invoices, expenses, start, end, grain) {
  if (grain === "year") {
    return eachMonth(start, end).map((m) => {
      const from = maxDate(start, startOfMonth(m));
      const to = minDate(end, endOfMonth(m));
      const days = eachDay(from, to).map((d) => dayRow(invoices, expenses, d));
      const stats = sumRows(days);
      return {
        ymd: toYMD(from),
        label: fmtMonthLabel(m),
        kamai: stats.salesRevenue,
        karcha: stats.expensesTotal,
        bachat: bachatOf(stats),
        bills: stats.bills,
        stats,
      };
    });
  }
  return eachDay(start, end).map((d) => dayRow(invoices, expenses, d));
}

function salesInRange(invoices, start, end) {
  return (invoices || []).filter((i) => i.type === "sale" && inLocalRange(i.date, start, end));
}

function purchasesInRange(invoices, start, end) {
  return (invoices || []).filter((i) => i.type === "purchase" && inLocalRange(i.date, start, end));
}

function expensesInRange(expenses, start, end) {
  return (expenses || []).filter((e) => inLocalRange(e.date, start, end));
}

/** productId → total units sold (all sale bills). Used for catalog search ranking. */
export function productSalesQtyMap(invoices) {
  const map = {};
  for (const iv of invoices || []) {
    if (iv.type !== "sale") continue;
    for (const it of iv.items || []) {
      const id = it.productId;
      if (!id) continue;
      map[id] = round2((map[id] || 0) + lineUnits(it));
    }
  }
  return map;
}

export function topProducts(sales, { limit = 6 } = {}) {
  const map = {};
  for (const iv of sales) {
    for (const it of iv.items || []) {
      const key = it.productId || it.name || "item";
      map[key] = map[key] || { id: key, name: it.name || "Item", qty: 0, revenue: 0 };
      map[key].qty = round2(map[key].qty + lineUnits(it));
      map[key].revenue = round2(map[key].revenue + itemAmount(it));
    }
  }
  return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

export function topCustomers(sales, { limit = 5 } = {}) {
  const map = {};
  for (const iv of sales) {
    const name = iv.customerName || "Walk-in";
    map[name] = round2((map[name] || 0) + (Number(iv.grandTotal) || 0));
  }
  return Object.entries(map)
    .map(([name, spend]) => ({ name, spend }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, limit);
}

export function companyMix(sales, products, { limit = 6 } = {}) {
  const byId = Object.fromEntries((products || []).map((p) => [p.id, p]));
  const map = {};
  for (const iv of sales) {
    for (const it of iv.items || []) {
      const p = byId[it.productId];
      const name = (p?.company || "").trim() || "No company";
      map[name] = round2((map[name] || 0) + itemAmount(it));
    }
  }
  return Object.entries(map)
    .map(([name, revenue]) => ({ name, revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

export function unitMix(sales) {
  let tiles = 0;
  let sanitary = 0;
  for (const iv of sales) {
    for (const it of iv.items || []) {
      const amt = itemAmount(it);
      if (isPieceUnit(it)) sanitary += amt;
      else tiles += amt;
    }
  }
  return { tiles: round2(tiles), sanitary: round2(sanitary) };
}

export function expenseBreakdown(expenses, { limit = 6 } = {}) {
  const map = {};
  for (const e of expenses) {
    const note = (e.note || "").trim() || "Other / no note";
    const key = note;
    map[key] = round2((map[key] || 0) + (Number(e.amount) || 0));
  }
  return Object.entries(map)
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function slowMovers(sales, products, { limit = 6 } = {}) {
  const sold = new Set();
  for (const iv of sales) {
    for (const it of iv.items || []) {
      if (it.productId) sold.add(it.productId);
    }
  }
  return (products || [])
    .filter((p) => !sold.has(p.id))
    .sort((a, b) => stockQty(b) - stockQty(a))
    .slice(0, limit);
}

function stockQty(p) {
  return (Number(p.showroomQty) || 0) + (Number(p.godownQty) || 0) + (Number(p.stockQty) || 0);
}

export function stockValue(products) {
  return round2((products || []).reduce((s, p) => s + stockQty(p) * (Number(p.sellPrice) || 0), 0));
}

export function weekdayPattern(daySeries) {
  const buckets = WEEKDAYS.map((name) => ({ name, kamai: 0, days: 0 }));
  for (const row of daySeries) {
    const d = fromYMD(row.ymd);
    const i = d.getDay();
    buckets[i].kamai += Number(row.kamai) || 0;
    buckets[i].days += 1;
  }
  return buckets.map((b) => ({
    name: b.name,
    kamai: b.days ? round2(b.kamai / b.days) : 0,
    total: round2(b.kamai),
  }));
}

export function extremum(series, key = "kamai") {
  const active = (series || []).filter((r) => (
    (Number(r.kamai) || 0) > 0 || (Number(r.karcha) || 0) > 0 || (Number(r.bills) || 0) > 0
  ));
  const use = active.length ? active : series || [];
  let best = null;
  let worst = null;
  for (const row of use) {
    const v = Number(row[key]) || 0;
    if (!best || v > best.value) best = { label: row.label, ymd: row.ymd, value: v };
    if (!worst || v < worst.value) worst = { label: row.label, ymd: row.ymd, value: v };
  }
  return { best, worst };
}

export function buildDecisionNotes({ stats, prev, extras = {} }) {
  const notes = [];
  const kamaiPct = pctChange(stats.salesRevenue, prev?.salesRevenue);
  if (kamaiPct != null && Math.abs(kamaiPct) >= 5) {
    notes.push({
      tone: kamaiPct >= 0 ? "good" : "warn",
      text: kamaiPct >= 0
        ? `Kamai pichle period se ${Math.round(kamaiPct)}% zyada hai.`
        : `Kamai pichle period se ${Math.round(Math.abs(kamaiPct))}% kam hai. Dekho kya slow ho raha hai.`,
    });
  }

  const karchaPct = pctChange(stats.expensesTotal, prev?.expensesTotal);
  if (karchaPct != null && karchaPct >= 20 && stats.expensesTotal > 0) {
    notes.push({
      tone: "warn",
      text: `Karcha pichle period se ${Math.round(karchaPct)}% badh gaya.`,
    });
  }

  if (stats.salesRevenue > 0 && stats.expensesTotal > stats.salesRevenue) {
    notes.push({
      tone: "bad",
      text: "Is period mein karcha kamai se zyada hai — net loss.",
    });
  }

  const rate = collectionRate(stats);
  if (rate != null && rate < 70 && stats.udhariAdded > 0) {
    notes.push({
      tone: "warn",
      text: `Sale ka sirf ${Math.round(rate)}% paisa aaya. Baaki udhari pe gaya — collection pe dhyaan do.`,
    });
  }

  if (extras.best?.value > 0) {
    notes.push({
      tone: "good",
      text: `Sabse tez din/mahina: ${extras.best.label} (${formatRough(extras.best.value)} kamai).`,
    });
  }

  if (extras.topProduct) {
    notes.push({
      tone: "info",
      text: `Sabse zyada bika: ${extras.topProduct.name}. Isko stock mein rakho.`,
    });
  }

  if (extras.topExpense) {
    notes.push({
      tone: "info",
      text: `Sabse bada karcha: ${extras.topExpense.name} (${formatRough(extras.topExpense.amount)}).`,
    });
  }

  if ((extras.lowStockCount || 0) > 0) {
    notes.push({
      tone: "warn",
      text: `${extras.lowStockCount} items low stock par hain — sale miss ho sakti hai.`,
    });
  }

  if (extras.topUdhari) {
    notes.push({
      tone: "warn",
      text: `Sabse zyada udhari: ${extras.topUdhari.name} (${formatRough(extras.topUdhari.pending)}).`,
    });
  }

  return notes.slice(0, 7);
}

function formatRough(n) {
  const v = Number(n) || 0;
  return "₹" + v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function gstCollected(sales) {
  return round2(sales.reduce((s, i) => s + (Number(i.gstAmount) || 0), 0));
}

export function purchaseTotal(purchases) {
  return round2(purchases.reduce((s, i) => s + (Number(i.grandTotal) || 0), 0));
}

export function pendingUdhari(customers, { limit = 5 } = {}) {
  const rows = (customers || [])
    .map((c) => ({ name: c.name || "Customer", pending: Number(c.totalPending) || 0 }))
    .filter((c) => c.pending > 0.5)
    .sort((a, b) => b.pending - a.pending);
  return {
    total: round2(rows.reduce((s, c) => s + c.pending, 0)),
    top: rows.slice(0, limit),
  };
}

export function lowStockCount(products) {
  return (products || []).filter((p) => stockQty(p) <= (Number(p.lowStockThreshold) || 0)).length;
}

/**
 * Shopkeeper-facing numbers for a calendar window.
 * Grain: "day" (one day KPIs + optional lookback series), "month" (daily bars), "year" (monthly bars).
 */
export function buildShopInsights({
  invoices = [],
  expenses = [],
  products = [],
  customers = [],
  start,
  end,
  grain = "month",
  lookbackDays = 14,
} = {}) {
  const seriesStart = grain === "day" ? addDays(start, -(lookbackDays - 1)) : start;
  const series = seriesForGrain(invoices, expenses, seriesStart, end, grain === "day" ? "day" : grain);
  const windowSeries = grain === "day"
    ? series.filter((r) => r.ymd === toYMD(start))
    : series;
  const stats = grain === "day" ? (windowSeries[0]?.stats || emptyStats()) : sumRows(series);

  const prev = alignedPreviousPeriod(start, end, grain);
  const prevSeries = seriesForGrain(invoices, expenses, prev.start, prev.end, "day");
  const prevStats = sumRows(prevSeries);

  const sales = salesInRange(invoices, start, end);
  const purchases = purchasesInRange(invoices, start, end);
  const periodExpenses = expensesInRange(expenses, start, end);
  const productsRanked = topProducts(sales);
  const customersRanked = topCustomers(sales);
  const companies = companyMix(sales, products);
  const mix = unitMix(sales);
  const karchaList = expenseBreakdown(periodExpenses);
  const slow = slowMovers(sales, products);
  const weekdays = weekdayPattern(
    grain === "year"
      ? seriesForGrain(invoices, expenses, start, end, "day")
      : series.filter((r) => r.ymd >= toYMD(start)),
  );
  const { best, worst } = extremum(windowSeries.length ? windowSeries : series);
  const udhari = pendingUdhari(customers);
  const low = lowStockCount(products);

  const notes = buildDecisionNotes({
    stats,
    prev: prevStats,
    extras: {
      best: grain === "day" ? null : best,
      topProduct: productsRanked[0],
      topExpense: karchaList[0],
      lowStockCount: low,
      topUdhari: udhari.top[0],
    },
  });

  return {
    start,
    end,
    grain,
    stats,
    prevStats,
    series,
    windowSeries,
    sales,
    purchases,
    products: productsRanked,
    customers: customersRanked,
    companies,
    mix,
    expenses: karchaList,
    slowMovers: slow,
    weekdays,
    best,
    worst,
    gst: gstCollected(sales),
    maalKharida: purchaseTotal(purchases),
    stockValue: stockValue(products),
    udhari,
    lowStockCount: low,
    notes,
    avgBill: avgBill(stats),
    collectionRate: collectionRate(stats),
    bachat: bachatOf(stats),
    prevBachat: bachatOf(prevStats),
  };
}
