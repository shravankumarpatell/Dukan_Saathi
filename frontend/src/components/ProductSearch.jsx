import React, { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { searchProducts } from "@/lib/fuzzy";
import { money, piecesBreakdown } from "@/lib/calc";
import { isBoxUnit, formatStockLabel, unitKindLabel, rateSuffix } from "@/lib/units";
import { Search, PlusCircle } from "lucide-react";

// Product search for manual line-item entry: by name, code, or company.
// Pass `onCreateNew` to offer creating a product that isn't in the catalog yet.
// The parent can call ref.focus() to bring the caret back for the next item.
const ProductSearch = forwardRef(function ProductSearch(
  { products, onPick, onCreateNew, placeholder = "Search product by name, code, company…", disabledIds = [] },
  ref
) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchProducts(products, q), [products, q]);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
      setOpen(true);
    },
    clear: () => setQ(""),
  }));

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

  const pick = (p) => { onPick(p); setQ(""); setOpen(false); };
  const createNew = () => { setQ(""); setOpen(false); onCreateNew(q.trim()); };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          data-testid="product-search-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") return setOpen(false);
            // Enter on a single match adds it straight away
            if (e.key === "Enter" && open) {
              e.preventDefault();
              const first = results.find((p) => !disabledIds.includes(p.id));
              if (first) pick(first);
              else if (onCreateNew && q.trim()) createNew();
            }
          }}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {onCreateNew && (
            <button
              data-testid="product-add-new"
              onClick={createNew}
              className="flex w-full items-center gap-2 border-b border-slate-100 bg-emerald-50 px-3 py-2.5 text-left font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <PlusCircle className="h-4 w-4 shrink-0" />
              <span className="text-sm">Naya item add karein{q.trim() ? `: “${q.trim()}”` : ""}</span>
            </button>
          )}
          {results.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">No products found.</div>}
          {results.map((p) => {
            const total = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
            const stockLabel = formatStockLabel(p, piecesBreakdown);
            const added = disabledIds.includes(p.id);
            return (
              <button
                key={p.id}
                data-testid={`product-option-${p.id}`}
                disabled={added}
                onClick={() => { if (added) return; pick(p); }}
                className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left transition-colors ${added ? "cursor-not-allowed opacity-40" : "hover:bg-indigo-50"}`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {p.name}
                    <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${isBoxUnit(p) ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{unitKindLabel(p)}</span>
                    {added && <span className="ml-1 text-xs font-bold text-emerald-600">✓ added</span>}
                  </p>
                  <p className="text-xs text-slate-500">{[p.code, p.company, p.size, isBoxUnit(p) ? `${p.piecesPerBox || 1} pcs/box` : null].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-indigo-700">{p.sellPrice > 0 ? `${money(p.sellPrice)}${rateSuffix(p)}` : "Rate —"}</p>
                  <p className={`text-xs ${total <= (p.lowStockThreshold || 0) ? "font-bold text-rose-600" : "text-slate-500"}`}>{stockLabel}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default ProductSearch;
