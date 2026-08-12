import React, { useState, useEffect, useMemo, useRef } from "react";
import { useApp } from "@/context/AppContext";
import InvoiceSearch from "@/components/InvoiceSearch";
import NumberInput from "@/components/NumberInput";
import { generateBillPDF } from "@/services/billPdf";
import { money, itemAmount, round2, fmtDate } from "@/lib/calc";
import { isBoxUnit, qtyFieldLabel, formatQtyLabel } from "@/lib/units";
import { toast } from "sonner";
import { Undo2, Eye, Save, Search, Pencil, AlertTriangle } from "lucide-react";

// Persist returns form state across navigation
const STORAGE_KEY = "ds_returns_draft";
function loadDraft() { try { const raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function saveDraft(state) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} }
function clearDraft() { try { sessionStorage.removeItem(STORAGE_KEY); } catch {} }

const SETTLEMENTS = [["cash", "Cash refund"], ["adjust_udhari", "Adjust udhari"], ["store_credit", "Store credit"]];

// A settlement is only offered when the customer can actually absorb it:
// udhari needs a pending balance, store credit needs a saved customer.
function settlementBlocker(mode, customer) {
  if (mode === "cash") return null;
  if (!customer) return "Walk-in bill — sirf cash";
  if (mode === "adjust_udhari" && (Number(customer.totalPending) || 0) <= 0.5) return "Koi udhari baaki nahi";
  return null;
}

