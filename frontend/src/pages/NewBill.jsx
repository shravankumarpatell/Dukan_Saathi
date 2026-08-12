import React, { useState, useMemo, useEffect, useRef } from "react";
import { useApp } from "@/context/AppContext";
import ProductSearch from "@/components/ProductSearch";
import CustomerSearch from "@/components/CustomerSearch";
import NumberInput from "@/components/NumberInput";
import { generateBillPDF } from "@/services/billPdf";
import { computeBillTotals, itemAmount, money, sqftCalc, todayISO } from "@/lib/calc";
import {
  isBoxUnit, qtyFieldLabel, rateSuffix, productMetaLine, unitKindLabel, UNIT_BOX, UNIT_PIECE,
} from "@/lib/units";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Calculator, Save, Eye, PackagePlus } from "lucide-react";
import UnitToggle from "@/components/UnitToggle";

const NUM = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-500";

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

export default function NewBill() {
  const { products, customers, shop, commitBill, addProduct } = useApp();
  const saved = useRef(loadDraft());
  const s = saved.current;
  const searchRef = useRef(null);

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
  const [sqftFor, setSqftFor] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(s?.selectedCustomer || null);
  const [useCredit, setUseCredit] = useState(s?.useCredit || false);
  const [saving, setSaving] = useState(false);
  const [detailsFor, setDetailsFor] = useState(null);   // product awaiting qty/rate
  const [newProductName, setNewProductName] = useState(null); // quick-add prefill (string, may be "")

  // Persist form state whenever it changes
  useEffect(() => {
    saveDraft({ type, items, customerName, customerPhone, isContractor, siteNote, gstEnabled, gstRate, discount, pay, selectedCustomer, useCredit });
  }, [type, items, customerName, customerPhone, isContractor, siteNote, gstEnabled, gstRate, discount, pay, selectedCustomer, useCredit]);

  const focusSearch = () => setTimeout(() => searchRef.current?.focus(), 60);

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
      size: p.size || "",
    }]);
    setDetailsFor(null);
    focusSearch();
  };

  // Item missing from the catalog — create it inline and continue billing it.
  const createAndPick = async (p) => {
    const savedProduct = await addProduct(p);
    setNewProductName(null);
    toast.success(`${savedProduct.name} stock me add ho gaya`);
    // Let the quick-add dialog unmount before the details popup takes focus
    setTimeout(() => setDetailsFor(savedProduct), 120);
  };

  const updItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const delItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const reset = () => {
    setType("sale"); setItems([]); setCustomerName(""); setCustomerPhone(""); setIsContractor(false); setSiteNote("");
    setGstEnabled(shop?.gstEnabled ?? true); setGstRate(18); setDiscount({ type: "flat", value: "" });
    setPay({ cash: "", online: "" }); setSelectedCustomer(null); setUseCredit(false);
    clearDraft();
  };

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

  const remaining = (it) => {
    const p = products.find((x) => x.id === it.productId); if (!p) return null;
    const tile = isBoxUnit(it);
    const ppb = tile ? (Number(it.piecesPerBox) || 1) : 1;
    const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
    // Stock is stored in selling units: boxes for tiles, pieces for sanitary.
    const availPieces = tile ? Math.round(totalStock * ppb) : Math.round(totalStock);
    const soldPieces = tile
      ? (Number(it.qty) || 0) * ppb + (Number(it.pieces) || 0)
      : (Number(it.qty) || 0);
    const left = availPieces - soldPieces;
    if (!tile) return { left, boxes: 0, pc: left, short: left < 0, tile: false };
    const boxes = Math.trunc(left / ppb); const pc = left - boxes * ppb;
    return { left, boxes, pc, short: left < 0, tile: true };
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
    const d = buildDraft();
    const inv = { ...d, invoiceNo: (gstEnabled ? "GST" : "INV") + "-PREVIEW", customerName: customerName || "Walk-in" };
    generateBillPDF({ shop, invoice: inv, customer: selectedCustomer || { name: customerName || "Walk-in" } }, "newtab");
  };

  const save = async () => {
    if (items.length === 0) return toast.error("Pehle item add kariye");
    if (type === "sale") {
      const over = items.filter((it) => { const r = remaining(it); return r && r.short; });
      if (over.length) return toast.error(`Stock me itna maal nahi: ${over.map((i) => i.name).join(", ")}`);
    }
    if (saving) return;
    setSaving(true);
    try {
      const { invoice, customer } = await commitBill(buildDraft());
      generateBillPDF({ shop, invoice, customer: customer || { name: invoice.customerName } }, "newtab");
      toast.success(`${invoice.invoiceNo} save ho gaya`);
      reset();
    } catch (e) { toast.error("Save nahi hua, dobara koshish karein"); } finally { setSaving(false); }
  };

  const applySqft = (res) => { updItem(sqftFor.index, { qty: String(res.boxesNeeded), pieces: String(res.loosePieces) }); setSqftFor(null); toast.success(`${res.boxesNeeded} box + ${res.loosePieces} pc (${res.tilesNeeded} tiles) for ${res.roomArea} sq-ft`); };

  return (
    <div className="space-y-4 ds-fade pb-10" data-testid="new-bill-page">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-bold text-slate-900">New Bill</h2>
        <div className="flex rounded-xl border border-slate-300 bg-white p-1">
          {["sale", "purchase"].map((t) => (
            <button key={t} data-testid={`type-${t}`} onClick={() => setType(t)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize ${type === t ? "bg-indigo-900 text-white" : "text-slate-600"}`}>{t === "sale" ? "Sale" : "Purchase"}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Add item (search catalog)</label>
            <ProductSearch ref={searchRef} products={products} onPick={pickProduct}
              onCreateNew={(name) => setNewProductName(name || "")}
              disabledIds={items.map((it) => it.productId)} />

            <div className="mt-4 space-y-2">
              {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Koi item nahi. Upar search karke add karein.</p>}
              {items.map((it, i) => {
                const tile = isBoxUnit(it);
                const rem = remaining(it);
                const remLabel = rem
                  ? (tile ? `${rem.boxes}b+${rem.pc}p` : `${rem.left} pcs`)
                  : "";
                return (
                  <div key={i} data-testid={`bill-item-${i}`} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {it.name}
                          <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${tile ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{unitKindLabel(it)}</span>
                        </p>
                        <p className="text-xs text-slate-400">{productMetaLine(it)}</p>
                      </div>
                      <button data-testid={`del-item-${i}`} onClick={() => delItem(i)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className={`mt-2 grid gap-2 ${tile ? "grid-cols-4" : "grid-cols-3"}`}>
                      <div>
                        <label className="text-xs text-slate-500">{qtyFieldLabel(it)}</label>
                        <NumberInput data-testid={`item-qty-${i}`} value={it.qty} onChange={(v) => updItem(i, { qty: v })} className={NUM} />
                      </div>
                      {tile && (
                        <div>
                          <label className="text-xs text-slate-500">Pcs</label>
                          <NumberInput data-testid={`item-pieces-${i}`} value={it.pieces} onChange={(v) => updItem(i, { pieces: v })} className={NUM} />
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-slate-500">Rate{rateSuffix(it)}</label>
                        <NumberInput data-testid={`item-rate-${i}`} value={it.rate} onChange={(v) => updItem(i, { rate: v })} className={NUM} />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Amount</label>
                        <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-right text-sm font-bold tabular-nums" data-testid={`item-amount-${i}`}>{money(itemAmount(it))}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      {tile && (
                        <button data-testid={`sqft-btn-${i}`} onClick={() => setSqftFor({ index: i, item: it })} className="flex items-center gap-1 text-xs font-semibold text-orange-600"><Calculator className="h-3 w-3" /> Sq-ft calculator</button>
                      )}
                      {type === "sale" && rem && (
                        <span data-testid={`item-remaining-${i}`} className={`ml-auto text-xs font-semibold ${rem.short ? "text-rose-600" : "text-slate-500"}`}>Bacha: {remLabel}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 font-display font-bold text-slate-900">{type === "purchase" ? "Supplier" : "Customer"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600">{type === "purchase" ? "Supplier name (optional)" : "Customer name (optional — blank = Walk-in)"}</label>
                <CustomerSearch customers={customers} value={customerName}
                  onChangeText={(t) => { setCustomerName(t); setSelectedCustomer(null); setUseCredit(false); }}
                  onPick={(c) => { if (c) { setSelectedCustomer(c); setCustomerName(c.name); setCustomerPhone(c.phone || ""); setIsContractor(!!c.isContractor); setSiteNote(c.siteNote || ""); } else { setSelectedCustomer(null); } }} />
              </div>
              <div className="col-span-2"><label className="text-xs font-semibold text-slate-600">Phone (optional)</label><input data-testid="customer-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="98xxxxxxxx" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700"><input data-testid="is-contractor" type="checkbox" checked={isContractor} onChange={(e) => setIsContractor(e.target.checked)} /> Contractor / Dealer</label>
              {isContractor && <div className="col-span-2"><input data-testid="site-note" value={siteNote} onChange={(e) => setSiteNote(e.target.value)} placeholder="Project / site note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">GST</label>
              <label className="flex items-center gap-2 text-sm"><input data-testid="gst-toggle" type="checkbox" checked={gstEnabled} onChange={(e) => setGstEnabled(e.target.checked)} />
                {gstEnabled && <select data-testid="gst-rate" value={gstRate} onChange={(e) => setGstRate(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">{[0,5,12,18,28,40].map((r) => <option key={r} value={r}>{r}%</option>)}</select>}
              </label>
            </div>
            <div className="mb-3">
              <label className="text-xs font-semibold text-slate-600">Discount</label>
              <div className="mt-1 flex gap-2">
                <select data-testid="discount-type" value={discount.type} onChange={(e) => setDiscount({ ...discount, type: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="flat">Rs</option><option value="percent">%</option></select>
                <NumberInput data-testid="discount-value" value={discount.value} onChange={(v) => setDiscount({ ...discount, value: v })} className={NUM} />
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
                <div><label className="text-xs font-semibold text-slate-600">Cash ₹</label><NumberInput data-testid="pay-cash" value={pay.cash} onChange={(v) => setPay({ ...pay, cash: v })} className={NUM} /></div>
                <div><label className="text-xs font-semibold text-slate-600">Online ₹</label><NumberInput data-testid="pay-online" value={pay.online} onChange={(v) => setPay({ ...pay, online: v })} className={NUM} /></div>
              </div>
              <button data-testid="pay-full-btn" onClick={() => setPay({ cash: String(totals.grandTotal), online: "" })} className="mt-2 text-xs font-semibold text-indigo-700">Full cash</button>
              {creditAvail > 0 && (
                <label className="mt-2 flex items-center justify-between rounded-lg bg-violet-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-violet-800">Use store credit ({money(creditAvail)})</span>
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
            <button data-testid="preview-bill-btn" onClick={preview} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3.5 font-bold text-indigo-800 transition-transform active:scale-95"><Eye className="h-5 w-5" /> Preview</button>
            <button data-testid="confirm-save-btn" onClick={save} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3.5 font-bold text-white shadow-md transition-transform active:scale-95 hover:bg-orange-500 disabled:opacity-60"><Save className="h-5 w-5" /> {saving ? "…" : "Confirm & Save"}</button>
          </div>
          <p className="text-center text-xs text-slate-400">Preview sirf dikhata hai (save nahi). Confirm & Save par PDF nayi tab me khulega.</p>
        </div>
      </div>

      <ItemDetailsDialog product={detailsFor} type={type}
        onClose={() => { setDetailsFor(null); focusSearch(); }}
        onAdd={(d) => addItemWithDetails(detailsFor, d)} />

      <NewProductDialog name={newProductName}
        onClose={() => { setNewProductName(null); focusSearch(); }}
        onCreate={createAndPick} />

      <SqftDialog sqftFor={sqftFor} onClose={() => setSqftFor(null)} onApply={applySqft} />
    </div>
  );
}

// Qty / rate popup shown right after a product is picked. Enter submits, and
// NewBill puts the caret back in the search box for the next item.
function ItemDetailsDialog({ product, type, onClose, onAdd }) {
  const [qty, setQty] = useState("");
  const [pieces, setPieces] = useState("");
  const [rate, setRate] = useState("");

  useEffect(() => {
    if (!product) return;
    setQty(""); setPieces("");
    // Purchases are billed at the supplier's rate, so never prefill there.
    setRate(type === "sale" && product.sellPrice > 0 ? String(product.sellPrice) : "");
  }, [product, type]);

  if (!product) return null;
  const tile = isBoxUnit(product);
  const ppb = tile ? (Number(product.piecesPerBox) || 1) : 1;
  const amount = itemAmount({
    qty, pieces: tile ? pieces : 0, rate,
    unit: tile ? UNIT_BOX : UNIT_PIECE,
    piecesPerBox: ppb,
  });

  const submit = () => {
    if (tile) {
      if (!(Number(qty) > 0 || Number(pieces) > 0)) return toast.error("Box ya pcs daaliye");
    } else if (!(Number(qty) > 0)) {
      return toast.error("Pcs daaliye");
    }
    if (!(Number(rate) > 0)) return toast.error("Rate daaliye");
    onAdd({ qty, pieces: tile ? pieces : "", rate });
  };

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="item-details-dialog" onCloseAutoFocus={(e) => e.preventDefault()}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}>
        <DialogHeader>
          <DialogTitle>
            {product.name}
            <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold align-middle ${tile ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{unitKindLabel(product)}</span>
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-xs text-slate-500">{productMetaLine(product)}</p>
        <div className={`grid gap-3 ${tile ? "grid-cols-3" : "grid-cols-2"}`}>
          <div>
            <label className="text-xs font-semibold text-slate-600">{qtyFieldLabel(product)}</label>
            <NumberInput data-testid="detail-qty" autoFocus value={qty} onChange={setQty} className={NUM} />
          </div>
          {tile && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Pcs</label>
              <NumberInput data-testid="detail-pieces" value={pieces} onChange={setPieces} className={NUM} />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-600">Rate{rateSuffix(product)}</label>
            <NumberInput data-testid="detail-rate" value={rate} onChange={setRate} className={NUM} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2">
          <span className="text-sm font-semibold text-slate-700">Amount</span>
          <b className="tabular-nums text-indigo-900" data-testid="detail-amount">{money(amount)}</b>
        </div>
        <button data-testid="detail-add-btn" onClick={submit} className="rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Add item (Enter)</button>
      </DialogContent>
    </Dialog>
  );
}

// Quick-add for stock the shopkeeper has in the godown but never entered.
function NewProductDialog({ name, onClose, onCreate }) {
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (name === null) return setF(null);
    setF({ name, code: "", company: "", size: "", unit: UNIT_BOX, piecesPerBox: "", sellPrice: "", stockQty: "", lowStockThreshold: "" });
  }, [name]);

  if (!f) return null;
  const tile = isBoxUnit(f);

  const submit = async () => {
    if (!f.name.trim()) return toast.error("Item ka naam daaliye");
    if (tile && !(Number(f.piecesPerBox) > 0)) return toast.error("Tiles ke liye pieces / box daaliye");
    if (busy) return;
    setBusy(true);
    try {
      await onCreate({
        ...f,
        unit: tile ? UNIT_BOX : UNIT_PIECE,
        piecesPerBox: tile ? f.piecesPerBox : 1,
      });
    } catch { toast.error("Item add nahi hua, dobara koshish karein"); }
    finally { setBusy(false); }
  };

  const T = (k, l, cls = "") => (
    <div key={k} className={cls}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{l}</label>
      <input data-testid={`np-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
    </div>
  );
  const N = (k, l, cls = "") => (
    <div key={k} className={cls}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{l}</label>
      <NumberInput data-testid={`np-${k}`} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} className={NUM} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto" data-testid="new-product-dialog" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><PackagePlus className="h-5 w-5 text-emerald-600" /> Naya item</DialogTitle></DialogHeader>
        <p className="-mt-2 text-xs text-slate-500">Tiles = Boxes + Pcs · Sanitary = Pieces only. Yahin add karke bill me lagayein.</p>
        <div className="grid grid-cols-2 gap-3">
          <UnitToggle value={f.unit} onChange={(unit) => setF({
            ...f, unit,
            piecesPerBox: unit === UNIT_PIECE ? "1" : (f.piecesPerBox === "1" ? "" : f.piecesPerBox),
          })} testId="np-unit" />
          {T("name", "Name", "col-span-2")}
          {T("code", "Code")}
          {T("company", "Company")}
          {tile && T("size", "Size (e.g. 2x2 ft)")}
          {tile && N("piecesPerBox", "Pieces / box")}
          {N("sellPrice", `Price optional (${tile ? "₹/box" : "₹/pc"})`)}
          {N("stockQty", `Stock (${tile ? "boxes" : "pcs"})`)}
          {N("lowStockThreshold", "Low-stock alert")}
        </div>
        <button data-testid="np-save-btn" onClick={submit} disabled={busy}
          className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-60">
          {busy ? "…" : "Add & bill me lagayein"}
        </button>
      </DialogContent>
    </Dialog>
  );
}

const Row = ({ l, v }) => <div className="flex justify-between text-slate-600"><span>{l}</span><span className="font-semibold">{v}</span></div>;

function SqftDialog({ sqftFor, onClose, onApply }) {
  const [mode, setMode] = useState("lw");
  const [d, setD] = useState({ roomArea: "", roomLengthFt: "", roomWidthFt: "", tileLenInch: "", tileWidInch: "", wastagePct: "" });
  if (!sqftFor) return null;
  const it = sqftFor.item;
  const input = mode === "area" ? { roomArea: d.roomArea } : { roomLengthFt: d.roomLengthFt, roomWidthFt: d.roomWidthFt };
  const res = sqftCalc({ ...input, tileLenInch: d.tileLenInch, tileWidInch: d.tileWidInch, wastagePct: d.wastagePct, piecesPerBox: it.piecesPerBox || 1, ratePerBox: it.rate });
  const F = (k, l) => <div key={k}><label className="text-xs font-semibold text-slate-600">{l}</label><NumberInput data-testid={`sqft-${k}`} value={d[k]} onChange={(v) => setD({ ...d, [k]: v })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums" /></div>;
  return (
    <Dialog open={!!sqftFor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="sqft-dialog">
        <DialogHeader><DialogTitle>Sq-ft Calculator — {it.name}</DialogTitle></DialogHeader>
        <div className="flex rounded-xl border border-slate-300 bg-white p-1 text-sm">
          <button data-testid="sqft-mode-lw" onClick={() => setMode("lw")} className={`flex-1 rounded-lg px-3 py-1.5 font-semibold ${mode === "lw" ? "bg-indigo-900 text-white" : "text-slate-600"}`}>Length × Width</button>
          <button data-testid="sqft-mode-area" onClick={() => setMode("area")} className={`flex-1 rounded-lg px-3 py-1.5 font-semibold ${mode === "area" ? "bg-indigo-900 text-white" : "text-slate-600"}`}>Direct sq-ft</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {mode === "area" ? F("roomArea", "Area (sq-ft)") : (<>{F("roomLengthFt", "Room length (ft)")}{F("roomWidthFt", "Room width (ft)")}</>)}
          {F("tileLenInch", "Tile length (inch)")}
          {F("tileWidInch", "Tile width (inch)")}
          {F("wastagePct", "Wastage %")}
        </div>
        <div className="rounded-xl bg-indigo-50 p-3 text-sm">
          <div className="flex justify-between"><span>Area</span><b>{res.roomArea} sq-ft</b></div>
          <div className="flex justify-between"><span>Tiles needed</span><b>{res.tilesNeeded}</b></div>
          <div className="flex justify-between"><span>Boxes + Pcs</span><b data-testid="sqft-boxes">{res.boxesNeeded} box + {res.loosePieces} pc</b></div>
          <div className="flex justify-between"><span>Price</span><b>{money(res.price)}</b></div>
        </div>
        <button data-testid="sqft-apply-btn" onClick={() => onApply(res)} className="rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Use {res.boxesNeeded} box + {res.loosePieces} pc</button>
      </DialogContent>
    </Dialog>
  );
}
