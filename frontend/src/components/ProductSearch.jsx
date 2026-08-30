import React, { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { searchProducts } from "@/lib/fuzzy";
import { money, piecesBreakdown } from "@/lib/calc";
import { productSalesQtyMap } from "@/lib/shopInsights";
import { formatStockLabel, unitKindLabel, unitKindChipClass, rateSuffix, productMetaLine, stockAvailPieces } from "@/lib/units";
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
  { products, invoices = [], onPick, onCreateNew, placeholder = "Search product by name, code, company…", disabledIds = [] },
  ref
) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const salesQty = useMemo(() => productSalesQtyMap(invoices), [invoices]);
  const results = useMemo(() => searchProducts(products, q, salesQty), [products, q, salesQty]);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const isOutOfStock = useCallback((p) => stockAvailPieces(p) <= 0, []);

  // One flat list so the keyboard highlight and the rendered order agree.
  const rows = useMemo(() => [
    ...(onCreateNew ? [{ kind: "create" }] : []),
    ...results.map((p) => ({
      kind: "product",
      product: p,
      disabled: disabledIds.includes(p.id) || isOutOfStock(p),
      outOfStock: isOutOfStock(p),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [results, onCreateNew, disabledIds.join(","), isOutOfStock]);

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

  const movePickable = useCallback((delta) => {
    if (!rows.length) return;
    const start = activeIndex;
    for (let step = 0; step < rows.length; step += 1) {
      const next = (start + delta * (step + 1) + rows.length * 10) % rows.length;
      const row = rows[next];
      if (row?.kind === "create" || (row?.kind === "product" && !row.disabled)) {
        setActiveIndex(next);
        return;
      }
    }
  }, [rows, activeIndex, setActiveIndex]);

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
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      movePickable(e.key === "ArrowDown" ? 1 : -1);
      return;
    }
    nav.handleKeyDown(e);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="ds-combo">
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
          className="ds-bare-input w-full text-sm placeholder:text-slate-400"
        />
        <Kbd keys={KEYS.quickCreate} className="hidden sm:inline-flex" />
      </div>

      {open && (
        <div
          id="product-search-list"
          role="listbox"
          ref={nav.listRef}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-panel shadow-lg"
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
            const added = disabledIds.includes(p.id);
            return (
              <button
                key={p.id}
                {...common}
                type="button"
                data-testid={`product-option-${p.id}`}
                disabled={row.disabled}
                onClick={() => selectRow(i)}
                className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left transition-colors ${
                  row.disabled ? "cursor-not-allowed opacity-40" : active ? "bg-mint-soft" : ""
                } ${row.outOfStock ? "bg-slate-50/80" : ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {p.name}
                    <span className={`ml-1.5 ${unitKindChipClass(p)}`}>{unitKindLabel(p)}</span>
                    {added && <span className="ml-1 text-xs font-bold text-emerald-600">✓ added</span>}
                    {row.outOfStock && !added && <span className="ml-1 text-xs font-bold text-rose-600">Stock khatam</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{productMetaLine(p, { includeKind: false })}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-bold tabular-nums ${total <= (p.lowStockThreshold || 0) ? "text-rose-600" : "text-slate-900"}`}>
                    {stockLabel}
                  </p>
                  <p className="text-xs text-mint-dark">
                    {p.sellPrice > 0 ? `${money(p.sellPrice)}${rateSuffix(p)}` : "Rate —"}
                  </p>
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
