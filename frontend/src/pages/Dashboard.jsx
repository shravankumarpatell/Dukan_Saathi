import React, { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { money, fmtDate } from "@/lib/calc";
import { useNavigate } from "react-router-dom";
import { Package, AlertTriangle, IndianRupee, Wallet, TrendingUp, ReceiptText } from "lucide-react";

const Stat = ({ icon: Icon, label, value, tone = "indigo", testid }) => (
  <div data-testid={testid} className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className={`mb-2 inline-flex rounded-lg p-2 bg-${tone}-100 text-${tone}-700`}><Icon className="h-4 w-4" /></div>
    <p className="text-xs uppercase tracking-widest text-slate-400">{label}</p>
    <p className="font-display text-2xl font-bold text-slate-900">{value}</p>
  </div>
);

export default function Dashboard() {
  const { products, invoices, customers, expenses } = useApp();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todaySales = invoices.filter((i) => i.type === "sale" && new Date(i.date).toDateString() === today);
    const revenue = todaySales.reduce((s, i) => s + (i.grandTotal || 0), 0);
    const totalUdhari = customers.reduce((s, c) => s + (c.totalPending || 0), 0);
    const lowStock = products.filter((p) => (p.showroomQty || 0) + (p.godownQty || 0) <= (p.lowStockThreshold || 0));
    return { revenue, totalUdhari, lowStock, todayCount: todaySales.length };
  }, [products, invoices, customers]);

  const topDebtors = [...customers].filter((c) => c.totalPending > 0).sort((a, b) => b.totalPending - a.totalPending).slice(0, 5);

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
        <Stat testid="stat-revenue" icon={IndianRupee} label="Aaj Sale" value={money(stats.revenue)} tone="emerald" />
        <Stat testid="stat-bills" icon={ReceiptText} label="Aaj Bills" value={stats.todayCount} tone="indigo" />
        <Stat testid="stat-udhari" icon={Wallet} label="Total Udhari" value={money(stats.totalUdhari)} tone="rose" />
        <Stat testid="stat-lowstock" icon={AlertTriangle} label="Low Stock" value={stats.lowStock.length} tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-600" /><h3 className="font-display font-bold text-slate-900">Low Stock Alert</h3></div>
          {stats.lowStock.length === 0 && <p className="text-sm text-slate-500">Sab stock theek hai. 👍</p>}
          <div className="space-y-2">
            {stats.lowStock.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2">
                <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                <span className="rounded-md border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700">{(p.showroomQty || 0) + (p.godownQty || 0)} {p.unit} left</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-indigo-700" /><h3 className="font-display font-bold text-slate-900">Top Udhari (Pending)</h3></div>
          {topDebtors.length === 0 && <p className="text-sm text-slate-500">Koi udhari baaki nahi.</p>}
          <div className="space-y-2">
            {topDebtors.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <div><p className="text-sm font-semibold text-slate-800">{c.name}</p>{c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}</div>
                <span className="font-bold text-rose-600">{money(c.totalPending)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 font-display font-bold text-slate-900">Recent Bills</h3>
        <div className="space-y-2">
          {invoices.slice(0, 6).map((i) => (
            <div key={i.id} className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
              <div>
                <p className="text-sm font-semibold text-slate-800">{i.invoiceNo} · {i.customerName}</p>
                <p className="text-xs text-slate-400">{fmtDate(i.date)} · {i.createdVia === "voice" ? "🎤 Voice" : "✍️ Manual"}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-slate-900">{money(i.grandTotal)}</p>
                {i.amountPending > 0 && <p className="text-xs font-semibold text-rose-600">{money(i.amountPending)} udhari</p>}
              </div>
            </div>
          ))}
          {invoices.length === 0 && <p className="text-sm text-slate-500">Abhi koi bill nahi bana.</p>}
        </div>
      </div>
    </div>
  );
}
