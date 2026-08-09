import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import ProductSearch from "@/components/ProductSearch";
import CustomerSearch from "@/components/CustomerSearch";
import { matchCustomer } from "@/lib/fuzzy";
import { money } from "@/lib/calc";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";

export default function Returns() {
  const { products, customers, setDraft } = useApp();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [settlement, setSettlement] = useState("cash");
  const [invoiceId, setInvoiceId] = useState("");

  const refundValue = product ? qty * product.sellPrice : 0;

  const submit = () => {
    if (!product) return toast.error("Product select kariye");
    const cust = matchCustomer(customers, customerName).best;
    setDraft({
      kind: "return", language: "hi", createdVia: "manual",
      productId: product.id, productName: product.name, qty: Number(qty) || 1,
      customerId: cust?.id, customerName: cust?.name || customerName, settlement, invoiceId: invoiceId || null, refundValue,
      title: "Record Return", subtitle: `${product.name} × ${qty}`,
      summaryRows: [
        { label: "Stock restored", new: `+${qty} ${product.unit}` },
        { label: "Settlement", new: settlement === "cash" ? "Cash refund" : settlement === "adjust_udhari" ? "Adjust udhari" : "Store credit" },
      ],
      amount: refundValue,
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="returns-page">
      <div className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-indigo-900" /><h2 className="font-display text-2xl font-bold text-slate-900">Record Return</h2></div>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Product</label>
          {product ? (
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
              <span className="font-semibold text-slate-800">{product.name}</span>
              <button data-testid="change-product-btn" onClick={() => setProduct(null)} className="text-xs font-semibold text-indigo-700">Change</button>
            </div>
          ) : <ProductSearch products={products} onPick={setProduct} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="text-xs font-semibold text-slate-600">Quantity</label><input data-testid="return-qty" type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
          <div><label className="text-xs font-semibold text-slate-600">Customer (optional)</label>
            <CustomerSearch customers={customers} value={customerName} inputTestId="return-customer"
              onChangeText={(t) => setCustomerName(t)}
              onPick={(c) => setCustomerName(c ? c.name : customerName)} />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600">Original invoice # (optional)</label>
          <input data-testid="return-invoice" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} placeholder="e.g. GST/2026/0001" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-600">Settlement</label>
          <div className="grid grid-cols-3 gap-2">
            {[["cash", "Cash refund"], ["adjust_udhari", "Adjust udhari"], ["store_credit", "Store credit"]].map(([v, l]) => (
              <button key={v} data-testid={`settle-${v}`} onClick={() => setSettlement(v)} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${settlement === v ? "border-indigo-900 bg-indigo-900 text-white" : "border-slate-300 text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-sm"><span>Refund value</span><b data-testid="return-refund">{money(refundValue)}</b></div>
        <button data-testid="submit-return-btn" onClick={submit} className="w-full rounded-xl bg-orange-600 px-4 py-3 font-bold text-white active:scale-95">Preview &amp; Confirm</button>
      </div>
    </div>
  );
}
