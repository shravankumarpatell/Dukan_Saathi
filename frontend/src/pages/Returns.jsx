import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import InvoiceSearch from "@/components/InvoiceSearch";
import NumberInput from "@/components/NumberInput";
import { generateBillPDF } from "@/services/billPdf";
import { money, itemAmount, round2, fmtDate } from "@/lib/calc";
import { toast } from "sonner";
import { Undo2, Eye, Save } from "lucide-react";

export default function Returns() {
  const { invoices, shop, commitBill } = useApp();
  const [invNo, setInvNo] = useState("");
  const [src, setSrc] = useState(null);
  const [rows, setRows] = useState([]);
  const [settlement, setSettlement] = useState("cash");
  const [refund, setRefund] = useState("0");
  const [saving, setSaving] = useState(false);

  const selectInvoice = (inv) => {
    setInvNo(inv.invoiceNo);
    setSrc(inv);
    setRows((inv.items || []).map((it) => ({ ...it, retQty: "", retPieces: "" })));
    setRefund("0"); setSettlement("cash");
  };

  const updRow = (i, patch) => {
    setRows((prev) => {
      const next = prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
      const total = next.reduce((s, it) => s + itemAmount({ ...it, qty: it.retQty, pieces: it.retPieces }), 0);
      setRefund(String(round2(total)));
      return next;
    });
  };

  const returned = rows.map((it) => ({ ...it, qty: Number(it.retQty) || 0, pieces: Number(it.retPieces) || 0 })).filter((it) => it.qty > 0 || it.pieces > 0);

  const reset = () => { setInvNo(""); setSrc(null); setRows([]); setRefund("0"); setSettlement("cash"); };

  const buildDraft = () => ({
    kind: "return", type: "return", createdVia: "manual", language: "hi",
    items: returned, refundTotal: Number(refund) || 0, settlement,
    originalInvoiceNo: src.invoiceNo, customerId: src.customerId || null, customerName: src.customerName || "Walk-in",
    gstEnabled: false,
  });

  const preview = () => {
    if (returned.length === 0) return toast.error("Kam se kam ek item return karein");
    const inv = { ...buildDraft(), invoiceNo: "RET-PREVIEW", date: new Date().toISOString() };
    generateBillPDF({ shop, invoice: inv, customer: { name: src.customerName || "Walk-in" } }, "newtab");
  };

  const save = async () => {
    if (returned.length === 0) return toast.error("Kam se kam ek item return karein");
    if (saving) return;
    setSaving(true);
    try {
      const { invoice, customer } = await commitBill(buildDraft());
      generateBillPDF({ shop, invoice, customer: customer || { name: invoice.customerName } }, "newtab");
      toast.success(`Return ${invoice.invoiceNo} ho gaya`);
      reset();
    } catch (e) { toast.error("Return save nahi hua"); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="returns-page">
      <div className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-indigo-900" /><h2 className="font-display text-2xl font-bold text-slate-900">Return Invoice</h2></div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-semibold text-slate-700">Original invoice (search & select)</label>
        <InvoiceSearch invoices={invoices} value={invNo} onChangeText={(t) => { setInvNo(t); setSrc(null); }} onPick={selectInvoice} />
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
                    <div><label className="text-xs text-slate-500">Return {isBox ? "box" : "qty"}</label><NumberInput data-testid={`return-qty-${i}`} value={it.retQty} onChange={(v) => updRow(i, { retQty: v })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums" /></div>
                    {isBox && <div><label className="text-xs text-slate-500">Pieces</label><NumberInput data-testid={`return-pieces-${i}`} value={it.retPieces} onChange={(v) => updRow(i, { retPieces: v })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums" /></div>}
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
            <NumberInput data-testid="return-refund" value={refund} onChange={(v) => setRefund(v)} className="w-32 rounded-lg border border-indigo-300 bg-white px-2 py-1.5 text-right text-sm font-bold tabular-nums" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button data-testid="preview-return-btn" onClick={preview} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 font-bold text-indigo-800 active:scale-95"><Eye className="h-5 w-5" /> Preview</button>
            <button data-testid="submit-return-btn" onClick={save} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-60"><Save className="h-5 w-5" /> {saving ? "…" : "Confirm & Save"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
