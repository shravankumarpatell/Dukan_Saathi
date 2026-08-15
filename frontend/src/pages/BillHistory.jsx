import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { money, fmtDate } from "@/lib/calc";
import { generateBillPDF } from "@/services/billPdf";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import Kbd from "@/components/Kbd";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useListNavigation } from "@/hooks/useListNavigation";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { Search, X, ChevronRight } from "lucide-react";

export default function BillHistory() {
  const { invoices, shop, customers } = useApp();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [date, setDate] = useState(todayStr);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf: closePdfPreview } = usePdfPreview();
  const searchRef = useRef(null);

  const list = useMemo(() => invoices.filter((i) => {
    if (filter !== "all" && i.paymentStatus !== filter) return false;
    if (date) {
      const d = new Date(i.date);
      const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (local !== date) return false;
    }
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return i.invoiceNo.toLowerCase().includes(s) || (i.customerName || "").toLowerCase().includes(s);
  }), [invoices, q, filter, date]);

  const focusStart = usePageFocus(() => searchRef.current?.focus(), { enabled: !pdfUrl });

  const openPdf = useCallback((i) => {
    if (!i) return;
    const customer = customers.find((c) => c.id === i.customerId);
    showPdf(generateBillPDF({ shop, invoice: i, customer: customer || { name: i.customerName } }, "bloburl"));
  }, [customers, shop, showPdf]);

  const closePdf = useCallback(() => {
    closePdfPreview();
    focusStart();
  }, [closePdfPreview, focusStart]);

  const nav = useListNavigation({
    count: list.length,
    enabled: !pdfUrl,
    onSelect: (i) => openPdf(list[i]),
    onEscape: () => { setQ(""); searchRef.current?.focus(); },
  });
  const { activeIndex, setActiveIndex, hover } = nav;
  useEffect(() => { setActiveIndex(0); }, [q, filter, date, setActiveIndex]);

  useHotkeyScope(SCOPES.HISTORY);
  useHotkeys(SCOPES.HISTORY, [
    { keys: KEYS.focusSearch, label: "Search par jaayein", handler: () => focusStart(0) },
    { keys: KEYS.preview, label: "Highlighted bill ka PDF", handler: () => openPdf(list[activeIndex]) },
    { keys: "alt+0", label: "Date filter hataayein (saare bills)", handler: () => setDate("") },
    { keys: "arrowdown", label: "Agala bill", handler: () => nav.move(1) },
    { keys: "arrowup", label: "Pichla bill", handler: () => nav.move(-1) },
    { keys: "enter", label: "Bill PDF kholein", handler: () => nav.selectActive() },
  ]);

  return (
    <div className="space-y-3 ds-fade" data-testid="history-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Bill History</h2>
        <p className="text-sm text-slate-500">{date ? "Showing selected date · tap ✕ on date for all bills" : "Showing all bills"}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={searchRef}
            data-testid="history-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={nav.handleKeyDown}
            aria-activedescendant={`hist-opt-${activeIndex}`}
            placeholder="Invoice no / customer…"
            className="w-full bg-transparent outline-none"
          />
          <Kbd keys={KEYS.focusSearch} />
        </div>
        <input data-testid="history-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2" />
        {date && <button data-testid="history-date-clear" onClick={() => setDate("")} title="Show all bills (alt+0)" className="flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-600"><X className="h-4 w-4" /></button>}
        <select data-testid="history-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2"><option value="all">All</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="pending">Pending</option></select>
      </div>

      {/* Flat, full-page list — scroll-mt clears the sticky top bar when arrow keys scroll a row into view */}
      <div className="divide-y divide-slate-100" role="listbox" ref={nav.listRef} data-testid="history-list">
        {list.map((i, idx) => {
          const active = idx === activeIndex;
          return (
            <button
              key={i.id}
              id={`hist-opt-${idx}`}
              role="option"
              aria-selected={active}
              data-list-index={idx}
              data-testid={`history-row-${i.id}`}
              onMouseEnter={() => hover(idx)}
              onClick={() => openPdf(i)}
              className={`flex w-full scroll-mt-16 scroll-mb-24 items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors lg:scroll-mt-20 lg:scroll-mb-8 ${active ? "bg-indigo-50 ring-1 ring-inset ring-indigo-200" : "active:bg-slate-50"}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{i.customerName || "Walk-in"}</p>
                <p className="truncate text-xs text-slate-400">{i.invoiceNo} · {fmtDate(i.date)}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-bold tabular-nums text-slate-900">{money(i.grandTotal)}</p>
                <span className={`text-[11px] font-bold ${
                  i.type === "return" || i.paymentStatus === "return"
                    ? "text-violet-600"
                    : i.paymentStatus === "paid"
                      ? "text-emerald-600"
                      : i.paymentStatus === "partial"
                        ? "text-amber-600"
                        : "text-rose-600"
                }`}>{i.type === "return" ? "return" : i.paymentStatus}</span>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          );
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Koi bill nahi mila.</p>}
      </div>

      {list.length > 0 && (
        <p className="text-center text-[11px] text-slate-400">
          <Kbd keys="arrowup" /> <Kbd keys="arrowdown" /> chunein · <Kbd keys="enter" /> PDF kholein
        </p>
      )}

      <PdfViewerDialog
        url={pdfUrl}
        filename={pdfFilename}
        onClose={closePdf}
        title="Invoice PDF"
        testId="history-pdf-frame"
      />
    </div>
  );
}
