import React, { useState, useMemo } from "react";
import { searchProducts } from "@/lib/fuzzy";
import { money } from "@/lib/calc";
import { Search } from "lucide-react";

// Product search for manual line-item entry (PRD C9): by name, code, or company.
export default function ProductSearch({ products, onPick, placeholder = "Search product by name, code, company…", disabledIds = [] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchProducts(products, q), [products, q]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          data-testid="product-search-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {results.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">No products found.</div>}
          {results.map((p) => {
            const total = (p.showroomQty || 0) + (p.godownQty || 0);
            const added = disabledIds.includes(p.id);
            return (
              <button
                key={p.id}
                data-testid={`product-option-${p.id}`}
                disabled={added}
                onClick={() => { if (added) return; onPick(p); setQ(""); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left transition-colors ${added ? "cursor-not-allowed opacity-40" : "hover:bg-indigo-50"}`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{p.name}{added && <span className="ml-1 text-xs font-bold text-emerald-600">✓ added</span>}</p>
                  <p className="text-xs text-slate-500">{[p.code, p.company, p.size].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-indigo-700">{money(p.sellPrice)}</p>
                  <p className={`text-xs ${total <= (p.lowStockThreshold || 0) ? "font-bold text-rose-600" : "text-slate-500"}`}>{total} {p.unit}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
