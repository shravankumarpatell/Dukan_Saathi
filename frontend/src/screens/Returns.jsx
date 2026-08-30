import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import InvoiceSearch from "@/components/InvoiceSearch";
import NumberInput from "@/components/NumberInput";
import Kbd from "@/components/Kbd";
import SegmentedControl from "@/components/SegmentedControl";
import { generateBillPDF, generateStoreCreditConvertReceiptPDF } from "@/services/billPdf";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { money, itemAmount, round2, fmtDate } from "@/lib/calc";
import { estimateReturnSettlementDetail, formatSettlementDetail } from "@/lib/settlement";
import {
  isBoxUnit, qtyFieldLabel, formatQtyLabel, formatAvailLabel,
  lineSoldPieces, remainingReturnableByProduct, priorReturnsForSale,
  remainingReturnableAmount, clampSaleQtyFields,
} from "@/lib/units";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { useListNavigation } from "@/hooks/useListNavigation";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { Eye, Save, Search, Pencil, AlertTriangle, ReceiptText } from "lucide-react";

// Persist returns form state across navigation
const STORAGE_KEY = "ds_returns_draft";
function loadDraft() { try { const raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function saveDraft(state) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
function clearDraft() { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} }

const SETTLEMENTS = [["cash", "Cash refund"], ["adjust_udhari", "Adjust udhari"], ["store_credit", "Store credit"]];
const CONVERT_TARGETS = [["cash", "Cash refund"], ["adjust_udhari", "Adjust udhari"]];

function isStoreCreditReturn(inv) {
  if ((inv?.settlement || "") === "store_credit") return true;
  return Number(inv?.settlementDetail?.storeCredit) > 0.01;
}

function heldStoreCredit(inv) {
  const detail = inv?.settlementDetail;
  if (detail && typeof detail.storeCredit === "number" && detail.storeCredit > 0) {
    return round2(detail.storeCredit);
  }
  if ((inv?.settlement || "") === "store_credit") {
    return round2(Number(inv.refundTotal) || Number(inv.grandTotal) || 0);
  }
  return 0;
}

// A settlement is only offered when the customer can actually absorb it:
// udhari needs a pending balance, store credit needs a saved customer.
function settlementBlocker(mode, customer) {
  if (mode === "cash") return null;
  if (!customer) return "Walk-in bill — sirf cash";
  if (mode === "adjust_udhari" && (Number(customer.totalPending) || 0) <= 0.5) return "Koi udhari baaki nahi";
  return null;
}

/**
 * Settlement choice as a proper radio group: it sits in the Enter chain, and
 * ←/→ move between the options without ever needing the mouse.
 */
function SettlementPicker({ value, onChange, customer, testPrefix = "settle" }) {
  const options = SETTLEMENTS.map(([v, l]) => ({
    value: v,
    label: l,
    disabled: !!settlementBlocker(v, customer),
    title: settlementBlocker(v, customer) || l,
  }));

  return (
    <div>
      <SegmentedControl
        label="Settlement"
        value={value}
        onChange={onChange}
        testPrefix={testPrefix}
        className="grid grid-cols-3 gap-2"
        options={options}
      />
      {customer ? (
        <p className="mt-1 text-xs text-slate-500">
          Udhari {money(customer.totalPending || 0)} · Store credit {money(customer.storeCredit || 0)}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Walk-in customer — udhari/store credit available nahi.</p>
      )}
    </div>
  );
}

export default function Returns() {
  const { invoices, customers, shop, commitBill, convertStoreCreditReturn } = useApp();
  const saved = useRef(loadDraft());
  const s = saved.current;
  const invSearchRef = useRef(null);
  const pageRef = useRef(null);
  /** Last focused control on this page (data-testid) — used to restore after PDF. */
  const lastFocusTestIdRef = useRef(null);

  const [tab, setTab] = useState("new");
  const [invNo, setInvNo] = useState(s?.invNo || "");
  const [src, setSrc] = useState(s?.src || null);
  const [rows, setRows] = useState(s?.rows || []);
  const [settlement, setSettlement] = useState(s?.settlement || "cash");
  const [refund, setRefund] = useState(s?.refund || "");
  const [saving, setSaving] = useState(false);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();
  const [pdfTitle, setPdfTitle] = useState("Return PDF");

  // Track caret by test id so PDF close can restore even if the old DOM node remounted.
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const onFocusIn = (e) => {
      const el = e.target?.closest?.("[data-testid]");
      if (!el || !root.contains(el)) return;
      const id = el.getAttribute("data-testid");
      if (!id || id === "returns-page" || id === "return-detail" || id === "pdf-viewer-frame") return;
      lastFocusTestIdRef.current = id;
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);

  const restoreFocusAfterPdf = useCallback(() => {
    const id = lastFocusTestIdRef.current;
    if (id) {
      const el = document.querySelector(`[data-testid="${CSS.escape(id)}"]`);
      if (el && typeof el.focus === "function") {
        el.focus();
        return;
      }
    }
    if (src) {
      const refundEl = document.querySelector('[data-testid="return-refund"]');
      if (refundEl && typeof refundEl.focus === "function") {
        refundEl.focus();
        return;
      }
      document.querySelector('[data-testid="return-qty-0"]')?.focus();
      return;
    }
    invSearchRef.current?.focus();
  }, [src]);

  const openPdf = useCallback((result, title) => {
    // Snapshot again at open time (Enter on last field may not have fired focusin lately,
    // but activeElement is still the refund input).
    const active = document.activeElement;
    const el = active?.closest?.("[data-testid]");
    if (el && pageRef.current?.contains(el)) {
      const id = el.getAttribute("data-testid");
      if (id && id !== "returns-page" && id !== "return-detail") {
        lastFocusTestIdRef.current = id;
      }
    }
    if (title) setPdfTitle(title);
    showPdf(result);
  }, [showPdf]);

  const handleClosePdf = useCallback(() => {
    closePdf();
    // After Radix Dialog focus-restore settles, put caret back on the field we left.
    setTimeout(restoreFocusAfterPdf, 100);
  }, [closePdf, restoreFocusAfterPdf]);

  // Persist form state
  useEffect(() => {
    saveDraft({ invNo, src, rows, settlement, refund });
  }, [invNo, src, rows, settlement, refund]);

  const customer = useMemo(
    () => (src?.customerId ? customers.find((c) => c.id === src.customerId) || null : null),
    [customers, src]
  );

  // Never leave an impossible settlement selected (e.g. udhari already cleared)
  useEffect(() => {
    if (settlementBlocker(settlement, customer)) setSettlement("cash");
  }, [settlement, customer]);

  const selectInvoice = (inv) => {
    setInvNo(inv.invoiceNo);
    setSrc(inv);
    setRows((inv.items || []).map((it) => ({ ...it, retQty: "", retPieces: "" })));
    setRefund(""); setSettlement("cash");
  };

  const remainingByProduct = useMemo(() => {
    if (!src) return {};
    const priorItems = priorReturnsForSale(src, invoices).flatMap((r) => r.items || []);
    return remainingReturnableByProduct(src.items || [], priorItems);
  }, [src, invoices]);

  const maxRefund = useMemo(
    () => (src ? remainingReturnableAmount(src, invoices) : 0),
    [src, invoices]
  );

  const updRow = (i, patch) => {
    setRows((prev) => {
      const cur = prev[i];
      if (!cur) return prev;
      let nextPatch = { ...patch };
      // Clamp return qty/pcs to remaining returnable pieces.
      if ("retQty" in patch || "retPieces" in patch) {
        const avail = remainingByProduct[cur.productId] ?? lineSoldPieces(cur);
        const field = "retQty" in patch ? "qty" : "pieces";
        const raw = "retQty" in patch ? patch.retQty : patch.retPieces;
        const clamped = clampSaleQtyFields({
          product: cur,
          qty: "retQty" in patch ? patch.retQty : cur.retQty,
          pieces: "retPieces" in patch ? patch.retPieces : cur.retPieces,
          field,
          raw,
          availPieces: avail,
        });
        nextPatch = { retQty: clamped.qty, retPieces: clamped.pieces };
      }
      const next = prev.map((it, idx) => (idx === i ? { ...it, ...nextPatch } : it));
      let total = next.reduce((s, it) => s + itemAmount({ ...it, qty: it.retQty, pieces: it.retPieces }), 0);
      total = round2(Math.min(total, maxRefund));
      setRefund(total ? String(total) : "");
      return next;
    });
  };

  const setRefundCapped = (v) => {
    const n = Number(v);
    if (v === "" || v === "." || !Number.isFinite(n)) return setRefund(v);
    setRefund(String(Math.min(Math.max(0, n), maxRefund)));
  };

  const returned = rows.map((it) => ({
    ...it,
    qty: Number(it.retQty) || 0,
    pieces: isBoxUnit(it) ? (Number(it.retPieces) || 0) : 0,
  })).filter((it) => it.qty > 0 || it.pieces > 0);

  const reset = () => { setInvNo(""); setSrc(null); setRows([]); setRefund(""); setSettlement("cash"); clearDraft(); };

  const buildDraft = () => ({
    kind: "return", type: "return", createdVia: "manual", language: "hi",
    items: returned, refundTotal: Number(refund) || 0, settlement,
    originalInvoiceNo: src.invoiceNo, customerId: src.customerId || null, customerName: src.customerName || "Walk-in",
    gstEnabled: false,
  });

  const preview = useCallback(() => {
    if (!src) return toast.error("Pehle invoice chunein");
    if (returned.length === 0) return toast.error("Kam se kam ek item return karein");
    const inv = {
      ...buildDraft(),
      invoiceNo: "RET-PREVIEW",
      date: new Date().toISOString(),
      settlementDetail: estimateReturnSettlementDetail({
        settlement,
        refund: Number(refund) || 0,
        originalPending: src.amountPending,
        totalPending: customer?.totalPending,
      }),
    };
    openPdf(
      generateBillPDF({ shop, invoice: inv, customer: { name: src.customerName || "Walk-in" } }, "bloburl"),
      "Return PDF"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, returned, refund, settlement, shop, openPdf, customer]);

  const openOriginal = useCallback(() => {
    if (!src) return toast.error("Pehle invoice chunein");
    const cust = customer || { name: src.customerName || "Walk-in" };
    openPdf(generateBillPDF({ shop, invoice: src, customer: cust }, "bloburl"), "Original Invoice");
  }, [src, customer, shop, openPdf]);

  const save = useCallback(async () => {
    if (!src) return toast.error("Pehle invoice chunein");
    if (returned.length === 0) return toast.error("Kam se kam ek item return karein");
    if (settlementBlocker(settlement, customer)) return toast.error("Ye settlement is customer par nahi ho sakta");
    const refundAmt = round2(Number(refund) || 0);
    if (refundAmt <= 0) return toast.error("Refund amount daaliye");
    if (refundAmt > maxRefund + 0.01) return toast.error(`Refund max ${money(maxRefund)} ho sakta hai`);
    if (saving) return;
    setSaving(true);
    try {
      const { invoice, customer: cust } = await commitBill({ ...buildDraft(), refundTotal: refundAmt });
      openPdf(
        generateBillPDF({ shop, invoice, customer: cust || { name: invoice.customerName } }, "bloburl"),
        "Return PDF"
      );
      toast.success(`Return ${invoice.invoiceNo} ho gaya`);
      reset();
      setTimeout(() => invSearchRef.current?.focus(), 60);
    } catch (e) { toast.error(e.message || "Return save nahi hua"); } finally { setSaving(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, returned, settlement, customer, saving, refund, maxRefund, shop, commitBill, openPdf]);

  /* ── Keyboard ── */
  useHotkeyScope(SCOPES.RETURNS, { enabled: !pdfUrl });
  const flow = useFormFlow({ onSave: preview, enabled: !pdfUrl });

  usePageFocus(
    () => {
      if (tab === "new") invSearchRef.current?.focus();
    },
    { enabled: tab === "new" && !src && !pdfUrl }
  );

  // After picking an invoice, park the caret on the first return qty field
  // (not invoice search — that is first in the Enter chain).
  useEffect(() => {
    if (!src?.id || tab !== "new") return undefined;
    const t = setTimeout(() => {
      document.querySelector('[data-testid="return-qty-0"]')?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [src?.id, tab]);

  useHotkeys(SCOPES.RETURNS, [
    { keys: KEYS.save, label: "Return save karein", handler: save, disabled: tab !== "new" || saving },
    { keys: KEYS.saveAlt, label: "Return save karein", handler: save, disabled: tab !== "new" || saving, hidden: true },
    { keys: KEYS.preview, label: "Preview PDF", handler: preview, disabled: tab !== "new" },
    { keys: KEYS.openOriginal, label: "Original invoice kholein", handler: openOriginal, disabled: tab !== "new" || !src },
    { keys: KEYS.focusSearch, label: "Invoice search par jaayein", handler: () => invSearchRef.current?.focus(), disabled: tab !== "new" },
    { keys: "alt+1", label: "New return tab", handler: () => setTab("new") },
    { keys: "alt+2", label: "Store-credit convert tab", handler: () => setTab("edit") },
  ]);

  return (
    <div ref={pageRef} className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="returns-page">

      <div className="flex rounded-control border border-border bg-white p-1">
        {[["new", "New Return", "alt+1"], ["edit", "Store-credit convert", "alt+2"]].map(([v, l, k]) => (
          <button key={v} data-testid={`returns-tab-${v}`} onClick={() => setTab(v)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-semibold ${tab === v ? "bg-surface text-white" : "text-ink-muted"}`}>
            {l} <Kbd keys={k} tone={tab === v ? "dark" : "default"} />
          </button>
        ))}
      </div>

      {tab === "edit" ? (
        <ConvertStoreCredit
          invoices={invoices}
          customers={customers}
          shop={shop}
          convertStoreCreditReturn={convertStoreCreditReturn}
          openPdf={openPdf}
        />
      ) : (
        <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="space-y-4">
          <div className="ds-panel p-4">
            <label className="mb-1 flex items-center justify-between gap-2 text-sm font-semibold text-slate-700">
              <span className="flex items-center gap-2">
                Original invoice (search &amp; select) <Kbd keys={KEYS.focusSearch} />
              </span>
              {src && (
                <button
                  type="button"
                  data-testid="open-original-invoice"
                  data-flow-skip
                  onClick={openOriginal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-mint/30 bg-mint-soft px-2 py-1 text-xs font-bold text-mint-dark active:scale-95"
                >
                  <ReceiptText className="h-3.5 w-3.5" />
                  Open bill
                  <Kbd keys={KEYS.openOriginal} />
                </button>
              )}
            </label>
            <InvoiceSearch ref={invSearchRef} invoices={invoices} value={invNo} onChangeText={(t) => { setInvNo(t); setSrc(null); }} onPick={selectInvoice} />
          </div>

          {src && (
            <div className="space-y-4 ds-panel p-4" data-testid="return-detail">
              <div className="flex items-center justify-between text-sm">
                <div><p className="font-display font-bold text-slate-900">{src.customerName}</p><p className="text-xs text-slate-400">{src.invoiceNo} · {fmtDate(src.date)}</p></div>
                <p className="font-bold text-slate-700">{money(src.grandTotal)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Select items to return</p>
                {rows.map((it, i) => {
                  const tile = isBoxUnit(it);
                  const left = remainingByProduct[it.productId] ?? lineSoldPieces(it);
                  return (
                    <div key={i} data-testid={`return-row-${i}`} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{it.name}</p>
                        <span className="text-xs text-slate-400">
                          sold {formatQtyLabel(it)} · left {formatAvailLabel(it, left)}
                        </span>
                      </div>
                      <div className={`mt-2 grid gap-2 ${tile ? "grid-cols-3" : "grid-cols-2"}`}>
                        <div>
                          <label className="text-xs text-slate-500">Return {qtyFieldLabel(it).toLowerCase()}</label>
                          <NumberInput data-testid={`return-qty-${i}`} value={it.retQty} onChange={(v) => updRow(i, { retQty: v })} className="w-full rounded-dense border border-border px-2 py-1.5 text-right text-sm tabular-nums" />
                        </div>
                        {tile && (
                          <div>
                            <label className="text-xs text-slate-500">Pcs</label>
                            <NumberInput data-testid={`return-pieces-${i}`} value={it.retPieces} onChange={(v) => updRow(i, { retPieces: v })} className="w-full rounded-dense border border-border px-2 py-1.5 text-right text-sm tabular-nums" />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-slate-500">Amount</label>
                          <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-right text-sm font-bold tabular-nums">{money(itemAmount({ ...it, qty: it.retQty, pieces: tile ? it.retPieces : 0 }))}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <SettlementPicker value={settlement} onChange={setSettlement} customer={customer} />

              <div className="flex items-center justify-between rounded-xl bg-mint-soft px-3 py-2 text-sm">
                <span className="font-semibold text-slate-700">Refund amount (editable, max {money(maxRefund)})</span>
                <NumberInput data-testid="return-refund" value={refund} onChange={setRefundCapped} className="w-32 rounded-control border border-mint/40 bg-white px-2 py-1.5 text-right text-sm font-bold tabular-nums" />
              </div>

              {settlement === "adjust_udhari" && Number(refund) > (customer?.totalPending || 0) && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Udhari sirf {money(customer?.totalPending || 0)} hai — baaki {money(round2(Number(refund) - (customer?.totalPending || 0)))} store credit ban jayega.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button data-testid="preview-return-btn" data-flow-skip onClick={preview} className="flex items-center justify-center gap-2 rounded-control border border-mint/40 bg-mint-soft px-4 py-3 font-bold text-mint-dark active:scale-95"><Eye className="h-5 w-5" /> Preview <Kbd keys={KEYS.preview} /></button>
                <button data-testid="submit-return-btn" data-flow-skip onClick={save} disabled={saving} className="flex items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-60 hover:bg-mint-dark"><Save className="h-5 w-5" /> {saving ? "…" : "Save"} <Kbd keys={KEYS.save} tone="dark" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={handleClosePdf} title={pdfTitle} />
    </div>
  );
}

// Convert a store-credit return to cash refund or adjust-udhari.
function ConvertStoreCredit({ invoices, customers, shop, convertStoreCreditReturn, openPdf }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [target, setTarget] = useState("cash");
  const [saving, setSaving] = useState(false);
  const searchRef = useRef(null);
  const wrapperRef = useRef(null);

  const creditReturns = useMemo(
    () => invoices.filter((i) => i.type === "return" && isStoreCreditReturn(i)),
    [invoices]
  );
  const typed = q.trim().toLowerCase();
  const list = useMemo(() => {
    const filtered = !typed
      ? creditReturns
      : creditReturns.filter((i) =>
          (i.invoiceNo || "").toLowerCase().includes(typed) ||
          (i.customerName || "").toLowerCase().includes(typed) ||
          (i.originalInvoiceNo || "").toLowerCase().includes(typed));
    return filtered.slice(0, 20);
  }, [creditReturns, typed]);

  const inv = useMemo(() => creditReturns.find((i) => i.id === editId) || null, [creditReturns, editId]);
  const customer = useMemo(
    () => (inv?.customerId ? customers.find((c) => c.id === inv.customerId) || null : null),
    [customers, inv]
  );
  const creditAmt = heldStoreCredit(inv);
  const pendingUdhari = round2(Number(customer?.totalPending) || 0);
  const absorbPreview = round2(Math.min(creditAmt, pendingUdhari));
  const leftoverPreview = round2(Math.max(0, creditAmt - absorbPreview));
  const blocked = settlementBlocker(target, customer);

  const pickReturn = useCallback((r) => {
    if (!r) return;
    setEditId(r.id);
    setQ(r.invoiceNo || "");
    setTarget("cash");
    setOpen(false);
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  // Never leave adjust_udhari selected when it is impossible.
  useEffect(() => {
    if (settlementBlocker(target, customer)) setTarget("cash");
  }, [target, customer]);

  const focusStart = usePageFocus(() => {
    searchRef.current?.focus();
    setOpen(true);
  }, { enabled: !editId });

  const save = useCallback(async () => {
    if (!inv || saving) return;
    if (blocked) return toast.error("Ye settlement is customer par nahi ho sakta");
    setSaving(true);
    try {
      const updated = await convertStoreCreditReturn(inv.id, { targetSettlement: target });
      toast.success(
        target === "cash"
          ? `${inv.invoiceNo} — store credit cash me de diya`
          : `${inv.invoiceNo} — store credit udhari me adjust ho gaya`
      );
      const printedAmt = target === "cash"
        ? creditAmt
        : round2(Number(updated.settlementConvertedAmount) || 0);
      openPdf(
        generateStoreCreditConvertReceiptPDF({
          shop,
          customer: customer || { name: updated.customerName || inv.customerName },
          returnInvoice: updated,
          amount: printedAmt,
          at: updated.settlementConvertedAt,
          target,
        }, "bloburl"),
        target === "cash" ? "Store credit cash receipt" : "Store credit udhari receipt"
      );
      setEditId(null);
      setQ("");
      focusStart();
    } catch (e) {
      toast.error(e.message || "Convert nahi hua");
    } finally {
      setSaving(false);
    }
  }, [inv, saving, blocked, target, creditAmt, convertStoreCreditReturn, openPdf, shop, customer, focusStart]);

  const nav = useListNavigation({
    count: list.length,
    enabled: open,
    onSelect: (i) => pickReturn(list[i]),
    onEscape: () => setOpen(false),
  });
  const { activeIndex, setActiveIndex, hover } = nav;
  useEffect(() => { setActiveIndex(0); }, [q, setActiveIndex]);

  useHotkeyScope("page:returns-convert");
  useHotkeys("page:returns-convert", [
    { keys: KEYS.save, label: "Store credit convert karein", handler: save, disabled: saving || !inv || !!blocked },
    { keys: KEYS.saveAlt, label: "Store credit convert karein", handler: save, disabled: saving || !inv || !!blocked, hidden: true },
    { keys: KEYS.focusSearch, label: "Return search par jaayein", handler: () => focusStart(0) },
  ]);

  const flow = useFormFlow({ onSave: () => { if (inv && !blocked) save(); } });

  useEffect(() => {
    if (!editId) return undefined;
    const t = setTimeout(() => {
      const selected = document.querySelector('[data-testid^="convert-settle-"][aria-checked="true"]');
      if (selected && typeof selected.focus === "function") selected.focus();
    }, 80);
    return () => clearTimeout(t);
  }, [editId]);

  const convertOptions = CONVERT_TARGETS.map(([v, l]) => ({
    value: v,
    label: l,
    disabled: !!settlementBlocker(v, customer),
    title: settlementBlocker(v, customer) || l,
  }));

  return (
    <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="space-y-4" data-testid="convert-store-credit">
      <div className="ds-panel p-4">
        <label className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
          Store-credit return (search &amp; select) <Kbd keys={KEYS.focusSearch} />
        </label>
        <div className="relative" ref={wrapperRef}>
          <div className="ds-combo">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              data-testid="convert-return-search"
              role="combobox"
              aria-expanded={open}
              aria-controls="convert-return-search-list"
              aria-activedescendant={open ? `sc-ret-opt-${activeIndex}` : undefined}
              autoComplete="off"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setEditId(null);
                setOpen(true);
              }}
              onFocus={() => {
                if (!(q || "").trim()) setOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (open) setOpen(false);
                  return;
                }
                if (!open) {
                  if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
                  return;
                }
                nav.handleKeyDown(e);
              }}
              placeholder="RET number ya customer…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>

          {open && (
            <div
              id="convert-return-search-list"
              role="listbox"
              ref={nav.listRef}
              className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-white shadow-lg"
            >
              {list.length === 0 && (
                <div className="px-3 py-4 text-sm text-slate-500">Koi store-credit return nahi mila.</div>
              )}
              {list.map((r, i) => {
                const active = i === activeIndex;
                return (
                  <button
                    key={r.id}
                    id={`sc-ret-opt-${i}`}
                    role="option"
                    aria-selected={active}
                    data-list-index={i}
                    type="button"
                    data-testid={`convert-return-option-${r.id}`}
                    onMouseEnter={() => hover(i)}
                    onMouseDown={(e) => { e.preventDefault(); pickReturn(r); }}
                    className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left ${active ? "bg-mint-soft" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ReceiptText className="h-4 w-4 shrink-0 text-mint" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{r.customerName || "Walk-in"}</p>
                        <p className="truncate text-xs text-slate-500">
                          {r.invoiceNo} · {fmtDate(r.date)}
                          {r.originalInvoiceNo ? ` · against ${r.originalInvoiceNo}` : ""}
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-slate-700">{money(heldStoreCredit(r))}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {inv && (
        <div className="space-y-4 ds-panel p-4" data-testid="convert-return-panel">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-ink" />
            <h3 className="font-display font-bold text-slate-900">{inv.invoiceNo}</h3>
          </div>
          <p className="-mt-2 text-xs text-slate-500">
            {inv.customerName || "Walk-in"} · {fmtDate(inv.date)}
            {inv.originalInvoiceNo ? ` · against ${inv.originalInvoiceNo}` : ""}
          </p>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Store credit held: <b>{money(creditAmt)}</b>
            {inv.settlementDetail ? (
              <span className="mt-1 block text-slate-500">{formatSettlementDetail(inv.settlementDetail) || "—"}</span>
            ) : null}
            {customer ? (
              <span className="ml-0 mt-1 block text-slate-500">
                Udhari {money(customer.totalPending || 0)} · Credit {money(customer.storeCredit || 0)}
              </span>
            ) : null}
          </div>

          <SegmentedControl
            label="Convert to"
            value={target}
            onChange={setTarget}
            testPrefix="convert-settle"
            className="grid grid-cols-2 gap-2"
            options={convertOptions}
          />

          {target === "cash" && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {money(creditAmt)} store credit cash me dena hoga. Return invoice pe udhari wahi rahegi — sirf yeh slice cash refund banegi.
            </p>
          )}
          {target === "adjust_udhari" && (
            <p className="flex items-start gap-1.5 rounded-lg bg-mint-soft px-3 py-2 text-xs font-semibold text-mint-dark">
              {money(absorbPreview)} udhari clear hogi. {money(leftoverPreview)} store credit rahegi. Receipt pe yahi split chhapega.
            </p>
          )}

          <button
            data-flow-skip
            data-testid="convert-return-save"
            onClick={save}
            disabled={saving || !!blocked}
            className="flex w-full items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-50 hover:bg-mint-dark"
          >
            <Save className="h-5 w-5" />
            {saving ? "…" : "Convert & print receipt"}
            <Kbd keys={KEYS.save} tone="dark" />
          </button>
        </div>
      )}
    </div>
  );
}

