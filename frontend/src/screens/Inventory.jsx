"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useNavigate } from "@/hooks/useNavigate";
import { useOwnedSearchParams } from "@/hooks/useOwnedSearchParams";
import NumberInput from "@/components/NumberInput";
import { AllowedUnitChips, CategorySelect, DerivedSqftHint, PackQtyField, PriceUnitSelect } from "@/components/CatalogFields";
import TileSizeSelect from "@/components/TileSizeSelect";
import Kbd from "@/components/Kbd";
import { money, piecesBreakdown } from "@/lib/calc";
import {
  isBoxUnit, formatStockLabel, normalizeProductUnitFields,
  applyCatalogUnitChange, applyCatalogCategoryChange, unitKindLabel, unitKindChipClass, piecesPerBoxOf,
  catalogShowsSize, catalogShowsPpb, rateSuffix, stockUnitWord, isSlabProduct,
} from "@/lib/units";
import { formatTileSize } from "@/lib/tileSizes";
import { searchProducts } from "@/lib/fuzzy";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { useListNavigation } from "@/hooks/useListNavigation";
import { usePageFocus } from "@/hooks/usePageFocus";
import { useQuickCreate } from "@/context/QuickCreateContext";
import { SCOPES, KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { errorMessage } from "@/services/apiError";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import { CATEGORIES, normalizeCategory } from "@/lib/uom";
import { Search, Upload, X, Package, Filter, ArrowUpDown } from "lucide-react";
import MeasureToAdd from "@/components/MeasureToAdd";

const NUMERIC = ["piecesPerBox", "sellPrice", "stockQty", "lowStockThreshold", "packQty"];

const SORT_OPTIONS = [
  ["smart", "Smart (default)"],
  ["name", "Name (A–Z)"],
  ["type", "Type (category)"],
  ["stockDesc", "Stock (zyada → kam)"],
  ["stockAsc", "Stock (kam → zyada)"],
  ["priceDesc", "Rate (zyada → kam)"],
  ["priceAsc", "Rate (kam → zyada)"],
];

const totalStockOf = (p) => (Number(p.showroomQty) || 0) + (Number(p.godownQty) || 0) + (Number(p.stockQty) || 0);

function applyStockSort(list, key) {
  if (key === "smart") return list;
  const arr = [...list];
  switch (key) {
    case "name":
      return arr.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" }));
    case "type":
      return arr.sort((a, b) => (
        unitKindLabel(a).localeCompare(unitKindLabel(b), "en", { sensitivity: "base" })
        || String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" })
      ));
    case "stockDesc": return arr.sort((a, b) => totalStockOf(b) - totalStockOf(a));
    case "stockAsc": return arr.sort((a, b) => totalStockOf(a) - totalStockOf(b));
    case "priceDesc": return arr.sort((a, b) => (Number(b.sellPrice) || 0) - (Number(a.sellPrice) || 0));
    case "priceAsc": return arr.sort((a, b) => (Number(a.sellPrice) || 0) - (Number(b.sellPrice) || 0));
    default: return arr;
  }
}

/** Phone: flex so Type/Size/Stock pack tight (no dead gap). Desktop: full grid. */
const STOCK_TRACKS =
  "flex items-center gap-x-2 px-3 lg:grid lg:grid-cols-[minmax(0,1.5fr)_5.75rem_6.5rem_5.5rem_4.25rem_5.75rem_5.5rem] lg:gap-x-3";

export default function Inventory() {
  const { products, updateProduct } = useApp();
  const [params, setParams] = useOwnedSearchParams();
  const navigate = useNavigate();
  const quickCreate = useQuickCreate();
  const [q, setQ] = useState(params.get("q") || "");
  const [form, setForm] = useState(null);
  const [cats, setCats] = useState(() => new Set());
  const [sortKey, setSortKey] = useState("smart");
  const searchRef = useRef(null);

  // Categories actually present in this shop's catalog — drives the Filter menu.
  const presentCats = useMemo(() => {
    const seen = new Map();
    for (const p of (products || [])) {
      const code = normalizeCategory(p.category, p.unit);
      if (!seen.has(code)) seen.set(code, CATEGORIES[code]?.short || CATEGORIES[code]?.label || code);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products]);

  const toggleCat = useCallback((code) => {
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }, []);

  const lowOnly = params.get("low") === "1";
  // No cap on the Stock page — show every product the shop has, not just top 30.
  let list = searchProducts(products, q, {}, Infinity);
  if (cats.size) list = list.filter((p) => cats.has(normalizeCategory(p.category, p.unit)));
  if (lowOnly) list = list.filter((p) => {
    const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
    return totalStock <= (p.lowStockThreshold || 0);
  });
  list = applyStockSort(list, sortKey);

  // Remember which row opened the dialog so closing it lands back on that row
  // (keeping the scroll position) instead of snapping to the search box up top.
  const lastEditIdRef = useRef(null);
  const returnToRowRef = useRef(false);

  const openEdit = useCallback((p) => {
    lastEditIdRef.current = p.id;
    const merged = { ...p };
    if (merged.showroomQty !== undefined || merged.godownQty !== undefined) {
      merged.stockQty = (Number(merged.showroomQty) || 0) + (Number(merged.godownQty) || 0) + (Number(merged.stockQty) || 0);
    }
    if (catalogShowsSize(merged)) merged.size = formatTileSize(merged.size);
    setForm(merged);
  }, []);

  // When closing the edit dialog we want the caret back on the opened row (no
  // scroll jump); every other trigger (Alt+K, page load) focuses the search box.
  const focusStart = usePageFocus(() => {
    if (returnToRowRef.current) {
      returnToRowRef.current = false;
      const id = lastEditIdRef.current;
      const el = id && document.querySelector(`[data-testid="product-row-${id}"]`);
      if (el) { el.focus({ preventScroll: true }); return; }
    }
    searchRef.current?.focus();
  }, { enabled: !form });

  const restoreListFocus = useCallback(() => {
    // usePageFocus fires on close (enabled flips true) and will honour this flag.
    returnToRowRef.current = true;
  }, []);

  const save = useCallback(async () => {
    if (!form?.id) return;
    if (!form.name) return toast.error("Product ka naam daaliye");
    if (catalogShowsPpb(form) && !(Number(form.piecesPerBox) > 0)) {
      return toast.error("Tiles ke liye pieces / box daaliye");
    }
    if (catalogShowsSize(form) && !String(form.size || "").trim()) {
      return toast.error("Size choose karein");
    }
    let clean = { ...form };
    NUMERIC.forEach((k) => (clean[k] = Number(clean[k]) || 0));
    clean = normalizeProductUnitFields(clean);
    // If product still has old showroomQty/godownQty fields, merge them into stockQty
    if (clean.showroomQty !== undefined || clean.godownQty !== undefined) {
      clean.stockQty = (Number(clean.stockQty) || 0) + (Number(clean.showroomQty) || 0) + (Number(clean.godownQty) || 0);
      delete clean.showroomQty;
      delete clean.godownQty;
    }
    try {
      await updateProduct(form.id, clean);
    } catch (err) {
      // Keep the edit form open so nothing typed is lost.
      toast.error(errorMessage(err, "Product update nahi hua. Dobara try karein."));
      return;
    }
    toast.success("Product update ho gaya");
    setForm(null);
    restoreListFocus();
  }, [form, updateProduct, restoreListFocus]);

  const setUnit = (unit) => {
    setForm((f) => applyCatalogUnitChange(f, unit));
  };
  const setCategory = (cat) => {
    setForm((f) => applyCatalogCategoryChange(f, cat));
  };

  /* ── Keyboard: type to filter, ↑/↓ to walk the list, Enter to edit ── */
  const nav = useListNavigation({
    count: list.length,
    enabled: !form,
    onSelect: (i) => { const p = list[i]; if (p) openEdit(p); },
    onEscape: () => { setQ(""); searchRef.current?.focus(); },
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useEffect(() => { setActiveIndex(0); }, [q, lowOnly, cats, sortKey, setActiveIndex]);

  // The palette hands over a product name as ?q=
  useEffect(() => {
    const incoming = params.get("q");
    if (incoming) { setQ(incoming); searchRef.current?.focus(); }
  }, [params]);

  useHotkeyScope(SCOPES.INVENTORY);
  useHotkeys(SCOPES.INVENTORY, [
    { keys: KEYS.focusSearch, label: "Search par jaayein", handler: () => focusStart(0) },
    { keys: KEYS.quickCreate, label: "Naya item banayein", handler: () => quickCreate("product", q.trim()) },
    { keys: KEYS.gotoBulk, label: "Bulk stock intake", handler: () => navigate("/bulk"), hidden: true },
    { keys: "arrowdown", label: "Agala product", handler: () => nav.move(1) },
    { keys: "arrowup", label: "Pichla product", handler: () => nav.move(-1) },
    { keys: "enter", label: "Product edit karein", handler: () => nav.selectActive() },
  ]);

  return (
    <div className="ds-fade" data-testid="inventory-page">
      <div className="ds-panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 p-3">
          <div className="ds-combo min-w-0 flex-1">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              ref={searchRef}
              data-testid="inventory-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={nav.handleKeyDown}
              aria-controls="stock-list"
              aria-activedescendant={list.length ? `stock-opt-${activeIndex}` : undefined}
              placeholder="Name, code, company…"
              className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-slate-400"
            />
            {q && (
              <button
                type="button"
                onClick={() => { setQ(""); searchRef.current?.focus(); }}
                className="rounded p-0.5 text-slate-400 hover:text-ink"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <Kbd keys={KEYS.focusSearch} />
          </div>
          <span className="hidden shrink-0 font-mono text-xs tabular-nums text-slate-400 sm:inline">
            {list.length}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="stock-filter-btn"
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-sm font-semibold transition-colors ${
                  cats.size ? "border-mint bg-mint-soft text-mint-dark" : "border-border text-ink hover:bg-slate-50"
                }`}
              >
                <Filter className="h-4 w-4" />
                <span className="hidden sm:inline">Filter</span>
                {cats.size > 0 && (
                  <span className="rounded-full bg-mint px-1.5 text-[10px] font-bold text-white">{cats.size}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Category</DropdownMenuLabel>
              {presentCats.length === 0 ? (
                <DropdownMenuItem disabled>Koi product nahi</DropdownMenuItem>
              ) : presentCats.map(([code, label]) => (
                <DropdownMenuCheckboxItem
                  key={code}
                  data-testid={`stock-filter-cat-${code}`}
                  checked={cats.has(code)}
                  onCheckedChange={() => toggleCat(code)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                data-testid="stock-filter-low"
                checked={lowOnly}
                onCheckedChange={(v) => setParams(v ? { low: "1" } : {})}
                onSelect={(e) => e.preventDefault()}
              >
                Low stock only
              </DropdownMenuCheckboxItem>
              {(cats.size > 0 || lowOnly) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    data-testid="stock-filter-clear"
                    onSelect={() => { setCats(new Set()); if (lowOnly) setParams({}); }}
                  >
                    Clear filters
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="stock-sort-btn"
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-sm font-semibold transition-colors ${
                  sortKey !== "smart" ? "border-mint bg-mint-soft text-mint-dark" : "border-border text-ink hover:bg-slate-50"
                }`}
              >
                <ArrowUpDown className="h-4 w-4" />
                <span className="hidden sm:inline">Sort</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sortKey} onValueChange={setSortKey}>
                {SORT_OPTIONS.map(([key, label]) => (
                  <DropdownMenuRadioItem key={key} value={key} data-testid={`stock-sort-${key}`}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <button
            type="button"
            data-testid="bulk-upload-btn"
            onClick={() => navigate("/bulk")}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control bg-mint px-3 text-sm font-semibold text-white transition-transform active:scale-95 hover:bg-mint-dark"
          >
            <Upload className="h-4 w-4" />
            Add Stock
            <Kbd keys={KEYS.gotoBulk} tone="dark" />
          </button>
        </div>

        {lowOnly && (
          <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-500/30 dark:text-rose-200" data-testid="low-filter-banner">
            Low stock ({list.length})
            <button type="button" data-testid="clear-low-filter" onClick={() => setParams({})} className="flex items-center gap-1 text-rose-600">
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
        )}

        <div className={`w-full border-l-2 border-l-transparent border-b border-slate-100 bg-slate-50/90 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${STOCK_TRACKS}`}>
          <span className="min-w-0 flex-1 lg:flex-none">Item</span>
          <span className="hidden lg:block">Type</span>
          <span className="hidden lg:block">Code</span>
          <span className="w-14 shrink-0 lg:w-auto">Size</span>
          <span className="hidden text-right lg:block">Pcs/Box</span>
          <span className="w-[3.25rem] shrink-0 text-right lg:w-auto">Stock</span>
          <span className="hidden text-right lg:block">Rate</span>
        </div>

        <div id="stock-list" role="listbox" aria-label="Stock" ref={nav.listRef} data-testid="stock-list" className="divide-y divide-slate-100">
          {list.map((p, i) => {
            const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
            const ppb = Number(p.piecesPerBox) || 1;
            const bd = piecesBreakdown(totalStock, ppb);
            const low = isBoxUnit(p)
              ? bd.totalPieces <= (p.lowStockThreshold || 0) * ppb
              : totalStock <= (p.lowStockThreshold || 0);
            const stockLabel = formatStockLabel(p, piecesBreakdown);
            const active = i === activeIndex;
            const tile = catalogShowsSize(p);
            const size = tile ? (formatTileSize(p.size) || "—") : "—";
            return (
              <button
                type="button"
                key={p.id}
                id={`stock-opt-${i}`}
                role="option"
                aria-selected={active}
                data-list-index={i}
                data-testid={`product-row-${p.id}`}
                onMouseEnter={() => hover(i)}
                onClick={() => openEdit(p)}
                className={`w-full ${STOCK_TRACKS} scroll-mt-16 scroll-mb-24 border-l-2 py-2 text-left text-sm transition-colors lg:scroll-mt-20 lg:scroll-mb-8 ${
                  low
                    ? "border-l-rose-400 bg-rose-50/80 dark:border-l-rose-500 dark:bg-rose-950/40"
                    : active
                      ? "border-l-mint bg-mint-soft"
                      : "border-l-transparent hover:bg-slate-50"
                } ${active ? (low ? "ring-1 ring-inset ring-rose-300 dark:ring-rose-500/40" : "ring-1 ring-inset ring-mint/35") : ""}`}
              >
                <div className="min-w-0 flex-1 lg:flex-none">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className={`min-w-0 truncate font-semibold ${low ? "text-rose-900 dark:text-rose-200" : "text-ink"}`}>{p.name}</p>
                    {low && <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900 dark:text-rose-200">LOW</span>}
                  </div>
                  {/* Mobile: type sits under the name so it is not pushed far right by flex-1 */}
                  <div className="mt-0.5 flex min-w-0 items-center gap-1.5 lg:hidden">
                    <span className={`shrink-0 ${unitKindChipClass(p)}`}>{unitKindLabel(p)}</span>
                    {p.company && (
                      <p className="truncate text-[11px] text-slate-400">{p.company}</p>
                    )}
                  </div>
                  {p.company && (
                    <p className="hidden truncate text-[11px] text-slate-400 lg:block">{p.company}</p>
                  )}
                </div>
                <span className={`hidden shrink-0 lg:inline-flex ${unitKindChipClass(p)}`}>{unitKindLabel(p)}</span>
                <span className="hidden truncate font-mono text-xs text-slate-500 lg:block">{p.code || "—"}</span>
                <span className="w-14 shrink-0 truncate text-xs text-slate-600 lg:w-auto">{size}</span>
                <span className="hidden text-right font-mono text-xs tabular-nums text-slate-500 lg:block">
                  {catalogShowsPpb(p) ? piecesPerBoxOf(p) : "—"}
                </span>
                <span className={`w-[3.25rem] shrink-0 text-right font-mono text-xs font-semibold tabular-nums lg:w-auto ${low ? "text-rose-700 dark:text-rose-200" : "text-ink"}`} data-testid={`stock-qty-${p.id}`}>
                  {stockLabel}
                </span>
                <span className="hidden text-right font-mono text-xs tabular-nums text-slate-600 lg:block">{money(p.sellPrice)}</span>
              </button>
            );
          })}
          {list.length === 0 && (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <Package className="mb-3 h-10 w-10 text-ink-muted/40" />
              <p className="font-semibold text-ink">{q || lowOnly ? "Koi match nahi" : "Catalog khali hai"}</p>
              {q || lowOnly ? (
                <p className="mt-1 text-sm text-ink-muted">Naam, code, ya company badal ke dhoondein.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-ink-muted">Pehle items daaliye — photo se ya grid se.</p>
                  <button
                    type="button"
                    onClick={() => navigate("/bulk")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-control bg-mint px-4 py-2 text-sm font-semibold text-white hover:bg-mint-dark"
                  >
                    <Upload className="h-4 w-4" /> Add Stock
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <EditProductDialog form={form} setForm={setForm} setUnit={setUnit} setCategory={setCategory} onSave={save} onClose={() => { setForm(null); restoreListFocus(); }} />
    </div>
  );
}

function EditProductDialog({ form, setForm, setUnit, setCategory, onSave, onClose }) {
  const open = useVisibleOpen(!!form);
  useHotkeyScope("modal:edit-product", { exclusive: true, enabled: open });
  useHotkeys("modal:edit-product", [
    { keys: KEYS.save, label: "Save product", handler: onSave },
    { keys: KEYS.saveAlt, label: "Save product", handler: onSave, hidden: true },
    { keys: KEYS.cancel, label: "Cancel", handler: onClose },
  ]);
  const flow = useFormFlow({ onCancel: onClose });

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => flow.focusFirst(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-auto" data-testid="product-form-dialog">
        <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
        {form && (
          <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="grid grid-cols-2 gap-3">
            <CategorySelect value={form.category} onChange={setCategory} testId="pf-category" className="col-span-2" />
            <PriceUnitSelect product={form} onChange={setUnit} testId="pf-unit" />
            <AllowedUnitChips
              product={form}
              onChange={(allowedUnits) => setForm({ ...form, allowedUnits })}
              testId="pf-allowed"
            />
            {[
              ["name", "Name", "col-span-2"], ["code", "Code"], ["company", "Company"],
              ...(catalogShowsSize(form) ? [["size", "Size"]] : []),
              ...(catalogShowsPpb(form) ? [["piecesPerBox", "Pieces / box"]] : []),
              ["sellPrice", `Price (₹${rateSuffix(form)})`],
              ["stockQty", isSlabProduct(form) ? `Remaining (${stockUnitWord(form)})` : `Stock (${stockUnitWord(form)})`, "col-span-2"],
              ["lowStockThreshold", "Low-stock threshold", "col-span-2"],
            ].map(([key, label, cls = ""]) => (
              <div key={key} className={cls}>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                {key === "size" ? (
                  <TileSizeSelect testId="pf-size" value={form.size} onChange={(v) => setForm({ ...form, size: v })} />
                ) : NUMERIC.includes(key) ? (
                  <NumberInput data-testid={`pf-${key}`} value={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} className="ds-field text-right tabular-nums" />
                ) : (
                  <input data-testid={`pf-${key}`} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="ds-field" />
                )}
              </div>
            ))}
            <PackQtyField product={form} value={form.packQty} onChange={(v) => setForm({ ...form, packQty: v })} testId="pf-packQty" />
            {isSlabProduct(form) && (
              <MeasureToAdd
                product={form}
                onAdd={(qty) => setForm({ ...form, stockQty: String(Math.round(((Number(form.stockQty) || 0) + qty) * 10000) / 10000) })}
                testPrefix="pf-measure"
              />
            )}
            <DerivedSqftHint product={form} rate={form.sellPrice} />
            <button data-flow-skip data-testid="save-product-btn" onClick={onSave} className="col-span-2 flex items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-semibold text-white active:scale-95 hover:bg-mint-dark">
              Save <Kbd keys={KEYS.save} tone="dark" />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
