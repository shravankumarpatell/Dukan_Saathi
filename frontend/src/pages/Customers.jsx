import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { money } from "@/lib/calc";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Wallet, Phone, HardHat } from "lucide-react";

export default function Customers() {
  const { customers, addCustomer, setDraft } = useApp();
  const [form, setForm] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [payAmt, setPayAmt] = useState("");
  const [payMode, setPayMode] = useState("cash");

  const sorted = [...customers].sort((a, b) => (b.totalPending || 0) - (a.totalPending || 0));

  const saveCustomer = async () => {
    if (!form.name) return toast.error("Naam daaliye");
    await addCustomer(form);
    toast.success("Customer add ho gaya");
    setForm(null);
  };

  const recordPayment = () => {
    const amt = Number(payAmt) || 0;
    if (amt <= 0) return toast.error("Amount daaliye");
    setDraft({
      kind: "payment", language: "hi", customerId: payFor.id, amount: amt, mode: payMode,
      title: "Record Payment", subtitle: `${payFor.name} · ${payMode}`,
      summaryRows: [{ label: "Pending balance", old: money(payFor.totalPending), new: money(Math.max(0, (payFor.totalPending || 0) - amt)) }],
      amount: amt,
    });
    setPayFor(null); setPayAmt("");
  };

  return (
    <div className="space-y-4 ds-fade" data-testid="customers-page">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-bold text-slate-900">Customers &amp; Udhari</h2><p className="text-sm text-slate-500">Total pending: <b className="text-rose-600">{money(customers.reduce((s, c) => s + (c.totalPending || 0), 0))}</b></p></div>
        <button data-testid="add-customer-btn" onClick={() => setForm({ name: "", phone: "", isContractor: false, siteNote: "" })} className="flex items-center gap-2 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95"><Plus className="h-4 w-4" /> Add</button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {sorted.map((c) => (
          <div key={c.id} data-testid={`customer-card-${c.id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-display font-bold text-slate-900">{c.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                  {c.isContractor && <span className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700"><HardHat className="h-3 w-3" />Contractor</span>}
                </div>
                {c.siteNote && <p className="mt-1 text-xs text-slate-400">📍 {c.siteNote}</p>}
                {c.storeCredit > 0 && <p className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700" data-testid={`store-credit-${c.id}`}>Store credit: {money(c.storeCredit)}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Udhari</p>
                <p className={`font-display text-lg font-bold ${c.totalPending > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(c.totalPending)}</p>
              </div>
            </div>
            <button data-testid={`pay-btn-${c.id}`} onClick={() => { setPayFor(c); setPayMode("cash"); }} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 active:scale-95"><Wallet className="h-4 w-4" /> Record Payment</button>
          </div>
        ))}
      </div>

      {/* Add customer */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent data-testid="customer-form-dialog">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <input data-testid="cf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input data-testid="cf-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <label className="flex items-center gap-2 text-sm"><input data-testid="cf-contractor" type="checkbox" checked={form.isContractor} onChange={(e) => setForm({ ...form, isContractor: e.target.checked })} /> Contractor / Dealer</label>
              {form.isContractor && <input data-testid="cf-site" value={form.siteNote} onChange={(e) => setForm({ ...form, siteNote: e.target.value })} placeholder="Project / site note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />}
              <button data-testid="save-customer-btn" onClick={saveCustomer} className="w-full rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Save</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record payment */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent data-testid="payment-dialog">
          <DialogHeader><DialogTitle>Record Payment — {payFor?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500">Current udhari: <b className="text-rose-600">{money(payFor?.totalPending)}</b></p>
          <input data-testid="payment-amount" type="number" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="Amount ₹" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            {["cash", "online"].map((m) => <button key={m} data-testid={`pay-mode-${m}`} onClick={() => setPayMode(m)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${payMode === m ? "border-indigo-900 bg-indigo-900 text-white" : "border-slate-300"}`}>{m}</button>)}
          </div>
          <button data-testid="submit-payment-btn" onClick={recordPayment} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:scale-95">Preview &amp; Confirm</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
