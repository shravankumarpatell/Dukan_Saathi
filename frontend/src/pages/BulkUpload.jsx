import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import { money } from "@/lib/calc";
import { toast } from "sonner";
import { Upload, AlertTriangle, Loader2, Check, FileText, TableProperties } from "lucide-react";
import BulkGrid from "@/components/BulkGrid";

export default function BulkUpload() {
  const { setDraft } = useApp();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [activeTab, setActiveTab] = useState("grid"); // "grid" | "photo"

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setPreview(URL.createObjectURL(file));
    try {
      const base64 = await toBase64(file);
      const result = await api.extractStockSheet(base64.split(",")[1], file.type);
      const extracted = result.rows || [];
      setRows(extracted.map((r, i) => ({ id: i, ...r })));
      toast.success(`${extracted.length} items extracted`);
    } catch (err) {
      toast.error("Extraction failed. Check your Gemini key or try a clearer photo.");
    }
    setBusy(false);
  };

  const upd = (id, patch) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const del = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const confirmBatch = () => {
    // Filter out completely empty rows (manual entry might have blanks)
    const validRows = rows.filter(r => r.name?.trim() || r.code?.trim() || r.qty?.toString().trim());
    
    if (validRows.length === 0) return toast.error("Please enter at least one valid product");
    
    // Check for missing mandatory fields in the valid rows
    const hasErrors = validRows.some(r => !r.name?.trim() || !r.qty?.toString().trim());
    if (hasErrors) return toast.error("Name and Qty are required for all entered products");

    setDraft({
      kind: "bulk_stock", rows: validRows,
      title: "Confirm Bulk Stock Intake", subtitle: `${validRows.length} products godown me add honge`,
      summaryRows: validRows.slice(0, 5).map((r) => ({ label: r.name, new: `+${r.qty}` })),
    });
  };

  return (
    <div className="space-y-4 ds-fade" data-testid="bulk-upload-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-[#F5F5F7]">Bulk Stock Entry</h2>
        <p className="text-sm text-slate-500 dark:text-[#A1A1A6]">Rapidly enter stock manually or upload a supplier sheet for AI extraction.</p>
      </div>

      {/* Tabs */}
      <div className="flex rounded-xl bg-slate-200/50 p-1 dark:bg-[#1C1C1E]">
        <button
          onClick={() => setActiveTab("grid")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
            activeTab === "grid"
              ? "bg-white text-indigo-900 shadow-sm dark:bg-[#2C2C2E] dark:text-[#F5F5F7]"
              : "text-slate-500 hover:text-slate-700 dark:text-[#6E6E73] dark:hover:text-[#A1A1A6]"
          }`}
        >
          <TableProperties className="h-4 w-4" /> Fast Grid Entry
        </button>
        <button
          onClick={() => setActiveTab("photo")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-all ${
            activeTab === "photo"
              ? "bg-white text-indigo-900 shadow-sm dark:bg-[#2C2C2E] dark:text-[#F5F5F7]"
              : "text-slate-500 hover:text-slate-700 dark:text-[#6E6E73] dark:hover:text-[#A1A1A6]"
          }`}
        >
          <FileText className="h-4 w-4" /> Smart Extract (AI)
        </button>
      </div>

      {activeTab === "photo" && (
        <label data-testid="bulk-file-label" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 bg-white p-8 text-center hover:bg-indigo-50 dark:border-[#2C2C2E] dark:bg-[#1C1C1E] dark:hover:bg-[#2C2C2E]">
          {busy ? <Loader2 className="h-8 w-8 animate-spin text-indigo-600 dark:text-[#F5F5F7]" /> : <Upload className="h-8 w-8 text-indigo-600 dark:text-[#F5F5F7]" />}
          <p className="font-semibold text-slate-700 dark:text-[#A1A1A6]">{busy ? "Extracting…" : "Photo ya PDF choose karein"}</p>
          <p className="text-xs text-slate-400 dark:text-[#6E6E73]">JP, PNG, PDF</p>
          <input data-testid="bulk-file-input" type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
        </label>
      )}

      {activeTab === "grid" && (
        <BulkGrid rows={rows} setRows={setRows} />
      )}

      {rows.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
          <h3 className="mb-2 font-display font-bold text-slate-900 dark:text-[#F5F5F7]">
            Review {activeTab === "grid" ? "Grid" : "Extracted"} Data
          </h3>
          {activeTab === "photo" && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs uppercase text-slate-500 dark:text-[#A1A1A6]"><th className="p-2">Name</th><th className="p-2">Code</th><th className="p-2">Company</th><th className="p-2">Qty</th><th className="p-2">Price</th><th></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} data-testid={`bulk-row-${r.id}`} className={`border-t border-slate-100 dark:border-[#2C2C2E] ${r.lowConfidence ? "bg-amber-50 dark:bg-[#FBBF24]/10" : ""}`}>
                      {["name", "code", "company", "qty", "price"].map((k) => (
                        <td key={k} className="p-1"><input data-testid={`bulk-${k}-${r.id}`} value={r[k] ?? ""} onChange={(e) => upd(r.id, { [k]: e.target.value })} className="w-full rounded border border-transparent bg-transparent px-1.5 py-1 focus:border-slate-300 focus:bg-white dark:text-[#A1A1A6] dark:focus:border-[#3A3A3C] dark:focus:bg-[#2C2C2E]" /></td>
                      ))}
                      <td className="p-1 text-right">
                        {r.lowConfidence && <span title="Low confidence — please check" className="mr-1 inline-flex"><AlertTriangle className="inline h-4 w-4 text-amber-600 dark:text-[#FBBF24]" /></span>}
                        <button data-testid={`bulk-del-${r.id}`} onClick={() => del(r.id)} className="text-xs font-semibold text-rose-500 dark:text-[#FB7185]">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button data-testid="bulk-confirm-btn" onClick={confirmBatch} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-bold text-white active:scale-95 dark:bg-[#FB923C]"><Check className="h-4 w-4" /> Review &amp; Confirm Batch</button>
        </div>
      )}
    </div>
  );
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
