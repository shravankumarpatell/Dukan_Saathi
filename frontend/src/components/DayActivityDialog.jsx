"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { money, fmtTime } from "@/lib/calc";
import { KEYS } from "@/lib/keymap";
import Kbd from "@/components/Kbd";
import {
  ArrowLeftRight,
  FileText,
  ReceiptIndianRupee,
  Undo2,
  Wallet,
  IndianRupee,
} from "lucide-react";

function EventIcon({ kind, mode }) {
  if (kind === "conversion") return <ArrowLeftRight className="h-4 w-4 text-violet-600" />;
  if (kind === "return") return <Undo2 className="h-4 w-4 text-amber-700" />;
  if (kind === "expense") return <IndianRupee className="h-4 w-4 text-amber-700" />;
  if (kind === "payment") {
    if (mode === "online") return <Wallet className="h-4 w-4 text-sky-600" />;
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

function EventRow({ ev, onSelect }) {
  const openable = Boolean(onSelect && ev.pdfKind);
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
              {fmtTime(ev.date)}
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

  if (openable) {
    return (
      <li data-testid={`day-activity-${ev.kind}-${ev.id}`}>
        <button
          type="button"
          data-testid={`day-activity-open-${ev.id}`}
          onClick={() => onSelect(ev)}
          className="flex w-full gap-3 px-3 py-3 text-left transition-colors hover:bg-canvas/60 focus-visible:bg-mint-soft/50 focus-visible:outline-none"
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li data-testid={`day-activity-${ev.kind}-${ev.id}`} className="flex gap-3 px-3 py-3">
      {body}
    </li>
  );
}

export function DayActivityList({ events, onSelect, variant = "boxed", empty }) {
  if (!events?.length) {
    return (
      <p className="px-4 py-8 text-center text-sm text-ink-muted" data-testid="day-activity-empty">
        {empty || "Is din koi bill, return, vusool ya kharcha nahi."}
      </p>
    );
  }
  const listClass = variant === "plain"
    ? "divide-y divide-border"
    : "divide-y divide-border rounded-control border border-border";
  return (
    <ul className={listClass} data-testid="day-activity-list">
      {events.map((ev) => (
        <EventRow key={ev.id} ev={ev} onSelect={onSelect} />
      ))}
    </ul>
  );
}

export default function DayActivityDialog({
  open,
  title,
  events,
  onClose,
  onPdf,
  onSelect,
}) {
  const visible = useVisibleOpen(!!open);

  useHotkeyScope("modal:day-activity", { exclusive: true, enabled: visible });
  useHotkeys("modal:day-activity", [
    { keys: KEYS.cancel, label: "Close", handler: onClose },
    { keys: KEYS.preview, label: "Daily summary PDF", handler: () => onPdf?.() },
  ]);

  return (
    <Dialog open={visible} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent
        data-testid="day-activity-dialog"
        className="flex max-h-[92vh] max-w-2xl flex-col overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 pb-4 pt-5 text-left">
          <DialogTitle className="pr-8 text-xl">{title || "Aaj ki activity"}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Activity</h3>
          <DayActivityList events={events} onSelect={onSelect} />
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-4">
          {onPdf ? (
            <button
              type="button"
              data-testid="day-activity-pdf-btn"
              onClick={onPdf}
              className="inline-flex items-center gap-2 rounded-control bg-mint px-4 py-2.5 text-sm font-semibold text-white hover:bg-mint-dark"
            >
              <FileText className="h-4 w-4" /> PDF <Kbd keys={KEYS.preview} tone="dark" />
            </button>
          ) : null}
          <button
            type="button"
            data-testid="day-activity-close-btn"
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
