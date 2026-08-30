"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { money, sqftCalc } from "@/lib/calc";
import { tileSizeToInches } from "@/lib/tileSizes";
import { addDays, fromYMD, fmtLongDate, localNoonISO, toYMD } from "@/lib/dates";
import { buildDailyDaybook, buildDayActivity } from "@/lib/daybook";
import {
  generateBillPDF,
  generateDailySummaryPDF,
  generateStoreCreditConvertReceiptPDF,
  generateUdhariVusoolReceiptPDF,
} from "@/services/billPdf";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import DayActivityDialog, { DayActivityList } from "@/components/DayActivityDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import NumberInput from "@/components/NumberInput";
import TileSizeSelect from "@/components/TileSizeSelect";
import Kbd from "@/components/Kbd";
import SegmentedControl from "@/components/SegmentedControl";
import { useNavigate } from "@/hooks/useNavigate";
import { useOwnedSearchParams } from "@/hooks/useOwnedSearchParams";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { AlertTriangle, IndianRupee, Wallet, ReceiptText, Plus, Calculator, ClipboardList, FileText } from "lucide-react";

const EMPTY_EXP = { amount: "", note: "", mode: "cash" };

const TONE_ICON = {
  emerald: "bg-mint-soft text-mint",
  indigo: "bg-slate-100 text-ink",
  rose: "bg-rose-50 text-rose-600",
  amber: "bg-amber-50 text-amber-700",
};

const TONE_VALUE = {
  emerald: "text-mint",
  indigo: "text-ink",
  rose: "text-rose-600",
  amber: "text-amber-700",
};

const STAT_EDGE = [
  "border-r border-b border-border/80 md:border-b-0",
  "border-b border-border/80 md:border-b-0 md:border-r",
  "border-r border-border/80",
  "",
];

const Stat = ({ icon: Icon, label, value, tone = "indigo", testid, onClick, edge = "" }) => (
  <button
    data-testid={testid}
    onClick={onClick}
    className={`min-w-0 overflow-hidden p-3 text-left transition-colors hover:bg-mint-soft/50 sm:p-4 ${edge}`}
  >
    <div className={`mb-2 inline-flex rounded-control p-1.5 sm:mb-3 ${TONE_ICON[tone] || TONE_ICON.indigo}`}>
      <Icon className="h-3.5 w-3.5" />
    </div>
    <p className="truncate text-[10px] font-medium uppercase tracking-widest text-ink-muted sm:text-[11px]">{label}</p>
    <p className={`mt-1 truncate font-mono text-lg font-semibold tracking-tight tabular-nums sm:text-2xl md:text-3xl ${TONE_VALUE[tone] || TONE_VALUE.indigo}`}>
      {value}
    </p>
  </button>
);

