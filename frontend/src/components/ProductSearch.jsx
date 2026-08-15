import React, { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { searchProducts } from "@/lib/fuzzy";
import { money, piecesBreakdown } from "@/lib/calc";
import { isBoxUnit, formatStockLabel, unitKindLabel, rateSuffix, productMetaLine } from "@/lib/units";
import { useListNavigation } from "@/hooks/useListNavigation";
import { KEYS } from "@/lib/keymap";
import Kbd from "@/components/Kbd";
import { Search, PlusCircle } from "lucide-react";

/**
 * Keyboard-native product combobox: typing filters, ↑/↓ move the highlight,
 * Enter picks, Esc closes, Alt+C jumps straight to "create this item".
 *
 * The create-new row is rendered first (it's the fastest thing to reach with
 * the mouse) but the highlight starts on the first real match, so Enter always
 * does the expected thing when the item already exists.
 *
 * Parents hold a ref and call focus() to bring the caret back for the next item.
 */
const ProductSearch = forwardRef(function ProductSearch(
  { products, onPick, onCreateNew, placeholder = "Search product by name, code, company…", disabledIds = [] },
  ref
) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchProducts(products, q), [products, q]);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // One flat list so the keyboard highlight and the rendered order agree.
  const rows = useMemo(() => [
    ...(onCreateNew ? [{ kind: "create" }] : []),
    ...results.map((p) => ({ kind: "product", product: p, disabled: disabledIds.includes(p.id) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [results, onCreateNew, disabledIds.join(",")]);

  const pick = (p) => { onPick(p); setQ(""); setOpen(false); };
  const createNew = () => { const name = q.trim(); setQ(""); setOpen(false); onCreateNew?.(name); };

  const selectRow = (i) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "create") return createNew();
    if (row.disabled) return;
    pick(row.product);
  };

  const nav = useListNavigation({
    count: rows.length,
    enabled: open,
    onSelect: selectRow,
    onEscape: () => setOpen(false),
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useImperativeHandle(ref, () => ({
    focus: () => { inputRef.current?.focus(); setOpen(true); },
    clear: () => setQ(""),
  }));

  // Start the highlight on the first pickable product rather than on
  // "create new", so Enter adds an existing item without an extra keypress.
  useEffect(() => {
    const first = rows.findIndex((r) => r.kind === "product" && !r.disabled);
    setActiveIndex(first === -1 ? 0 : first);
  }, [q, rows, setActiveIndex]);

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

  const onKeyDown = (e) => {
    // Alt+C creates the typed item without hunting for the row.
    if (e.altKey && (e.key === "c" || e.key === "C") && onCreateNew) {
      e.preventDefault();
      e.stopPropagation();
      return createNew();
    }
    // Esc is owned by this combobox whenever it has focus — never bubble to
    // a page hotkey that would re-open another search.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (open) setOpen(false);
      // Keep caret on the search box — never blur on Esc.
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
      return;
    }
    nav.handleKeyDown(e);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-500">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          data-testid="product-search-input"
          role="combobox"
          aria-expanded={open}
          aria-controls="product-search-list"
          aria-activedescendant={open ? `product-row-opt-${activeIndex}` : undefined}
          autoComplete="off"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!wrapperRef.current?.contains(e.relatedTarget)) setOpen(false);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
        />
        <Kbd keys={KEYS.quickCreate} className="hidden sm:inline-flex" />
      </div>

      {open && (
        <div
          id="product-search-list"
          role="listbox"
          ref={nav.listRef}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          {rows.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">No products found.</div>}

          {rows.map((row, i) => {
            const active = i === activeIndex;
            const common = {
              id: `product-row-opt-${i}`,
              role: "option",
              "aria-selected": active,
              "data-list-index": i,
              onMouseEnter: () => hover(i),
            };

            if (row.kind === "create") {
              return (
                <button
                  key="create-new"
                  {...common}
                  type="button"
                  data-testid="product-add-new"
                  onClick={createNew}
                  className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2.5 text-left font-semibold text-emerald-800 ${active ? "bg-emerald-100" : "bg-emerald-50"}`}
                >
                  <PlusCircle className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-sm">Naya item add karein{q.trim() ? `: “${q.trim()}”` : ""}</span>
                  <Kbd keys={KEYS.quickCreate} />
                </button>
              );
            }

            const p = row.product;
            const total = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
            const stockLabel = formatStockLabel(p, piecesBreakdown);
            return (
              <button
                key={p.id}
                {...common}
                type="button"
                data-testid={`product-option-${p.id}`}
                disabled={row.disabled}
                onClick={() => selectRow(i)}
                className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left transition-colors ${
                  row.disabled ? "cursor-not-allowed opacity-40" : active ? "bg-indigo-50" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {p.name}
                    <span className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold ${isBoxUnit(p) ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}>{unitKindLabel(p)}</span>
                    {row.disabled && <span className="ml-1 text-xs font-bold text-emerald-600">✓ added</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{productMetaLine(p, { includeKind: false })}</p>
                </div>
                <div className="shrink-0 text-right">
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
