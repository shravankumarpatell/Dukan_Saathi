import React, { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { money, sqftCalc } from "@/lib/calc";
import { generateDailySummaryPDF } from "@/services/billPdf";
import NumberInput from "@/components/NumberInput";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, IndianRupee, Wallet, ReceiptText, Printer, Plus, BarChart3, ChevronRight, Calculator } from "lucide-react";

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
    const lowStock = products.filter((p) => ((p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0)) <= (p.lowStockThreshold || 0));
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
    const sales = todaySales.map((i) => ({ invoiceNo: i.invoiceNo, customerName: i.customerName, grandTotal: i.grandTotal }));
    generateDailySummaryPDF({ shop, dateISO: new Date().toISOString(), stats: s, sales, expenses: todayExp }, "newtab");
  };

  return (
    <div className="space-y-6 ds-fade" data-testid="dashboard-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Namaste</h2>
        <p className="text-sm text-slate-500">Aaj ka hisaab ek nazar me.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat testid="stat-revenue" icon={IndianRupee} label="Aaj Sale" value={money(stats.revenue)} tone="emerald" onClick={printSummary} />
        <Stat testid="stat-bills" icon={ReceiptText} label="Aaj Bills" value={stats.todayCount} tone="indigo" onClick={() => navigate("/history")} />
        <Stat testid="stat-udhari" icon={Wallet} label="Total Udhari" value={money(stats.totalUdhari)} tone="rose" onClick={() => navigate("/customers?tab=udhari")} />
        <Stat testid="stat-lowstock" icon={AlertTriangle} label="Low Stock" value={stats.lowStock.length} tone="amber" onClick={() => navigate("/inventory?low=1")} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Add expense */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><IndianRupee className="h-4 w-4 text-orange-600" /><h3 className="font-display font-bold text-slate-900">Add Expense</h3></div>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput data-testid="dash-exp-amount" value={exp.amount} onChange={(v) => setExp({ ...exp, amount: v })} placeholder="Amount ₹" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
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
          <button data-testid="dash-print-summary-btn" onClick={printSummary} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95"><Printer className="h-4 w-4" /> Print Daily Summary (PDF)</button>
        </div>
      </div>

      <SqftCard />

      {/* Reports & Analytics — at the very bottom */}
      <button data-testid="dash-reports-btn" onClick={() => navigate("/analytics")} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left transition-transform active:scale-95 hover:border-indigo-300 hover:shadow-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-indigo-100 p-2 text-indigo-700"><BarChart3 className="h-5 w-5" /></div>
          <div><p className="font-display font-bold text-slate-900">Reports &amp; Analytics</p><p className="text-xs text-slate-500">Top sellers, revenue chart, slow movers, top customers</p></div>
        </div>
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </button>
    </div>
  );
}

function SqftCard() {
  const [mode, setMode] = useState("lw");
  const [d, setD] = useState({ roomArea: "", roomLengthFt: "", roomWidthFt: "", tileLenInch: "", tileWidInch: "", piecesPerBox: "", wastagePct: "" });
  const input = mode === "area" ? { roomArea: d.roomArea } : { roomLengthFt: d.roomLengthFt, roomWidthFt: d.roomWidthFt };
  const res = sqftCalc({ ...input, tileLenInch: d.tileLenInch, tileWidInch: d.tileWidInch, piecesPerBox: d.piecesPerBox, wastagePct: d.wastagePct, ratePerBox: 0 });
  const F = (k, l) => <div key={k}><label className="text-xs font-semibold text-slate-600">{l}</label><NumberInput data-testid={`dash-sqft-${k}`} value={d[k]} onChange={(v) => setD({ ...d, [k]: v })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:ring-2 focus:ring-indigo-500" /></div>;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="dash-sqft-card">
      <div className="mb-3 flex items-center gap-2"><Calculator className="h-4 w-4 text-orange-600" /><h3 className="font-display font-bold text-slate-900">Quick Sq-ft Calculator</h3></div>
      <div className="mb-3 flex rounded-xl border border-slate-300 bg-white p-1 text-sm">
        <button data-testid="dash-sqft-mode-lw" onClick={() => setMode("lw")} className={`flex-1 rounded-lg px-3 py-1.5 font-semibold ${mode === "lw" ? "bg-indigo-900 text-white" : "text-slate-600"}`}>Length × Width</button>
        <button data-testid="dash-sqft-mode-area" onClick={() => setMode("area")} className={`flex-1 rounded-lg px-3 py-1.5 font-semibold ${mode === "area" ? "bg-indigo-900 text-white" : "text-slate-600"}`}>Direct sq-ft</button>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {mode === "area" ? F("roomArea", "Area (sq-ft)") : (<>{F("roomLengthFt", "Length (ft)")}{F("roomWidthFt", "Width (ft)")}</>)}
        {F("tileLenInch", "Tile L (inch)")}
        {F("tileWidInch", "Tile W (inch)")}
        {F("piecesPerBox", "Pcs / box")}
        {F("wastagePct", "Wastage %")}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-indigo-50 p-3 text-center text-sm">
        <div><p className="text-xs text-slate-500">Area</p><b data-testid="dash-sqft-area">{res.roomArea}</b></div>
        <div><p className="text-xs text-slate-500">Tiles</p><b data-testid="dash-sqft-tiles">{res.tilesNeeded}</b></div>
        <div><p className="text-xs text-slate-500">Boxes + Pcs</p><b data-testid="dash-sqft-boxes">{res.boxesNeeded} + {res.loosePieces}</b></div>
      </div>
    </div>
  );
}
