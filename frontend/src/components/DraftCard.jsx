import React from "react";
import { useApp } from "@/context/AppContext";
import { money } from "@/lib/calc";
import { Check, X } from "lucide-react";

// Generic old->new draft confirmation card (for stock/payment/return/transfer/expense).
export default function DraftCard() {
  const { draft, commitDraft, cancelDraft } = useApp();
  if (!draft || draft.kind === "sale" || draft.kind === "purchase") return null;

  const rows = draft.summaryRows || [];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 md:p-5 pointer-events-none lg:left-64">
      <div
        data-testid="draft-card"
        className="ds-slideup pointer-events-auto w-full max-w-md rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 shadow-2xl dark:border-[#FBBF24]/30 dark:bg-[#1C1C1E]/95 dark:backdrop-blur-xl"
      >
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-md bg-amber-500 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-white dark:bg-[#FBBF24]">Draft</span>
          <h3 className="font-display text-lg font-bold text-slate-900 dark:text-[#F5F5F7]">{draft.title}</h3>
        </div>
        {draft.subtitle && <p className="mb-3 text-sm text-slate-600 dark:text-[#FBBF24]">{draft.subtitle}</p>}

        <div className="mb-4 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-sm dark:bg-[#111113]/40">
              <span className="text-slate-600 dark:text-[#FBBF24]">{r.label}</span>
              <span className="flex items-center gap-2 font-semibold">
                {r.old !== undefined && r.old !== null && (
                  <span className="text-slate-400 line-through dark:text-[#F5F5F7]0/50">{r.old}</span>
                )}
                <span className="text-emerald-700 dark:text-[#34D399]">{r.new}</span>
              </span>
            </div>
          ))}
          {draft.amount !== undefined && (
            <div className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-base font-bold text-slate-900 dark:bg-[#111113]/60 dark:text-[#F5F5F7]">
              <span>Amount</span><span>{money(draft.amount)}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            data-testid="draft-cancel-btn"
            onClick={cancelDraft}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition-transform active:scale-95 dark:border-[#FBBF24]/30 dark:bg-[#FBBF24]/15 dark:text-[#FBBF24]"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            data-testid="draft-confirm-btn"
            onClick={commitDraft}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-md transition-transform active:scale-95 hover:bg-emerald-700 dark:bg-[#34D399] dark:hover:bg-[#34D399]"
          >
            <Check className="h-4 w-4" /> Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
