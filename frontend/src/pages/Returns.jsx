import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { generateBillPDF } from "@/services/billPdf";
import { money, itemAmount, round2, fmtDate } from "@/lib/calc";
import { toast } from "sonner";
import { Undo2, Search } from "lucide-react";

export default function Returns() {
  const { invoices, customers, shop, commitBill } = useApp();
  const [invNo, setInvNo] = useState("");
  const [src, setSrc] = useState(null); // matched invoice
  const [rows, setRows] = useState([]); // { ...item, retQty, retPieces }
  const [settlement, setSettlement] = useState("cash");
  const [refund, setRefund] = useState(0);
  const [saving, setSaving] = useState(false);

  const fetchBill = () => {
    const s = invNo.trim().toLowerCase();
    if (!s) return toast.error("Invoice number daaliye");
    const found = invoices.find((i) => (i.invoiceNo || "").toLowerCase() === s && i.type === "sale");
    if (!found) return toast.error("Sale invoice nahi mila");
    setSrc(found);
    const r = (found.items || []).map((it) => ({ ...it, retQty: 0, retPieces: 0 }));
    setRows(r); setRefund(0); setSettlement("cash");
  };

  const updRow = (i, patch) => {
    setRows((prev) => {
      const next = prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
      const total = next.reduce((s, it) => s + itemAmount({ ...it, qty: it.retQty, pieces: it.retPieces }), 0);
      setRefund(round2(total));
      return next;
    });
  };

  const returned = rows.map((it) => ({ ...it, qty: Number(it.retQty) || 0, pieces: Number(it.retPieces) || 0 })).filter((it) => it.qty > 0 || it.pieces > 0);

  const reset = () => { setInvNo(""); setSrc(null); setRows([]); setRefund(0); setSettlement("cash"); };

  const save = async () => {
    if (returned.length === 0) return toast.error("Kam se kam ek item return karein");
    if (saving) return;
    setSaving(true);
    try {
      const d = {
        kind: "return", type: "return", createdVia: "manual", language: "hi",
        items: returned, refundTotal: Number(refund) || 0, settlement,
        originalInvoiceNo: src.invoiceNo, customerId: src.customerId || null, customerName: src.customerName || "Walk-in",
        gstEnabled: false,
      };
      const { invoice, customer } = await commitBill(d);
      generateBillPDF({ shop, invoice, customer: customer || { name: invoice.customerName } }, "newtab");
      toast.success(`Return ${invoice.invoiceNo} ho gaya`);
      reset();
    } catch (e) { toast.error("Return save nahi hua"); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="returns-page">
      <div className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-indigo-900" /><h2 className="font-display text-2xl font-bold text-slate-900">Return Invoice</h2></div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-semibold text-slate-700">Original invoice number</label>
        <div className="flex gap-2">
          <input data-testid="return-invoice-no" value={invNo} onChange={(e) => setInvNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fetchBill()} placeholder="e.g. GST/2026/0001" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button data-testid="fetch-bill-btn" onClick={fetchBill} className="flex items-center gap-1 rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white active:scale-95"><Search className="h-4 w-4" /> Fetch</button>
        </div>
      </div>

      {src && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4" data-testid="return-detail">
          <div className="flex items-center justify-between text-sm">
            <div><p className="font-display font-bold text-slate-900">{src.customerName}</p><p className="text-xs text-slate-400">{src.invoiceNo} · {fmtDate(src.date)}</p></div>
            <p className="font-bold text-slate-700">{money(src.grandTotal)}</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Select items to return</p>
            {rows.map((it, i) => {
              const isBox = it.unit === "box" && (Number(it.piecesPerBox) || 1) > 1;
              return (
                <div key={i} data-testid={`return-row-${i}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between"><p className="font-semibold text-slate-900">{it.name}</p><span className="text-xs text-slate-400">sold {it.qty}{isBox && Number(it.pieces) > 0 ? ` + ${it.pieces} pc` : ""}</span></div>
                  <div className={`mt-2 grid gap-2 ${isBox ? "grid-cols-3" : "grid-cols-2"}`}>
                    <div><label className="text-xs text-slate-500">Return {isBox ? "box" : "qty"}</label><input data-testid={`return-qty-${i}`} type="number" inputMode="decimal" value={it.retQty} min={0} max={it.qty} onChange={(e) => updRow(i, { retQty: Math.max(0, Math.min(Number(it.qty), Number(e.target.value))) })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums" /></div>
                    {isBox && <div><label className="text-xs text-slate-500">Pieces</label><input data-testid={`return-pieces-${i}`} type="number" inputMode="decimal" value={it.retPieces} min={0} onChange={(e) => updRow(i, { retPieces: Math.max(0, Number(e.target.value)) })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums" /></div>}
                    <div><label className="text-xs text-slate-500">Amount</label><p className="rounded-lg bg-slate-50 px-2 py-1.5 text-right text-sm font-bold tabular-nums">{money(itemAmount({ ...it, qty: it.retQty, pieces: it.retPieces }))}</p></div>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">Settlement</label>
            <div className="grid grid-cols-3 gap-2">
              {[["cash", "Cash refund"], ["adjust_udhari", "Adjust udhari"], ["store_credit", "Store credit"]].map(([v, l]) => (
                <button key={v} data-testid={`settle-${v}`} onClick={() => setSettlement(v)} className={`rounded-lg border px-2 py-2 text-xs font-semibold ${settlement === v ? "border-indigo-900 bg-indigo-900 text-white" : "border-slate-300 text-slate-600"}`}>{l}</button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">Refund amount (editable)</span>
            <input data-testid="return-refund" type="number" inputMode="decimal" value={refund} onChange={(e) => setRefund(Number(e.target.value))} className="w-32 rounded-lg border border-indigo-300 bg-white px-2 py-1.5 text-right text-sm font-bold tabular-nums" />
          </div>

          <button data-testid="submit-return-btn" onClick={save} disabled={saving} className="w-full rounded-xl bg-orange-600 px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-60">{saving ? "Saving…" : "Confirm & Save Return"}</button>
        </div>
      )}
    </div>
  );
}
