import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import NumberInput from "@/components/NumberInput";
import UnitToggle from "@/components/UnitToggle";
import TileSizeSelect from "@/components/TileSizeSelect";
import Kbd from "@/components/Kbd";
import { money, piecesBreakdown } from "@/lib/calc";
import {
  isBoxUnit, formatStockLabel, productMetaLine, normalizeProductUnitFields,
  applyCatalogUnitChange,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Upload, X, ChevronRight, Package } from "lucide-react";

const NUMERIC = ["piecesPerBox", "sellPrice", "stockQty", "lowStockThreshold"];

export default function Inventory() {
  const { products, updateProduct } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const quickCreate = useQuickCreate();
  const [q, setQ] = useState(params.get("q") || "");
  const [form, setForm] = useState(null);
  const searchRef = useRef(null);

  const lowOnly = params.get("low") === "1";
  let list = searchProducts(products, q);
  if (lowOnly) list = list.filter((p) => {
    const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
    return totalStock <= (p.lowStockThreshold || 0);
  });

  const openEdit = useCallback((p) => {
    const merged = { ...p };
    if (merged.showroomQty !== undefined || merged.godownQty !== undefined) {
      merged.stockQty = (Number(merged.showroomQty) || 0) + (Number(merged.godownQty) || 0) + (Number(merged.stockQty) || 0);
    }
    if (isBoxUnit(merged)) merged.size = formatTileSize(merged.size);
    setForm(merged);
  }, []);

  const focusStart = usePageFocus(() => searchRef.current?.focus(), { enabled: !form });

  const save = useCallback(async () => {
    if (!form?.id) return;
    if (!form.name) return toast.error("Product ka naam daaliye");
    if (isBoxUnit(form) && !(Number(form.piecesPerBox) > 0)) {
      return toast.error("Tiles ke liye pieces / box daaliye");
    }
    if (isBoxUnit(form) && !String(form.size || "").trim()) {
      return toast.error("Tiles ke liye size choose karein");
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
    await updateProduct(form.id, clean);
    toast.success("Product update ho gaya");
    setForm(null);
    focusStart();
  }, [form, updateProduct, focusStart]);

  const setUnit = (unit) => {
    setForm((f) => applyCatalogUnitChange(f, unit));
  };

  /* ── Keyboard: type to filter, ↑/↓ to walk the list, Enter to edit ── */
  const nav = useListNavigation({
    count: list.length,
    enabled: !form,
    onSelect: (i) => { const p = list[i]; if (p) openEdit(p); },
    onEscape: () => { setQ(""); searchRef.current?.focus(); },
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useEffect(() => { setActiveIndex(0); }, [q, lowOnly, setActiveIndex]);

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
    <div className="space-y-3 ds-fade" data-testid="inventory-page">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-bold text-slate-900">Stock</h2><p className="text-sm text-slate-500">{products.length} products</p></div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button data-testid="bulk-upload-btn" onClick={() => navigate("/bulk")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-800 active:scale-95"><Upload className="h-4 w-4" /> Add Stock <Kbd keys={KEYS.gotoBulk} /></button>
        <button data-testid="quick-add-product-btn" onClick={() => quickCreate("product", q.trim())} className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 active:scale-95"><Package className="h-4 w-4" /> Naya item <Kbd keys={KEYS.quickCreate} /></button>
      </div>

      {lowOnly && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" data-testid="low-filter-banner">
          Low-stock only ({list.length})
          <button data-testid="clear-low-filter" onClick={() => setParams({})} className="flex items-center gap-1 text-rose-600"><X className="h-4 w-4" /> Clear</button>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={searchRef}
          data-testid="inventory-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={nav.handleKeyDown}
          aria-controls="stock-list"
          aria-activedescendant={`stock-opt-${activeIndex}`}
          placeholder="Search name / code / company…"
          className="w-full bg-transparent outline-none"
        />
        <Kbd keys={KEYS.focusSearch} />
      </div>

      <div className="divide-y divide-slate-100" id="stock-list" role="listbox" ref={nav.listRef} data-testid="stock-list">
        {list.map((p, i) => {
          const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
          const ppb = Number(p.piecesPerBox) || 1;
          const bd = piecesBreakdown(totalStock, ppb);
          const low = bd.totalPieces <= (p.lowStockThreshold || 0) * (isBoxUnit(p) ? ppb : 1);
          const stockLabel = formatStockLabel(p, piecesBreakdown);
          const active = i === activeIndex;
          return (
            <button
              key={p.id}
              id={`stock-opt-${i}`}
              role="option"
              aria-selected={active}
              data-list-index={i}
              data-testid={`product-row-${p.id}`}
              onMouseEnter={() => hover(i)}
              onClick={() => openEdit(p)}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors ${
                low ? "bg-rose-50" : active ? "bg-indigo-50" : "active:bg-slate-50"
              } ${active ? "ring-1 ring-inset ring-indigo-300" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${low ? "text-rose-800" : "text-slate-900"}`}>
                  {p.name}{low && <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">LOW</span>}
                </p>
                <p className="truncate text-xs text-slate-400">{productMetaLine(p)}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-700" data-testid={`stock-qty-${p.id}`}>
                  Stock {stockLabel}
                </span>
                <p className="mt-1 text-xs font-semibold tabular-nums text-slate-500">{money(p.sellPrice)}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          );
        })}
        {list.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="h-12 w-12 text-slate-300 mb-3" />
            <h3 className="font-semibold text-slate-900">No products found</h3>
            <p className="text-sm text-slate-500 mt-1 mb-4 max-w-sm">
              {q ? "We couldn't find any products matching your search." : "You haven't added any products to your inventory yet."}
            </p>
            <button onClick={() => quickCreate("product", q.trim())} className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white">
              {q ? `Add "${q.trim()}"` : "Add product"}
            </button>
          </div>
        )}
      </div>

      {list.length > 0 && (
        <p className="hidden text-center text-[11px] text-slate-400 lg:block">
          <Kbd keys="arrowup" /> <Kbd keys="arrowdown" /> chunein · <Kbd keys="enter" /> edit karein
        </p>
      )}

      <EditProductDialog form={form} setForm={setForm} setUnit={setUnit} onSave={save} onClose={() => { setForm(null); focusStart(); }} />
    </div>
  );
}

function EditProductDialog({ form, setForm, setUnit, onSave, onClose }) {
  const open = !!form;
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
            <UnitToggle value={form.unit} onChange={setUnit} testId="pf-unit" />
            {[
              ["name", "Name", "col-span-2"], ["code", "Code"], ["company", "Company"],
              ...(isBoxUnit(form) ? [["size", "Size"], ["piecesPerBox", "Pieces / box"]] : []),
              ["sellPrice", `Price (${isBoxUnit(form) ? "₹/box" : "₹/pc"})`],
              ["stockQty", `Stock (${isBoxUnit(form) ? "boxes" : "pcs"})`, "col-span-2"],
              ["lowStockThreshold", "Low-stock threshold", "col-span-2"],
            ].map(([key, label, cls = ""]) => (
              <div key={key} className={cls}>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                {key === "size" ? (
                  <TileSizeSelect testId="pf-size" value={form.size} onChange={(v) => setForm({ ...form, size: v })} />
                ) : NUMERIC.includes(key) ? (
                  <NumberInput data-testid={`pf-${key}`} value={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-500" />
                ) : (
                  <input data-testid={`pf-${key}`} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
                )}
              </div>
            ))}
            <button data-flow-skip data-testid="save-product-btn" onClick={onSave} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">
              Save <Kbd keys={KEYS.save} tone="dark" />
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