export default function Dashboard() {
  const { products, invoices, customers, expenses, shop, setDraft, draft } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useOwnedSearchParams();
  const [exp, setExp] = useState(EMPTY_EXP);
  const expAmountRef = useRef(null);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();
  const [pdfTitle, setPdfTitle] = useState("PDF");
  const [activityYmd, setActivityYmd] = useState(null);

  const focusStart = usePageFocus(() => expAmountRef.current?.focus(), { enabled: !draft });
  const prevDraft = useRef(draft);
  useEffect(() => {
    if (prevDraft.current && !draft) focusStart();
    prevDraft.current = draft;
  }, [draft, focusStart]);

  const todayDaybook = useMemo(
    () => buildDailyDaybook({ invoices, expenses }),
    [invoices, expenses],
  );
  const todayEvents = useMemo(() => buildDayActivity(todayDaybook), [todayDaybook]);

  const stats = useMemo(() => {
    const totalUdhari = customers.reduce((s, c) => s + (c.totalPending || 0), 0);
    const lowStock = products.filter((p) => ((p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0)) <= (p.lowStockThreshold || 0));
    return {
      salesGross: todayDaybook.stats.salesGross,
      totalUdhari,
      lowStock,
      todayCount: todayDaybook.todayCount,
    };
  }, [products, customers, todayDaybook]);

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

  const activityDaybook = useMemo(
    () => (activityYmd ? buildDailyDaybook({ invoices, expenses, day: fromYMD(activityYmd) }) : null),
    [activityYmd, invoices, expenses],
  );
  const activityEvents = useMemo(
    () => (activityDaybook ? buildDayActivity(activityDaybook) : []),
    [activityDaybook],
  );

  const printSummary = (ymd) => setActivityYmd(ymd);

  const openPdfResult = useCallback((result, title) => {
    setPdfTitle(title);
    showPdf(result);
  }, [showPdf]);

  const findInvoice = useCallback((ev) => {
    if (ev?.invoiceId) {
      const byId = invoices.find((i) => i.id === ev.invoiceId);
      if (byId) return byId;
    }
    if (ev?.invoiceNo) return invoices.find((i) => i.invoiceNo === ev.invoiceNo);
    return null;
  }, [invoices]);

  const partyFor = useCallback((ev, inv) => {
    const id = ev?.customerId || inv?.customerId;
    if (id) {
      const c = customers.find((x) => x.id === id);
      if (c) return c;
    }
    return { name: ev?.customerName || inv?.customerName || "Walk-in" };
  }, [customers]);

  const openEventPdf = useCallback((ev) => {
    if (!ev?.pdfKind) return;
    if (ev.pdfKind === "udhari-vusool") {
      const firstNo = ev.allocations?.[0]?.invoiceNo || ev.invoiceNo;
      const inv = findInvoice({ invoiceNo: firstNo, invoiceId: ev.allocations?.[0]?.invoiceId });
      const party = partyFor(ev, inv);
      openPdfResult(
        generateUdhariVusoolReceiptPDF({
          shop,
          customer: party,
          amount: ev.amount,
          mode: ev.mode,
          allocations: ev.allocations,
          remainingUdhari: party.totalPending,
          at: ev.date,
        }, "bloburl"),
        "Udhari vusool",
      );
      return;
    }
    const inv = findInvoice(ev);
    if (!inv) {
      toast.error("Bill nahi mili");
      return;
    }
    const party = partyFor(ev, inv);
    if (ev.pdfKind === "convert-receipt") {
      openPdfResult(
        generateStoreCreditConvertReceiptPDF({
          shop,
          customer: party,
          returnInvoice: inv,
          amount: ev.amount,
          at: ev.date,
          target: ev.convertedTo || inv.settlementConvertedTo,
        }, "bloburl"),
        "Receipt",
      );
      return;
    }
    openPdfResult(
      generateBillPDF({ shop, invoice: inv, customer: party }, "bloburl"),
      inv.type === "return" ? "Return PDF" : "Invoice PDF",
    );
  }, [findInvoice, partyFor, shop, openPdfResult]);

  const openDayPdf = useCallback(() => {
    if (!activityYmd || !activityDaybook) return;
    openPdfResult(generateDailySummaryPDF({
      shop,
      dateISO: localNoonISO(activityYmd),
      ...activityDaybook,
    }, "bloburl"), "Daily Summary PDF");
  }, [activityYmd, activityDaybook, shop, openPdfResult]);

  const openTodaySummaryPdf = useCallback(() => {
    openPdfResult(generateDailySummaryPDF({
      shop,
      dateISO: localNoonISO(toYMD(new Date())),
      ...todayDaybook,
    }, "bloburl"), "Daily Summary PDF");
  }, [shop, todayDaybook, openPdfResult]);

  const printSummaryRef = useRef(printSummary);
  printSummaryRef.current = printSummary;
  const sqftFocusRef = useRef(null);

  useHotkeyScope(SCOPES.DASHBOARD);
  const flow = useFormFlow({ onSave: addExpense, enabled: !draft });

  useHotkeys(SCOPES.DASHBOARD, [
    { keys: KEYS.save, label: "Kharcha add karein", handler: addExpense, disabled: !!draft },
    { keys: KEYS.saveAlt, label: "Kharcha add karein", handler: addExpense, disabled: !!draft, hidden: true },
    { keys: KEYS.focusSearch, label: "Kharcha amount par jaayein", handler: () => focusStart(0) },
    {
      keys: KEYS.gotoExpense,
      label: "Add expense par jaayein",
      handler: () => focusStart(0),
      allowInInput: true,
    },
    {
      keys: KEYS.sqftCalc,
      label: "Sq-ft calculator par jaayein",
      handler: () => sqftFocusRef.current?.(),
      allowInInput: true,
    },
    {
      keys: KEYS.preview,
      label: "Aaj ka summary PDF",
      handler: openTodaySummaryPdf,
      disabled: !!draft,
    },
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
      printSummaryRef.current(ymd);
      setParams({}, { replace: true });
    } else if (params.get("focus") === "sqft") {
      setTimeout(() => sqftFocusRef.current?.(), 60);
      setParams({}, { replace: true });
    }
  }, [params, setParams, focusStart]);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    [],
  );

  return (
    <div className="space-y-8 ds-fade" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <p className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">Namaste</p>
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-muted">{todayLabel}</p>
      </div>

      <div className="ds-panel overflow-hidden">
        <div className="grid grid-cols-2 bg-white md:grid-cols-4">
          <Stat
            testid="stat-revenue"
            icon={IndianRupee}
            label="Total sale"
            value={money(stats.salesGross)}
            tone="emerald"
            edge={STAT_EDGE[0]}
            onClick={() => navigate("/analytics")}
          />
          <Stat testid="stat-bills" icon={ReceiptText} label="Aaj Bills" value={stats.todayCount} tone="indigo" edge={STAT_EDGE[1]} onClick={() => navigate("/history")} />
          <Stat testid="stat-udhari" icon={Wallet} label="Total Udhari" value={money(stats.totalUdhari)} tone="rose" edge={STAT_EDGE[2]} onClick={() => navigate("/customers?tab=udhari")} />
          <Stat testid="stat-lowstock" icon={AlertTriangle} label="Low Stock" value={stats.lowStock.length} tone="amber" edge={STAT_EDGE[3]} onClick={() => navigate("/inventory?low=1")} />
        </div>
      </div>

      <div className="grid items-stretch gap-4 lg:grid-cols-12">
        <div className="ds-panel flex h-full flex-col p-5 lg:col-span-4">
          <div className="mb-4 flex items-center gap-2">
            <IndianRupee className="h-4 w-4 text-ink-muted" />
            <h3 className="font-display text-base font-semibold text-ink">Add Expense</h3>
            <Kbd keys={KEYS.gotoExpense} />
          </div>
          <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="flex flex-1 flex-col justify-between gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label htmlFor="dash-exp-amount" className="mb-1 block text-xs font-semibold text-ink-muted">Amount</label>
                <NumberInput ref={expAmountRef} id="dash-exp-amount" data-testid="dash-exp-amount" value={exp.amount} onChange={(v) => setExp({ ...exp, amount: v })} placeholder="₹" className="w-full rounded-control border border-border bg-canvas/40 px-3 py-2 text-sm outline-none focus:border-mint" />
              </div>
              <div className="min-w-0">
                <label htmlFor="dash-exp-note" className="mb-1 block text-xs font-semibold text-ink-muted">Note</label>
                <input id="dash-exp-note" data-testid="dash-exp-note" value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} placeholder="Petrol, chai…" className="w-full rounded-control border border-border bg-canvas/40 px-3 py-2 text-sm outline-none focus:border-mint" />
              </div>
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
              <button type="button" data-flow-skip data-testid="dash-add-expense-btn" onClick={addExpense} className="flex flex-1 items-center justify-center gap-1 rounded-control bg-mint px-3 py-1.5 text-sm font-semibold text-white active:scale-95">
                <Plus className="h-4 w-4" /> Add <Kbd keys="enter" tone="dark" />
              </button>
            </div>
          </div>
        </div>

        <div className="flex lg:col-span-8">
          <SqftCard registerFocus={(fn) => { sqftFocusRef.current = fn; }} />
        </div>
      </div>

      <div className="ds-panel overflow-hidden" data-testid="dash-today-activity">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <ClipboardList className="h-4 w-4 text-ink-muted" />
          <h3 className="font-display text-base font-semibold text-ink">Aaj ki activity</h3>
          <button
            type="button"
            data-testid="dash-activity-pdf-btn"
            onClick={openTodaySummaryPdf}
            className="ml-auto inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1.5 text-xs font-semibold text-ink hover:bg-canvas/60"
          >
            <FileText className="h-3.5 w-3.5" /> PDF <Kbd keys={KEYS.preview} />
          </button>
        </div>
        {todayEvents.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-6">
            <p className="text-sm text-ink-muted" data-testid="dash-activity-empty">
              Aaj abhi koi bill, vusool ya kharcha nahi.
            </p>
            <button
              type="button"
              data-testid="dash-activity-new-bill"
              onClick={() => navigate("/bill")}
              className="inline-flex items-center gap-1.5 rounded-control bg-mint px-3 py-2 text-sm font-semibold text-white hover:bg-mint-dark"
            >
              <Plus className="h-4 w-4" /> Naya bill
            </button>
          </div>
        ) : (
          <div>
            <DayActivityList
              events={todayEvents}
              onSelect={openEventPdf}
              variant="plain"
            />
          </div>
        )}
      </div>

      <DayActivityDialog
        open={!!activityYmd}
        title={activityYmd ? fmtLongDate(fromYMD(activityYmd)) : "Aaj ki activity"}
        events={activityEvents}
        onClose={() => setActivityYmd(null)}
        onPdf={openDayPdf}
        onSelect={openEventPdf}
      />
      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={closePdf} title={pdfTitle} />
    </div>
  );
}

