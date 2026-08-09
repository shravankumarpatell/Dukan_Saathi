import React, { useState, useMemo } from "react";
import { searchCustomers } from "@/lib/fuzzy";
import { money } from "@/lib/calc";
import { Search, UserPlus } from "lucide-react";

// Autocomplete for customer/supplier names — mirrors the product-search UX (PRD D1).
// Shows matching existing customers (with udhari / store-credit); "Add new" creates one.
export default function CustomerSearch({ customers, value, onChangeText, onPick, placeholder, inputTestId = "customer-name" }) {
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchCustomers(customers, value), [customers, value]);
  const typed = (value || "").trim();
  const exact = results.find((c) => c.name.toLowerCase() === typed.toLowerCase());

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          data-testid={inputTestId}
          value={value}
          onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder || "Search existing or type a new name…"}
          className="w-full bg-transparent outline-none placeholder:text-slate-400"
        />
      </div>
      {open && typed && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {results.map((c) => (
            <button key={c.id} type="button" data-testid={`customer-option-${c.id}`}
              onMouseDown={() => { onPick(c); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left hover:bg-indigo-50">
              <div>
                <p className="text-sm font-semibold text-slate-900">{c.name}</p>
                <p className="text-xs text-slate-500">{[c.phone, c.isContractor ? "Contractor" : null].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <div className="text-right text-xs">
                {c.totalPending > 0 && <p className="font-bold text-rose-600">Udhari {money(c.totalPending)}</p>}
                {c.storeCredit > 0 && <p className="font-bold text-violet-600">Credit {money(c.storeCredit)}</p>}
              </div>
            </button>
          ))}
          {!exact && (
            <button type="button" data-testid="customer-add-new"
              onMouseDown={() => { onPick(null); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
              <UserPlus className="h-4 w-4" /> Add new: “{typed}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
