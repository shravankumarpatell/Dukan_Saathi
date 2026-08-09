import React, { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { buildInvoicePdf } from "@/lib/invoicePdf";
import { computeBillTotals, money } from "@/lib/calc";
import { Check, X, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

// PDF preview = the confirmation step for a bill (PRD C8). Shopkeeper can turn the
// screen to show the customer the real bill before anything is saved/committed.
export default function BillPreviewModal() {
  const { draft, commitDraft, cancelDraft, shop, customers } = useApp();
  const isBill = draft && (draft.kind === "sale" || draft.kind === "purchase");

  const { pdfUri, totals } = useMemo(() => {
    if (!isBill) return { pdfUri: null, totals: null };
    const t = computeBillTotals(draft);
    const customer = draft.customerId ? customers.find((c) => c.id === draft.customerId) : null;
    const uri = buildInvoicePdf({ shop, draft, totals: t, customer: customer || { name: draft.customerName, phone: draft.customerPhone, siteNote: draft.siteNote } });
    return { pdfUri: uri, totals: t };
  }, [draft, shop, customers, isBill]);

  if (!isBill) return null;

  return (
    <Dialog open={isBill} onOpenChange={(o) => { if (!o) cancelDraft(); }}>
      <DialogContent className="max-w-3xl gap-0 overflow-hidden p-0" data-testid="bill-preview-modal">
        <DialogTitle className="sr-only">Bill Preview</DialogTitle>
        <div className="flex items-center justify-between border-b bg-indigo-900 px-4 py-3 text-white">
          <div>
            <p className="text-xs uppercase tracking-widest text-indigo-200">Confirm before commit</p>
            <h3 className="font-display text-lg font-bold">Bill Preview {totals.ewayRequired ? "· E-way bill needed" : ""}</h3>
          </div>
          <div className="text-right">
            <p className="text-xs text-indigo-200">Grand Total</p>
            <p className="font-display text-xl font-bold">{money(totals.grandTotal)}</p>
          </div>
        </div>

        {totals.ewayRequired && (
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
            <AlertTriangle className="h-4 w-4" /> Invoice ≥ ₹50,000 — generate an e-way bill for transport.
          </div>
        )}

        <div className="max-h-[62vh] overflow-auto bg-stone-200 p-3 md:p-5">
          <div className="mx-auto max-w-2xl shadow-xl">
            <iframe title="bill-pdf" src={pdfUri} className="h-[70vh] w-full rounded-md bg-white" data-testid="bill-pdf-frame" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t bg-white p-4">
          <button
            data-testid="bill-edit-cancel-btn"
            onClick={cancelDraft}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 transition-transform active:scale-95"
          >
            <X className="h-4 w-4" /> Edit / Cancel
          </button>
          <button
            data-testid="bill-confirm-btn"
            onClick={commitDraft}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white shadow-md transition-transform active:scale-95 hover:bg-emerald-700"
          >
            <Check className="h-4 w-4" /> Confirm &amp; Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
