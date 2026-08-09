import React, { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { money, fmtDate } from "@/lib/calc";
import { generateDailySummaryPDF } from "@/services/billPdf";
import { toast } from "sonner";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Printer, Plus, TrendingDown } from "lucide-react";

const RANGES = { this_month: "This Month", last_month: "Last Month", this_year: "This Year" };

export default function Analytics() {
  const { invoices, products, customers, expenses, shop, setDraft } = useApp();
  const [range, setRange] = useState("this_month");
  const [exp, setExp] = useState({ amount: "", note: "", mode: "cash" });

  const inRange = useMemo(() => {
    const now = new Date();
    return invoices.filter((i) => {
      const d = new Date(i.date);
      if (range === "this_month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (range === "last_month") { const m = (now.getMonth() + 11) % 12; return d.getMonth() === m; }
      return d.getFullYear() === now.getFullYear();
    }).filter((i) => i.type === "sale");
  }, [invoices, range]);

  const topProducts = useMemo(() => {
    const map = {};
    inRange.forEach((iv) => iv.items.forEach((it) => {
      map[it.name] = map[it.name] || { name: it.name, qty: 0, revenue: 0 };
      map[it.name].qty += Number(it.qty) || 0;
      map[it.name].revenue += (Number(it.qty) || 0) * (Number(it.rate) || 0);
    }));
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [inRange]);

  const revenueSeries = useMemo(() => {
    const map = {};
    inRange.forEach((iv) => { const k = new Date(iv.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); map[k] = (map[k] || 0) + (iv.grandTotal || 0); });
    return Object.entries(map).map(([date, revenue]) => ({ date, revenue }));
  }, [inRange]);

  const slowMovers = useMemo(() => {
    const sold = new Set();
    inRange.forEach((iv) => iv.items.forEach((it) => sold.add(it.productId)));
    return products.filter((p) => !sold.has(p.id)).slice(0, 6);
  }, [inRange, products]);

  const topCustomers = useMemo(() => {
    const map = {};
    inRange.forEach((iv) => { map[iv.customerName] = (map[iv.customerName] || 0) + (iv.grandTotal || 0); });
    return Object.entries(map).map(([name, spend]) => ({ name, spend })).sort((a, b) => b.spend - a.spend).slice(0, 5);
  }, [inRange]);

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
    const stats = { salesRevenue: todaySales.reduce((s, i) => s + (i.grandTotal || 0), 0), cashCollected: cash, onlineCollected: online, udhariAdded, udhariCollected: 0, expensesTotal, netCash: cash - expensesTotal };
    generateDailySummaryPDF({ shop, dateISO: new Date().toISOString(), stats, expenses: todayExp }, "newtab");
  };

  return (
    <div className="space-y-5 ds-fade" data-testid="analytics-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-slate-900">Reports</h2>
        <div className="flex items-center gap-2">
          <select data-testid="range-select" value={range} onChange={(e) => setRange(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">{Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-display font-bold text-slate-900">Revenue over time</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueSeries}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="date" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v) => money(v)} /><Line type="monotone" dataKey="revenue" stroke="#312E81" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 font-display font-bold text-slate-900">Top products (revenue)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topProducts}><CartesianGrid strokeDasharray="3 3" stroke="#eee" /><XAxis dataKey="name" fontSize={9} interval={0} angle={-12} textAnchor="end" height={50} /><YAxis fontSize={11} /><Tooltip formatter={(v) => money(v)} /><Bar dataKey="revenue" fill="#EA580C" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 font-display font-bold text-slate-900">Top customers</h3>
          {topCustomers.map((c) => <div key={c.name} className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0"><span className="text-slate-700">{c.name}</span><b>{money(c.spend)}</b></div>)}
          {topCustomers.length === 0 && <p className="text-sm text-slate-400">No data.</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-1 font-display font-bold text-slate-900"><TrendingDown className="h-4 w-4 text-rose-500" /> Slow movers</h3>
          {slowMovers.map((p) => <div key={p.id} className="flex justify-between border-b border-slate-100 py-1.5 text-sm last:border-0"><span className="text-slate-700">{p.name}</span><span className="text-slate-400">{(p.showroomQty || 0) + (p.godownQty || 0)} left</span></div>)}
          {slowMovers.length === 0 && <p className="text-sm text-slate-400">Sab bik raha hai! 🎉</p>}
        </div>
      </div>
    </div>
  );
}
