import React, { useState, useMemo, useRef, useEffect } from "react";
import { money, fmtDate } from "@/lib/calc";
import { Search, ReceiptText } from "lucide-react";

// Autocomplete for picking an existing SALE invoice (return flow).
export default function InvoiceSearch({ invoices, value, onChangeText, onPick, placeholder = "Type invoice no or customer…" }) {
  const [open, setOpen] = useState(false);
  const typed = (value || "").trim().toLowerCase();
  const results = useMemo(() => {
    const sales = invoices.filter((i) => i.type === "sale");
    const list = !typed ? sales : sales.filter((i) => (i.invoiceNo || "").toLowerCase().includes(typed) || (i.customerName || "").toLowerCase().includes(typed));
    return list.slice(0, 20);
  }, [invoices, typed]);
  const wrapperRef = useRef(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
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
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:focus-within:ring-indigo-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#6E6E73]" />
        <input
          data-testid="return-invoice-no"
          value={value}
          onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none placeholder:text-slate-400 dark:text-[#A1A1A6] dark:placeholder:text-[#6E6E73]"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
          {results.length === 0 && <div className="px-3 py-4 text-sm text-slate-500 dark:text-[#A1A1A6]">Koi sale invoice nahi mila.</div>}
          {results.map((i) => (
            <button key={i.id} type="button" data-testid={`invoice-option-${i.id}`}
              onMouseDown={() => { onPick(i); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left hover:bg-indigo-50 dark:border-[#2C2C2E] dark:hover:bg-[#2C2C2E]">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 shrink-0 text-indigo-600 dark:text-[#F5F5F7]" />
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-[#F5F5F7]">{i.customerName || "Walk-in"}</p>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1A6]">{i.invoiceNo} · {fmtDate(i.date)}</p>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-[#A1A1A6]">{money(i.grandTotal)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
