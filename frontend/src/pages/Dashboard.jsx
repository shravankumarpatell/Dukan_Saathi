import React, { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { money, fmtDate } from "@/lib/calc";
import { generateDailySummaryPDF } from "@/services/billPdf";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Package, AlertTriangle, IndianRupee, Wallet, ReceiptText, Printer, Plus } from "lucide-react";

const Stat = ({ icon: Icon, label, value, tone = "indigo", testid, onClick }) => (
  <button data-testid={testid} onClick={onClick} className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition-transform active:scale-95 hover:border-indigo-300 hover:shadow-md">
    <div className={`mb-2 inline-flex rounded-lg p-2 bg-${tone}-100 text-${tone}-700`}><Icon className="h-4 w-4" /></div>
    <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
    <p className="font-display text-2xl font-bold text-slate-900">{value}</p>
  </button>
);

export default function Dashboard() {
  const { products, invoices, customers, expenses, shop, setDraft } = useApp();
  const navigate = useNavigate();
  const [exp, setExp] = useState({ amount: "", note: "", mode: "cash" });

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todaySales = invoices.filter((i) => i.type === "sale" && new Date(i.date).toDateString() === today);
    const revenue = todaySales.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const totalUdhari = customers.reduce((s, c) => s + (c.totalPending || 0), 0);
    const lowStock = products.filter((p) => (p.showroomQty || 0) + (p.godownQty || 0) <= (p.lowStockThreshold || 0));
    return { revenue, totalUdhari, lowStock, todayCount: todaySales.length };
  }, [products, invoices, customers]);

  const addExpense = () => {
    if (!(Number(exp.amount) > 0)) return toast.error("Amount daaliye");
    setDraft({ kind: "expense", amount: Number(exp.amount), note: exp.note, mode: exp.mode, title: "Add Expense", subtitle: exp.note || exp.mode, amount: Number(exp.amount) });
    setExp({ amount: "", note: "", mode: "cash" });
  };

  const printSummary = () => {
    const today = new Date().toDateString();
    const todaySales = invoices.filter((i) => i.type === "sale" && new Date(i.date).toDateString() === today);
    const cash = todaySales.reduce((s, i) => s + (i.payments || []).filter((p) => p.mode === "cash").reduce((a, p) => a + p.amount, 0), 0);
    const online = todaySales.reduce((s, i) => s + (i.payments || []).filter((p) => p.mode === "online").reduce((a, p) => a + p.amount, 0), 0);
    const udhariAdded = todaySales.reduce((s, i) => s + (i.amountPending || 0), 0);
    const todayExp = expenses.filter((e) => new Date(e.date).toDateString() === today);
    const expensesTotal = todayExp.reduce((s, e) => s + (e.amount || 0), 0);
    const s = { salesRevenue: stats.revenue, cashCollected: cash, onlineCollected: online, udhariAdded, udhariCollected: 0, expensesTotal, netCash: cash - expensesTotal };
    generateDailySummaryPDF({ shop, dateISO: new Date().toISOString(), stats: s, expenses: todayExp }, "newtab");
  };

  return (
    <div className="space-y-6 ds-fade" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900">Namaste 🙏</h2>
          <p className="text-sm text-slate-500">Aaj ka hisaab ek nazar me.</p>
        </div>
        <button data-testid="quick-bill-btn" onClick={() => navigate("/bill")}
          className="rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white transition-transform active:scale-95">+ New Bill</button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat testid="stat-revenue" icon={IndianRupee} label="Aaj Sale" value={money(stats.revenue)} tone="emerald" onClick={() => navigate("/analytics")} />
        <Stat testid="stat-bills" icon={ReceiptText} label="Aaj Bills" value={stats.todayCount} tone="indigo" onClick={() => navigate("/history")} />
        <Stat testid="stat-udhari" icon={Wallet} label="Total Udhari" value={money(stats.totalUdhari)} tone="rose" onClick={() => navigate("/customers")} />
        <Stat testid="stat-lowstock" icon={AlertTriangle} label="Low Stock" value={stats.lowStock.length} tone="amber" onClick={() => navigate("/inventory?low=1")} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Add expense */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><IndianRupee className="h-4 w-4 text-orange-600" /><h3 className="font-display font-bold text-slate-900">Add Expense</h3></div>
          <div className="grid grid-cols-2 gap-2">
            <input data-testid="dash-exp-amount" type="number" value={exp.amount} onChange={(e) => setExp({ ...exp, amount: e.target.value })} placeholder="Amount ₹" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input data-testid="dash-exp-note" value={exp.note} onChange={(e) => setExp({ ...exp, note: e.target.value })} placeholder="Note" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="mt-2 flex gap-2">
            {["cash", "online"].map((m) => <button key={m} data-testid={`dash-exp-mode-${m}`} onClick={() => setExp({ ...exp, mode: m })} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold capitalize ${exp.mode === m ? "border-indigo-900 bg-indigo-900 text-white" : "border-slate-300"}`}>{m}</button>)}
            <button data-testid="dash-add-expense-btn" onClick={addExpense} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white active:scale-95"><Plus className="h-4 w-4" /> Add</button>
          </div>
        </div>

        {/* Daily summary */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex items-center gap-2"><Printer className="h-4 w-4 text-indigo-700" /><h3 className="font-display font-bold text-slate-900">Daily Summary</h3></div>
          <p className="text-sm text-slate-500">Aaj ki sale, cash/online, udhari aur expenses ka day-book.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-emerald-50 px-3 py-2"><p className="text-xs text-slate-500">Sale</p><p className="font-bold text-emerald-700">{money(stats.revenue)}</p></div>
            <div className="rounded-lg bg-rose-50 px-3 py-2"><p className="text-xs text-slate-500">Udhari</p><p className="font-bold text-rose-700">{money(stats.totalUdhari)}</p></div>
          </div>
          <button data-testid="dash-print-summary-btn" onClick={printSummary} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95"><Printer className="h-4 w-4" /> Print Daily Summary (PDF)</button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 font-display font-bold text-slate-900">Recent Bills</h3>
        <div className="space-y-2">
          {invoices.slice(0, 6).map((i) => (
            <button key={i.id} data-testid={`dash-bill-${i.id}`} onClick={() => navigate("/history")} className="flex w-full items-center justify-between border-b border-slate-100 py-2 text-left last:border-0 hover:bg-slate-50">
              <div>
                <p className="text-sm font-semibold text-slate-800">{i.invoiceNo} · {i.customerName}</p>
                <p className="text-xs text-slate-400">{fmtDate(i.date)} · {i.createdVia === "voice" ? "🎤 Voice" : "✍️ Manual"}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{money(i.grandTotal)}</p>
                {i.amountPending > 0 && <p className="text-xs font-semibold text-rose-600">{money(i.amountPending)} udhari</p>}
              </div>
            </button>
          ))}
          {invoices.length === 0 && <p className="text-sm text-slate-500">Abhi koi bill nahi bana.</p>}
        </div>
      </div>
    </div>
  );
}
