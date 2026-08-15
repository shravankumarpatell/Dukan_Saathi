import React, { useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { money } from "@/lib/calc";
import { formatStockLabel } from "@/lib/units";
import { buildDailyDaybook } from "@/lib/daybook";
import { generateDailySummaryPDF } from "@/services/billPdf";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import Kbd from "@/components/Kbd";
import DateNav from "@/components/DateNav";
import SegmentedControl from "@/components/SegmentedControl";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import {
  addDays,
  earliestYMD,
  fmtLongDate,
  fromYMD,
  isTodayYmd,
  isYesterdayYmd,
  localNoonISO,
  toYM,
  toYMD,
} from "@/lib/dates";
import { buildShopInsights, pctChange, rangeForGrain } from "@/lib/shopInsights";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Printer, TrendingDown, TrendingUp } from "lucide-react";

const GRAINS = [
  { value: "day", label: "Daily" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
];

export default function Analytics() {
  const { invoices, products, expenses, customers, shop } = useApp();
  const [grain, setGrain] = useState("day");
  const [dayYmd, setDayYmd] = useState(() => toYMD(new Date()));
  const [monthYm, setMonthYm] = useState(() => toYM(new Date()));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));
  const grainRef = useRef(null);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();
  usePageFocus(() => {
    const el = document.querySelector('[data-testid="analytics-date-input"]');
    (el || grainRef.current)?.focus();
  });

  const minYmd = useMemo(
    () => earliestYMD([...invoices, ...expenses]) || toYMD(addDays(new Date(), -365)),
    [invoices, expenses],
  );

  const { start, end } = useMemo(
    () => rangeForGrain({ grain, dayYmd, monthYm, year }),
    [grain, dayYmd, monthYm, year],
  );

  const insights = useMemo(
    () => buildShopInsights({
      invoices, expenses, products, customers, start, end, grain, lookbackDays: 14,
    }),
    [invoices, expenses, products, customers, start, end, grain],
  );

  const printSummary = () => {
    const ymd = grain === "day" ? dayYmd : toYMD(new Date());
    const day = fromYMD(ymd);
    const { stats, sales, expenses: dayExp } = buildDailyDaybook({ invoices, expenses, day });
    showPdf(generateDailySummaryPDF({
      shop,
      dateISO: localNoonISO(ymd),
      stats,
      sales,
      expenses: dayExp,
    }, "bloburl"));
  };

  useHotkeyScope(SCOPES.ANALYTICS);
  useHotkeys(SCOPES.ANALYTICS, [
    { keys: "alt+1", label: "Daily analysis", handler: () => setGrain("day") },
    { keys: "alt+2", label: "Monthly analysis", handler: () => setGrain("month") },
    { keys: "alt+3", label: "Yearly analysis", handler: () => setGrain("year") },
    { keys: KEYS.preview, label: "Is din ka summary print karein", handler: printSummary },
    { keys: KEYS.focusSearch, label: "Date / range par jaayein", handler: () => {
      document.querySelector('[data-testid="analytics-date-input"]')?.focus();
    } },
  ]);

  const periodLabel = grain === "day"
    ? (isTodayYmd(dayYmd) ? "Aaj" : isYesterdayYmd(dayYmd) ? "Kal" : fmtLongDate(start))
    : grain === "month"
      ? start.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
      : String(year);

  const chartTitle = grain === "day"
    ? "Pichle 14 din — kamai vs karcha"
    : grain === "month"
      ? "Is mahine har din"
      : "Is saal har mahina";

  return (
    <div className="space-y-5 ds-fade" data-testid="analytics-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500">Kamai, karcha, udhari — din, mahina, saal. Decision yahin se.</p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div ref={grainRef} data-testid="range-select">
            <SegmentedControl
              value={grain}
              onChange={setGrain}
              testPrefix="range"
              className="grid grid-cols-3 gap-2"
              showArrowHint={false}
              options={GRAINS}
            />
          </div>
          <span className="hidden items-center justify-end gap-1 text-xs text-slate-400 sm:flex">
            <Kbd keys="alt+1" /><Kbd keys="alt+2" /><Kbd keys="alt+3" />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <DateNav
          mode={grain}
          value={grain === "day" ? dayYmd : grain === "month" ? monthYm : year}
          onChange={grain === "day" ? setDayYmd : grain === "month" ? setMonthYm : setYear}
          min={minYmd}
          testId="analytics-date"
        />
        {grain === "day" && (
          <button
            type="button"
            data-testid="analytics-print-summary"
            onClick={printSummary}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-2 text-sm font-semibold text-white active:scale-95"
          >
            <Printer className="h-4 w-4" /> Print day-book <Kbd keys={KEYS.preview} tone="dark" />
          </button>
        )}
      </div>

      <p className="text-sm font-semibold text-slate-700" data-testid="analytics-period-label">{periodLabel}</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi testid="kpi-kamai" label="Kamai" value={money(insights.stats.salesRevenue)} delta={pctChange(insights.stats.salesRevenue, insights.prevStats.salesRevenue)} tone="emerald" />
        <Kpi testid="kpi-karcha" label="Karcha" value={money(insights.stats.expensesTotal)} delta={pctChange(insights.stats.expensesTotal, insights.prevStats.expensesTotal)} invert tone="orange" />
        <Kpi testid="kpi-bachat" label="Bachat (kamai − karcha)" value={money(insights.bachat)} delta={pctChange(insights.bachat, insights.prevBachat)} tone="indigo" />
        <Kpi testid="kpi-bills" label="Bills" value={insights.stats.bills} hint={insights.stats.bills ? `Avg bill ${money(insights.avgBill)}` : "Koi sale nahi"} />
        <Kpi testid="kpi-cash" label="Cash aaya" value={money(insights.stats.cashCollected)} hint={`Drawer net ${money(insights.stats.netCash)}`} />
        <Kpi testid="kpi-online" label="Online aaya" value={money(insights.stats.onlineCollected)} hint={`Online net ${money(insights.stats.netOnline)}`} />
        <Kpi testid="kpi-udhari-out" label="Udhari diya" value={money(insights.stats.udhariAdded)} />
        <Kpi testid="kpi-udhari-in" label="Udhari vusool" value={money(insights.stats.udhariCollected)} hint={insights.collectionRate != null ? `Collection ${Math.round(insights.collectionRate)}%` : undefined} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Returns (cash)" value={money(insights.stats.returnsTotal)} />
        <Mini label="Maal kharida" value={money(insights.maalKharida)} />
        <Mini label="GST on bills" value={money(insights.gst)} />
        <Mini label="Stock value (sell)" value={money(insights.stockValue)} />
      </div>

      {insights.notes.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2" data-testid="analytics-notes">
          {insights.notes.map((n, i) => (
            <div
              key={i}
              className={`rounded-xl border px-3 py-2 text-sm ${
                n.tone === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : n.tone === "bad" ? "border-rose-200 bg-rose-50 text-rose-900"
                    : n.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-950"
                      : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {n.text}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 font-display font-bold text-slate-900">{chartTitle}</h3>
        {insights.series.some((r) => r.kamai || r.karcha) ? (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={insights.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" fontSize={11} stroke="#64748b" />
              <YAxis fontSize={11} stroke="#64748b" />
              <Tooltip formatter={(v, name) => [money(v), name]} contentStyle={{ backgroundColor: "#fff", borderColor: "#e2e8f0", color: "#0f172a" }} />
              <Legend />
              <Bar dataKey="kamai" name="Kamai" fill="#312E81" radius={[4, 4, 0, 0]} />
              <Bar dataKey="karcha" name="Karcha" fill="#EA580C" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="bachat" name="Bachat" stroke="#059669" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-400">Is period mein sale ya karcha nahi.</p>
        )}
      </div>

      {grain !== "day" && insights.best?.value > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          <Mini label="Best kamai" value={insights.best.label} hint={money(insights.best.value)} />
          <Mini label="Sabse halka din/mahina" value={insights.worst?.label || "—"} hint={money(insights.worst?.value || 0)} />
          <Mini label="Udhari abhi pending" value={money(insights.udhari.total)} hint={`${insights.lowStockCount} low-stock items`} />
        </div>
      )}

      {grain !== "day" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-display font-bold text-slate-900">Weekday pattern (avg kamai)</h3>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={insights.weekdays}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" fontSize={11} stroke="#64748b" />
              <YAxis fontSize={11} stroke="#64748b" />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ backgroundColor: "#fff", borderColor: "#e2e8f0", color: "#0f172a" }} />
              <Bar dataKey="kamai" name="Avg kamai" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <ListCard title="Top products (kamai)">
          {insights.products.map((p) => (
            <Row key={p.id} left={p.name} right={money(p.revenue)} hint={`${p.qty} sold`} />
          ))}
        </ListCard>
        <ListCard title="Top customers">
          {insights.customers.map((c) => (
            <Row key={c.name} left={c.name} right={money(c.spend)} />
          ))}
        </ListCard>
        <ListCard title="Karcha breakdown">
          {insights.expenses.map((e) => (
            <Row key={e.name} left={e.name} right={money(e.amount)} />
          ))}
        </ListCard>
        <ListCard title="Company mix">
          {insights.companies.map((c) => (
            <Row key={c.name} left={c.name} right={money(c.revenue)} />
          ))}
        </ListCard>
        <ListCard title="Tiles vs sanitary">
          <Row left="Tiles" right={money(insights.mix.tiles)} />
          <Row left="Sanitary" right={money(insights.mix.sanitary)} />
        </ListCard>
        <ListCard title="Udhari pending (abhi)">
          {insights.udhari.top.map((c) => (
            <Row key={c.name} left={c.name} right={money(c.pending)} />
          ))}
        </ListCard>
        <ListCard title="Slow movers" icon={TrendingDown}>
          {insights.slowMovers.map((p) => (
            <Row key={p.id} left={p.name} right={`${formatStockLabel(p)} left`} muted />
          ))}
          {insights.slowMovers.length === 0 && <p className="text-sm text-slate-400">Sab bik raha hai! 🎉</p>}
        </ListCard>
        <ListCard title="Payment mix is period">
          <Row left="Cash collected" right={money(insights.stats.cashCollected)} />
          <Row left="Online collected" right={money(insights.stats.onlineCollected)} />
          <Row left="Udhari diya" right={money(insights.stats.udhariAdded)} />
          <Row left="Udhari vusool" right={money(insights.stats.udhariCollected)} />
        </ListCard>
      </div>

      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={closePdf} title="Daily Summary PDF" />
    </div>
  );
}

function Kpi({ label, value, hint, delta, invert, tone = "slate", testid }) {
  const show = delta != null && Number.isFinite(delta);
  const good = invert ? delta < 0 : delta > 0;
  return (
    <div data-testid={testid} className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`font-display text-xl font-bold text-slate-900 ${tone === "emerald" ? "text-emerald-800" : tone === "orange" ? "text-orange-800" : ""}`}>{value}</p>
      {show && (
        <p className={`mt-0.5 flex items-center gap-0.5 text-xs font-semibold ${good ? "text-emerald-600" : delta === 0 ? "text-slate-400" : "text-rose-600"}`}>
          {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null}
          {delta > 0 ? "+" : ""}{Math.round(delta)}% vs pichla
        </p>
      )}
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function Mini({ label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
      <p className="font-display text-lg font-bold text-slate-900">{value}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function ListCard({ title, children, icon: Icon }) {
  const empty = !React.Children.count(children);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-2 flex items-center gap-1 font-display font-bold text-slate-900">
        {Icon && <Icon className="h-4 w-4 text-rose-500" />}
        {title}
      </h3>
      {empty ? <p className="text-sm text-slate-400">No data.</p> : children}
    </div>
  );
}

function Row({ left, right, hint, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="min-w-0 truncate text-slate-700">{left}{hint ? <span className="ml-1 text-xs text-slate-400">{hint}</span> : null}</span>
      <b className={`shrink-0 tabular-nums ${muted ? "font-medium text-slate-400" : "text-slate-900"}`}>{right}</b>
    </div>
  );
}
