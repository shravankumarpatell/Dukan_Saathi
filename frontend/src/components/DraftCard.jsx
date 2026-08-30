import React, { useEffect } from "react";
import { useApp } from "@/context/AppContext";
import { money } from "@/lib/calc";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { SCOPES, KEYS } from "@/lib/keymap";
import Kbd from "@/components/Kbd";
import { Check, X } from "lucide-react";

// Generic old->new draft confirmation card (for stock/payment/return/transfer/expense).
export default function DraftCard() {
  const { draft, commitDraft, cancelDraft } = useApp();
  const active = !!draft && draft.kind !== "sale";

  // Exclusive so page form-flow / F9 cannot steal Esc or Ctrl+Enter while a
  // draft is waiting for Confirm.
  useHotkeyScope(SCOPES.DRAFT, { exclusive: true, enabled: active });
  useHotkeys(SCOPES.DRAFT, [
    { keys: KEYS.confirmDraft, label: "Confirm this draft", handler: commitDraft, allowInInput: true },
    { keys: KEYS.cancel, label: "Cancel this draft", handler: cancelDraft },
  ]);

  useEffect(() => {
    if (!active) return undefined;
    // Park focus on Confirm so the caret isn't left in the page form behind.
    const t = setTimeout(() => {
      document.querySelector('[data-testid="draft-confirm-btn"]')?.focus();
    }, 40);
    return () => clearTimeout(t);
  }, [active, draft?.kind, draft?.amount, draft?.title]);

  if (!active) return null;

  const rows = draft.summaryRows || [];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 md:p-5 pointer-events-none lg:left-64">
      <div
        data-testid="draft-card"
        className="ds-slideup pointer-events-auto w-full max-w-md rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-white">Draft</span>
          <h3 className="font-display text-lg font-bold text-slate-900">{draft.title}</h3>
        </div>
        {draft.subtitle && <p className="mb-3 text-sm text-slate-600">{draft.subtitle}</p>}

        <div className="mb-4 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-sm">
              <span className="text-slate-600">{r.label}</span>
              <span className="flex items-center gap-2 font-semibold">
                {r.old !== undefined && r.old !== null && (
                  <span className="text-slate-400 line-through">{r.old}</span>
                )}
                <span className="text-emerald-700">{r.new}</span>
              </span>
            </div>
          ))}
          {draft.amount !== undefined && (
            <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-base font-bold text-slate-900">
              <span>Amount</span><span>{money(draft.amount)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            data-testid="draft-cancel-btn"
            onClick={cancelDraft}
            className="flex items-center justify-center gap-2 rounded-control border border-border bg-white px-4 py-3 font-semibold text-ink-muted transition-transform active:scale-95"
          >
            <X className="h-4 w-4" /> Cancel <Kbd keys={KEYS.cancel} />
          </button>
          <button
            data-testid="draft-confirm-btn"
            onClick={commitDraft}
            className="flex items-center justify-center gap-2 rounded-control bg-emerald-600 px-4 py-3 font-semibold text-white shadow-md transition-transform active:scale-95 hover:bg-emerald-700"
          >
            <Check className="h-4 w-4" /> Confirm <Kbd keys={KEYS.confirmDraft} tone="dark" />
          </button>
        </div>
      </div>
    </div>
  );
}
