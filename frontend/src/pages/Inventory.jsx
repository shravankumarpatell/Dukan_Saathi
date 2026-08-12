import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import NumberInput from "@/components/NumberInput";
import UnitToggle from "@/components/UnitToggle";
import { money, piecesBreakdown } from "@/lib/calc";
import {
  isBoxUnit, formatStockLabel, productMetaLine, normalizeProductUnitFields, UNIT_PIECE,
} from "@/lib/units";
import { searchProducts } from "@/lib/fuzzy";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Upload, X, ChevronRight, Package } from "lucide-react";

const NUMERIC = ["piecesPerBox", "sellPrice", "stockQty", "lowStockThreshold"];

export default function Inventory() {
  const { products, updateProduct } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);

  const lowOnly = params.get("low") === "1";
  let list = searchProducts(products, q);
  if (lowOnly) list = list.filter((p) => {
    const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
    return totalStock <= (p.lowStockThreshold || 0);
  });

  const save = async () => {
    if (!form?.id) return;
    if (!form.name) return toast.error("Product ka naam daaliye");
    if (isBoxUnit(form) && !(Number(form.piecesPerBox) > 0)) {
      return toast.error("Tiles ke liye pieces / box daaliye");
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
  };

  const openEdit = (p) => {
    const merged = { ...p };
    if (merged.showroomQty !== undefined || merged.godownQty !== undefined) {
      merged.stockQty = (Number(merged.showroomQty) || 0) + (Number(merged.godownQty) || 0) + (Number(merged.stockQty) || 0);
    }
    setForm(merged);
  };

  const setUnit = (unit) => {
    setForm((f) => ({
      ...f,
      unit,
      piecesPerBox: unit === UNIT_PIECE ? 1 : (Number(f.piecesPerBox) > 1 ? f.piecesPerBox : ""),
    }));
  };

  return (
    <div className="space-y-3 ds-fade" data-testid="inventory-page">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-bold text-slate-900">Stock</h2><p className="text-sm text-slate-500">{products.length} products</p></div>
      </div>

      <button data-testid="bulk-upload-btn" onClick={() => navigate("/bulk")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-800 active:scale-95"><Upload className="h-4 w-4" /> Add Stock</button>

      {lowOnly && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" data-testid="low-filter-banner">
          Low-stock only ({list.length})
          <button data-testid="clear-low-filter" onClick={() => setParams({})} className="flex items-center gap-1 text-rose-600"><X className="h-4 w-4" /> Clear</button>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input data-testid="inventory-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code / company…" className="w-full bg-transparent outline-none" />
      </div>

      <div className="divide-y divide-slate-100" data-testid="stock-list">
        {list.map((p) => {
          const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
          const ppb = Number(p.piecesPerBox) || 1;
          const bd = piecesBreakdown(totalStock, ppb);
          const low = bd.totalPieces <= (p.lowStockThreshold || 0) * (isBoxUnit(p) ? ppb : 1);
          const stockLabel = formatStockLabel(p, piecesBreakdown);
          return (
            <button key={p.id} data-testid={`product-row-${p.id}`} onClick={() => openEdit(p)}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors ${low ? "bg-rose-50" : "active:bg-slate-50"}`}>
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
            {!q && (
              <button onClick={() => navigate("/bulk")} className="rounded-lg bg-indigo-900 px-4 py-2 text-sm font-semibold text-white">Add Stock</button>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto" data-testid="product-form-dialog">
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              <UnitToggle value={form.unit} onChange={setUnit} testId="pf-unit" />
              {[
                ["name", "Name", "col-span-2"], ["code", "Code"], ["company", "Company"],
                ...(isBoxUnit(form) ? [["size", "Size (e.g. 2x2 ft)"], ["piecesPerBox", "Pieces / box"]] : []),
                ["sellPrice", `Price (${isBoxUnit(form) ? "₹/box" : "₹/pc"})`],
                ["stockQty", `Stock (${isBoxUnit(form) ? "boxes" : "pcs"})`, "col-span-2"],
                ["lowStockThreshold", "Low-stock threshold", "col-span-2"],
              ].map(([key, label, cls = ""]) => (
                <div key={key} className={cls}>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                  {NUMERIC.includes(key) ? (
                    <NumberInput data-testid={`pf-${key}`} value={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-500" />
                  ) : (
                    <input data-testid={`pf-${key}`} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}
                </div>
              ))}
              <button data-testid="save-product-btn" onClick={save} className="col-span-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Save</button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