function SettlementPicker({ value, onChange, customer, testPrefix = "settle" }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">Settlement</label>
      <div className="grid grid-cols-3 gap-2">
        {SETTLEMENTS.map(([v, l]) => {
          const blocked = settlementBlocker(v, customer);
          return (
            <button key={v} data-testid={`${testPrefix}-${v}`} disabled={!!blocked} title={blocked || l}
              onClick={() => onChange(v)}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                blocked ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                  : value === v ? "border-indigo-900 bg-indigo-900 text-white" : "border-slate-300 text-slate-600"}`}>
              {l}
            </button>
          );
        })}
      </div>
      {customer ? (
        <p className="mt-1 text-xs text-slate-500">
          Udhari {money(customer.totalPending || 0)} · Store credit {money(customer.storeCredit || 0)}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">Walk-in customer — udhari/store credit available nahi.</p>
      )}
    </div>
  );
}

export default function Returns() {
  const { invoices, customers, shop, commitBill, updateReturn } = useApp();
  const saved = useRef(loadDraft());
  const s = saved.current;

  const [tab, setTab] = useState("new");
  const [invNo, setInvNo] = useState(s?.invNo || "");
  const [src, setSrc] = useState(s?.src || null);
  const [rows, setRows] = useState(s?.rows || []);
  const [settlement, setSettlement] = useState(s?.settlement || "cash");
  const [refund, setRefund] = useState(s?.refund || "");
  const [saving, setSaving] = useState(false);

  // Persist form state
  useEffect(() => {
    saveDraft({ invNo, src, rows, settlement, refund });
  }, [invNo, src, rows, settlement, refund]);

  const customer = useMemo(
    () => (src?.customerId ? customers.find((c) => c.id === src.customerId) || null : null),
    [customers, src]
  );

  // Never leave an impossible settlement selected (e.g. udhari already cleared)
  useEffect(() => {
    if (settlementBlocker(settlement, customer)) setSettlement("cash");
  }, [settlement, customer]);

  const selectInvoice = (inv) => {
    setInvNo(inv.invoiceNo);
    setSrc(inv);
    setRows((inv.items || []).map((it) => ({ ...it, retQty: "", retPieces: "" })));
    setRefund(""); setSettlement("cash");
  };

  const updRow = (i, patch) => {
    setRows((prev) => {
      const next = prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
      const total = next.reduce((s, it) => s + itemAmount({ ...it, qty: it.retQty, pieces: it.retPieces }), 0);
      setRefund(total ? String(round2(total)) : "");
      return next;
    });
  };

  const returned = rows.map((it) => ({
    ...it,
    qty: Number(it.retQty) || 0,
    pieces: isBoxUnit(it) ? (Number(it.retPieces) || 0) : 0,
  })).filter((it) => it.qty > 0 || it.pieces > 0);

  const reset = () => { setInvNo(""); setSrc(null); setRows([]); setRefund(""); setSettlement("cash"); clearDraft(); };

  const buildDraft = () => ({
    kind: "return", type: "return", createdVia: "manual", language: "hi",
    items: returned, refundTotal: Number(refund) || 0, settlement,
    originalInvoiceNo: src.invoiceNo, customerId: src.customerId || null, customerName: src.customerName || "Walk-in",
    gstEnabled: false,
  });

  const preview = () => {
    if (returned.length === 0) return toast.error("Kam se kam ek item return karein");
    const inv = { ...buildDraft(), invoiceNo: "RET-PREVIEW", date: new Date().toISOString() };
    generateBillPDF({ shop, invoice: inv, customer: { name: src.customerName || "Walk-in" } }, "newtab");
  };

  const save = async () => {
    if (returned.length === 0) return toast.error("Kam se kam ek item return karein");
    if (settlementBlocker(settlement, customer)) return toast.error("Ye settlement is customer par nahi ho sakta");
    if (saving) return;
    setSaving(true);
    try {
      const { invoice, customer: cust } = await commitBill(buildDraft());
      generateBillPDF({ shop, invoice, customer: cust || { name: invoice.customerName } }, "newtab");
      toast.success(`Return ${invoice.invoiceNo} ho gaya`);
      reset();
    } catch (e) { toast.error(e.message || "Return save nahi hua"); } finally { setSaving(false); }
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="returns-page">
      <div className="flex items-center gap-2"><Undo2 className="h-5 w-5 text-indigo-900" /><h2 className="font-display text-2xl font-bold text-slate-900">Return Invoice</h2></div>

      <div className="flex rounded-xl border border-slate-300 bg-white p-1">
        {[["new", "New Return"], ["edit", "Edit Return"]].map(([v, l]) => (
          <button key={v} data-testid={`returns-tab-${v}`} onClick={() => setTab(v)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === v ? "bg-indigo-900 text-white" : "text-slate-600"}`}>{l}</button>
        ))}
      </div>

      {tab === "edit" ? (
        <EditReturns invoices={invoices} customers={customers} updateReturn={updateReturn} />
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className="mb-1 block text-sm font-semibold text-slate-700">Original invoice (search & select)</label>
            <InvoiceSearch invoices={invoices} value={invNo} onChangeText={(t) => { setInvNo(t); setSrc(null); }} onPick={selectInvoice} />
          </div>

          {src && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4" data-testid="return-detail">
              <div className="flex items-center justify-between text-sm">
                <div><p className="font-display font-bold text-slate-900">{src.customerName}</p><p className="text-xs text-slate-400">{src.invoiceNo} · {fmtDate(src.date)}</p></div>
                <p className="font-bold text-slate-700">{money(src.grandTotal)}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Select items to return</p>
                {rows.map((it, i) => {
                  const tile = isBoxUnit(it);
                  return (
                    <div key={i} data-testid={`return-row-${i}`} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{it.name}</p>
                        <span className="text-xs text-slate-400">sold {formatQtyLabel(it)}</span>
                      </div>
                      <div className={`mt-2 grid gap-2 ${tile ? "grid-cols-3" : "grid-cols-2"}`}>
                        <div>
                          <label className="text-xs text-slate-500">Return {qtyFieldLabel(it).toLowerCase()}</label>
                          <NumberInput data-testid={`return-qty-${i}`} value={it.retQty} onChange={(v) => updRow(i, { retQty: v })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums" />
                        </div>
                        {tile && (
                          <div>
                            <label className="text-xs text-slate-500">Pcs</label>
                            <NumberInput data-testid={`return-pieces-${i}`} value={it.retPieces} onChange={(v) => updRow(i, { retPieces: v })} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums" />
                          </div>
                        )}
                        <div>
                          <label className="text-xs text-slate-500">Amount</label>
                          <p className="rounded-lg bg-slate-50 px-2 py-1.5 text-right text-sm font-bold tabular-nums">{money(itemAmount({ ...it, qty: it.retQty, pieces: tile ? it.retPieces : 0 }))}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <SettlementPicker value={settlement} onChange={setSettlement} customer={customer} />

              <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-sm">
                <span className="font-semibold text-slate-700">Refund amount (editable)</span>
                <NumberInput data-testid="return-refund" value={refund} onChange={(v) => setRefund(v)} className="w-32 rounded-lg border border-indigo-300 bg-white px-2 py-1.5 text-right text-sm font-bold tabular-nums" />
              </div>

              {settlement === "adjust_udhari" && Number(refund) > (customer?.totalPending || 0) && (
                <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Udhari sirf {money(customer?.totalPending || 0)} hai — baaki {money(round2(Number(refund) - (customer?.totalPending || 0)))} store credit ban jayega.
                </p>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button data-testid="preview-return-btn" onClick={preview} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 font-bold text-indigo-800 active:scale-95"><Eye className="h-5 w-5" /> Preview</button>
                <button data-testid="submit-return-btn" onClick={save} disabled={saving} className="flex items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-60"><Save className="h-5 w-5" /> {saving ? "…" : "Confirm & Save"}</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Re-settle a past return — e.g. a customer who took store credit comes back
// weeks later wanting the cash instead. Balances are corrected server-side.
function EditReturns({ invoices, customers, updateReturn }) {
  const [q, setQ] = useState("");
  const [editId, setEditId] = useState(null);
  const [settlement, setSettlement] = useState("cash");
  const [refund, setRefund] = useState("");
  const [saving, setSaving] = useState(false);

  const returns = useMemo(() => invoices.filter((i) => i.type === "return"), [invoices]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const filtered = !t ? returns : returns.filter((i) =>
      (i.invoiceNo || "").toLowerCase().includes(t) ||
      (i.customerName || "").toLowerCase().includes(t) ||
      (i.originalInvoiceNo || "").toLowerCase().includes(t));
    return filtered.slice(0, 25);
  }, [returns, q]);

  const inv = useMemo(() => returns.find((i) => i.id === editId) || null, [returns, editId]);
  const customer = useMemo(
    () => (inv?.customerId ? customers.find((c) => c.id === inv.customerId) || null : null),
    [customers, inv]
  );

  useEffect(() => {
    if (!inv) return;
    setSettlement(inv.settlement || "cash");
    setRefund(String(inv.refundTotal ?? inv.grandTotal ?? ""));
  }, [inv]);

  const blocked = settlementBlocker(settlement, customer);
  const heldCredit = Number(inv?.settlementDetail?.storeCredit) || (inv?.settlement === "store_credit" ? Number(inv?.refundTotal) || 0 : 0);
  const changed = !!inv && (settlement !== (inv.settlement || "cash") || Number(refund) !== Number(inv.refundTotal ?? 0));

  const save = async () => {
    if (!inv || saving) return;
    if (blocked) return toast.error("Ye settlement is customer par nahi ho sakta");
    setSaving(true);
    try {
      await updateReturn(inv.id, { settlement, refundTotal: Number(refund) || 0 });
      toast.success(`${inv.invoiceNo} update ho gaya`);
    } catch (e) { toast.error(e.message || "Update nahi hua"); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4" data-testid="edit-returns">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-semibold text-slate-700">Purana return dhundhein</label>
        <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input data-testid="edit-return-search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="RET number ya customer…" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
        </div>

        <div className="mt-2 divide-y divide-slate-100">
          {list.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Koi return invoice nahi mila.</p>}
          {list.map((r) => (
            <button key={r.id} data-testid={`edit-return-option-${r.id}`} onClick={() => setEditId(r.id)}
              className={`flex w-full items-center justify-between gap-2 px-1 py-2.5 text-left ${editId === r.id ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{r.customerName || "Walk-in"}</p>
                <p className="truncate text-xs text-slate-500">{r.invoiceNo} · {fmtDate(r.date)} · {SETTLEMENTS.find(([v]) => v === r.settlement)?.[1] || r.settlement}</p>
              </div>
              <p className="shrink-0 text-sm font-bold text-slate-700">{money(r.refundTotal ?? r.grandTotal)}</p>
            </button>
          ))}
        </div>
      </div>

      {inv && (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4" data-testid="edit-return-panel">
          <div className="flex items-center gap-2"><Pencil className="h-4 w-4 text-indigo-900" /><h3 className="font-display font-bold text-slate-900">{inv.invoiceNo}</h3></div>
          <p className="-mt-2 text-xs text-slate-500">
            {inv.customerName || "Walk-in"} · {fmtDate(inv.date)}
            {inv.originalInvoiceNo ? ` · against ${inv.originalInvoiceNo}` : ""}
          </p>

          <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Abhi: <b>{SETTLEMENTS.find(([v]) => v === inv.settlement)?.[1] || inv.settlement}</b> · {money(inv.refundTotal ?? 0)}
            {heldCredit > 0 && <span className="ml-1">(store credit {money(heldCredit)})</span>}
          </div>

          <SettlementPicker value={settlement} onChange={setSettlement} customer={customer} testPrefix="edit-settle" />

          <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-700">Refund amount</span>
            <NumberInput data-testid="edit-return-refund" value={refund} onChange={setRefund}
              className="w-32 rounded-lg border border-indigo-300 bg-white px-2 py-1.5 text-right text-sm font-bold tabular-nums" />
          </div>

          {inv.settlement === "store_credit" && settlement === "cash" && (
            <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {money(heldCredit)} store credit customer ke account se hat jayega — utna cash aapko dena hoga.
            </p>
          )}

          <button data-testid="edit-return-save" onClick={save} disabled={saving || !changed}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-bold text-white active:scale-95 disabled:opacity-50">
            <Save className="h-5 w-5" /> {saving ? "…" : changed ? "Update settlement" : "Koi change nahi"}
          </button>
        </div>
      )}
    </div>
  );
}
