import React, { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { money, fmtDate } from "@/lib/calc";
import { isSaleFullyReturned } from "@/lib/units";
import { useListNavigation } from "@/hooks/useListNavigation";
import { Search, ReceiptText } from "lucide-react";

/**
 * Keyboard-native picker for an existing SALE invoice (the return flow).
 * Fully-returned sales are hidden. ↑/↓ move, Enter picks, Esc closes.
 *
 * Dropdown opens while typing / ArrowDown / explicit focus(). A filled value
 * does not auto-open on focus, so Enter can advance in the page form chain
 * (same idea as CustomerSearch after a pick).
 */
const InvoiceSearch = forwardRef(function InvoiceSearch(
  { invoices, value, onChangeText, onPick, placeholder = "Type invoice no or customer…" },
  ref
) {
  const [open, setOpen] = useState(false);
  const typed = (value || "").trim().toLowerCase();
  const results = useMemo(() => {
    const sales = invoices.filter((i) => i.type === "sale" && !isSaleFullyReturned(i, invoices));
    const list = !typed
      ? sales
      : sales.filter((i) =>
          (i.invoiceNo || "").toLowerCase().includes(typed) ||
          (i.customerName || "").toLowerCase().includes(typed));
    return list.slice(0, 20);
  }, [invoices, typed]);

  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const nav = useListNavigation({
    count: results.length,
    enabled: open,
    onSelect: (i) => { const inv = results[i]; if (inv) { onPick(inv); setOpen(false); } },
    onEscape: () => setOpen(false),
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useImperativeHandle(ref, () => ({
    focus: () => { inputRef.current?.focus(); setOpen(true); },
  }));

  useEffect(() => { setActiveIndex(0); }, [value, setActiveIndex]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          data-testid="return-invoice-no"
          role="combobox"
          aria-expanded={open}
          aria-controls="invoice-search-list"
          aria-activedescendant={open ? `invoice-opt-${activeIndex}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
          onFocus={() => {
            // Empty field: browse. Filled (picked) field: stay closed so Enter
            // can move to the next form field; ArrowDown / typing reopens.
            if (!(value || "").trim()) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              if (open) setOpen(false);
              // Keep caret on the input — never blur on Esc.
              return;
            }
            if (!open) {
              if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
              return;
            }
            nav.handleKeyDown(e);
          }}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none placeholder:text-slate-400"
        />
      </div>

      {open && (
        <div
          id="invoice-search-list"
          role="listbox"
          ref={nav.listRef}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {results.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">Koi sale invoice nahi mila.</div>}
          {results.map((i, idx) => {
            const active = idx === activeIndex;
            return (
              <button
                key={i.id}
                id={`invoice-opt-${idx}`}
                role="option"
                aria-selected={active}
                data-list-index={idx}
                type="button"
                data-testid={`invoice-option-${i.id}`}
                onMouseEnter={() => hover(idx)}
                onMouseDown={(e) => { e.preventDefault(); onPick(i); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left ${active ? "bg-indigo-50" : ""}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <ReceiptText className="h-4 w-4 shrink-0 text-indigo-600" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{i.customerName || "Walk-in"}</p>
                    <p className="truncate text-xs text-slate-500">{i.invoiceNo} · {fmtDate(i.date)}</p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-bold text-slate-700">{money(i.grandTotal)}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default InvoiceSearch;
