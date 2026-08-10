import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { money } from "@/lib/calc";
import { searchProducts } from "@/lib/fuzzy";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, ArrowRightLeft, Upload, X, ChevronRight } from "lucide-react";

const empty = { name: "", code: "", company: "", size: "", unit: "box", piecesPerBox: 1, costPrice: 0, sellPrice: 0, showroomQty: 0, godownQty: 0, lowStockThreshold: 10 };

export default function Inventory() {
  const { products, addProduct, updateProduct, setDraft } = useApp();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [form, setForm] = useState(null);

  const lowOnly = params.get("low") === "1";
  let list = searchProducts(products, q);
  if (lowOnly) list = list.filter((p) => (p.showroomQty || 0) + (p.godownQty || 0) <= (p.lowStockThreshold || 0));

  const save = async () => {
    if (!form.name) return toast.error("Product ka naam daaliye");
    const clean = { ...form };
    ["piecesPerBox", "costPrice", "sellPrice", "showroomQty", "godownQty", "lowStockThreshold"].forEach((k) => (clean[k] = Number(clean[k]) || 0));
    if (form.id) await updateProduct(form.id, clean);
    else await addProduct(clean);
    toast.success(form.id ? "Product update ho gaya" : "Product add ho gaya");
    setForm(null);
  };

  const transfer = (p) => {
    const qty = Math.min(p.godownQty || 0, 10) || 1;
    setForm(null);
    setDraft({
      kind: "stock_transfer", productId: p.id, qty,
      title: "Move to Showroom", subtitle: `${p.name} — godown se showroom`,
      summaryRows: [
        { label: "Showroom", old: p.showroomQty, new: (p.showroomQty || 0) + qty },
        { label: "Godown", old: p.godownQty, new: Math.max(0, (p.godownQty || 0) - qty) },
      ],
    });
  };

  return (
    <div className="space-y-3 ds-fade" data-testid="inventory-page">
      <div className="flex items-center justify-between">
        <div><h2 className="font-display text-2xl font-bold text-slate-900">Stock</h2><p className="text-sm text-slate-500">{products.length} products</p></div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button data-testid="bulk-upload-btn" onClick={() => navigate("/bulk")} className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm font-semibold text-indigo-800 active:scale-95"><Upload className="h-4 w-4" /> Bulk Upload</button>
        <button data-testid="add-product-btn" onClick={() => setForm({ ...empty })} className="flex items-center justify-center gap-2 rounded-xl bg-indigo-900 px-3 py-2.5 text-sm font-semibold text-white active:scale-95"><Plus className="h-4 w-4" /> Add Product</button>
      </div>

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

      {/* Flat, full-page product list — no bordered box, no horizontal scroll */}
      <div className="divide-y divide-slate-100" data-testid="stock-list">
        {list.map((p) => {
          const total = (p.showroomQty || 0) + (p.godownQty || 0);
          const low = total <= (p.lowStockThreshold || 0);
          return (
            <button key={p.id} data-testid={`product-row-${p.id}`} onClick={() => setForm({ ...p })}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors ${low ? "bg-rose-50" : "active:bg-slate-50"}`}>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${low ? "text-rose-800" : "text-slate-900"}`}>
                  {p.name}{low && <span className="ml-1.5 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">LOW</span>}
                </p>
                <p className="truncate text-xs text-slate-400">{[p.code, p.company, p.size].filter(Boolean).join(" · ")} · {p.unit}{p.unit === "box" ? ` ${p.piecesPerBox}/box` : ""}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="flex items-center justify-end gap-1.5 text-[11px]">
                  <span className="rounded bg-teal-100 px-1.5 py-0.5 font-bold tabular-nums text-teal-700">Show {p.showroomQty}</span>
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-bold tabular-nums text-indigo-700">Godown {p.godownQty}</span>
                </div>
                <p className="mt-1 text-xs font-semibold tabular-nums text-slate-500">Price {money(p.sellPrice)}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
            </button>
          );
        })}
        {list.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Koi product nahi mila.</p>}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto" data-testid="product-form-dialog" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>{form?.id ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ["name", "Name", "col-span-2"], ["code", "Code"], ["company", "Company"], ["size", "Size (e.g. 2x2 ft)"],
                ["unit", "Unit (box/piece)"], ["piecesPerBox", "Pieces / box", "", "number"], ["costPrice", "Cost", "", "number"], ["sellPrice", "Price", "", "number"],
                ["showroomQty", "Showroom Qty", "", "number"], ["godownQty", "Godown Qty", "", "number"], ["lowStockThreshold", "Low-stock threshold", "col-span-2", "number"],
              ].map(([key, label, cls = "", type = "text"]) => (
                <div key={key} className={cls}>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                  <input data-testid={`pf-${key}`} type={type} inputMode={type === "number" ? "decimal" : undefined} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              ))}
              {form.id && (
                <button data-testid={`transfer-btn-${form.id}`} onClick={() => transfer(form)} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-800 active:scale-95"><ArrowRightLeft className="h-4 w-4" /> Move stock to showroom</button>
              )}
              <button data-testid="save-product-btn" onClick={save} className="col-span-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Save</button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