function Field({ label, htmlFor, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

function SqftCard({ registerFocus }) {
  const [mode, setMode] = useState("lw");
  const [d, setD] = useState({
    roomArea: "",
    roomLengthFt: "",
    roomWidthFt: "",
    size: "",
    piecesPerBox: "",
  });
  const cardRef = useRef(null);
  const pendingMeasure = useRef(false);
  const flow = useFormFlow();
  const input = mode === "area" ? { roomArea: d.roomArea } : { roomLengthFt: d.roomLengthFt, roomWidthFt: d.roomWidthFt };
  const inches = tileSizeToInches(d.size);
  const res = sqftCalc({ ...input, ...inches, piecesPerBox: d.piecesPerBox, wastagePct: 0, ratePerBox: 0 });
  const packed = Number(d.piecesPerBox) > 0;
  const quoted = res.tilesNeeded > 0 && packed;
  const numCls = "w-full rounded-control border border-border bg-canvas/40 px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-mint";
  const sizeCls = "ds-combo bg-canvas/40";

  const focusMeasure = useCallback(() => {
    const el =
      cardRef.current?.querySelector('[data-testid="dash-sqft-roomArea"]') ||
      cardRef.current?.querySelector('[data-testid="dash-sqft-roomLengthFt"]');
    el?.focus();
  }, []);

  useEffect(() => {
    registerFocus?.(() => {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      const first =
        cardRef.current?.querySelector('[data-testid="dash-sqft-mode-lw"]') ||
        cardRef.current?.querySelector("input");
      try {
        first?.focus({ focusVisible: true });
      } catch {
        first?.focus();
      }
    });
  }, [registerFocus]);

  useEffect(() => {
    if (!pendingMeasure.current) return;
    pendingMeasure.current = false;
    focusMeasure();
  }, [mode, focusMeasure]);

  const focusMode = useCallback(() => {
    const el =
      cardRef.current?.querySelector(`[data-testid="dash-sqft-mode-${mode}"]`) ||
      cardRef.current?.querySelector('[data-testid="dash-sqft-mode-lw"]');
    el?.focus();
  }, [mode]);

  const handleSqftKeys = useCallback((e) => {
    // Shift+Enter on first measure field returns to L×W / Sq-ft toggle.
    if (e.key === "Enter" && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const id = e.target?.getAttribute?.("data-testid") || "";
      if (id === "dash-sqft-roomLengthFt" || id === "dash-sqft-roomArea") {
        e.preventDefault();
        e.stopPropagation();
        focusMode();
        return;
      }
    }
    flow.handleKeyDown(e);
  }, [flow, focusMode]);

  return (
    <div ref={cardRef} className="ds-panel flex w-full flex-col p-5 lg:h-full" data-testid="dash-sqft-card">
      <div ref={flow.containerRef} onKeyDown={handleSqftKeys} className="flex flex-col gap-3 lg:flex-1 lg:justify-between">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-ink-muted" />
            <h3 className="font-display text-base font-semibold text-ink">Quick sq-ft calculator</h3>
            <Kbd keys={KEYS.sqftCalc} />
          </div>
          <SegmentedControl
            value={mode}
            onChange={setMode}
            testPrefix="dash-sqft-mode"
            className="grid w-full grid-cols-2 gap-1 sm:w-44"
            showArrowHint={false}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey) return;
              if (e.defaultPrevented) {
                pendingMeasure.current = true;
                return;
              }
              requestAnimationFrame(() => {
                const ae = document.activeElement;
                const id = ae?.getAttribute?.("data-testid") || "";
                if (id.startsWith("dash-sqft-mode-")) focusMeasure();
              });
            }}
            options={[
              { value: "lw", label: "L × W" },
              { value: "area", label: "Sq-ft" },
            ]}
          />
        </div>

        <div className={mode === "area" ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "grid grid-cols-2 gap-3 lg:grid-cols-4"}>
          {mode === "area" ? (
            <>
              <Field label="Area (sq-ft)" htmlFor="dash-sqft-roomArea" className="col-start-1 row-start-1">
                <NumberInput id="dash-sqft-roomArea" data-testid="dash-sqft-roomArea" value={d.roomArea} onChange={(v) => setD({ ...d, roomArea: v })} className={numCls} />
              </Field>
              <Field label="Tile size" className="col-span-2 row-start-2 sm:col-span-1 sm:col-start-2 sm:row-start-1">
                <TileSizeSelect testId="dash-sqft-size" value={d.size} onChange={(v) => setD({ ...d, size: v })} className={sizeCls} />
              </Field>
              <Field label="Pcs / box" htmlFor="dash-sqft-piecesPerBox" className="col-start-2 row-start-1 sm:col-start-3">
                <NumberInput id="dash-sqft-piecesPerBox" data-testid="dash-sqft-piecesPerBox" value={d.piecesPerBox} onChange={(v) => setD({ ...d, piecesPerBox: v })} className={numCls} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Length (ft)" htmlFor="dash-sqft-roomLengthFt">
                <NumberInput id="dash-sqft-roomLengthFt" data-testid="dash-sqft-roomLengthFt" value={d.roomLengthFt} onChange={(v) => setD({ ...d, roomLengthFt: v })} className={numCls} />
              </Field>
              <Field label="Width (ft)" htmlFor="dash-sqft-roomWidthFt">
                <NumberInput id="dash-sqft-roomWidthFt" data-testid="dash-sqft-roomWidthFt" value={d.roomWidthFt} onChange={(v) => setD({ ...d, roomWidthFt: v })} className={numCls} />
              </Field>
              <Field label="Tile size">
                <TileSizeSelect testId="dash-sqft-size" value={d.size} onChange={(v) => setD({ ...d, size: v })} className={sizeCls} />
              </Field>
              <Field label="Pcs / box" htmlFor="dash-sqft-piecesPerBox">
                <NumberInput id="dash-sqft-piecesPerBox" data-testid="dash-sqft-piecesPerBox" value={d.piecesPerBox} onChange={(v) => setD({ ...d, piecesPerBox: v })} className={numCls} />
              </Field>
            </>
          )}
        </div>

        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-canvas/50">
          <div className="border-r border-border px-2 py-2.5 sm:px-3 lg:flex lg:items-baseline lg:justify-between lg:gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Area</p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-ink lg:mt-0 lg:text-right lg:text-lg">
              <span data-testid="dash-sqft-area">{res.roomArea}</span>
              <span className="ml-1 font-sans text-xs font-normal text-ink-muted">sq-ft</span>
            </p>
          </div>
          <div className="border-r border-border px-2 py-2.5 sm:px-3 lg:flex lg:items-baseline lg:justify-between lg:gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Tiles</p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums text-ink lg:mt-0 lg:text-right lg:text-lg" data-testid="dash-sqft-tiles">{res.tilesNeeded}</p>
          </div>
          <div className="px-2 py-2.5 sm:px-3 lg:flex lg:items-baseline lg:justify-between lg:gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Boxes + loose</p>
            <p className={`mt-0.5 font-mono text-base font-semibold tabular-nums lg:mt-0 lg:text-right lg:text-lg ${quoted ? "text-ink" : "text-ink-muted/50"}`} data-testid="dash-sqft-boxes">
              {res.boxesNeeded} + {res.loosePieces}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

