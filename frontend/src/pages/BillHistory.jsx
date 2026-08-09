import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { money, fmtDate } from "@/lib/calc";
import { buildInvoicePdf } from "@/lib/invoicePdf";
import { computeBillTotals } from "@/lib/calc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Search, Eye } from "lucide-react";

export default function BillHistory() {
  const { invoices, shop, customers } = useApp();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState(null);

  const list = useMemo(() => invoices.filter((i) => {
    if (filter !== "all" && i.paymentStatus !== filter) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return i.invoiceNo.toLowerCase().includes(s) || (i.customerName || "").toLowerCase().includes(s);
  }), [invoices, q, filter]);

  const openPdf = (i) => {
    const t = computeBillTotals(i);
    const customer = customers.find((c) => c.id === i.customerId);
    setView(buildInvoicePdf({ shop, draft: i, totals: t, customer: customer || { name: i.customerName } }));
  };

  return (
    <div className="space-y-4 ds-fade" data-testid="history-page">
      <h2 className="font-display text-2xl font-bold text-slate-900">Bill History</h2>
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input data-testid="history-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no / customer…" className="w-full bg-transparent text-sm outline-none" /></div>
        <select data-testid="history-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value="all">All</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="pending">Pending</option></select>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="ds-stripe w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-2.5">Invoice</th><th className="p-2.5">Customer</th><th className="p-2.5">Date</th><th className="p-2.5 text-right">Total</th><th className="p-2.5 text-center">Status</th><th className="p-2.5"></th></tr></thead>
          <tbody>
            {list.map((i) => (
              <tr key={i.id} data-testid={`history-row-${i.id}`} className="border-b border-slate-100">
                <td className="p-2.5 font-semibold">{i.invoiceNo}</td>
                <td className="p-2.5">{i.customerName}</td>
                <td className="p-2.5 text-slate-500">{fmtDate(i.date)}</td>
                <td className="p-2.5 text-right font-bold">{money(i.grandTotal)}</td>
                <td className="p-2.5 text-center"><span className={`rounded-md px-2 py-0.5 text-xs font-bold ${i.paymentStatus === "paid" ? "bg-emerald-100 text-emerald-700" : i.paymentStatus === "partial" ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>{i.paymentStatus}</span></td>
                <td className="p-2.5 text-right"><button data-testid={`view-bill-${i.id}`} onClick={() => openPdf(i)} className="rounded-lg p-1.5 text-indigo-700 hover:bg-indigo-50"><Eye className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-sm text-slate-400">Koi bill nahi mila.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-3xl p-2"><iframe title="bill" src={view} className="h-[80vh] w-full rounded-md" /></DialogContent>
      </Dialog>
    </div>
  );
}
