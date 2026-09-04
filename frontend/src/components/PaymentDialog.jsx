"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import NumberInput from "@/components/NumberInput";
import Kbd from "@/components/Kbd";
import { money, fmtDate, round2 } from "@/lib/calc";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import { generateUdhariVusoolReceiptPDF } from "@/services/billPdf";
import { ReceiptIndianRupee } from "lucide-react";
import SegmentedControl from "@/components/SegmentedControl";

/** Keep the typed string unless it exceeds this invoice's pending udhari. */
function capToPending(raw, pending) {
  const max = round2(Number(pending) || 0);
  if (raw === "" || raw === ".") return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return "";
  if (n > max) return String(Math.round(max * 100) / 100);
  return raw;
}

export default function PaymentDialog({ customer, bills, shop, onClose, onSubmit, onReconcile, onShowPdf }) {
  const open = useVisibleOpen(!!customer);
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
    const over = allocations.find((a) => {
      const bill = bills.find((b) => b.id === a.invoiceId);
      const pending = round2(Number(bill?.amountPending) || 0);
      return a.amount > pending + 0.001;
    });
    if (over) return toast.error("Amount is bill ke pending udhari se zyada nahi ho sakti");
    setBusy(true);
    try {
      const result = await onSubmit(customer.id, allocations, payMode);
      const paid = Number(result?.totalPaid ?? result) || 0;
      toast.success(`${money(paid)} udhari vusool ho gayi`);
      onClose();
      if (paid > 0.01 && onShowPdf) {
        const rows = Array.isArray(result?.allocations) && result.allocations.length
          ? result.allocations
          : allocations.map((a) => {
            const bill = bills.find((b) => b.id === a.invoiceId);
            return { invoiceId: a.invoiceId, invoiceNo: bill?.invoiceNo, amount: a.amount };
          });
        onShowPdf(
          generateUdhariVusoolReceiptPDF({
            shop,
            customer,
            amount: paid,
            mode: result?.mode || payMode,
            allocations: rows,
            remainingUdhari: result?.totalPending,
            at: result?.paidAt,
          }, "bloburl")
        );
      }
    } catch (e) {
      toast.error(e?.message || "Payment record nahi hua, dobara koshish karein");
      setBusy(false);
    }
  }, [busy, alloc, customer, bills, shop, payMode, onSubmit, onClose, onShowPdf]);

  useHotkeyScope("modal:payment", { exclusive: true, enabled: open });
  useHotkeys("modal:payment", [
    { keys: KEYS.save, label: "Record & print receipt", handler: submit, disabled: busy },
    { keys: KEYS.saveAlt, label: "Record & print receipt", handler: submit, disabled: busy, hidden: true },
    { keys: "alt+t", label: "Saare bill full bharein", handler: fillAll },
    { keys: KEYS.cancel, label: "Cancel", handler: onClose },
  ]);
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
        <DialogHeader><DialogTitle>Udhari vusool — {customer?.name || "Walk-in"}</DialogTitle></DialogHeader>
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
            <div key={b.id} data-testid={`pay-bill-${b.id}`} className="rounded-control border border-border p-3">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <ReceiptIndianRupee className="h-4 w-4 text-mint-dark" />
                  <div>
                    <p className="font-semibold text-ink">{b.invoiceNo}</p>
                    <p className="text-xs text-ink-muted">{fmtDate(b.date)} · pending {money(b.amountPending)}</p>
                  </div>
                </div>
                <button type="button" data-flow-skip data-testid={`pay-bill-fill-${b.id}`} onClick={() => setAlloc((a) => ({ ...a, [b.id]: String(Math.round((b.amountPending || 0) * 100) / 100) }))} className="text-xs font-semibold text-mint-dark">Full</button>
              </div>
              <NumberInput data-testid={`pay-bill-amt-${b.id}`} value={alloc[b.id] ?? ""} onChange={(v) => setAlloc((a) => ({ ...a, [b.id]: capToPending(v, b.amountPending) }))} placeholder={`Max ${money(b.amountPending)}`} className="mt-2 w-full rounded-control border border-border px-3 py-2 text-right text-sm tabular-nums outline-none focus:border-mint" />
            </div>
          ))}
          {bills.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">Is customer ke koi pending bill nahi.</p>}

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
        <div className="flex items-center justify-between rounded-control bg-canvas/60 px-3 py-2 text-sm font-bold"><span>Total payment</span><span data-testid="pay-alloc-total">{money(allocTotal)}</span></div>
        <button data-testid="submit-payment-btn" onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-60 hover:bg-mint-dark">
          {busy ? "…" : "Record & print receipt"} <Kbd keys={KEYS.save} tone="dark" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
