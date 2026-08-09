import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import ProductSearch from "@/components/ProductSearch";
import { computeBillTotals, money, sqftCalc, todayISO } from "@/lib/calc";
import { matchCustomer } from "@/lib/fuzzy";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Calculator, Eye, Plus } from "lucide-react";

export default function NewBill() {
  const { products, customers, shop, setDraft } = useApp();
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

  const addItem = (p) => {
    setItems((prev) => [...prev, { productId: p.id, name: p.name, qty: 1, unit: p.unit, rate: type === "purchase" ? p.costPrice : p.sellPrice, piecesPerBox: p.piecesPerBox, size: p.size }]);
  };
  const updItem = (i, patch) => setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const delItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

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

  const preview = () => {
    if (items.length === 0) return toast.error("Pehle item add kariye");
    if (type === "sale" && !customerName.trim()) return toast.error("Customer ka naam daaliye");
    let d = { ...draftBase };
    if (type === "sale") {
      const m = matchCustomer(customers, customerName, customerPhone);
      if (m.best) d.customerId = m.best.id;
    }
    setDraft(d);
  };

  const applySqft = (res) => {
    updItem(sqftFor.index, { qty: res.boxesNeeded });
    setSqftFor(null);
    toast.success(`${res.boxesNeeded} box (${res.tilesNeeded} tiles) for ${res.roomArea} sq-ft`);
  };

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
        {/* Left: items */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-2 block text-sm font-semibold text-slate-700">Add item (search catalog)</label>
            <ProductSearch products={products} onPick={addItem} />

            <div className="mt-4 space-y-2">
              {items.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Koi item nahi. Upar search karke add karein.</p>}
              {items.map((it, i) => (
                <div key={i} data-testid={`bill-item-${i}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between">
                    <div><p className="font-semibold text-slate-900">{it.name}</p><p className="text-xs text-slate-400">{it.size} · {it.unit}</p></div>
                    <button data-testid={`del-item-${i}`} onClick={() => delItem(i)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div><label className="text-xs text-slate-500">Qty</label><input data-testid={`item-qty-${i}`} type="number" value={it.qty} onChange={(e) => updItem(i, { qty: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-slate-500">Rate</label><input data-testid={`item-rate-${i}`} type="number" value={it.rate} onChange={(e) => updItem(i, { rate: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" /></div>
                    <div><label className="text-xs text-slate-500">Amount</label><p className="rounded-lg bg-slate-50 px-2 py-1.5 text-sm font-bold">{money(it.qty * it.rate)}</p></div>
                  </div>
                  {it.unit === "box" && (
                    <button data-testid={`sqft-btn-${i}`} onClick={() => setSqftFor({ index: i, item: it })} className="mt-2 flex items-center gap-1 text-xs font-semibold text-orange-600"><Calculator className="h-3 w-3" /> Sq-ft calculator</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Customer */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 font-display font-bold text-slate-900">{type === "purchase" ? "Supplier" : "Customer"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-600">Name</label><input data-testid="customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Ashok Kumar" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              <div><label className="text-xs font-semibold text-slate-600">Phone (optional)</label><input data-testid="customer-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="98xxxxxxxx" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700"><input data-testid="is-contractor" type="checkbox" checked={isContractor} onChange={(e) => setIsContractor(e.target.checked)} /> Contractor / Dealer</label>
              {isContractor && <div className="col-span-2"><input data-testid="site-note" value={siteNote} onChange={(e) => setSiteNote(e.target.value)} placeholder="Project / site note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>}
            </div>
          </div>
        </div>

        {/* Right: totals & payment */}
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
                <input data-testid="discount-value" type="number" value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
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
                <div><label className="text-xs font-semibold text-slate-600">Cash ₹</label><input data-testid="pay-cash" type="number" value={pay.cash} onChange={(e) => setPay({ ...pay, cash: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
                <div><label className="text-xs font-semibold text-slate-600">Online ₹</label><input data-testid="pay-online" type="number" value={pay.online} onChange={(e) => setPay({ ...pay, online: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
              </div>
              <button data-testid="pay-full-btn" onClick={() => setPay({ cash: totals.grandTotal, online: 0 })} className="mt-2 text-xs font-semibold text-indigo-700">Full cash</button>
              <div className={`mt-2 rounded-lg px-2 py-1.5 text-sm font-bold ${totals.amountPending > 0.5 ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`} data-testid="pending-line">
                {totals.amountPending > 0.5 ? `Udhari: ${money(totals.amountPending)}` : "Fully paid ✓"}
              </div>
            </div>
          )}

          <button data-testid="preview-bill-btn" onClick={preview} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3.5 font-bold text-white shadow-md transition-transform active:scale-95 hover:bg-orange-500">
            <Eye className="h-5 w-5" /> Preview Bill (PDF)
          </button>
          <p className="text-center text-xs text-slate-400">Kuch save nahi hoga jab tak aap preview confirm nahi karte.</p>
        </div>
      </div>

      <SqftDialog sqftFor={sqftFor} onClose={() => setSqftFor(null)} onApply={applySqft} />
    </div>
  );
}

const Row = ({ l, v }) => <div className="flex justify-between text-slate-600"><span>{l}</span><span className="font-semibold">{v}</span></div>;

function SqftDialog({ sqftFor, onClose, onApply }) {
  const [d, setD] = useState({ roomLengthFt: 10, roomWidthFt: 10, tileLenInch: 24, tileWidInch: 24, wastagePct: 5 });
  if (!sqftFor) return null;
  const it = sqftFor.item;
  const res = sqftCalc({ ...d, piecesPerBox: it.piecesPerBox || 1, ratePerBox: it.rate });
  return (
    <Dialog open={!!sqftFor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="sqft-dialog">
        <DialogHeader><DialogTitle>Sq-ft Calculator — {it.name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {[["roomLengthFt", "Room length (ft)"], ["roomWidthFt", "Room width (ft)"], ["tileLenInch", "Tile length (inch)"], ["tileWidInch", "Tile width (inch)"], ["wastagePct", "Wastage %"]].map(([k, l]) => (
            <div key={k}><label className="text-xs font-semibold text-slate-600">{l}</label><input data-testid={`sqft-${k}`} type="number" value={d[k]} onChange={(e) => setD({ ...d, [k]: Number(e.target.value) })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
          ))}
        </div>
        <div className="rounded-xl bg-indigo-50 p-3 text-sm">
          <div className="flex justify-between"><span>Area</span><b>{res.roomArea} sq-ft</b></div>
          <div className="flex justify-between"><span>Tiles needed</span><b>{res.tilesNeeded}</b></div>
          <div className="flex justify-between"><span>Boxes needed</span><b data-testid="sqft-boxes">{res.boxesNeeded}</b></div>
          <div className="flex justify-between"><span>Price</span><b>{money(res.price)}</b></div>
        </div>
        <button data-testid="sqft-apply-btn" onClick={() => onApply(res)} className="rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Use {res.boxesNeeded} boxes</button>
      </DialogContent>
    </Dialog>
  );
}
