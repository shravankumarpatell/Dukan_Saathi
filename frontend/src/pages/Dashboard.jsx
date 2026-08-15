import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { money, sqftCalc } from "@/lib/calc";
import { tileSizeToInches } from "@/lib/tileSizes";
import { buildDailyDaybook } from "@/lib/daybook";
import { generateDailySummaryPDF } from "@/services/billPdf";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import NumberInput from "@/components/NumberInput";
import TileSizeSelect from "@/components/TileSizeSelect";
import DateNav from "@/components/DateNav";
import Kbd from "@/components/Kbd";
import SegmentedControl from "@/components/SegmentedControl";
import { addDays, earliestYMD, fromYMD, localNoonISO, toYMD } from "@/lib/dates";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { AlertTriangle, IndianRupee, Wallet, ReceiptText, Printer, Plus, Calculator } from "lucide-react";

const EMPTY_EXP = { amount: "", note: "", mode: "cash" };

const Stat = ({ icon: Icon, label, value, tone = "indigo", testid, onClick }) => (
  <button data-testid={testid} onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-transform active:scale-95 hover:border-indigo-300 hover:shadow-md">
    <div className={`mb-2 inline-flex rounded-lg p-2 bg-${tone}-100 text-${tone}-700`}><Icon className="h-4 w-4" /></div>
    <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
    <p className="font-display text-2xl font-bold text-slate-900">{value}</p>
  </button>
);

export default function Dashboard() {
  const { products, invoices, customers, expenses, shop, setDraft, draft } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [exp, setExp] = useState(EMPTY_EXP);
  const [summaryDate, setSummaryDate] = useState(() => toYMD(new Date()));
  const expAmountRef = useRef(null);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();

  const focusStart = usePageFocus(() => expAmountRef.current?.focus(), { enabled: !draft });
  const prevDraft = useRef(draft);
  useEffect(() => {
    if (prevDraft.current && !draft) focusStart();
    prevDraft.current = draft;
  }, [draft, focusStart]);

  const stats = useMemo(() => {
    const daybook = buildDailyDaybook({ invoices, expenses });
    const totalUdhari = customers.reduce((s, c) => s + (c.totalPending || 0), 0);
    const lowStock = products.filter((p) => ((p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0)) <= (p.lowStockThreshold || 0));
    return {
      revenue: daybook.stats.salesRevenue,
      totalUdhari,
      lowStock,
      todayCount: daybook.todayCount,
    };
  }, [products, invoices, customers, expenses]);

  const minSummaryDate = useMemo(
    () => earliestYMD([...invoices, ...expenses]) || toYMD(addDays(new Date(), -365)),
    [invoices, expenses],
  );

  const addExpense = useCallback(() => {
    if (!(Number(exp.amount) > 0)) { toast.error("Amount daaliye"); return expAmountRef.current?.focus(); }
    setDraft({
      kind: "expense",
      amount: Number(exp.amount),
      note: exp.note,
      mode: exp.mode,
      title: "Add Expense",
      subtitle: exp.note || exp.mode,
      onCommitted: () => { setExp(EMPTY_EXP); focusStart(); },
    });
  }, [exp, setDraft, focusStart]);

  const printSummary = (ymd = summaryDate) => {
    const { stats: s, sales, expenses: dayExp } = buildDailyDaybook({
      invoices,
      expenses,
      day: fromYMD(ymd),
    });
    showPdf(generateDailySummaryPDF({
      shop,
      dateISO: localNoonISO(ymd),
      stats: s,
      sales,
      expenses: dayExp,
    }, "bloburl"));
  };

  const printSummaryRef = useRef(printSummary);
  printSummaryRef.current = printSummary;
  const sqftFocusRef = useRef(null);

  useHotkeyScope(SCOPES.DASHBOARD);
  const flow = useFormFlow({ onSave: addExpense, enabled: !draft });

  useHotkeys(SCOPES.DASHBOARD, [
    { keys: KEYS.save, label: "Kharcha add karein", handler: addExpense, disabled: !!draft },
    { keys: KEYS.saveAlt, label: "Kharcha add karein", handler: addExpense, disabled: !!draft, hidden: true },
    { keys: KEYS.preview, label: "Daily summary print karein", handler: () => printSummaryRef.current() },
    { keys: KEYS.focusSearch, label: "Kharcha amount par jaayein", handler: () => focusStart(0) },
    { keys: KEYS.sqftCalc, label: "Sq-ft calculator par jaayein", handler: () => sqftFocusRef.current?.() },
  ]);

  useEffect(() => {
    if (params.get("focus") === "expense") {
      focusStart(0);
      setParams({}, { replace: true });
    } else if (params.get("print") === "summary") {
      const dateParam = params.get("date");
      let ymd = toYMD(new Date());
      if (dateParam === "yesterday") ymd = toYMD(addDays(new Date(), -1));
      else if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) ymd = dateParam;
      setSummaryDate(ymd);
      printSummaryRef.current(ymd);
      setParams({}, { replace: true });
    } else if (params.get("focus") === "sqft") {
      setTimeout(() => sqftFocusRef.current?.(), 60);
      setParams({}, { replace: true });
    }
  }, [params, setParams, focusStart]);

  return (
    <div className="space-y-6 ds-fade" data-testid="dashboard-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Namaste</h2>
        <p className="text-sm text-slate-500">Aaj ka hisaab ek nazar me.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          testid="stat-revenue"
          icon={IndianRupee}
          label="Aaj ki kamayi"
          value={money(stats.revenue)}
          tone="emerald"
          onClick={() => navigate("/analytics")}
        />
        <Stat testid="stat-bills" icon={ReceiptText} label="Aaj Bills" value={stats.todayCount} tone="indigo" onClick={() => navigate("/history")} />
        <Stat testid="stat-udhari" icon={Wallet} label="Total Udhari" value={money(stats.totalUdhari)} tone="rose" onClick={() => navigate("/customers?tab=udhari")} />
        <Stat testid="stat-lowstock" icon={AlertTriangle} label="Low Stock" value={stats.lowStock.length} tone="amber" onClick={() => navigate("/inventory?low=1")} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-orange-600" />
            <h3 className="font-display font-bold text-slate-900">Add Expense</h3>
            <Kbd keys={KEYS.gotoExpense} />
          </div>
          <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <NumberInput ref={expAmountRef} data-testid="dash-exp-amount" value={exp.amount} onChange={(v) => setExp({ ...exp, amount: v })} placeholder="Amount ₹" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input data-testid="dash-exp-note" value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} placeholder="Note" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <SegmentedControl
                  value={exp.mode}
                  onChange={(mode) => setExp({ ...exp, mode })}
                  testPrefix="dash-exp-mode"
                  className="grid grid-cols-2 gap-2"
                  showArrowHint={false}
                  options={[
                    { value: "cash", label: "Cash" },
                    { value: "online", label: "Online" },
                  ]}
                />
              </div>
              <button type="button" data-flow-skip data-testid="dash-add-expense-btn" onClick={addExpense} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95">
                <Plus className="h-4 w-4" /> Add <Kbd keys="enter" tone="dark" />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2">
            <Printer className="h-4 w-4 text-indigo-700" />
            <h3 className="font-display font-bold text-slate-900">Daily Summary</h3>
          </div>
          <DateNav
            value={summaryDate}
            onChange={setSummaryDate}
            min={minSummaryDate}
            testId="dash-summary-date"
          />
          <p className="mt-2 text-sm text-slate-500">
            Is din ki sale, cash/online, udhari aur expenses ka day-book.
          </p>
          <button data-testid="dash-print-summary-btn" onClick={() => printSummary()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95">
            <Printer className="h-4 w-4" /> Print Daily Summary (PDF) <Kbd keys={KEYS.preview} tone="dark" />
          </button>
        </div>
      </div>

      <SqftCard registerFocus={(fn) => { sqftFocusRef.current = fn; }} />

      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={closePdf} title="Daily Summary PDF" />
    </div>
  );
}

