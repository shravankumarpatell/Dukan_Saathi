import React, { useState, useMemo, useRef, useEffect } from "react";
import { searchProducts } from "@/lib/fuzzy";
import { money, piecesBreakdown } from "@/lib/calc";
import { Search } from "lucide-react";

// Product search for manual line-item entry: by name, code, or company.
export default function ProductSearch({ products, onPick, placeholder = "Search product by name, code, company…", disabledIds = [] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchProducts(products, q), [products, q]);
  const wrapperRef = useRef(null);

  // Close dropdown when clicking outside
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
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:focus-within:ring-indigo-500">
        <Search className="h-4 w-4 text-slate-400 dark:text-[#6E6E73]" />
        <input
          data-testid="product-search-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-[#A1A1A6] dark:placeholder:text-[#6E6E73]"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
          {results.length === 0 && <div className="px-3 py-4 text-sm text-slate-500 dark:text-[#A1A1A6]">No products found.</div>}
          {results.map((p) => {
            const total = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
            const ppb = Number(p.piecesPerBox) || 1;
            const isBox = p.unit === "box" && ppb > 1;
            const bd = piecesBreakdown(total, ppb);
            const stockLabel = isBox ? `${bd.boxes}b${bd.loose ? `+${bd.loose}p` : ""}` : `${total}`;
            const added = disabledIds.includes(p.id);
            return (
              <button
                key={p.id}
                data-testid={`product-option-${p.id}`}
                disabled={added}
                onClick={() => { if (added) return; onPick(p); setQ(""); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left transition-colors dark:border-[#2C2C2E] ${added ? "cursor-not-allowed opacity-40" : "hover:bg-indigo-50 dark:hover:bg-[#2C2C2E]"}`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-[#F5F5F7]">{p.name}{added && <span className="ml-1 text-xs font-bold text-emerald-600 dark:text-[#34D399]">✓ added</span>}</p>
                  <p className="text-xs text-slate-500 dark:text-[#A1A1A6]">{[p.code, p.company, p.size].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-indigo-700 dark:text-[#F5F5F7]">{money(p.sellPrice)}</p>
                  <p className={`text-xs ${total <= (p.lowStockThreshold || 0) ? "font-bold text-rose-600 dark:text-[#FB7185]" : "text-slate-500 dark:text-[#A1A1A6]"}`}>{stockLabel} {p.unit}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
