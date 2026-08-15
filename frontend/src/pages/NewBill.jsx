import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import { useQuickCreate } from "@/context/QuickCreateContext";
import ProductSearch from "@/components/ProductSearch";
import CustomerSearch from "@/components/CustomerSearch";
import BillCartDialog from "@/components/BillCartDialog";
import SqftDialog from "@/components/SqftDialog";
import NumberInput from "@/components/NumberInput";
import Kbd from "@/components/Kbd";
import SegmentedControl from "@/components/SegmentedControl";
import { generateBillPDF } from "@/services/billPdf";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { computeBillTotals, itemAmount, money, rateFromAmount, round2, todayISO } from "@/lib/calc";
import { sanitizeNumber } from "@/components/NumberInput";
import {
  isBoxUnit, qtyFieldLabel, rateSuffix, productMetaLine, unitKindLabel, UNIT_BOX, UNIT_PIECE,
  stockAvailPieces, clampSaleQtyFields, formatAvailLabel, lineSoldPieces,
} from "@/lib/units";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { SCOPES, KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Calculator, Save, Eye, ShoppingCart, Eraser } from "lucide-react";

const NUM = "w-full rounded-lg border border-slate-300 px-1.5 py-1 text-sm text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-500";

// Persist NewBill form state across navigation using sessionStorage
const STORAGE_KEY = "ds_newbill_draft";
function loadDraft() {
  try { const raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function saveDraft(state) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

/** Fields we never restore into (modals / ephemeral). */
function isRestorableFocusId(id) {
  if (!id) return false;
  if (id.startsWith("detail-") || id.startsWith("sqft-")) return false;
  if (id.startsWith("bill-item-") || id.startsWith("item-") || id.startsWith("del-item-")) return false;
  if (id === "bill-cart-dialog" || id === "bill-cart-close" || id === "bill-cart-empty" || id === "bill-cart-subtotal") return false;
  return true;
}

export default function NewBill() {
  const { products, customers, shop, commitBill } = useApp();
  const quickCreate = useQuickCreate();
  const saved = useRef(loadDraft());
  const s = saved.current;
  const pageRef = useRef(null);
  const searchRef = useRef(null);
  const cartBtnRef = useRef(null);
  const focusTestIdRef = useRef(s?.focusTestId || null);

  const [type, setType] = useState(s?.type || "sale");
  const [items, setItems] = useState(s?.items || []);
  const [customerName, setCustomerName] = useState(s?.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(s?.customerPhone || "");
  const [isContractor, setIsContractor] = useState(s?.isContractor || false);
  const [siteNote, setSiteNote] = useState(s?.siteNote || "");
  const [gstEnabled, setGstEnabled] = useState(s?.gstEnabled ?? (shop?.gstEnabled ?? true));
  const [gstRate, setGstRate] = useState(s?.gstRate ?? 18);
  const [discount, setDiscount] = useState(s?.discount || { type: "flat", value: "" });
  const [pay, setPay] = useState(s?.pay || { cash: "", online: "" });
  const [selectedCustomer, setSelectedCustomer] = useState(s?.selectedCustomer || null);
  const [useCredit, setUseCredit] = useState(s?.useCredit || false);
  const [saving, setSaving] = useState(false);
  const [detailsFor, setDetailsFor] = useState(null);   // product awaiting qty/rate
  const [cartOpen, setCartOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();

  const handleClosePdf = useCallback(() => {
    closePdf();
    // Belt-and-suspenders with PdfViewerDialog restore: if the old DOM node
    // remounted, land via the last known data-testid.
    setTimeout(() => {
      const id = focusTestIdRef.current;
      if (id && isRestorableFocusId(id)) {
        const el = document.querySelector(`[data-testid="${CSS.escape(id)}"]`);
        if (el && typeof el.focus === "function") {
          el.focus();
          return;
        }
      }
      customerSearchRef.current?.focus();
    }, 100);
  }, [closePdf]);

  // Persist form state whenever it changes (keep last focus id)
  useEffect(() => {
    saveDraft({
      type, items, customerName, customerPhone, isContractor, siteNote,
      gstEnabled, gstRate, discount, pay, selectedCustomer, useCredit,
      focusTestId: focusTestIdRef.current,
    });
  }, [type, items, customerName, customerPhone, isContractor, siteNote, gstEnabled, gstRate, discount, pay, selectedCustomer, useCredit]);

  const focusSearch = useCallback(() => setTimeout(() => searchRef.current?.focus(), 60), []);
  const focusCartBtn = useCallback(() => setTimeout(() => cartBtnRef.current?.focus(), 80), []);
  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => {
    setCartOpen(false);
    // After Dialog unmounts focus trap, land back on View cart so Enter can
    // continue the page field chain (Alt+Enter reopens the cart).
    focusCartBtn();
  }, [focusCartBtn]);
  const phoneRef = useRef(null);
  const customerSearchRef = useRef(null);
  const focusCustomer = useCallback(() => setTimeout(() => customerSearchRef.current?.focus(), 60), []);

  // Remember last focused control so returning to /bill restores caret there
  // (instead of always jumping to customer name via usePageFocus).
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const onFocusIn = (e) => {
      const el = e.target?.closest?.("[data-testid]");
      if (!el || !root.contains(el)) return;
      const id = el.getAttribute("data-testid");
      if (!isRestorableFocusId(id)) return;
      focusTestIdRef.current = id;
      const prev = loadDraft() || {};
      saveDraft({ ...prev, focusTestId: id });
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);

  // On mount / navigate-back: restore last field, else start on customer.
  useEffect(() => {
    const id = focusTestIdRef.current;
    const t = setTimeout(() => {
      if (id && isRestorableFocusId(id)) {
        const el = document.querySelector(`[data-testid="${CSS.escape(id)}"]`);
        if (el && typeof el.focus === "function") {
          el.focus();
          return;
        }
      }
      customerSearchRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, []);

  // Picking a product opens the details popup; the caret returns to the search
  // box afterwards so the next item can be typed straight away.
  const pickProduct = (p) => {
    if (items.some((it) => it.productId === p.id)) { toast.error("Ye item pehle se add hai"); return focusSearch(); }
    setDetailsFor(p);
  };

  const addItemWithDetails = (p, d) => {
    const tile = isBoxUnit(p);
    setItems((prev) => [...prev, {
      productId: p.id, name: p.name,
      qty: d.qty, pieces: tile ? d.pieces : "",
      unit: tile ? UNIT_BOX : UNIT_PIECE,
      rate: d.rate,
      piecesPerBox: tile ? (Number(p.piecesPerBox) || 1) : 1,
      size: tile ? (p.size || "") : "",
    }]);
    setDetailsFor(null);
    focusSearch();
  };

  // Item missing from the catalog — create it inline, then bill it. The rest of
  // the bill is untouched throughout.
  const createItemOnTheFly = useCallback(async (name) => {
    const product = await quickCreate("product", name || "");
    if (product) setDetailsFor(product);
    else focusSearch();
  }, [quickCreate, focusSearch]);

  const applyCustomer = useCallback((c) => {
    setSelectedCustomer(c);
    setCustomerName(c.name);
    setCustomerPhone(String(c.phone || "").replace(/\D/g, "").slice(0, 10));
    setIsContractor(!!c.isContractor);
    setSiteNote(c.siteNote || "");
    // Existing party — phone already known; jump straight to adding items.
    focusSearch();
  }, [focusSearch]);

  // New name typed in search — keep it on the bill; customer is created on Save.
  // Focus phone so the user can fill optional contact before items.
  const acceptNewCustomerName = useCallback((name) => {
    const n = (name || "").trim();
    if (!n) return;
    setCustomerName(n);
    setSelectedCustomer(null);
    setUseCredit(false);
    setTimeout(() => phoneRef.current?.focus(), 60);
  }, []);

  const updItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const delItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const reset = useCallback(() => {
    setType("sale"); setItems([]); setCustomerName(""); setCustomerPhone(""); setIsContractor(false); setSiteNote("");
    setGstEnabled(shop?.gstEnabled ?? true); setGstRate(18); setDiscount({ type: "flat", value: "" });
    setPay({ cash: "", online: "" }); setSelectedCustomer(null); setUseCredit(false);
    setCartOpen(false);
    setDetailsFor(null);
    setClearOpen(false);
    focusTestIdRef.current = null;
    clearDraft();
  }, [shop?.gstEnabled]);

  const hasBillData = useMemo(() => (
    items.length > 0
    || !!(customerName || "").trim()
    || !!(customerPhone || "").trim()
    || isContractor
    || !!(siteNote || "").trim()
    || Number(discount.value) > 0
    || Number(pay.cash) > 0
    || Number(pay.online) > 0
    || useCredit
    || type !== "sale"
  ), [items, customerName, customerPhone, isContractor, siteNote, discount.value, pay.cash, pay.online, useCredit, type]);

  const requestClear = useCallback(() => {
    if (!hasBillData) {
      toast.message("Bill pehle se clear hai");
      return;
    }
    setCartOpen(false);
    setDetailsFor(null);
    setClearOpen(true);
  }, [hasBillData]);

  const confirmClear = useCallback(() => {
    reset();
    toast.success("Bill clear ho gaya");
    focusCustomer();
  }, [reset, focusCustomer]);

  const cancelClear = useCallback(() => setClearOpen(false), []);

  // Clear-confirm dialog owns Esc / Enter while open.
  useHotkeyScope(SCOPES.CLEAR_BILL, { exclusive: true, enabled: clearOpen });
  useHotkeys(SCOPES.CLEAR_BILL, [
    { keys: KEYS.cancel, label: "Clear cancel", handler: cancelClear },
    {
      keys: "enter",
      label: "Clear confirm",
      allowInInput: true,
      handler: () => {
        // Enter on Cancel = dismiss; otherwise confirm (Confirm is auto-focused).
        if (document.activeElement?.getAttribute("data-testid") === "clear-bill-cancel") {
          cancelClear();
          return;
        }
        confirmClear();
      },
    },
    { keys: KEYS.confirmDraft, label: "Clear confirm", handler: confirmClear, allowInInput: true, hidden: true },
  ]);

  useEffect(() => {
    if (!clearOpen) return undefined;
    const t = setTimeout(() => {
      document.querySelector('[data-testid="clear-bill-confirm"]')?.focus();
    }, 40);
    return () => clearTimeout(t);
  }, [clearOpen]);

  const draftBase = useMemo(() => ({
    kind: type, type, items, gstEnabled, gstRate: Number(gstRate),
    discount: Number(discount.value) > 0 ? discount : null,
    payments: [
      ...(Number(pay.cash) > 0 ? [{ mode: "cash", amount: Number(pay.cash) }] : []),
      ...(Number(pay.online) > 0 ? [{ mode: "online", amount: Number(pay.online) }] : []),
    ],
    customerName, customerPhone, isContractor, siteNote, createdVia: "manual", date: todayISO(), language: "hi",
  }), [type, items, gstEnabled, gstRate, discount, pay, customerName, customerPhone, isContractor, siteNote]);

  const totals = computeBillTotals(draftBase);
  const creditAvail = selectedCustomer?.storeCredit || 0;
  const creditApplied = type === "sale" && useCredit && creditAvail > 0 ? Math.min(creditAvail, totals.amountPending) : 0;
  const netPending = Math.max(0, totals.amountPending - creditApplied);

  // Cash + Online must never exceed bill total — clamp as the user types.
  const setPayField = useCallback((field, raw) => {
    const cleaned = sanitizeNumber(raw);
    const other = field === "cash" ? (Number(pay.online) || 0) : (Number(pay.cash) || 0);
    const max = Math.max(0, round2(totals.grandTotal - other));
    if (cleaned === "" || cleaned === ".") {
      setPay((p) => ({ ...p, [field]: cleaned }));
      return;
    }
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return;
    const capped = n > max ? String(max) : cleaned;
    setPay((p) => ({ ...p, [field]: capped }));
  }, [pay.cash, pay.online, totals.grandTotal]);

  // If the bill total shrinks (item/discount change), pull payments back in range.
  useEffect(() => {
    const cash = Number(pay.cash) || 0;
    const online = Number(pay.online) || 0;
    const max = round2(totals.grandTotal);
    if (cash + online <= max + 0.001) return;
    let nextCash = Math.min(cash, max);
    let nextOnline = Math.min(online, Math.max(0, round2(max - nextCash)));
    setPay({
      cash: pay.cash === "" && nextCash === 0 ? "" : String(nextCash),
      online: pay.online === "" && nextOnline === 0 ? "" : String(nextOnline),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totals.grandTotal]);

  const updItemQty = (i, field, raw) => {
    const it = items[i];
    if (!it) return;
    // Purchases can exceed current stock (stock-in); only clamp sales.
    if (type !== "sale") {
      const cleaned = sanitizeNumber(raw);
      const whole = cleaned.includes(".") ? cleaned.slice(0, cleaned.indexOf(".")) : cleaned;
      updItem(i, { [field]: whole, amount: undefined });
      return;
    }
    const p = products.find((x) => x.id === it.productId) || it;
    const reserved = items.reduce((s, x, idx) => (
      idx === i || x.productId !== it.productId ? s : s + lineSoldPieces(x)
    ), 0);
    const next = clampSaleQtyFields({
      product: { ...p, unit: it.unit, piecesPerBox: it.piecesPerBox },
      qty: it.qty,
      pieces: it.pieces,
      field,
      raw,
      availPieces: Math.max(0, stockAvailPieces(p) - reserved),
    });
    updItem(i, { qty: next.qty, pieces: isBoxUnit(it) ? next.pieces : "", amount: undefined });
  };

  // Editing amount back-calcs rate so totals / backend stay rate×qty based.
  const updItemAmount = (i, raw) => {
    const it = items[i];
    if (!it) return;
    const cleaned = sanitizeNumber(raw);
    if (cleaned === "" || cleaned === ".") {
      updItem(i, { amount: cleaned, rate: cleaned === "" ? "" : it.rate });
      return;
    }
    updItem(i, { amount: cleaned, rate: rateFromAmount(it, cleaned) });
  };

  const buildDraft = () => {
    const payments = [
      ...(Number(pay.cash) > 0 ? [{ mode: "cash", amount: Number(pay.cash) }] : []),
      ...(Number(pay.online) > 0 ? [{ mode: "online", amount: Number(pay.online) }] : []),
      ...(creditApplied > 0 ? [{ mode: "credit", amount: creditApplied }] : []),
    ];
    return { ...draftBase, payments, customerId: selectedCustomer?.id || null };
  };

  const preview = () => {
    if (items.length === 0) return toast.error("Pehle item add kariye");
    const cashOnline = round2((Number(pay.cash) || 0) + (Number(pay.online) || 0));
    if (cashOnline > round2(totals.grandTotal) + 0.01) {
      return toast.error("Cash + Online bill total se zyada nahi ho sakta");
    }
    const d = buildDraft();
    const inv = { ...d, invoiceNo: (gstEnabled ? "GST" : "INV") + "-PREVIEW", customerName: customerName || "Walk-in" };
    showPdf(generateBillPDF({ shop, invoice: inv, customer: selectedCustomer || { name: customerName || "Walk-in" } }, "bloburl"));
  };

  const save = async () => {
    if (items.length === 0) return toast.error("Pehle item add kariye");
    const cashOnline = round2((Number(pay.cash) || 0) + (Number(pay.online) || 0));
    if (type === "sale" && cashOnline > round2(totals.grandTotal) + 0.01) {
      return toast.error("Cash + Online bill total se zyada nahi ho sakta");
    }
    if (type === "sale") {
      const byProduct = {};
      for (const it of items) {
        byProduct[it.productId] = (byProduct[it.productId] || 0) + lineSoldPieces(it);
      }
      const over = items.filter((it) => {
        if (byProduct[it.productId] == null) return false;
        const p = products.find((x) => x.id === it.productId);
        if (!p) return false;
        const short = byProduct[it.productId] > stockAvailPieces(p);
        if (short) byProduct[it.productId] = null; // report once per product
        return short;
      });
      if (over.length) return toast.error(`Stock me itna maal nahi: ${over.map((i) => i.name).join(", ")}`);
    }
    if (saving) return;
    setSaving(true);
    try {
      const { invoice, customer } = await commitBill(buildDraft());
      showPdf(generateBillPDF({ shop, invoice, customer: customer || { name: invoice.customerName } }, "bloburl"));
      toast.success(`${invoice.invoiceNo} save ho gaya`);
      reset();
      focusCustomer();
    } catch (e) { toast.error(e?.message || "Save nahi hua, dobara koshish karein"); } finally { setSaving(false); }
  };

  /* ── Keyboard ────────────────────────────────────────────────────────────
     Enter chains through every field; last field opens Preview (never F9 save).
     Line items live in View cart (Enter / Alt+Enter when that button is focused). */
  useHotkeyScope(SCOPES.BILLING, { enabled: !cartOpen && !detailsFor && !clearOpen && !pdfUrl });
  const flow = useFormFlow({ onSave: preview, enabled: !cartOpen && !detailsFor && !clearOpen && !pdfUrl });

  useHotkeys(SCOPES.BILLING, [
    { keys: KEYS.save, label: "Save bill", handler: save, disabled: saving },
    { keys: KEYS.saveAlt, label: "Save bill", handler: save, disabled: saving, hidden: true },
    { keys: KEYS.preview, label: "Preview PDF", handler: preview },
    { keys: KEYS.quickCreate, label: "Naya item banayein", handler: () => createItemOnTheFly("") },
    { keys: KEYS.focusSearch, label: "Customer search par jaayein", handler: () => customerSearchRef.current?.focus() },
    { keys: KEYS.clearBill, label: "Bill clear / reset", handler: requestClear },
    {
      keys: KEYS.deleteRow,
      label: "Cart kholo (line delete cart me)",
      handler: () => {
        if (items.length === 0) return toast.error("Cart khali hai");
        openCart();
      },
    },
  ]);

  return (
    <div ref={pageRef} className="space-y-4 ds-fade pb-10" data-testid="new-bill-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-slate-900">New Bill</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="clear-bill-btn"
            data-flow-skip
            onClick={requestClear}
            className="flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100 active:scale-95"
          >
            <Eraser className="h-4 w-4" /> Clear <Kbd keys={KEYS.clearBill} />
          </button>
          <div className="w-56">
            <SegmentedControl
              value={type}
              onChange={setType}
              testPrefix="type"
              showArrowHint={false}
              className="grid grid-cols-2 gap-1"
              options={[
                { value: "sale", label: "Sale" },
                { value: "purchase", label: "Purchase" },
              ]}
            />
          </div>
        </div>
      </div>

      <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 font-display font-bold text-slate-900">
              {type === "purchase" ? "Supplier" : "Customer"}
              <Kbd keys={KEYS.focusSearch} />
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                <div>
                  <label className="text-xs font-semibold text-slate-600">{type === "purchase" ? "Supplier name (optional)" : "Customer name (optional — blank = Walk-in)"}</label>
                  <CustomerSearch
                    ref={customerSearchRef}
                    customers={customers}
                    value={customerName}
                    onChangeText={(t) => { setCustomerName(t); setSelectedCustomer(null); setUseCredit(false); }}
                    onPick={(c) => { if (c) applyCustomer(c); else setSelectedCustomer(null); }}
                    onCreateNew={acceptNewCustomerName}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Phone (optional)</label>
                  <input
                    ref={phoneRef}
                    data-testid="customer-phone"
                    inputMode="numeric"
                    maxLength={10}
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="98xxxxxxxx"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
                <input data-testid="is-contractor" type="checkbox" checked={isContractor} onChange={(e) => setIsContractor(e.target.checked)} />
                Contractor / Dealer <Kbd keys={KEYS.toggleCheckbox} />
              </label>
              {isContractor && <div className="col-span-2"><input data-testid="site-note" value={siteNote} onChange={(e) => setSiteNote(e.target.value)} placeholder="Project / site note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-2 text-sm font-semibold text-slate-700">
              Add item (search catalog)
            </label>
            <ProductSearch ref={searchRef} products={products} onPick={pickProduct}
              onCreateNew={createItemOnTheFly}
              disabledIds={items.map((it) => it.productId)} />

            <button
              ref={cartBtnRef}
              type="button"
              data-testid="view-cart-btn"
              data-flow-field
              onClick={openCart}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 active:scale-[0.99]"
            >
              <ShoppingCart className="h-4 w-4" />
              View cart
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-800" data-testid="view-cart-count">
                {items.length}
              </span>
              <Kbd keys={KEYS.toggleCheckbox} />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">GST</label>
              <label className="flex items-center gap-2 text-sm">
                <input data-testid="gst-toggle" type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} />
                <Kbd keys={KEYS.toggleCheckbox} />
                {gstEnabled && <select data-testid="gst-rate" value={gstRate} onChange={(e) => setGstRate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">{[0,5,12,18,28,40].map((r) => <option key={r} value={r}>{r}%</option>)}</select>}
              </label>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-slate-600">Discount</label>
              <div className="mt-1 flex gap-2">
                <select
                  data-testid="discount-type"
                  value={discount.type}
                  onChange={(e) => {
                    const nextType = e.target.value;
                    let nextVal = discount.value;
                    if (nextType === "percent") {
                      const n = Number(nextVal);
                      if (Number.isFinite(n) && n > 100) nextVal = "100";
                    }
                    setDiscount({ ...discount, type: nextType, value: nextVal });
                  }}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                >
                  <option value="flat">Rs</option>
                  <option value="percent">%</option>
                </select>
                <NumberInput
                  data-testid="discount-value"
                  value={discount.value}
                  onChange={(v) => {
                    if (discount.type === "percent") {
                      const cleaned = v === "" || v === "." ? v : (Number(v) > 100 ? "100" : v);
                      setDiscount({ ...discount, value: cleaned });
                      return;
                    }
                    setDiscount({ ...discount, value: v });
                  }}
                  className={NUM}
                />
              </div>
            </div>

            <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <Row l="Subtotal" v={money(totals.subtotal)} />
              {totals.discountOff > 0 && <Row l="Discount" v={"- " + money(totals.discountOff)} />}
              {totals.gstRate > 0 && <Row l={`GST ${totals.gstRate}%`} v={money(totals.gstAmount)} />}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-display text-lg font-bold text-slate-900"><span>Total</span><span data-testid="bill-grand-total">{money(totals.grandTotal)}</span></div>
            </div>
          </div>

          {type === "sale" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-display font-bold text-slate-900">Payment split</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Cash ₹</label>
                  <NumberInput data-testid="pay-cash" value={pay.cash} onChange={(v) => setPayField("cash", v)} className={NUM} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Online ₹</label>
                  <NumberInput data-testid="pay-online" value={pay.online} onChange={(v) => setPayField("online", v)} className={NUM} />
                </div>
              </div>
              <button
                type="button"
                data-testid="pay-full-btn"
                onClick={() => setPay({ cash: String(round2(totals.grandTotal)), online: "" })}
                className="mt-2 text-xs font-semibold text-indigo-700"
              >
                Full cash
              </button>
              {creditAvail > 0 && (
                <label className="mt-2 flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-violet-800">Use store credit ({money(creditAvail)}) <Kbd keys={KEYS.toggleCheckbox} /></span>
                  <input data-testid="use-store-credit" type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} />
                </label>
              )}
              {creditApplied > 0 && <div className="mt-1 flex justify-between px-1 text-xs font-semibold text-violet-700" data-testid="credit-applied-line"><span>Store credit applied</span><span>- {money(creditApplied)}</span></div>}
              <div className={`mt-2 rounded-lg px-2 py-1.5 text-sm font-bold ${netPending > 0.5 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`} data-testid="pending-line">
                {netPending > 0.5 ? `Udhari: ${money(netPending)}` : "Fully paid ✓"}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button data-testid="preview-bill-btn" onClick={preview} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3.5 font-bold text-indigo-800 transition-transform active:scale-95"><Eye className="h-5 w-5" /> Preview <Kbd keys={KEYS.preview} /></button>
            <button data-testid="confirm-save-btn" onClick={save} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3.5 font-bold text-white shadow-md transition-transform active:scale-95 hover:bg-orange-500 disabled:opacity-60"><Save className="h-5 w-5" /> {saving ? "…" : "Save"} <Kbd keys={KEYS.save} tone="dark" /></button>
          </div>
          <p className="text-center text-xs text-slate-400">Last field par Enter = Preview. Save sirf <Kbd keys={KEYS.save} /> se.</p>
        </div>
      </div>

      <ItemDetailsDialog
        product={detailsFor}
        type={type}
        reservedPieces={
          detailsFor
            ? items.filter((it) => it.productId === detailsFor.id).reduce((s, it) => s + lineSoldPieces(it), 0)
            : 0
        }
        onClose={() => { setDetailsFor(null); focusSearch(); }}
        onAdd={(d) => addItemWithDetails(detailsFor, d)}
      />

      <BillCartDialog
        open={cartOpen}
        onClose={closeCart}
        items={items}
        type={type}
        products={products}
        updItem={updItem}
        updItemQty={updItemQty}
        updItemAmount={updItemAmount}
        delItem={delItem}
        onSave={save}
        onPreview={preview}
        onRequestClear={requestClear}
        saving={saving}
      />

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent data-testid="clear-bill-dialog" onOpenAutoFocus={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Bill clear karein?</AlertDialogTitle>
            <AlertDialogDescription>
              Saari lines, customer, discount aur payment hat jaayengi. Ye undo nahi hoga.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="clear-bill-cancel" className="gap-1.5">
              Cancel <Kbd keys={KEYS.cancel} />
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="clear-bill-confirm"
              onClick={confirmClear}
              className="gap-1.5 bg-rose-600 hover:bg-rose-500"
            >
              Haan, clear karo <Kbd keys="enter" tone="dark" />
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={handleClosePdf} title="Invoice PDF" />
    </div>
  );
}

// Qty / rate popup shown right after a product is picked. Enter walks the
// fields and the last Enter adds the line; NewBill then puts the caret back in
// the search box for the next item. On sales, Box/Pcs are clamped to stock.
// Tiles: Alt+Q opens the sq-ft calculator and fills Box/Pcs.
function ItemDetailsDialog({ product, type, reservedPieces = 0, onClose, onAdd }) {
  const [qty, setQty] = useState("");
  const [pieces, setPieces] = useState("");
  const [rate, setRate] = useState("");
  const [sqftOpen, setSqftOpen] = useState(false);
  const rateRef = useRef(null);
  const open = !!product;
  const limitStock = type === "sale";

  useEffect(() => {
    if (!product) return;
    setQty(""); setPieces("");
    setSqftOpen(false);
    // Purchases are billed at the supplier's rate, so never prefill there.
    setRate(type === "sale" && product.sellPrice > 0 ? String(product.sellPrice) : "");
  }, [product, type]);

  const tile = product ? isBoxUnit(product) : false;
  const ppb = tile ? (Number(product.piecesPerBox) || 1) : 1;
  const availPieces = product
    ? Math.max(0, stockAvailPieces(product) - (Number(reservedPieces) || 0))
    : 0;
  const availLabel = product ? formatAvailLabel(product, availPieces) : "";

  const setQtyField = useCallback((field, raw) => {
    if (!product || !limitStock) {
      const cleaned = sanitizeNumber(raw);
      const whole = cleaned.includes(".") ? cleaned.slice(0, cleaned.indexOf(".")) : cleaned;
      if (field === "qty") setQty(whole);
      else setPieces(whole);
      return;
    }
    const next = clampSaleQtyFields({ product, qty, pieces, field, raw, availPieces });
    setQty(next.qty);
    setPieces(next.pieces);
  }, [product, limitStock, qty, pieces, availPieces]);

  const applySqft = useCallback((res) => {
    if (!product) return;
    let nextQty = String(res.boxesNeeded);
    let nextPcs = String(res.loosePieces);
    const wanted = (Number(res.boxesNeeded) || 0) * ppb + (Number(res.loosePieces) || 0);
    if (limitStock) {
      const afterBoxes = clampSaleQtyFields({
        product, qty: "0", pieces: "0", field: "qty", raw: nextQty, availPieces,
      });
      const afterPcs = clampSaleQtyFields({
        product, qty: afterBoxes.qty, pieces: "0", field: "pieces", raw: nextPcs, availPieces,
      });
      nextQty = afterPcs.qty;
      nextPcs = afterPcs.pieces;
      const got = (Number(nextQty) || 0) * ppb + (Number(nextPcs) || 0);
      if (got < wanted) toast.error(`Stock sirf ${availLabel} hai — sq-ft qty adjust hui`);
      else toast.success(`${nextQty} box + ${nextPcs || 0} pc (${res.tilesNeeded} tiles)`);
    } else {
      toast.success(`${nextQty} box + ${nextPcs || 0} pc (${res.tilesNeeded} tiles)`);
    }
    setQty(nextQty);
    setPieces(nextPcs);
    setSqftOpen(false);
    // Qty/Pcs filled — park the caret on Rate so Enter can finish the add.
    setTimeout(() => rateRef.current?.focus(), 60);
  }, [product, ppb, limitStock, availPieces, availLabel]);

  const submit = useCallback(() => {
    if (!product) return;
    if (tile) {
      if (!(Number(qty) > 0 || Number(pieces) > 0)) return toast.error("Box ya pcs daaliye");
    } else if (!(Number(qty) > 0)) {
      return toast.error("Pcs daaliye");
    }
    if (!(Number(rate) > 0)) return toast.error("Rate daaliye");
    if (limitStock) {
      const asked = tile
        ? (Number(qty) || 0) * ppb + (Number(pieces) || 0)
        : (Number(qty) || 0);
      if (asked > availPieces) {
        return toast.error(`Stock sirf ${availLabel} hai`);
      }
      if (availPieces <= 0) {
        return toast.error("Is item ka stock khatam hai");
      }
    }
    onAdd({ qty, pieces: tile ? pieces : "", rate });
  }, [product, tile, qty, pieces, rate, onAdd, limitStock, ppb, availPieces, availLabel]);

  useHotkeyScope("modal:item-details", { exclusive: true, enabled: open && !sqftOpen });
  useHotkeys("modal:item-details", [
    { keys: KEYS.cancel, label: "Cancel", handler: onClose },
    {
      keys: KEYS.sqftCalc,
      label: "Sq-ft calculator",
      handler: () => setSqftOpen(true),
      disabled: !tile,
    },
  ]);
  // Enter through fields; Enter on Rate adds the item (this dialog's primary action).
  const flow = useFormFlow({ onSave: submit, onCancel: onClose });

  if (!product) return null;

  const amount = itemAmount({
    qty, pieces: tile ? pieces : 0, rate,
    unit: tile ? UNIT_BOX : UNIT_PIECE,
    piecesPerBox: ppb,
  });
  const stockEmpty = limitStock && availPieces <= 0;
  const sqftItem = {
    name: product.name,
    piecesPerBox: ppb,
    rate: Number(rate) || Number(product.sellPrice) || 0,
    size: product.size || "",
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent data-testid="item-details-dialog" onCloseAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              {product.name}
              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold align-middle ${tile ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{unitKindLabel(product)}</span>
            </DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-slate-500">{productMetaLine(product)}</p>
          {limitStock && (
            <div
              data-testid="detail-stock-remaining"
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                stockEmpty ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"
              }`}
            >
              Stock remaining: <span className="tabular-nums">{availLabel}</span>
              {stockEmpty && <span className="ml-1 font-normal">(khatam)</span>}
            </div>
          )}
          <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className={`grid gap-3 ${tile ? "grid-cols-3" : "grid-cols-2"}`}>
            <div>
              <label className="text-xs font-semibold text-slate-600">{qtyFieldLabel(product)}</label>
              <NumberInput data-testid="detail-qty" autoFocus value={qty} onChange={(v) => setQtyField("qty", v)} className={NUM} />
            </div>
            {tile && (
              <div>
                <label className="text-xs font-semibold text-slate-600">Pcs</label>
                <NumberInput data-testid="detail-pieces" value={pieces} onChange={(v) => setQtyField("pieces", v)} className={NUM} />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-600">Rate{rateSuffix(product)}</label>
              <NumberInput ref={rateRef} data-testid="detail-rate" value={rate} onChange={setRate} className={NUM} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">Amount</span>
            <b className="tabular-nums text-indigo-900" data-testid="detail-amount">{money(amount)}</b>
          </div>
          {tile && (
            <button
              type="button"
              data-testid="detail-sqft-btn"
              onClick={() => setSqftOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-800 active:scale-95"
            >
              <Calculator className="h-4 w-4" /> Sq-ft calculator <Kbd keys={KEYS.sqftCalc} />
            </button>
          )}
          <button
            data-testid="detail-add-btn"
            onClick={submit}
            disabled={stockEmpty}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-50"
          >
            Add item <Kbd keys="enter" tone="dark" />
          </button>
        </DialogContent>
      </Dialog>

      <SqftDialog
        sqftFor={sqftOpen ? { item: sqftItem } : null}
        onClose={() => setSqftOpen(false)}
        onApply={applySqft}
      />
    </>
  );
}

const Row = ({ l, v }) => <div className="flex justify-between text-slate-600"><span>{l}</span><span className="font-semibold">{v}</span></div>;
