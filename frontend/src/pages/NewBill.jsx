import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import ProductSearch from "@/components/ProductSearch";
import CustomerSearch from "@/components/CustomerSearch";
import { generateBillPDF } from "@/services/billPdf";
import { computeBillTotals, itemAmount, money, sqftCalc, todayISO } from "@/lib/calc";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Calculator, Save } from "lucide-react";

const NUM = "w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-500";

const blank = {
  type: "sale", items: [], customerName: "", customerPhone: "", isContractor: false, siteNote: "",
  discount: { type: "flat", value: 0 }, pay: { cash: 0, online: 0 }, selectedCustomer: null, useCredit: false,
};

export default function NewBill() {
  const { products, customers, shop, commitBill } = useApp();
  const [type, setType] = useState("sale");
  const [items, setItems] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [isContractor, setIsContractor] = useState(false);
  const [siteNote, setSiteNote] = useState("");
  const [gstEnabled, setGstEnabled] = useState(shop?.gstEnabled ?? true);
  const [gstRate, setGstRate] = useState(18);
  const [discount, setDiscount] = useState({ type: "flat", value: 0 });
  const [pay, setPay] = useState({ cash: 0, online: 0 });
  const [sqftFor, setSqftFor] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [useCredit, setUseCredit] = useState(false);
  const [saving, setSaving] = useState(false);

  const addItem = (p) => setItems((prev) => [...prev, { productId: p.id, name: p.name, qty: 1, pieces: 0, unit: p.unit, rate: type === "purchase" ? p.costPrice : p.sellPrice, piecesPerBox: p.piecesPerBox || 1, size: p.size }]);
  const updItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const delItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const reset = () => {
    setType("sale"); setItems([]); setCustomerName(""); setCustomerPhone(""); setIsContractor(false); setSiteNote("");
    setGstEnabled(shop?.gstEnabled ?? true); setGstRate(18); setDiscount({ type: "flat", value: 0 });
    setPay({ cash: 0, online: 0 }); setSelectedCustomer(null); setUseCredit(false);
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
    const ppb = Number(it.piecesPerBox) || 1;
    const availPieces = ((p.showroomQty || 0) + (p.godownQty || 0)) * ppb;
    const soldPieces = (Number(it.qty) || 0) * ppb + (Number(it.pieces) || 0);
    const left = availPieces - soldPieces;
    const boxes = Math.trunc(left / ppb); const pc = left - boxes * ppb;
    return { left, boxes, pc, short: left < 0 };
  };

  const save = async () => {
    if (items.length === 0) return toast.error("Pehle item add kariye");
    if (saving) return;
    setSaving(true);
    try {
      const payments = [
        ...(Number(pay.cash) > 0 ? [{ mode: "cash", amount: Number(pay.cash) }] : []),
        ...(Number(pay.online) > 0 ? [{ mode: "online", amount: Number(pay.online) }] : []),
        ...(creditApplied > 0 ? [{ mode: "credit", amount: creditApplied }] : []),
      ];
      const d = { ...draftBase, payments, customerId: selectedCustomer?.id || null };
      const { invoice, customer } = await commitBill(d);
      generateBillPDF({ shop, invoice, customer: customer || { name: invoice.customerName } }, "newtab");
      toast.success(`${invoice.invoiceNo} save ho gaya`);
      reset();
    } catch (e) {
      toast.error("Save nahi hua, dobara koshish karein");
    } finally { setSaving(false); }
  };

  const applySqft = (res) => { updItem(sqftFor.index, { qty: res.boxesNeeded, pieces: res.loosePieces }); setSqftFor(null); toast.success(`${res.boxesNeeded} box + ${res.loosePieces} pc (${res.tilesNeeded} tiles) for ${res.roomArea} sq-ft`); };

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
            <ProductSearch products={products} onPick={addItem} />

            <div className="mt-4 space-y-2">
              {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Koi item nahi. Upar search karke add karein.</p>}
              {items.map((it, i) => {
                const isBox = it.unit === "box" && (Number(it.piecesPerBox) || 1) > 1;
                const rem = remaining(it);
                return (
                  <div key={i} data-testid={`bill-item-${i}`} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between">
                      <div><p className="font-semibold text-slate-900">{it.name}</p><p className="text-xs text-slate-400">{[it.size, it.unit, isBox ? `${it.piecesPerBox}/box` : ""].filter(Boolean).join(" · ")}</p></div>
                      <button data-testid={`del-item-${i}`} onClick={() => delItem(i)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <div className={`mt-2 grid gap-2 ${isBox ? "grid-cols-4" : "grid-cols-3"}`}>
                      <div><label className="text-xs text-slate-500">{isBox ? "Box" : "Qty"}</label><input data-testid={`item-qty-${i}`} type="number" inputMode="decimal" value={it.qty} onChange={(e) => updItem(i, { qty: Number(e.target.value) })} className={NUM} /></div>
                      {isBox && <div><label className="text-xs text-slate-500">Pieces</label><input data-testid={`item-pieces-${i}`} type="number" inputMode="decimal" value={it.pieces} onChange={(e) => updItem(i, { pieces: Number(e.target.value) })} className={NUM} /></div>}
                      <div><label className="text-xs text-slate-500">Rate{isBox ? "/box" : ""}</label><input data-testid={`item-rate-${i}`} type="number" inputMode="decimal" value={it.rate} onChange={(e) => updItem(i, { rate: Number(e.target.value) })} className={NUM} /></div>
                      <div><label className="text-xs text-slate-500">Amount</label><p className="rounded-lg bg-slate-50 px-2 py-1.5 text-right text-sm font-bold tabular-nums" data-testid={`item-amount-${i}`}>{money(itemAmount(it))}</p></div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      {it.unit === "box" && (
                        <button data-testid={`sqft-btn-${i}`} onClick={() => setSqftFor({ index: i, item: it })} className="flex items-center gap-1 text-xs font-semibold text-orange-600"><Calculator className="h-3 w-3" /> Sq-ft calculator</button>
                      )}
                      {type === "sale" && rem && (
                        <span data-testid={`item-remaining-${i}`} className={`ml-auto text-xs font-semibold ${rem.short ? "text-rose-600" : "text-slate-500"}`}>Bacha: {rem.boxes} box{isBox ? ` + ${rem.pc} pc` : ""}</span>
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
                <select data-testid="discount-type" value={discount.type} onChange={(e) => setDiscount({ ...discount, type: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"><option value="flat">₹</option><option value="percent">%</option></select>
                <input data-testid="discount-value" type="number" inputMode="decimal" value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value })} className={NUM} />
              </div>
            </div>

            <div className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
              <Row l="Subtotal" v={money(totals.subtotal)} />
              {totals.discountOff > 0 && <Row l="Discount" v={"- " + money(totals.discountOff)} />}
              {totals.gstRate > 0 && <Row l={`GST ${totals.gstRate}%`} v={money(totals.gstAmount)} />}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-display text-lg font-bold text-slate-900"><span>Total</span><span data-testid="bill-grand-total">{money(totals.grandTotal)}</span></div>
              {totals.ewayRequired && <p className="rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">⚠ E-way bill required (≥ ₹50,000)</p>}
            </div>
          </div>

          {type === "sale" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 font-display font-bold text-slate-900">Payment split</h3>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs font-semibold text-slate-600">Cash ₹</label><input data-testid="pay-cash" type="number" inputMode="decimal" value={pay.cash} onChange={(e) => setPay({ ...pay, cash: e.target.value })} className={NUM} /></div>
                <div><label className="text-xs font-semibold text-slate-600">Online ₹</label><input data-testid="pay-online" type="number" inputMode="decimal" value={pay.online} onChange={(e) => setPay({ ...pay, online: e.target.value })} className={NUM} /></div>
              </div>
              <button data-testid="pay-full-btn" onClick={() => setPay({ cash: totals.grandTotal, online: 0 })} className="mt-2 text-xs font-semibold text-indigo-700">Full cash</button>
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

          <button data-testid="confirm-save-btn" onClick={save} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3.5 font-bold text-white shadow-md transition-transform active:scale-95 hover:bg-orange-500 disabled:opacity-60">
            <Save className="h-5 w-5" /> {saving ? "Saving…" : "Confirm & Save"}
          </button>
          <p className="text-center text-xs text-slate-400">Save karte hi PDF invoice nayi tab me khul jayega.</p>
        </div>
      </div>

      <SqftDialog sqftFor={sqftFor} onClose={() => setSqftFor(null)} onApply={applySqft} />
    </div>
  );
}

const Row = ({ l, v }) => <div className="flex justify-between text-slate-600"><span>{l}</span><span className="font-semibold">{v}</span></div>;

function SqftDialog({ sqftFor, onClose, onApply }) {
  const [mode, setMode] = useState("lw");
  const [d, setD] = useState({ roomArea: 100, roomLengthFt: 10, roomWidthFt: 10, tileLenInch: 24, tileWidInch: 24, wastagePct: 5 });
  if (!sqftFor) return null;
  const it = sqftFor.item;
  const input = mode === "area" ? { roomArea: d.roomArea } : { roomLengthFt: d.roomLengthFt, roomWidthFt: d.roomWidthFt };
  const res = sqftCalc({ ...input, tileLenInch: d.tileLenInch, tileWidInch: d.tileWidInch, wastagePct: d.wastagePct, piecesPerBox: it.piecesPerBox || 1, ratePerBox: it.rate });
  const F = (k, l) => <div key={k}><label className="text-xs font-semibold text-slate-600">{l}</label><input data-testid={`sqft-${k}`} type="number" inputMode="decimal" value={d[k]} onChange={(e) => setD({ ...d, [k]: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums" /></div>;
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
          <div className="flex justify-between"><span>Boxes + loose</span><b data-testid="sqft-boxes">{res.boxesNeeded} box + {res.loosePieces} pc</b></div>
          <div className="flex justify-between"><span>Price</span><b>{money(res.price)}</b></div>
        </div>
        <button data-testid="sqft-apply-btn" onClick={() => onApply(res)} className="rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Use {res.boxesNeeded} box + {res.loosePieces} pc</button>
      </DialogContent>
    </Dialog>
  );
}
