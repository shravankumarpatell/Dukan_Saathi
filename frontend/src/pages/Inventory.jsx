import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { useSearchParams, useNavigate } from "react-router-dom";
import { money } from "@/lib/calc";
import { searchProducts } from "@/lib/fuzzy";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, ArrowRightLeft, Upload, X } from "lucide-react";

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
    <div className="space-y-4 ds-fade" data-testid="inventory-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display text-2xl font-bold text-slate-900">Stock</h2><p className="text-sm text-slate-500">{products.length} products</p></div>
        <div className="flex gap-2">
          <button data-testid="bulk-upload-btn" onClick={() => navigate("/bulk")} className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-800 active:scale-95"><Upload className="h-4 w-4" /> Bulk Upload</button>
          <button data-testid="add-product-btn" onClick={() => setForm({ ...empty })} className="flex items-center gap-2 rounded-xl bg-indigo-900 px-4 py-2.5 text-sm font-semibold text-white active:scale-95"><Plus className="h-4 w-4" /> Add Product</button>
        </div>
      </div>

      {lowOnly && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700" data-testid="low-filter-banner">
          Showing low-stock products only ({list.length})
          <button data-testid="clear-low-filter" onClick={() => setParams({})} className="flex items-center gap-1 text-rose-600"><X className="h-4 w-4" /> Clear</button>
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input data-testid="inventory-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code / company…" className="w-full bg-transparent text-sm outline-none" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="ds-stripe w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="p-2.5">Product</th><th className="p-2.5">Company</th><th className="p-2.5 text-right">Price</th>
              <th className="p-2.5 text-center">Showroom</th><th className="p-2.5 text-center">Godown</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => {
              const total = (p.showroomQty || 0) + (p.godownQty || 0);
              const low = total <= (p.lowStockThreshold || 0);
              return (
                <tr key={p.id} data-testid={`product-row-${p.id}`} onClick={() => setForm({ ...p })}
                  className={`cursor-pointer border-b border-slate-100 transition-colors ${low ? "bg-rose-50 hover:bg-rose-100" : "hover:bg-indigo-50"}`}>
                  <td className="p-2.5">
                    <p className={`font-semibold ${low ? "text-rose-800" : "text-slate-900"}`}>{p.name}{low && <span className="ml-2 rounded-md border border-rose-200 bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">LOW</span>}</p>
                    <p className="text-xs text-slate-400">{[p.code, p.size].filter(Boolean).join(" · ")} · {p.unit}{p.unit === "box" ? ` (${p.piecesPerBox}/box)` : ""}</p>
                  </td>
                  <td className="p-2.5 text-slate-600">{p.company}</td>
                  <td className="p-2.5 text-right font-semibold">{money(p.sellPrice)}</td>
                  <td className="p-2.5 text-center"><span className="rounded-md bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-700">{p.showroomQty}</span></td>
                  <td className="p-2.5 text-center"><span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">{p.godownQty}</span></td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-sm text-slate-400">Koi product nahi mila.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto" data-testid="product-form-dialog">
          <DialogHeader><DialogTitle>{form?.id ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ["name", "Name", "col-span-2"], ["code", "Code"], ["company", "Company"], ["size", "Size (e.g. 2x2 ft)"],
                ["unit", "Unit (box/piece)"], ["piecesPerBox", "Pieces / box", "", "number"], ["costPrice", "Cost ₹", "", "number"], ["sellPrice", "Price ₹", "", "number"],
                ["showroomQty", "Showroom Qty", "", "number"], ["godownQty", "Godown Qty", "", "number"], ["lowStockThreshold", "Low-stock threshold", "col-span-2", "number"],
              ].map(([key, label, cls = "", type = "text"]) => (
                <div key={key} className={cls}>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label>
                  <input data-testid={`pf-${key}`} type={type} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
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
