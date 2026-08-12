import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { money, fmtDate } from "@/lib/calc";
import { generateBillPDF } from "@/services/billPdf";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Search, X, ChevronRight } from "lucide-react";

export default function BillHistory() {
  const { invoices, shop, customers } = useApp();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [date, setDate] = useState(todayStr);
  const [view, setView] = useState(null);

  const list = useMemo(() => invoices.filter((i) => {
    if (filter !== "all" && i.paymentStatus !== filter) return false;
    if (date) {
      const d = new Date(i.date);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (local !== date) return false;
    }
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return i.invoiceNo.toLowerCase().includes(s) || (i.customerName || "").toLowerCase().includes(s);
  }), [invoices, q, filter, date]);

  const openPdf = (i) => {
    const customer = customers.find((c) => c.id === i.customerId);
    setView(generateBillPDF({ shop, invoice: i, customer: customer || { name: i.customerName } }, "bloburl"));
  };

  return (
    <div className="space-y-3 ds-fade" data-testid="history-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Bill History</h2>
        <p className="text-sm text-slate-500">{date ? "Showing selected date · tap ✕ on date for all bills" : "Showing all bills"}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input data-testid="history-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no / customer…" className="w-full bg-transparent outline-none" /></div>
        <input data-testid="history-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2" />
        {date && <button data-testid="history-date-clear" onClick={() => setDate("")} className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-600"><X className="h-4 w-4" /></button>}
        <select data-testid="history-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="all">All</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="pending">Pending</option></select>
      </div>

      {/* Flat, full-page list */}
      <div className="divide-y divide-slate-100" data-testid="history-list">
        {list.map((i) => (
          <button key={i.id} data-testid={`history-row-${i.id}`} onClick={() => openPdf(i)} className="flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors active:bg-slate-50">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-900">{i.customerName || "Walk-in"}</p>
              <p className="truncate text-xs text-slate-400">{i.invoiceNo} · {fmtDate(i.date)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold tabular-nums text-slate-900">{money(i.grandTotal)}</p>
              <span className={`text-[11px] font-bold ${i.paymentStatus === "paid" ? "text-emerald-600" : i.paymentStatus === "partial" ? "text-amber-600" : "text-rose-600"}`}>{i.paymentStatus}</span>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
          </button>
        ))}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Koi bill nahi mila.</p>}
      </div>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-3xl p-2"><DialogTitle className="sr-only">Invoice PDF</DialogTitle><iframe title="bill" src={view} className="h-[80vh] w-full rounded-md" data-testid="history-pdf-frame" /></DialogContent>
      </Dialog>
    </div>
  );
}
