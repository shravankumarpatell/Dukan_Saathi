"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useNavigate } from "@/hooks/useNavigate";
import CustomerSearch from "@/components/CustomerSearch";
import ProductSearch from "@/components/ProductSearch";
import NumberInput from "@/components/NumberInput";
import SegmentedControl from "@/components/SegmentedControl";
import SlabMeasureGrid from "@/components/SlabMeasureGrid";
import Kbd from "@/components/Kbd";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { usePageFocus } from "@/hooks/usePageFocus";
import { useFormFlow } from "@/hooks/useFormFlow";
import { useQuickCreate } from "@/context/QuickCreateContext";
import { SCOPES, KEYS } from "@/lib/keymap";
import { money, round2 } from "@/lib/calc";
import { convertAreaRate, filledRows, formatArea, padMeasureRows, totalArea } from "@/lib/slab";
import { isSlabProduct, unitShort } from "@/lib/uom";
import {
  SLAB_DEFAULT_ROWS,
  SLAB_MAX_ROWS,
  clearSlabDraft,
  consumePendingSlabBill,
  deleteSlabForm,
  emptySlabForm,
  loadSavedSlabForms,
  loadSlabDraft,
  saveSlabDraft,
  saveSlabForm,
  setPendingSlabBill,
  sharePdfBlob,
  slabFormHasPieces,
  slabFormToBillLine,
} from "@/lib/slabEstimates";
import { generateSlabEstimatePDF } from "@/services/billPdf";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FileText, FolderOpen, Plus, ReceiptText,
  RotateCcw, Save, Share2, Trash2,
} from "lucide-react";

const FLD = "w-full rounded-control border border-border bg-canvas/40 px-3 py-2 text-sm outline-none hover:border-mint focus:border-mint";
const NUM = `${FLD} text-right tabular-nums`;

function initialSlabForm() {
  const d = loadSlabDraft();
  if (!d) return emptySlabForm();
  if (!filledRows(d.rows).length && (d.rows?.length || 0) > SLAB_DEFAULT_ROWS) {
    return { ...d, rows: padMeasureRows([], SLAB_DEFAULT_ROWS), startingRow: 1 };
  }
  return d;
}

