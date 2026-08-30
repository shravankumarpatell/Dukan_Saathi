"use client";

import React, { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { buildCustomerActivity, buildCustomerSummary } from "@/lib/customerLedger";
import { money, fmtDate } from "@/lib/calc";
import { CONTRACTOR_CHIP } from "@/lib/units";
import Kbd from "@/components/Kbd";
import { KEYS } from "@/lib/keymap";
import {
  HardHat,
  Phone,
  MapPin,
  ReceiptIndianRupee,
  Undo2,
  Wallet,
  CreditCard,
  ArrowLeftRight,
} from "lucide-react";

function EventIcon({ kind, mode }) {
  if (kind === "conversion") return <ArrowLeftRight className="h-4 w-4 text-violet-600" />;
  if (kind === "return") return <Undo2 className="h-4 w-4 text-amber-700" />;
  if (kind === "payment") {
    if (mode === "return_adjust") return <Undo2 className="h-4 w-4 text-amber-700" />;
    if (mode === "credit") return <CreditCard className="h-4 w-4 text-violet-600" />;
    return <Wallet className="h-4 w-4 text-emerald-600" />;
  }
  return <ReceiptIndianRupee className="h-4 w-4 text-mint-dark" />;
}

function amountTone(sign, amountKind) {
  if (sign === "+" || amountKind === "cash-in") return "text-emerald-600";
  if (sign === "−" || sign === "-" || amountKind === "cash-out") return "text-amber-700";
  if (amountKind === "udhari") return "text-rose-600";
  return "text-ink";
}

export default function CustomerDetailDialog({
  customer,
  invoices,
  onClose,
  onRecordPayment,
  onOpenPdf,
  suppressed = false,
}) {
  const open = useVisibleOpen(!!customer && !suppressed);

  const summary = useMemo(
    () => (customer ? buildCustomerSummary(customer, invoices) : null),
    [customer, invoices]
  );
  const activity = useMemo(
    () => (customer ? buildCustomerActivity(customer, invoices) : []),
    [customer, invoices]
  );

  const canPay = (summary?.pendingTotal || 0) > 0.5;

  useHotkeyScope("modal:customer-detail", { exclusive: true, enabled: open });
  useHotkeys("modal:customer-detail", [
    { keys: KEYS.cancel, label: "Close", handler: onClose },
    {
      keys: "alt+p",
      label: "Record payment",
      handler: () => canPay && onRecordPayment?.(),
      disabled: !canPay,
    },
  ]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !suppressed) onClose(); }}>
      <DialogContent
        data-testid="customer-detail-dialog"
        className="flex max-h-[92vh] max-w-2xl flex-col overflow-hidden p-0"
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-4 pt-5 text-left">
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                <span className="truncate">{customer?.name || "Walk-in"}</span>
                {customer?.isContractor ? (
                  <span className={`${CONTRACTOR_CHIP} text-xs`}>
                    <HardHat className="h-3.5 w-3.5" /> Contractor
                  </span>
                ) : (
                  <span className="rounded bg-canvas px-2 py-0.5 text-xs font-bold text-ink-muted">Customer</span>
                )}
              </DialogTitle>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
                {customer?.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> {customer.phone}
                  </span>
                ) : null}
                {customer?.siteNote ? (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{customer.siteNote}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {summary && (
            <div
              className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
              data-testid="customer-detail-summary"
            >
              {[
                { label: "Udhari", value: money(summary.pendingTotal), tone: summary.pendingTotal > 0.5 ? "text-rose-600" : "text-emerald-600" },
                { label: "Store credit", value: money(summary.storeCredit), tone: "text-ink" },
                { label: "Bills", value: String(summary.billCount), tone: "text-ink" },
                { label: "Returns", value: String(summary.returnCount), tone: "text-ink" },
              ].map((s) => (
                <div key={s.label} className="rounded-control border border-border bg-canvas/40 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{s.label}</p>
                  <p className={`font-mono text-sm font-bold tabular-nums ${s.tone}`}>{s.value}</p>
                </div>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Activity</h3>
          {activity.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">Abhi koi bill ya return nahi.</p>
          ) : (
            <ul className="divide-y divide-border rounded-control border border-border" data-testid="customer-activity-list">
              {activity.map((ev) => {
                const openable = Boolean(ev.invoice && onOpenPdf);
                const body = (
                  <>
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-canvas">
                      <EventIcon kind={ev.kind} mode={ev.mode} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1 text-left">
                          <p className="truncate font-semibold text-ink">
                            {ev.title}
                            {ev.invoiceNo ? (
                              <span className="ml-1.5 font-mono text-xs font-normal text-ink-muted">{ev.invoiceNo}</span>
                            ) : null}
                          </p>
                          <p className="mt-0.5 text-xs leading-snug text-ink-muted [overflow-wrap:anywhere]">
                            {fmtDate(ev.date)}
                            {ev.detail ? ` · ${ev.detail}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-0.5 pl-2">
                          <span className={`whitespace-nowrap font-mono text-sm font-bold tabular-nums ${amountTone(ev.sign, ev.amountKind)}`}>
                            {ev.sign || ""}{money(ev.amount)}
                          </span>
                          {ev.udhari > 0.5 ? (
                            <span className="whitespace-nowrap font-mono text-xs font-semibold tabular-nums text-rose-600">
                              {money(ev.udhari)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </>
                );
                return (
                  <li
                    key={ev.id}
                    data-testid={`activity-${ev.kind}-${ev.invoiceId || ev.id}`}
                  >
                    {openable ? (
                      <button
                        type="button"
                        data-testid={`activity-pdf-${ev.id}`}
                        onClick={() => onOpenPdf(ev)}
                        className="flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-canvas/60 focus-visible:bg-mint-soft/50 focus-visible:outline-none"
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="flex gap-3 px-3 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
          {canPay && onRecordPayment ? (
            <button
              type="button"
              data-testid="detail-record-payment-btn"
              onClick={onRecordPayment}
              className="inline-flex items-center gap-2 rounded-control bg-mint px-4 py-2.5 text-sm font-semibold text-white hover:bg-mint-dark"
            >
              Record Payment <Kbd keys="alt+p" tone="dark" />
            </button>
          ) : null}
          <button
            type="button"
            data-testid="detail-close-btn"
            onClick={onClose}
            className="rounded-control border border-border px-4 py-2.5 text-sm font-semibold text-ink hover:bg-canvas/60"
          >
            Close <Kbd keys={KEYS.cancel} />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
