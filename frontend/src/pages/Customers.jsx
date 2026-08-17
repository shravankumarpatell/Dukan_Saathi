import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams } from "react-router-dom";
import NumberInput from "@/components/NumberInput";
import Kbd from "@/components/Kbd";
import { money, fmtDate, round2 } from "@/lib/calc";
import { searchCustomers } from "@/lib/fuzzy";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { useListNavigation } from "@/hooks/useListNavigation";
import { usePageFocus } from "@/hooks/usePageFocus";
import { useQuickCreate } from "@/context/QuickCreateContext";
import { SCOPES, KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Wallet, Phone, HardHat, Users, ReceiptIndianRupee, Search } from "lucide-react";
import SegmentedControl from "@/components/SegmentedControl";

export default function Customers() {
  const { customers, invoices, allocatePayment, reconcileCustomer } = useApp();
  const [params, setParams] = useSearchParams();
  const quickCreate = useQuickCreate();
  const [tab, setTab] = useState(params.get("tab") === "customers" ? "customers" : "udhari");
  const [q, setQ] = useState(params.get("q") || "");
  // all | customer | contractor — mirrors GET /customers?role=
  const [role, setRole] = useState(
    ["customer", "contractor"].includes(params.get("role") || "") ? params.get("role") : "all"
  );
  const [payFor, setPayFor] = useState(null);
  const searchRef = useRef(null);

  const byRole = useMemo(() => {
    if (role === "contractor") return customers.filter((c) => !!c.isContractor);
    if (role === "customer") return customers.filter((c) => !c.isContractor);
    return customers;
  }, [customers, role]);

  const totalUdhari = byRole.reduce((s, c) => s + (c.totalPending || 0), 0);

  const filtered = useMemo(
    () => (q.trim() ? searchCustomers(byRole, q) : byRole),
    [byRole, q]
  );
  const allSorted = useMemo(
    () => [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [filtered]
  );
  const dueSorted = useMemo(
    () => filtered.filter((c) => (c.totalPending || 0) > 0.5).sort((a, b) => (b.totalPending || 0) - (a.totalPending || 0)),
    [filtered]
  );
  const shown = tab === "udhari" ? dueSorted : allSorted;

  const roleCounts = useMemo(() => ({
    all: customers.length,
    customer: customers.filter((c) => !c.isContractor).length,
    contractor: customers.filter((c) => !!c.isContractor).length,
  }), [customers]);

  const pendingBills = useCallback(
    (cid) => invoices
      .filter((i) => i.customerId === cid && i.type === "sale" && (i.amountPending || 0) > 0.5)
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [invoices]
  );

  const focusStart = usePageFocus(() => searchRef.current?.focus(), { enabled: !payFor });

  const openPay = useCallback((c) => {
    if (!c) return;
    if (pendingBills(c.id).length === 0) return toast.error(`${c.name} ka koi pending bill nahi`);
    setPayFor(c);
  }, [pendingBills]);

  const addCustomer = useCallback(() => quickCreate("customer", q.trim()), [quickCreate, q]);

  const setRoleFilter = useCallback((next) => {
    setRole(next);
    const nextParams = { tab };
    if (q) nextParams.q = q;
    if (next && next !== "all") nextParams.role = next;
    setParams(nextParams, { replace: true });
  }, [tab, q, setParams]);

  /* ── Keyboard ── */
  const nav = useListNavigation({
    count: shown.length,
    enabled: !payFor,
    onSelect: (i) => { if (tab === "udhari") openPay(shown[i]); },
    onEscape: () => { setQ(""); searchRef.current?.focus(); },
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useEffect(() => { setActiveIndex(0); }, [q, tab, role, setActiveIndex]);

  // Intents arriving from the palette or a global shortcut. These have to be an
  // effect rather than initial state because the palette can jump to a customer
  // while this screen is already mounted.
  useEffect(() => {
    const incomingTab = params.get("tab");
    if (incomingTab === "customers" || incomingTab === "udhari") setTab(incomingTab);
    const incomingQ = params.get("q");
    if (incomingQ) setQ(incomingQ);
    const incomingRole = params.get("role");
    if (incomingRole === "customer" || incomingRole === "contractor" || incomingRole === "all") {
      setRole(incomingRole === "all" ? "all" : incomingRole);
    }

    // F8 lands here as ?focus=payment — park the caret on the search box so the
    // shopkeeper can arrow to whoever just paid and press Enter.
    if (params.get("focus") === "payment") {
      setTab("udhari");
      searchRef.current?.focus();
      setParams({ tab: "udhari" }, { replace: true });
    }
  }, [params, setParams]);

  useHotkeyScope(SCOPES.CUSTOMERS);
  useHotkeys(SCOPES.CUSTOMERS, [
    { keys: KEYS.focusSearch, label: "Search par jaayein", handler: () => focusStart(0) },
    { keys: KEYS.quickCreate, label: "Naya customer banayein", handler: addCustomer },
    { keys: "alt+1", label: "Udhari tab", handler: () => setTab("udhari") },
    { keys: "alt+2", label: "Customers tab", handler: () => setTab("customers") },
    { keys: "alt+0", label: "Saare dikhao", handler: () => setRoleFilter("all") },
    { keys: "alt+3", label: "Sirf customers", handler: () => setRoleFilter("customer") },
    { keys: "alt+4", label: "Sirf contractors", handler: () => setRoleFilter("contractor") },
    { keys: "arrowdown", label: "Agala", handler: () => nav.move(1) },
    { keys: "arrowup", label: "Pichla", handler: () => nav.move(-1) },
    { keys: "enter", label: "Select / payment", handler: () => nav.selectActive() },
  ]);

  return (
    <div className="space-y-4 ds-fade" data-testid="customers-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Udhari &amp; Customers</h2>
        <p className="text-sm text-slate-500">Total pending: <b className="text-rose-600">{money(totalUdhari)}</b></p>
      </div>

      <div className="flex rounded-xl border border-slate-300 bg-white p-1">
        <button data-testid="tab-udhari" onClick={() => setTab("udhari")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "udhari" ? "bg-indigo-900 text-white" : "text-slate-600"}`}>
          <Wallet className="h-4 w-4" /> Udhari ({dueSorted.length}) <Kbd keys="alt+1" tone={tab === "udhari" ? "dark" : "default"} />
        </button>
        <button data-testid="tab-customers" onClick={() => setTab("customers")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${tab === "customers" ? "bg-indigo-900 text-white" : "text-slate-600"}`}>
          <Users className="h-4 w-4" /> Customers <Kbd keys="alt+2" tone={tab === "customers" ? "dark" : "default"} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by role" data-testid="role-filter">
        {[
          { id: "all", label: "All", count: roleCounts.all, keys: "alt+0" },
          { id: "customer", label: "Customers", count: roleCounts.customer, keys: "alt+3" },
          { id: "contractor", label: "Contractors", count: roleCounts.contractor, keys: "alt+4", icon: HardHat },
        ].map((f) => {
          const active = role === f.id;
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              type="button"
              data-testid={`role-filter-${f.id}`}
              onClick={() => setRoleFilter(f.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "border-indigo-900 bg-indigo-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
              }`}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {f.label}
              <span className={`tabular-nums ${active ? "text-indigo-200" : "text-slate-400"}`}>({f.count})</span>
              <Kbd keys={f.keys} tone={active ? "dark" : "default"} />
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={searchRef}
          data-testid="customer-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={nav.handleKeyDown}
          aria-activedescendant={`cust-opt-${activeIndex}`}
          placeholder="Naam ya phone se dhoondein…"
          className="w-full bg-transparent outline-none"
        />
        <Kbd keys={KEYS.focusSearch} />
      </div>

      {tab === "udhari" && (
        <div className="grid gap-3 md:grid-cols-2" role="listbox" ref={nav.listRef} data-testid="udhari-list">
          {dueSorted.map((c, i) => {
            const active = i === activeIndex;
            return (
              <div
                key={c.id}
                id={`cust-opt-${i}`}
                role="option"
                aria-selected={active}
                data-list-index={i}
                data-testid={`udhari-card-${c.id}`}
                onMouseEnter={() => hover(i)}
                className={`rounded-2xl border bg-white p-4 transition-colors ${active ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200"}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-display font-bold text-slate-900">{c.name || "Walk-in"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                      {c.isContractor && <span className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700"><HardHat className="h-3 w-3" />Contractor</span>}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">{pendingBills(c.id).length} pending bill(s)</p>
                  </div>
                  <div className="text-right"><p className="text-xs text-slate-400">Udhari</p><p className="font-display text-lg font-bold text-rose-600">{money(c.totalPending)}</p></div>
                </div>
                <button data-testid={`pay-btn-${c.id}`} onClick={() => openPay(c)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-800 active:scale-95">
                  <Wallet className="h-4 w-4" /> Record Payment {active && <Kbd keys="enter" />}
                </button>
              </div>
            );
          })}
          {dueSorted.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-emerald-100 p-3 mb-3">
                <Wallet className="h-8 w-8 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-slate-900">{q || role !== "all" ? "Koi match nahi" : "Zero Udhari! 🎉"}</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-sm">
                {q || role !== "all"
                  ? "Is filter mein koi pending udhari nahi hai."
                  : "All your customers have cleared their dues."}
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "customers" && (
        <>
          <div className="flex justify-end">
            <button data-testid="add-customer-btn" onClick={addCustomer} className="flex items-center gap-2 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95">
              <Plus className="h-4 w-4" /> Add Customer <Kbd keys={KEYS.quickCreate} tone="dark" />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2" role="listbox" ref={nav.listRef}>
            {allSorted.map((c, i) => {
              const active = i === activeIndex;
              return (
                <div
                  key={c.id}
                  id={`cust-opt-${i}`}
                  role="option"
                  aria-selected={active}
                  data-list-index={i}
                  data-testid={`customer-card-${c.id}`}
                  onMouseEnter={() => hover(i)}
                  className={`rounded-2xl border bg-white p-4 transition-colors ${active ? "border-indigo-400 ring-1 ring-indigo-200" : "border-slate-200"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-display font-bold text-slate-900">{c.name || "Walk-in"}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {c.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>}
                        {c.isContractor
                          ? <span className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700"><HardHat className="h-3 w-3" />Contractor / Dealer</span>
                          : <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">Customer</span>}
                      </div>
                      {c.siteNote && <p className="mt-1 text-xs text-slate-400">📍 {c.siteNote}</p>}
                      {c.storeCredit > 0 && <p className="mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700" data-testid={`store-credit-${c.id}`}>Store credit: {money(c.storeCredit)}</p>}
                    </div>
                    <div className="text-right"><p className="text-xs text-slate-400">Udhari</p><p className={`font-display text-lg font-bold ${c.totalPending > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(c.totalPending)}</p></div>
                  </div>
                </div>
              );
            })}
            {allSorted.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-slate-300 mb-3" />
                <h3 className="font-semibold text-slate-900">
                  {q || role !== "all" ? "Koi match nahi" : "No customers yet"}
                </h3>
                <p className="text-sm text-slate-500 mt-1 mb-4 max-w-sm">
                  {q || role !== "all"
                    ? "Is filter mein koi party nahi mili."
                    : "Add your first customer to start tracking udhari and history."}
                </p>
                {role === "all" && !q && (
                  <button onClick={addCustomer} className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white">
                    Add Customer
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {shown.length > 0 && (
        <p className="hidden text-center text-[11px] text-slate-400 lg:block">
          <Kbd keys="arrowup" /> <Kbd keys="arrowdown" /> chunein{tab === "udhari" && <> · <Kbd keys="enter" /> payment lein</>}
        </p>
      )}

      <PaymentDialog
        customer={payFor}
        bills={payFor ? pendingBills(payFor.id) : []}
        onClose={() => { setPayFor(null); focusStart(); }}
        onSubmit={allocatePayment}
        onReconcile={reconcileCustomer}
      />
    </div>
  );
}

/* ── Record payment against specific bills ────────────────────────────────── */
function PaymentDialog({ customer, bills, onClose, onSubmit, onReconcile }) {
  const open = !!customer;
  const [alloc, setAlloc] = useState({});
  const [payMode, setPayMode] = useState("cash");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!customer) return;
    const init = {};
    bills.forEach((b) => (init[b.id] = ""));
    setAlloc(init);
    setPayMode("cash");
    setBusy(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);

  const billsPendingSum = useMemo(
    () => round2(bills.reduce((s, b) => s + (Number(b.amountPending) || 0), 0)),
    [bills]
  );
  const cardPending = round2(Number(customer?.totalPending) || 0);
  const ledgerDrift = Math.abs(billsPendingSum - cardPending) > 0.5;

  const allocTotal = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);

  const fillAll = useCallback(() => {
    const next = {};
    // Cap "Full" to card totalPending when ledgers drift (FIFO by bill order).
    let left = cardPending > 0.5 ? cardPending : billsPendingSum;
    bills.forEach((b) => {
      const take = Math.min(Number(b.amountPending) || 0, left);
      next[b.id] = take > 0 ? String(Math.round(take * 100) / 100) : "";
      left = Math.max(0, round2(left - take));
    });
    setAlloc(next);
  }, [bills, cardPending, billsPendingSum]);

  const runReconcile = useCallback(async () => {
    if (!customer || busy) return;
    setBusy(true);
    try {
      const r = await onReconcile(customer.id);
      toast.success(`Udhari reconcile: pending ab ${money(r.totalPending)}`);
      onClose();
    } catch (e) {
      toast.error(e?.message || "Reconcile nahi hua");
      setBusy(false);
    }
  }, [customer, busy, onReconcile, onClose]);

  const submit = useCallback(async () => {
    if (busy) return;
    const allocations = Object.entries(alloc)
      .map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) || 0 }))
      .filter((a) => a.amount > 0);
    if (allocations.length === 0) return toast.error("Kam se kam ek bill par amount daaliye");
    setBusy(true);
    try {
      const paid = await onSubmit(customer.id, allocations, payMode);
      toast.success(`${money(paid)} payment record ho gaya`);
      onClose();
    } catch (e) {
      toast.error(e?.message || "Payment record nahi hua, dobara koshish karein");
      setBusy(false);
    }
  }, [busy, alloc, customer, payMode, onSubmit, onClose]);

  useHotkeyScope("modal:payment", { exclusive: true, enabled: open });
  useHotkeys("modal:payment", [
    { keys: KEYS.save, label: "Record payment", handler: submit, disabled: busy },
    { keys: KEYS.saveAlt, label: "Record payment", handler: submit, disabled: busy, hidden: true },
    { keys: "alt+t", label: "Saare bill full bharein", handler: fillAll },
    { keys: KEYS.cancel, label: "Cancel", handler: onClose },
  ]);
  // F9 records; Enter only advances through bill amounts → mode.
  const flow = useFormFlow({ onCancel: onClose });

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => flow.focusFirst(), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="payment-dialog" className="max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>Record Payment — {customer?.name || "Walk-in"}</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-500">
          Kis bill ke against payment aayi? Enter se agla bill, <Kbd keys="alt+t" /> se sab full. Save sirf <Kbd keys={KEYS.save} />.
        </p>
        {ledgerDrift && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="pay-ledger-drift">
            <p className="font-semibold">Udhari mismatch: card {money(cardPending)} · bills {money(billsPendingSum)}</p>
            <p className="mt-1">Returns ke baad invoices sync nahi hue. Pehle reconcile karein.</p>
            <button
              type="button"
              data-testid="pay-reconcile-btn"
              disabled={busy || !onReconcile}
              onClick={runReconcile}
              className="mt-2 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-bold text-white active:scale-95 disabled:opacity-50"
            >
              Reconcile udhari
            </button>
          </div>
        )}
        <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="space-y-3">
          {bills.map((b) => (
            <div key={b.id} data-testid={`pay-bill-${b.id}`} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <ReceiptIndianRupee className="h-4 w-4 text-indigo-700" />
                  <div>
                    <p className="font-semibold text-slate-900">{b.invoiceNo}</p>
                    <p className="text-xs text-slate-400">{fmtDate(b.date)} · pending {money(b.amountPending)}</p>
                  </div>
                </div>
                <button type="button" data-flow-skip data-testid={`pay-bill-fill-${b.id}`} onClick={() => setAlloc((a) => ({ ...a, [b.id]: String(Math.round((b.amountPending || 0) * 100) / 100) }))} className="text-xs font-semibold text-indigo-700">Full</button>
              </div>
              <NumberInput data-testid={`pay-bill-amt-${b.id}`} value={alloc[b.id] ?? ""} onChange={(v) => setAlloc((a) => ({ ...a, [b.id]: v }))} placeholder="Amount ₹" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums" />
            </div>
          ))}
          {bills.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Is customer ke koi pending bill nahi.</p>}

          <SegmentedControl
            label="Payment mode"
            value={payMode}
            onChange={setPayMode}
            testPrefix="pay-mode"
            className="grid grid-cols-2 gap-2"
            options={[
              { value: "cash", label: "Cash" },
              { value: "online", label: "Online" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold"><span>Total payment</span><span data-testid="pay-alloc-total">{money(allocTotal)}</span></div>
        <button data-testid="submit-payment-btn" onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-60">
          {busy ? "…" : "Record Payment"} <Kbd keys={KEYS.save} tone="dark" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