export default function SlabEstimate() {
  const { shop, products, customers, invoices } = useApp();
  const quickCreate = useQuickCreate();
  const navigate = useNavigate();
  const partyRef = useRef(null);
  const qualityRef = useRef(null);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();

  const [form, setForm] = useState(initialSlabForm);
  const [savedList, setSavedList] = useState(() => loadSavedSlabForms());
  const [formsOpen, setFormsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [resetOpen, setResetOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const slabProducts = useMemo(() => (products || []).filter(isSlabProduct), [products]);
  const patch = useCallback((partial) => {
    setForm((f) => ({ ...f, ...partial }));
  }, []);

  useEffect(() => {
    saveSlabDraft(form);
  }, [form]);

  const filled = filledRows(form.rows);
  const displayArea = totalArea(form.rows, form.measureUnit, form.areaUnit);
  const rateN = Number(form.rate) || 0;
  const cost = round2(displayArea * rateN);

  const changeAreaUnit = useCallback((next) => {
    setForm((f) => {
      const n = Number(f.rate);
      const rate = n > 0
        ? String(Math.round(convertAreaRate(n, f.areaUnit, next) * 10000) / 10000)
        : f.rate;
      return { ...f, areaUnit: next, rate };
    });
  }, []);

  const resetGrid = useCallback(() => {
    setForm((f) => ({ ...f, rows: padMeasureRows([], SLAB_DEFAULT_ROWS), startingRow: 1 }));
  }, []);

  const newForm = useCallback(() => {
    const blank = emptySlabForm();
    setForm(blank);
    clearSlabDraft();
    saveSlabDraft(blank);
    toast.message("Naya form");
  }, []);

  const saveForm = useCallback(() => {
    saveSlabForm(form);
    setSavedList(loadSavedSlabForms());
    const blank = emptySlabForm();
    setForm(blank);
    clearSlabDraft();
    saveSlabDraft(blank);
    toast.success("Form save ho gaya — naya form ready");
  }, [form]);

  const loadForm = useCallback((saved) => {
    setForm(saved);
    setFormsOpen(false);
    toast.success("Form load ho gaya");
  }, []);

  const removeSaved = useCallback((id, e) => {
    e?.stopPropagation();
    deleteSlabForm(id);
    setSavedList(loadSavedSlabForms());
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (form.id === id) setForm((f) => ({ ...f, id: "", savedAt: "" }));
  }, [form.id]);

  const openForms = useCallback(() => {
    setSavedList(loadSavedSlabForms());
    setSelectedIds(new Set());
    setFormsOpen(true);
  }, []);

  const toggleSelected = useCallback((id, e) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const confirmReset = useCallback(() => {
    newForm();
    setResetOpen(false);
    toast.success("Form reset ho gaya");
  }, [newForm]);

  const buildPdf = useCallback((output) => (
    generateSlabEstimatePDF({ shop, form }, output)
  ), [shop, form]);

  const previewPdf = useCallback(() => {
    showPdf(buildPdf("bloburl"));
  }, [buildPdf, showPdf]);

  const sharePdf = useCallback(async () => {
    setSharing(true);
    try {
      const blob = buildPdf("blob");
      const file = typeof blob === "string" ? null : blob;
      const name = `${(form.partyName || "Party").replace(/\s+/g, "_")}_slab.pdf`;
      const result = await sharePdfBlob(file, name, `Slab estimate — ${form.quality || "stone"}`);
      if (result === "shared") toast.success("PDF share ho gaya");
      else toast.success("PDF download ho gaya — WhatsApp se bhej sakte ho");
    } catch (err) {
      if (err?.name === "AbortError") return;
      toast.error(err?.message || "Share nahi hua");
    } finally {
      setSharing(false);
    }
  }, [buildPdf, form.partyName, form.quality]);

  const productForForm = useCallback((f) => (
    slabProducts.find((p) => p.id === f.productId)
      || slabProducts.find((p) => p.name.toLowerCase() === String(f.quality || "").trim().toLowerCase())
      || null
  ), [slabProducts]);

  const createBill = useCallback(() => {
    if (!slabFormHasPieces(form)) return toast.error("Kam se kam ek slab naapiye");
    if (!(rateN > 0)) return toast.error("Rate daaliye");
    const product = productForForm(form);
    if (!product) return toast.error("Quality stock se choose karein — bill ke liye SKU chahiye");
    const line = slabFormToBillLine(form, product);
    if (!line) return toast.error("Estimate bill ke liye ready nahi");
    // consumePending is also called on New Bill; stash so a leftover empty consume is harmless.
    consumePendingSlabBill();
    setPendingSlabBill({
      customerName: form.partyName || "",
      vehicleNo: form.vehicleNo || "",
      items: [line],
    });
    saveForm();
    navigate("/bill");
    toast.success("Bill pe estimate aa gaya — payment lein");
  }, [form, rateN, productForForm, saveForm, navigate]);

  const createBillFromSelected = useCallback(() => {
    const chosen = savedList.filter((s) => selectedIds.has(s.id));
    if (!chosen.length) return toast.error("Pehle form select karein");
    const lines = [];
    const skipped = [];
    for (const f of chosen) {
      const product = slabFormHasPieces(f) && Number(f.rate) > 0 ? productForForm(f) : null;
      const line = product ? slabFormToBillLine(f, product) : null;
      if (line) lines.push(line);
      else skipped.push(f.partyName ? `${f.partyName} · ${f.quality || "?"}` : (f.quality || "form"));
    }
    if (!lines.length) return toast.error("Selected forms bill ke liye ready nahi — rate/SKU check karein");
    const primary = chosen.find((s) => productForForm(s) && slabFormHasPieces(s)) || chosen[0];
    consumePendingSlabBill();
    setPendingSlabBill({
      customerName: primary.partyName || "",
      vehicleNo: primary.vehicleNo || "",
      items: lines,
    });
    setFormsOpen(false);
    navigate("/bill");
    if (skipped.length) toast.warning(`Skip huए: ${skipped.join(", ")}`);
    toast.success(`${lines.length} estimate bill pe aa gaye — payment lein`);
  }, [savedList, selectedIds, productForForm, navigate]);

  const pickParty = useCallback((c) => {
    patch({ partyName: c?.name || "" });
  }, [patch]);

  const pickQuality = useCallback((p) => {
    if (!p) return;
    setForm((f) => {
      const dest = p.unit || "sqft";
      let rate = Number(p.sellPrice) || 0;
      if (rate > 0 && dest !== f.areaUnit) {
        rate = convertAreaRate(rate, dest, f.areaUnit);
      }
      return {
        ...f,
        quality: p.name,
        productId: p.id,
        rate: rate > 0 ? String(Math.round(rate * 10000) / 10000) : f.rate,
      };
    });
  }, []);

  const createQuality = useCallback(async (name = "") => {
    const product = await quickCreate("product", name || "");
    if (product) pickQuality(product);
    else qualityRef.current?.focus();
  }, [quickCreate, pickQuality]);

  useHotkeyScope(SCOPES.SLAB, { enabled: !pdfUrl && !formsOpen && !resetOpen });
  useHotkeys(SCOPES.SLAB, [
    { keys: KEYS.save, label: "Save form", handler: saveForm, allowInInput: true },
    { keys: KEYS.saveAlt, label: "Save form", handler: saveForm, allowInInput: true, hidden: true },
    { keys: KEYS.preview, label: "Generate PDF", handler: previewPdf, allowInInput: true },
    { keys: KEYS.quickCreate, label: "Naya quality / item", handler: () => createQuality("") },
    { keys: KEYS.clearBill, label: "Reset form", handler: () => setResetOpen(true) },
  ]);

  // Remember the last field the cashier touched so returning to the page keeps
  // the caret there instead of snapping back to the party name.
  const lastFocusedRef = useRef(null);
  const rememberFocus = useCallback((e) => {
    const el = e.target;
    if (el && typeof el.focus === "function" && el.tagName !== "BODY") {
      lastFocusedRef.current = el;
    }
  }, []);
  const restoreFocus = useCallback(() => {
    const el = lastFocusedRef.current;
    if (el && el.isConnected) el.focus();
    else partyRef.current?.focus();
  }, []);

  usePageFocus(restoreFocus, { enabled: !pdfUrl && !formsOpen && !resetOpen });
  const flow = useFormFlow({ onSave: saveForm });

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-28 lg:pb-8" ref={flow.containerRef} onKeyDown={flow.handleKeyDown} onFocusCapture={rememberFocus}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Slab Estimate</h2>
          <p className="text-xs text-ink-muted">Naap yahan. Customer pay kare tab New Bill se invoice.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-testid="slab-new-form" onClick={newForm} className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink hover:bg-mint-soft">
            <Plus className="h-4 w-4" /> Naya form
          </button>
          <button type="button" data-testid="slab-my-forms" onClick={openForms} className="inline-flex items-center gap-1.5 rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink hover:bg-mint-soft">
            <FolderOpen className="h-4 w-4" /> Saved forms
          </button>
        </div>
      </div>

      <section className="ds-panel space-y-3 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Estimate details</p>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-muted">Party name</label>
          <CustomerSearch
            ref={partyRef}
            customers={customers}
            value={form.partyName}
            onChangeText={(v) => patch({ partyName: v })}
            onPick={pickParty}
            onCreateNew={(name) => patch({ partyName: name })}
            placeholder="Party / customer"
            inputTestId="slab-party"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-muted">Quality</label>
          <ProductSearch
            ref={qualityRef}
            products={slabProducts}
            invoices={invoices}
            onPick={pickQuality}
            onCreateNew={createQuality}
            includeOutOfStock
            inputTestId="slab-quality"
            placeholder={form.quality || "Stock se choose…"}
          />
          {form.quality ? (
            <p className="mt-1 truncate text-sm font-semibold text-ink" data-testid="slab-quality-label">
              {form.quality}
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-muted">
              Stock se choose karein. Naya quality: <Kbd keys={KEYS.quickCreate} />
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted" htmlFor="slab-vehicle">Vehicle No</label>
            <input id="slab-vehicle" data-testid="slab-vehicle" value={form.vehicleNo} onChange={(e) => patch({ vehicleNo: e.target.value })} className={FLD} placeholder="Vehicle number" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-muted" htmlFor="slab-lot">Lot No</label>
            <input id="slab-lot" data-testid="slab-lot" value={form.lotNo} onChange={(e) => patch({ lotNo: e.target.value })} className={FLD} placeholder="Lot No" />
          </div>
        </div>
      </section>

      <section className="ds-panel space-y-3 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">Units</p>
        <SegmentedControl
          label="Measurement unit"
          testPrefix="slab-measure"
          value={form.measureUnit}
          onChange={(v) => patch({ measureUnit: v })}
          className="grid grid-cols-3 gap-1"
          showArrowHint={false}
          options={[
            { value: "cm", label: "CM" },
            { value: "inch", label: "Inches" },
            { value: "ft", label: "Feet" },
          ]}
        />
        <SegmentedControl
          label="Total area unit"
          testPrefix="slab-area"
          value={form.areaUnit}
          onChange={changeAreaUnit}
          className="grid grid-cols-2 gap-1"
          showArrowHint={false}
          options={[
            { value: "sqft", label: "Sq.ft" },
            { value: "sqm", label: "Sq.m" },
          ]}
        />
      </section>

      <section className="ds-panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">Phone pe Next: Length → Width → agli row. Last row pe Next nayi row banata hai.</p>
          <button type="button" data-testid="slab-reset-grid" onClick={resetGrid} className="rounded-control border border-border px-3 py-2 text-sm font-semibold text-ink hover:bg-canvas">
            Reset rows
          </button>
        </div>

        <SlabMeasureGrid
          rows={form.rows}
          onChange={(rows) => patch({ rows })}
          measureUnit={form.measureUnit}
          areaUnit={form.areaUnit}
          startSr={1}
          minRows={SLAB_DEFAULT_ROWS}
          maxRows={SLAB_MAX_ROWS}
          showAddRows={false}
        />
      </section>

      <section className="ds-panel space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink">Total {unitShort(form.areaUnit)}</span>
          <span className="rounded-full bg-mint-soft px-3 py-1 font-mono text-sm font-semibold tabular-nums text-mint-dark" data-testid="slab-total-area">
            {formatArea(displayArea)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="text-sm font-semibold text-ink" htmlFor="slab-rate">Price / {unitShort(form.areaUnit)}</label>
          <div className="flex w-40 items-center gap-1">
            <span className="text-ink-muted">₹</span>
            <NumberInput id="slab-rate" data-testid="slab-rate" value={form.rate} onChange={(v) => patch({ rate: v })} className={NUM} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink">Total cost</span>
          <span className="rounded-full bg-mint px-3 py-1.5 font-mono text-sm font-semibold tabular-nums text-white" data-testid="slab-total-cost">
            {money(cost)}
          </span>
        </div>
        <p className="text-xs text-ink-muted">{filled.length} slabs naapi</p>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" data-testid="slab-save-form" onClick={saveForm} className="inline-flex items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-semibold text-white hover:bg-mint-dark">
          <Save className="h-4 w-4" /> Save form <Kbd keys={KEYS.save} tone="dark" />
        </button>
        <button type="button" data-testid="slab-generate-pdf" onClick={previewPdf} className="inline-flex items-center justify-center gap-2 rounded-control border border-mint/40 bg-mint-soft px-4 py-3 font-semibold text-mint-dark">
          <FileText className="h-4 w-4" /> Generate PDF <Kbd keys={KEYS.preview} />
        </button>
        <button type="button" data-testid="slab-share-pdf" onClick={sharePdf} disabled={sharing} className="inline-flex items-center justify-center gap-2 rounded-control border border-border px-4 py-3 font-semibold text-ink hover:bg-canvas disabled:opacity-60">
          <Share2 className="h-4 w-4" /> Share PDF
        </button>
        <button type="button" data-testid="slab-reset-form" onClick={() => setResetOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-control border border-rose-200 bg-rose-50 px-4 py-3 font-semibold text-rose-700 hover:bg-rose-100">
          <RotateCcw className="h-4 w-4" /> Reset form
        </button>
        <button type="button" data-testid="slab-create-bill" onClick={createBill} className="inline-flex items-center justify-center gap-2 rounded-control border border-border px-4 py-3 font-semibold text-ink hover:bg-mint-soft sm:col-span-2">
          <ReceiptText className="h-4 w-4" /> Create bill (payment)
        </button>
      </div>

      <Dialog open={formsOpen} onOpenChange={setFormsOpen}>
        <DialogContent className="max-w-lg" data-testid="slab-forms-dialog">
          <DialogHeader>
            <DialogTitle>Saved forms</DialogTitle>
          </DialogHeader>
          {savedList.length > 0 && (
            <p className="px-1 text-xs text-ink-muted">
              Tick karke ek saath bill banayein, ya form pe click karke load karein.
            </p>
          )}
          <div className="max-h-[55vh] space-y-1 overflow-auto">
            {savedList.length === 0 ? (
              <p className="px-1 py-6 text-center text-sm text-ink-muted">Abhi koi saved form nahi</p>
            ) : savedList.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                data-testid={`slab-form-${s.id}`}
                onClick={() => loadForm(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    loadForm(s);
                  }
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded-control border border-border px-3 py-2 text-left hover:bg-mint-soft focus:outline-none focus:ring-2 focus:ring-mint"
              >
                <input
                  type="checkbox"
                  data-testid={`slab-form-pick-${s.id}`}
                  checked={selectedIds.has(s.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => toggleSelected(s.id, e)}
                  className="h-4 w-4 shrink-0 accent-mint"
                  title="Bill ke liye select"
                  aria-label="Select form for bill"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{s.partyName || "Walk-in"} · {s.quality || "Quality"}</p>
                  <p className="truncate text-xs text-ink-muted">{s.date} {s.vehicleNo ? `· ${s.vehicleNo}` : ""}</p>
                </div>
                <button
                  type="button"
                  data-testid={`slab-form-del-${s.id}`}
                  onClick={(e) => removeSaved(s.id, e)}
                  className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-sm text-ink-muted">{selectedIds.size} form select</span>
              <button
                type="button"
                data-testid="slab-create-bill-multi"
                onClick={createBillFromSelected}
                className="inline-flex items-center gap-2 rounded-control bg-mint px-4 py-2 font-semibold text-white hover:bg-mint-dark"
              >
                <ReceiptText className="h-4 w-4" /> Create bill ({selectedIds.size})
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent data-testid="slab-reset-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Form reset karein?</AlertDialogTitle>
            <AlertDialogDescription>
              Party, naap aur rate clear ho jaayenge. Saved forms safe rehti hain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction data-testid="slab-reset-confirm" onClick={confirmReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={closePdf} title="Slab estimate" />
    </div>
  );
}
