"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useOwnedSearchParams } from "@/hooks/useOwnedSearchParams";
import Kbd from "@/components/Kbd";
import { money, fmtDate } from "@/lib/calc";
import { searchCustomers } from "@/lib/fuzzy";
import { CONTRACTOR_CHIP } from "@/lib/units";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useListNavigation } from "@/hooks/useListNavigation";
import { usePageFocus } from "@/hooks/usePageFocus";
import { useQuickCreate } from "@/context/QuickCreateContext";
import { SCOPES, KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import CustomerDetailDialog from "@/components/CustomerDetailDialog";
import PaymentDialog from "@/components/PaymentDialog";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { generateBillPDF, generateStoreCreditConvertReceiptPDF, generateUdhariVusoolReceiptPDF } from "@/services/billPdf";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { Plus, Wallet, Phone, HardHat, Users, Search, ChevronRight } from "lucide-react";

const ROW_TRACKS =
  "grid-cols-[minmax(0,1fr)_6.5rem] sm:grid-cols-[minmax(0,1.4fr)_7rem_6.5rem] lg:grid-cols-[minmax(0,1.6fr)_8rem_7rem_5.5rem_6.5rem] items-center gap-x-3 px-3";

export default function Customers() {
  const { customers, invoices, shop, allocatePayment, reconcileCustomer } = useApp();
  const [params, setParams] = useOwnedSearchParams();
  const quickCreate = useQuickCreate();
  const [tab, setTab] = useState(params.get("tab") === "customers" ? "customers" : "udhari");
  const [q, setQ] = useState(params.get("q") || "");
  const [role, setRole] = useState(
    ["customer", "contractor"].includes(params.get("role") || "") ? params.get("role") : "all"
  );
  const [detailFor, setDetailFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf: closePdfPreview } = usePdfPreview();
  const searchRef = useRef(null);

  const byRole = useMemo(() => {
    if (role === "contractor") return customers.filter((c) => !!c.isContractor);
    if (role === "customer") return customers.filter((c) => !c.isContractor);
    return customers;
  }, [customers, role]);

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

  const modalOpen = !!(detailFor || payFor || pdfUrl);
  const focusStart = usePageFocus(() => searchRef.current?.focus(), { enabled: !modalOpen });

  const openDetail = useCallback((c) => {
    if (!c) return;
    setDetailFor(c);
  }, []);

  const openPay = useCallback((c) => {
    if (!c) return;
    if (pendingBills(c.id).length === 0) return toast.error(`${c.name} ka koi pending bill nahi`);
    setDetailFor(null);
    setPayFor(c);
  }, [pendingBills]);

  const openPdf = useCallback((evOrInv) => {
    const inv = evOrInv?.invoice || evOrInv;
    if (!inv) return;
    const customer = customers.find((c) => c.id === inv.customerId) || detailFor;
    const party = customer || { name: inv.customerName };
    if (evOrInv?.kind === "conversion" || evOrInv?.pdfKind === "convert-receipt") {
      showPdf(
        generateStoreCreditConvertReceiptPDF({
          shop,
          customer: party,
          returnInvoice: inv,
          amount: evOrInv.amount,
          at: evOrInv.date,
          target: evOrInv.convertedTo || inv.settlementConvertedTo,
        }, "bloburl")
      );
      return;
    }
    if (evOrInv?.pdfKind === "udhari-vusool") {
      showPdf(
        generateUdhariVusoolReceiptPDF({
          shop,
          customer: party,
          amount: evOrInv.amount,
          mode: evOrInv.mode,
          allocations: evOrInv.allocations,
          remainingUdhari: evOrInv.remainingUdhari,
          at: evOrInv.date,
        }, "bloburl")
      );
      return;
    }
    showPdf(generateBillPDF({ shop, invoice: inv, customer: party }, "bloburl"));
  }, [customers, detailFor, shop, showPdf]);

  const closePdf = useCallback(() => {
    closePdfPreview();
  }, [closePdfPreview]);

  const addCustomer = useCallback(() => quickCreate("customer", q.trim()), [quickCreate, q]);

  const setRoleFilter = useCallback((next) => {
    setRole(next);
    const nextParams = { tab };
    if (q) nextParams.q = q;
    if (next && next !== "all") nextParams.role = next;
    setParams(nextParams, { replace: true });
  }, [tab, q, setParams]);

  const setTabAndParams = useCallback((next) => {
    setTab(next);
    const nextParams = { tab: next };
    if (q) nextParams.q = q;
    if (role && role !== "all") nextParams.role = role;
    setParams(nextParams, { replace: true });
  }, [q, role, setParams]);

  const nav = useListNavigation({
    count: shown.length,
    enabled: !modalOpen,
    onSelect: (i) => openDetail(shown[i]),
    onEscape: () => { setQ(""); searchRef.current?.focus(); },
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useEffect(() => { setActiveIndex(0); }, [q, tab, role, setActiveIndex]);

  useEffect(() => {
    const incomingTab = params.get("tab");
    if (incomingTab === "customers" || incomingTab === "udhari") setTab(incomingTab);
    const incomingQ = params.get("q");
    if (incomingQ) setQ(incomingQ);
    const incomingRole = params.get("role");
    if (incomingRole === "customer" || incomingRole === "contractor" || incomingRole === "all") {
      setRole(incomingRole === "all" ? "all" : incomingRole);
    }

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
    { keys: "alt+1", label: "Udhari tab", handler: () => setTabAndParams("udhari") },
    { keys: "alt+2", label: "Customers tab", handler: () => setTabAndParams("customers") },
    { keys: "alt+0", label: "Saare dikhao", handler: () => setRoleFilter("all") },
    { keys: "alt+3", label: "Sirf customers", handler: () => setRoleFilter("customer") },
    { keys: "alt+4", label: "Sirf contractors", handler: () => setRoleFilter("contractor") },
    { keys: "arrowdown", label: "Agala", handler: () => nav.move(1) },
    { keys: "arrowup", label: "Pichla", handler: () => nav.move(-1) },
    { keys: "enter", label: "Party detail kholein", handler: () => nav.selectActive() },
  ]);

  return (
    <div className="ds-fade space-y-4" data-testid="customers-page">
      <div className="ds-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <div className="flex rounded-control border border-border bg-canvas/40 p-1">
            <button
              type="button"
              data-testid="tab-udhari"
              onClick={() => setTabAndParams("udhari")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-2 text-sm font-semibold transition-colors ${
                tab === "udhari" ? "bg-surface text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Wallet className="h-4 w-4" /> Udhari
              <span className={`tabular-nums ${tab === "udhari" ? "text-white/60" : "text-slate-400"}`}>({dueSorted.length})</span>
              <Kbd keys="alt+1" tone={tab === "udhari" ? "dark" : "default"} />
            </button>
            <button
              type="button"
              data-testid="tab-customers"
              onClick={() => setTabAndParams("customers")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-control px-3 py-2 text-sm font-semibold transition-colors ${
                tab === "customers" ? "bg-surface text-white" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Users className="h-4 w-4" /> Customers
              <Kbd keys="alt+2" tone={tab === "customers" ? "dark" : "default"} />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by role" data-testid="role-filter">
            {[
              { id: "all", label: "All", count: roleCounts.all, keys: "alt+0" },
              { id: "customer", label: "Customer", count: roleCounts.customer, keys: "alt+3" },
              { id: "contractor", label: "Contractor", count: roleCounts.contractor, keys: "alt+4", icon: HardHat },
            ].map((f) => {
              const active = role === f.id;
              const Icon = f.icon;
              return (
                <button
                  key={f.id}
                  type="button"
                  data-testid={`role-filter-${f.id}`}
                  onClick={() => setRoleFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-control border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "border-surface bg-surface text-white"
                      : "border-border bg-white text-ink hover:border-surface/40"
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {f.label}
                  <span className={`tabular-nums ${active ? "text-white/55" : "text-slate-400"}`}>{f.count}</span>
                  <Kbd keys={f.keys} tone={active ? "dark" : "default"} />
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2">
              <div className="ds-combo min-w-0 flex-1 sm:w-64 sm:flex-none">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  ref={searchRef}
                  data-testid="customer-search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={nav.handleKeyDown}
                  aria-activedescendant={shown.length ? `cust-opt-${activeIndex}` : undefined}
                  placeholder="Naam ya phone…"
                  className="w-full bg-transparent text-sm outline-none"
                />
                <Kbd keys={KEYS.focusSearch} />
              </div>
              {tab === "customers" && (
                <button
                  type="button"
                  data-testid="add-customer-btn"
                  onClick={addCustomer}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control bg-mint px-3 text-sm font-semibold text-white transition-transform active:scale-95 hover:bg-mint-dark"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Add</span>
                  <Kbd keys={KEYS.quickCreate} tone="dark" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`grid w-full border-l-2 border-l-transparent border-b border-border bg-canvas/50 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-muted ${ROW_TRACKS}`}>
          <span>Party</span>
          <span className="hidden sm:block">Phone</span>
          <span className="hidden lg:block">Role</span>
          <span className="hidden text-right lg:block">{tab === "udhari" ? "Bills" : "Credit"}</span>
          <span className="text-right">Udhari</span>
        </div>

        <div
          role="listbox"
          aria-label={tab === "udhari" ? "Udhari" : "Customers"}
          ref={nav.listRef}
          data-testid={tab === "udhari" ? "udhari-list" : undefined}
          className="divide-y divide-border"
        >
          {shown.map((c, i) => {
            const active = i === activeIndex;
            const pending = Number(c.totalPending) || 0;
            const bills = tab === "udhari" ? pendingBills(c.id).length : 0;
            return (
              <button
                type="button"
                key={c.id}
                id={`cust-opt-${i}`}
                role="option"
                aria-selected={active}
                data-list-index={i}
                data-testid={tab === "udhari" ? `udhari-card-${c.id}` : `customer-card-${c.id}`}
                onMouseEnter={() => hover(i)}
                onClick={() => openDetail(c)}
                className={`grid w-full ${ROW_TRACKS} border-l-2 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? "border-l-mint bg-mint-soft ring-1 ring-inset ring-mint/30"
                    : "border-l-transparent hover:bg-canvas/60"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate font-semibold text-ink">{c.name || "Walk-in"}</p>
                    {c.isContractor && (
                      <HardHat className="h-3.5 w-3.5 shrink-0 text-ink-muted sm:hidden" aria-label="Contractor" />
                    )}
                  </div>
                  <p className="truncate text-[11px] text-ink-muted sm:hidden">
                    {c.phone || "—"}
                    {c.siteNote ? ` · ${c.siteNote}` : ""}
                  </p>
                </div>
                <span className="hidden truncate font-mono text-xs text-ink-muted sm:block">
                  {c.phone ? (
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</span>
                  ) : "—"}
                </span>
                <span className="hidden lg:block">
                  {c.isContractor ? (
                    <span className={CONTRACTOR_CHIP}>
                      <HardHat className="h-3 w-3" /> Contractor
                    </span>
                  ) : (
                    <span className="rounded bg-canvas px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">Customer</span>
                  )}
                </span>
                <span className="hidden text-right font-mono text-xs tabular-nums text-ink-muted lg:block">
                  {tab === "udhari"
                    ? `${bills}`
                    : (c.storeCredit > 0 ? money(c.storeCredit) : "—")}
                </span>
                <span className="flex items-center justify-end gap-1">
                  <span className={`font-mono text-sm font-semibold tabular-nums ${pending > 0.5 ? "text-rose-600" : "text-emerald-600"}`}>
                    {money(pending)}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-muted/50" />
                </span>
                {tab === "udhari" && (
                  <span className="sr-only">
                    <span data-testid={`pay-btn-${c.id}`}>Record Payment</span>
                  </span>
                )}
                {tab === "customers" && c.storeCredit > 0 && (
                  <span className="sr-only" data-testid={`store-credit-${c.id}`}>{money(c.storeCredit)}</span>
                )}
              </button>
            );
          })}

          {shown.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              {tab === "udhari" ? (
                <>
                  <div className="mb-3 rounded-full bg-emerald-100 p-3">
                    <Wallet className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h3 className="font-semibold text-ink">{q || role !== "all" ? "Koi match nahi" : "Zero udhari"}</h3>
                  <p className="mt-1 max-w-sm text-sm text-ink-muted">
                    {q || role !== "all"
                      ? "Is filter mein koi pending udhari nahi hai."
                      : "Saari parties clear hain."}
                  </p>
                </>
              ) : (
                <>
                  <Users className="mb-3 h-10 w-10 text-ink-muted/40" />
                  <h3 className="font-semibold text-ink">
                    {q || role !== "all" ? "Koi match nahi" : "Abhi koi party nahi"}
                  </h3>
                  <p className="mt-1 mb-4 max-w-sm text-sm text-ink-muted">
                    {q || role !== "all"
                      ? "Is filter mein koi party nahi mili."
                      : "Pehli party add karein — udhari aur history yahin dikhegi."}
                  </p>
                  {role === "all" && !q && (
                    <button
                      type="button"
                      onClick={addCustomer}
                      className="rounded-control bg-mint px-4 py-2 text-sm font-semibold text-white hover:bg-mint-dark"
                    >
                      Add Customer
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <CustomerDetailDialog
        customer={detailFor}
        invoices={invoices}
        onClose={() => { setDetailFor(null); focusStart(); }}
        onRecordPayment={() => openPay(detailFor)}
        onOpenPdf={openPdf}
      />

      <PaymentDialog
        customer={payFor}
        bills={payFor ? pendingBills(payFor.id) : []}
        shop={shop}
        onClose={() => { setPayFor(null); focusStart(); }}
        onSubmit={allocatePayment}
        onReconcile={reconcileCustomer}
        onShowPdf={showPdf}
      />

      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={closePdf} />
    </div>
  );
}