function SqftCard({ registerFocus }) {
  const [mode, setMode] = useState("lw");
  const [d, setD] = useState({ roomArea: "", roomLengthFt: "", roomWidthFt: "", size: "", piecesPerBox: "", wastagePct: "" });
  const cardRef = useRef(null);
  const flow = useFormFlow();
  const input = mode === "area" ? { roomArea: d.roomArea } : { roomLengthFt: d.roomLengthFt, roomWidthFt: d.roomWidthFt };
  const inches = tileSizeToInches(d.size);
  const res = sqftCalc({ ...input, ...inches, piecesPerBox: d.piecesPerBox, wastagePct: d.wastagePct, ratePerBox: 0 });
  const F = (k, l) => (
    <div key={k}>
      <label className="text-xs font-semibold text-slate-600">{l}</label>
      <NumberInput
        data-testid={`dash-sqft-${k}`}
        value={d[k]}
        onChange={(v) => setD({ ...d, [k]: v })}
        className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );

  useEffect(() => {
    registerFocus?.(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const first =
        cardRef.current?.querySelector('[data-testid="dash-sqft-mode-lw"]') ||
        cardRef.current?.querySelector("input");
      first?.focus();
    });
  }, [registerFocus]);

  return (
    <div ref={cardRef} className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="dash-sqft-card">
      <div className="mb-3 flex items-center gap-2">
        <Calculator className="h-4 w-4 text-orange-600" />
        <h3 className="font-display font-bold text-slate-900">Quick Sq-ft Calculator</h3>
        <Kbd keys={KEYS.sqftCalc} />
      </div>
      <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="space-y-3">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          testPrefix="dash-sqft-mode"
          className="grid grid-cols-2 gap-2"
          options={[
            { value: "lw", label: "Length × Width" },
            { value: "area", label: "Direct sq-ft" },
          ]}
        />
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {mode === "area" ? F("roomArea", "Area (sq-ft)") : (<>{F("roomLengthFt", "Length (ft)")}{F("roomWidthFt", "Width (ft)")}</>)}
          <div className="col-span-2 md:col-span-3">
            <label className="text-xs font-semibold text-slate-600">Tile size</label>
            <TileSizeSelect testId="dash-sqft-size" value={d.size} onChange={(v) => setD({ ...d, size: v })} />
          </div>
          {F("piecesPerBox", "Pcs / box")}
          {F("wastagePct", "Wastage %")}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-indigo-50 p-3 text-center text-sm">
        <div><p className="text-xs text-slate-500">Area</p><b data-testid="dash-sqft-area">{res.roomArea}</b></div>
        <div><p className="text-xs text-slate-500">Tiles</p><b data-testid="dash-sqft-tiles">{res.tilesNeeded}</b></div>
        <div><p className="text-xs text-slate-500">Boxes + Pcs</p><b data-testid="dash-sqft-boxes">{res.boxesNeeded} + {res.loosePieces}</b></div>
      </div>
    </div>
  );
}
