import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { SCOPES, NAV_ITEMS, NAV_BOTTOM, KEYS } from "@/lib/keymap";
import { searchProducts, searchCustomers } from "@/lib/fuzzy";
import { money } from "@/lib/calc";
import { formatStockLabel } from "@/lib/units";
import { piecesBreakdown } from "@/lib/calc";
import Kbd from "@/components/Kbd";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { Plus, IndianRupee, Wallet, Printer, Package, Users, Undo2, Calculator } from "lucide-react";

/**
 * The Gateway: one keystroke (Ctrl+K) to reach any screen, action, item or
 * customer. Typing filters, arrows move, Enter jumps — no mouse anywhere.
 *
 * Filtering is done here rather than by cmdk so that products and customers go
 * through the same fuzzy search the rest of the app uses.
 */

const ACTIONS = [
  { id: "new-bill", label: "Naya bill banayein", hint: "New sale or purchase invoice", icon: Plus, to: "/bill", keys: KEYS.gotoBill, keywords: "bill invoice sale sell purchase naya" },
  { id: "expense", label: "Kharcha add karein", hint: "Record an expense", icon: IndianRupee, to: "/?focus=expense", keys: KEYS.gotoExpense, keywords: "expense kharcha spend cost daily" },
  { id: "sqft", label: "Sq-ft calculator", hint: "Quick tile area → boxes calculator", icon: Calculator, to: "/?focus=sqft", keys: KEYS.sqftCalc, keywords: "sqft square feet tiles boxes area calculator" },
  { id: "udhari", label: "Udhari payment lein", hint: "Record a customer payment", icon: Wallet, to: "/customers?tab=udhari&focus=payment", keys: KEYS.gotoUdhari, keywords: "udhari payment collect credit due paisa" },
  { id: "return", label: "Return / refund karein", hint: "Take goods back against a bill", icon: Undo2, to: "/returns", keys: KEYS.gotoReturns, keywords: "return refund wapas credit note" },
  { id: "stock-in", label: "Stock intake karein", hint: "Bulk add products from a supplier sheet", icon: Package, to: "/bulk", keys: KEYS.gotoBulk, keywords: "stock intake bulk upload supplier maal" },
  { id: "summary", label: "Aaj ka summary print karein", hint: "Daily day-book PDF", icon: Printer, to: "/?print=summary", keywords: "print summary daybook daily report pdf aaj" },
  { id: "summary-yesterday", label: "Kal ka summary print karein", hint: "Yesterday's day-book PDF", icon: Printer, to: "/?print=summary&date=yesterday", keywords: "print summary yesterday kal daybook daily report pdf" },
];

const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
};

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { products, customers } = useApp();
  const [query, setQuery] = useState("");

  // Exclusive: while the Gateway is open, no page or global key fires behind it.
  useHotkeyScope(SCOPES.PALETTE, { exclusive: true, enabled: open });
  useHotkeys(SCOPES.PALETTE, [
    { keys: KEYS.palette, label: "Close palette", handler: () => onOpenChange(false), allowInInput: true },
  ]);

  useEffect(() => { if (open) setQuery(""); }, [open]);

  const screens = useMemo(
    () => [...NAV_ITEMS, ...NAV_BOTTOM].filter((n) => matches(query, n.label, n.keywords, n.to)),
    [query]
  );
  const actions = useMemo(
    () => ACTIONS.filter((a) => matches(query, a.label, a.hint, a.keywords)),
    [query]
  );
  const productHits = useMemo(
    () => (query.trim().length < 2 ? [] : searchProducts(products, query).slice(0, 6)),
    [products, query]
  );
  const customerHits = useMemo(
    () => (query.trim().length < 2 ? [] : searchCustomers(customers, query).slice(0, 6)),
    [customers, query]
  );

  const go = (to) => { onOpenChange(false); navigate(to); };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        data-testid="palette-input"
        value={query}
        onValueChange={setQuery}
        placeholder="Kahan jaana hai? Screen, item ya customer ka naam likhein…"
      />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>Kuch nahi mila.</CommandEmpty>

        {actions.length > 0 && (
          <CommandGroup heading="Kaam — Actions">
            {actions.map((a) => (
              <CommandItem key={a.id} value={a.id} onSelect={() => go(a.to)} className="gap-3">
                <a.icon className="h-4 w-4 shrink-0 text-indigo-700" />
                <span className="flex-1">
                  <span className="font-semibold">{a.label}</span>
                  <span className="ml-2 text-xs text-slate-400">{a.hint}</span>
                </span>
                {a.keys && <Kbd keys={a.keys} />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {screens.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Screens">
              {screens.map((n) => (
                <CommandItem key={n.to} value={`screen-${n.to}`} onSelect={() => go(n.to)} className="gap-3">
                  <n.icon className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="flex-1 font-semibold">{n.label}</span>
                  <Kbd keys={n.keys} />
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {productHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Items">
              {productHits.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`product-${p.id}`}
                  onSelect={() => go(`/inventory?q=${encodeURIComponent(p.name)}`)}
                  className="gap-3"
                >
                  <Package className="h-4 w-4 shrink-0 text-amber-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{p.name}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {[p.code, p.company, formatStockLabel(p, piecesBreakdown)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-indigo-700">{money(p.sellPrice)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {customerHits.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Customers">
              {customerHits.map((c) => (
                <CommandItem
                  key={c.id}
                  value={`customer-${c.id}`}
                  onSelect={() => go(`/customers?tab=customers&q=${encodeURIComponent(c.name)}`)}
                  className="gap-3"
                >
                  <Users className="h-4 w-4 shrink-0 text-slate-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-slate-400">{c.phone || "—"}</span>
                  </span>
                  {c.totalPending > 0 && (
                    <span className="shrink-0 text-xs font-bold text-rose-600">{money(c.totalPending)}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>

      <div className="flex items-center gap-3 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
        <span className="flex items-center gap-1"><Kbd keys="arrowup" /><Kbd keys="arrowdown" /> chunein</span>
        <span className="flex items-center gap-1"><Kbd keys="enter" /> kholein</span>
        <span className="flex items-center gap-1"><Kbd keys="escape" /> band</span>
        <span className="ml-auto flex items-center gap-1"><Kbd keys={KEYS.help} /> saare shortcuts</span>
      </div>
    </CommandDialog>
  );
}
