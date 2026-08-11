import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams } from "react-router-dom";
import NumberInput from "@/components/NumberInput";
import { money, fmtDate } from "@/lib/calc";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Wallet, Phone, HardHat, Users, ReceiptIndianRupee } from "lucide-react";

export default function Customers() {
  const { customers, invoices, addCustomer, allocatePayment } = useApp();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "customers" ? "customers" : "udhari");
  const [form, setForm] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [alloc, setAlloc] = useState({});
  const [payMode, setPayMode] = useState("cash");

  const totalUdhari = customers.reduce((s, c) => s + (c.totalPending || 0), 0);
  const allSorted = [...customers].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const dueSorted = [...customers].filter((c) => (c.totalPending || 0) > 0.5).sort((a, b) => (b.totalPending || 0) - (a.totalPending || 0));

  const saveCustomer = async () => {
    const name = (form.name || "").trim();
    if (!name) return toast.error("Customer ka naam daaliye");
    if (customers.some((c) => (c.name || "").trim().toLowerCase() === name.toLowerCase())) return toast.error("Ye naam pehle se hai — har customer ka naam unique hona chahiye");
    await addCustomer({ ...form, name });
    toast.success("Customer add ho gaya");
    setForm(null);
  };

  const pendingBills = (cid) => invoices.filter((i) => i.customerId === cid && i.type === "sale" && (i.amountPending || 0) > 0.5).sort((a, b) => new Date(a.date) - new Date(b.date));

  const openPay = (c) => {
    const bills = pendingBills(c.id);
    const init = {}; bills.forEach((b) => (init[b.id] = ""));
    setAlloc(init); setPayMode("cash"); setPayFor(c);
  };
  const allocTotal = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);

  const submitPayment = async () => {
    const allocations = Object.entries(alloc).map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) || 0 })).filter((a) => a.amount > 0);
    if (allocations.length === 0) return toast.error("Kam se kam ek bill par amount daaliye");
    const paid = await allocatePayment(payFor.id, allocations, payMode);
    toast.success(`${money(paid)} payment record ho gaya`);
    setPayFor(null); setAlloc({});
  };

  return (
    <div className="space-y-4 ds-fade" data-testid="customers-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-[#F5F5F7]">Udhari &amp; Customers</h2>
        <p className="text-sm text-slate-500 dark:text-[#A1A1A6]">Total pending: <b className="text-rose-600 dark:text-[#FB7185]">{money(totalUdhari)}</b></p>
      </div>

      <div className="flex rounded-xl border border-slate-300 bg-white p-1 dark:border-[#2C2C2E] dark:bg-[#2C2C2E]">
        <button data-testid="tab-udhari" onClick={() => setTab("udhari")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "udhari" ? "bg-indigo-900 text-white dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]" : "text-slate-600 dark:text-[#A1A1A6]"}`}><Wallet className="h-4 w-4" /> Udhari ({dueSorted.length})</button>
        <button data-testid="tab-customers" onClick={() => setTab("customers")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "customers" ? "bg-indigo-900 text-white dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]" : "text-slate-600 dark:text-[#A1A1A6]"}`}><Users className="h-4 w-4" /> Customers</button>
      </div>

      {tab === "udhari" && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="udhari-list">
          {dueSorted.map((c) => (
            <div key={c.id} data-testid={`udhari-card-${c.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-bold text-slate-900 dark:text-[#F5F5F7]">{c.name || "Walk-in"}</p>
                  {c.phone && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-[#A1A1A6]"><Phone className="h-3 w-3" />{c.phone}</p>}
                  <p className="mt-1 text-xs text-slate-400 dark:text-[#6E6E73]">{pendingBills(c.id).length} pending bill(s)</p>
                </div>
                <div className="text-right"><p className="text-xs text-slate-400 dark:text-[#6E6E73]">Udhari</p><p className="font-display text-lg font-bold text-rose-600 dark:text-[#FB7185]">{money(c.totalPending)}</p></div>
              </div>
              <button data-testid={`pay-btn-${c.id}`} onClick={() => openPay(c)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 active:scale-95 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#818CF8]"><Wallet className="h-4 w-4" /> Record Payment</button>
            </div>
          ))}
          {dueSorted.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-emerald-100 p-3 dark:bg-emerald-900/30 mb-3">
                <Wallet className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="font-semibold text-slate-900 dark:text-[#F5F5F7]">Zero Udhari! 🎉</h3>
              <p className="text-sm text-slate-500 dark:text-[#A1A1A6] mt-1 max-w-sm">
                All your customers have cleared their dues.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "customers" && (
        <>
          <div className="flex justify-end">
            <button data-testid="add-customer-btn" onClick={() => setForm({ name: "", phone: "", isContractor: false, siteNote: "" })} className="flex items-center gap-2 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]"><Plus className="h-4 w-4" /> Add Customer</button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {allSorted.map((c) => (
              <div key={c.id} data-testid={`customer-card-${c.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display font-bold text-slate-900 dark:text-[#F5F5F7]">{c.name || "Walk-in"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-[#A1A1A6]">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {c.isContractor && <span className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700 dark:bg-[#FBBF24]/10 dark:text-[#FBBF24]"><HardHat className="h-3 w-3" />Contractor</span>}
                    </div>
                    {c.siteNote && <p className="mt-1 text-xs text-slate-400 dark:text-[#6E6E73]">📍 {c.siteNote}</p>}
                    {c.storeCredit > 0 && <p className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-[#A78BFA]/10 dark:text-[#A78BFA]" data-testid={`store-credit-${c.id}`}>Store credit: {money(c.storeCredit)}</p>}
                  </div>
                  <div className="text-right"><p className="text-xs text-slate-400 dark:text-[#6E6E73]">Udhari</p><p className={`font-display text-lg font-bold ${c.totalPending > 0 ? "text-rose-600 dark:text-[#FB7185]" : "text-emerald-600 dark:text-[#34D399]"}`}>{money(c.totalPending)}</p></div>
                </div>
              </div>
            ))}
            {allSorted.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-slate-300 dark:text-[#3A3A3C] mb-3" />
                <h3 className="font-semibold text-slate-900 dark:text-[#F5F5F7]">No customers yet</h3>
                <p className="text-sm text-slate-500 dark:text-[#A1A1A6] mt-1 mb-4 max-w-sm">
                  Add your first customer to start tracking udhari and history.
                </p>
                <button onClick={() => setForm({ name: "", phone: "", isContractor: false, siteNote: "" })} className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white dark:bg-[#818CF8]">
                  Add Customer
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Add customer */}
      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent data-testid="customer-form-dialog">
          <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <input data-testid="cf-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name (unique)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#A1A1A6] dark:placeholder-[#6E6E73]" />
              <input data-testid="cf-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#A1A1A6] dark:placeholder-[#6E6E73]" />
              <label className="flex items-center gap-2 text-sm dark:text-[#A1A1A6]"><input data-testid="cf-contractor" type="checkbox" checked={form.isContractor} onChange={(e) => setForm({ ...form, isContractor: e.target.checked })} /> Contractor / Dealer</label>
              {form.isContractor && <input data-testid="cf-site" value={form.siteNote} onChange={(e) => setForm({ ...form, siteNote: e.target.value })} placeholder="Project / site note" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#A1A1A6] dark:placeholder-[#6E6E73]" />}
              <button data-testid="save-customer-btn" onClick={saveCustomer} className="w-full rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]">Save</button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Record payment against specific bills */}
      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent data-testid="payment-dialog" className="max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Record Payment — {payFor?.name || "Walk-in"}</DialogTitle></DialogHeader>
          <p className="text-sm text-slate-500 dark:text-[#A1A1A6]">Kis bill ke against payment aayi? Amount daaliye.</p>
          <div className="space-y-2">
            {payFor && pendingBills(payFor.id).map((b) => (
              <div key={b.id} data-testid={`pay-bill-${b.id}`} className="rounded-xl border border-slate-200 p-3 dark:border-[#2C2C2E]">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2"><ReceiptIndianRupee className="h-4 w-4 text-indigo-700 dark:text-[#F5F5F7]" /><div><p className="font-semibold text-slate-900 dark:text-[#F5F5F7]">{b.invoiceNo}</p><p className="text-xs text-slate-400 dark:text-[#6E6E73]">{fmtDate(b.date)} · pending {money(b.amountPending)}</p></div></div>
                  <button data-testid={`pay-bill-fill-${b.id}`} onClick={() => setAlloc((a) => ({ ...a, [b.id]: String(Math.round(b.amountPending)) }))} className="text-xs font-semibold text-indigo-700 dark:text-[#F5F5F7]">Full</button>
                </div>
                <NumberInput data-testid={`pay-bill-amt-${b.id}`} value={alloc[b.id] ?? ""} onChange={(v) => setAlloc((a) => ({ ...a, [b.id]: v }))} placeholder="Amount ₹" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#A1A1A6]" />
              </div>
            ))}
            {payFor && pendingBills(payFor.id).length === 0 && <p className="py-4 text-center text-sm text-slate-400 dark:text-[#6E6E73]">Is customer ke koi pending bill nahi.</p>}
          </div>
          <div className="flex gap-2">
            {["cash", "online"].map((m) => <button key={m} data-testid={`pay-mode-${m}`} onClick={() => setPayMode(m)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold capitalize ${payMode === m ? "border-indigo-900 bg-indigo-900 text-white dark:border-[#818CF8]/40 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]" : "border-slate-300 dark:border-[#2C2C2E] dark:text-[#A1A1A6]"}`}>{m}</button>)}
          </div>
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold dark:bg-[#2C2C2E] dark:text-[#A1A1A6]"><span>Total payment</span><span data-testid="pay-alloc-total">{money(allocTotal)}</span></div>
          <button data-testid="submit-payment-btn" onClick={submitPayment} className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:scale-95 dark:bg-[#34D399]">Record Payment</button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
