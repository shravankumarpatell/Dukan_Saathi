import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import NumberInput from "@/components/NumberInput";
import { money, piecesBreakdown } from "@/lib/calc";
import { searchProducts } from "@/lib/fuzzy";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Upload, X, ChevronRight } from "lucide-react";

const empty = { name: "", code: "", company: "", size: "", unit: "box", piecesPerBox: 1, costPrice: 0, sellPrice: 0, stockQty: 0, lowStockThreshold: 10 };
const NUMERIC = ["piecesPerBox", "costPrice", "sellPrice", "stockQty", "lowStockThreshold"];

export default function Inventory() {
  const { products, addProduct, updateProduct } = useApp();
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
    if (!form.name) return toast.error("Product ka naam daaliye");
    const clean = { ...form };
    NUMERIC.forEach((k) => (clean[k] = Number(clean[k]) || 0));
    // If product still has old showroomQty/godownQty fields, merge them into stockQty
    if (clean.showroomQty !== undefined || clean.godownQty !== undefined) {
      clean.stockQty = (Number(clean.stockQty) || 0) + (Number(clean.showroomQty) || 0) + (Number(clean.godownQty) || 0);
      delete clean.showroomQty;
      delete clean.godownQty;
    }
    if (form.id) await updateProduct(form.id, clean);
    else await addProduct(clean);
    toast.success(form.id ? "Product update ho gaya" : "Product add ho gaya");
    setForm(null);
  };

  // When opening the edit form, merge old showroom+godown into stockQty if present
  const openEdit = (p) => {
    const merged = { ...p };
    if (merged.showroomQty !== undefined || merged.godownQty !== undefined) {
      merged.stockQty = (Number(merged.showroomQty) || 0) + (Number(merged.godownQty) || 0) + (Number(merged.stockQty) || 0);
    }
    setForm(merged);
  };

  return (
    <div className="space-y-3 ds-fade" data-testid="inventory-page">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-bold text-slate-900 dark:text-[#F5F5F7]">Stock</h2><p className="text-sm text-slate-500 dark:text-[#A1A1A6]">{products.length} products</p></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button data-testid="bulk-upload-btn" onClick={() => navigate("/bulk")} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-800 active:scale-95 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#818CF8]"><Upload className="h-4 w-4" /> Bulk Upload</button>
        <button data-testid="add-product-btn" onClick={() => setForm({ ...empty })} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-900 px-3 py-2.5 text-sm font-semibold text-white active:scale-95 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]"><Plus className="h-4 w-4" /> Add Product</button>
      </div>

      {lowOnly && (
        <div className="flex items-center justify-between rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 dark:bg-[#FB7185]/10 dark:text-[#FB7185]" data-testid="low-filter-banner">
          Low-stock only ({list.length})
          <button data-testid="clear-low-filter" onClick={() => setParams({})} className="flex items-center gap-1 text-rose-600 dark:text-[#FB7185]"><X className="h-4 w-4" /> Clear</button>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
        <Search className="h-4 w-4 shrink-0 text-slate-400 dark:text-[#6E6E73]" />
        <input data-testid="inventory-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code / company…" className="w-full bg-transparent outline-none dark:text-[#A1A1A6] dark:placeholder-[#6E6E73]" />
      </div>

      <div className="divide-y divide-slate-100 dark:divide-[#2C2C2E]" data-testid="stock-list">
        {list.map((p) => {
          const ppb = Number(p.piecesPerBox) || 1;
          const isBox = p.unit === "box" && ppb > 1;
          const totalStock = (p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0);
          const bd = piecesBreakdown(totalStock, ppb);
          const low = bd.totalPieces <= (p.lowStockThreshold || 0) * ppb;
          const stockLabel = isBox ? `${bd.boxes}b${bd.loose ? `+${bd.loose}p` : ""}` : `${bd.totalPieces}`;
          return (
            <button key={p.id} data-testid={`product-row-${p.id}`} onClick={() => openEdit(p)}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors ${low ? "bg-rose-50 dark:bg-[#FB7185]/10" : "active:bg-slate-50 dark:active:bg-[#2C2C2E]"}`}>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${low ? "text-rose-800 dark:text-[#FB7185]" : "text-slate-900 dark:text-[#F5F5F7]"}`}>
                  {p.name}{low && <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-[#FB7185]/15 dark:text-[#FB7185]">LOW</span>}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-[#6E6E73]">{[p.code, p.company, p.size].filter(Boolean).join(" · ")} · {p.unit}{isBox ? ` ${ppb}/box` : ""}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-700 dark:bg-[#818CF8]/10 dark:text-[#818CF8]" data-testid={`stock-qty-${p.id}`}>
                  Stock {stockLabel}
                </span>
                <p className="mt-1 text-xs font-semibold tabular-nums text-slate-500 dark:text-[#A1A1A6]">{money(p.sellPrice)}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-[#6E6E73]" />
            </button>
          );
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400 dark:text-[#6E6E73]">Koi product nahi mila.</p>}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto" data-testid="product-form-dialog">
          <DialogHeader><DialogTitle>{form?.id ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ["name", "Name", "col-span-2"], ["code", "Code"], ["company", "Company"], ["size", "Size (e.g. 2x2 ft)"],
                ["unit", "Unit (box/piece)"], ["piecesPerBox", "Pieces / box"], ["costPrice", "Cost"], ["sellPrice", "Price"],
                ["stockQty", "Stock Qty (boxes)", "col-span-2"], ["lowStockThreshold", "Low-stock threshold", "col-span-2"],
              ].map(([key, label, cls = ""]) => (
                <div key={key} className={cls}>
                  <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-[#A1A1A6]">{label}</label>
                  {NUMERIC.includes(key) ? (
                    <NumberInput data-testid={`pf-${key}`} value={form[key]} onChange={(v) => setForm({ ...form, [key]: v })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right tabular-nums outline-none focus:ring-2 focus:ring-indigo-500 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#A1A1A6]" />
                  ) : (
                    <input data-testid={`pf-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#A1A1A6]" />
                  )}
                </div>
              ))}
              <button data-testid="save-product-btn" onClick={save} className="col-span-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]">Save</button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
