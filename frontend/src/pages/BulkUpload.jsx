import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import { toast } from "sonner";
import { Upload, Loader2, Check } from "lucide-react";
import BulkGrid, { emptyRow } from "@/components/BulkGrid";
import Kbd from "@/components/Kbd";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { SCOPES, KEYS } from "@/lib/keymap";
import { UNIT_BOX, UNIT_PIECE, normalizeUnit } from "@/lib/units";
import { normalizeTileSize } from "@/lib/tileSizes";

function isBlankRow(r) {
  return !String(r?.name || "").trim() && !String(r?.code || "").trim() && !String(r?.qty ?? "").trim();
}

function mimeOf(file) {
  if (file?.type) return file.type;
  const n = (file?.name || "").toLowerCase();
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".heic") || n.endsWith(".heif")) return "image/heic";
  return "image/jpeg";
}

export default function BulkUpload() {
  const { setDraft, draft } = useApp();
  const [rows, setRows] = useState(() => [emptyRow(Date.now())]);
  const [busy, setBusy] = useState(false);
  const [gridKey, setGridKey] = useState(0);
  const fileRef = useRef(null);

  const prevDraft = useRef(draft);
  useEffect(() => {
    if (prevDraft.current && !draft) setGridKey((k) => k + 1);
    prevDraft.current = draft;
  }, [draft]);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const mime = mimeOf(file);
    if (mime === "image/heic" || mime === "image/heif") {
      toast.error("HEIC photos are not supported. Save as JPG or PNG and try again.");
      return;
    }
    setBusy(true);
    try {
      const base64 = await toBase64(file);
      const raw = String(base64).includes(",") ? String(base64).split(",")[1] : String(base64);
      const result = await api.extractStockSheet(raw, mime);
      const extracted = result.rows || [];
      if (result.error && extracted.length === 0) {
        toast.error("Extraction failed. Try a clearer photo or PDF.");
        return;
      }
      if (extracted.length === 0) {
        toast.error("No products found in this file. Try a clearer photo.");
        return;
      }
      const mapped = extracted.map((r, i) => {
        const unit = normalizeUnit(r.unit);
        const tile = unit === UNIT_BOX;
        return {
          id: Date.now() + i,
          ...r,
          unit,
          size: tile ? (normalizeTileSize(r.size) || "") : "",
          piecesPerBox: tile ? (r.piecesPerBox || "") : 1,
          price: r.price ?? "",
        };
      });
      setRows((prev) => {
        const kept = prev.filter((r) => !isBlankRow(r));
        return kept.length ? [...kept, ...mapped] : mapped;
      });
      setGridKey((k) => k + 1);
      toast.success(`${extracted.length} items extracted`);
    } catch {
      toast.error("Extraction failed. Try a clearer photo or PDF.");
    } finally {
      setBusy(false);
    }
  };

  const resetPage = () => {
    setRows([emptyRow(Date.now())]);
    setBusy(false);
    setGridKey((k) => k + 1);
    if (fileRef.current) fileRef.current.value = "";
  };

  const confirmBatch = useCallback(() => {
    const validRows = rows.filter((r) => r.name?.trim() || r.code?.trim() || r.qty?.toString().trim());

    if (validRows.length === 0) return toast.error("Please enter at least one valid product");

    const hasErrors = validRows.some((r) => !r.name?.trim() || !r.qty?.toString().trim());
    if (hasErrors) return toast.error("Name and Qty are required for all entered products");

    const tileMissingSize = validRows.some(
      (r) => normalizeUnit(r.unit) === UNIT_BOX && !String(r.size || "").trim()
    );
    if (tileMissingSize) return toast.error("Tiles ke liye size choose karein");

    const tileMissingPpb = validRows.some(
      (r) => normalizeUnit(r.unit) === UNIT_BOX && !(Number(r.piecesPerBox) > 0)
    );
    if (tileMissingPpb) return toast.error("Tiles ke liye Pieces/box daaliye");

    setDraft({
      kind: "bulk_stock",
      rows: validRows.map((r) => ({
        ...r,
        unit: normalizeUnit(r.unit),
        size: normalizeUnit(r.unit) === UNIT_PIECE ? "" : (normalizeTileSize(r.size) || r.size || ""),
        piecesPerBox: normalizeUnit(r.unit) === UNIT_PIECE ? 1 : (Number(r.piecesPerBox) || 1),
      })),
      title: "Confirm Bulk Stock Intake",
      subtitle: `${validRows.length} products stock me add honge`,
      summaryRows: validRows.slice(0, 5).map((r) => ({
        label: r.name,
        new: `+${r.qty} ${normalizeUnit(r.unit) === UNIT_PIECE ? "pcs" : "box"}`,
      })),
      onCommitted: resetPage,
    });
  }, [rows, setDraft]);

  useHotkeyScope(SCOPES.BULK);
  useHotkeys(SCOPES.BULK, [
    { keys: KEYS.save, label: "Batch confirm karein", handler: confirmBatch, disabled: rows.length === 0 },
    { keys: KEYS.saveAlt, label: "Batch confirm karein", handler: confirmBatch, disabled: rows.length === 0, hidden: true },
  ]);

  return (
    <div className="space-y-4 ds-fade" data-testid="bulk-upload-page">
      <div>
        <h2 className="font-display text-2xl font-bold text-slate-900">Add Stock</h2>
        <p className="text-sm text-slate-500">Type rows below, or upload a supplier photo / PDF — extracted items land in the same grid. Price optional hai.</p>
      </div>

      <label data-testid="bulk-file-label" className={`flex cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-indigo-300 bg-white px-4 py-4 text-center hover:bg-indigo-50 ${busy ? "pointer-events-none opacity-70" : ""}`}>
        {busy ? <Loader2 className="h-6 w-6 animate-spin text-indigo-600" /> : <Upload className="h-6 w-6 text-indigo-600" />}
        <span>
          <span className="block font-semibold text-slate-700">{busy ? "Extracting…" : "Photo ya PDF se extract karein"}</span>
          <span className="text-xs text-slate-400">JPG, PNG, PDF</span>
        </span>
        <input ref={fileRef} data-testid="bulk-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={onFile} />
      </label>

      <BulkGrid key={gridKey} rows={rows} setRows={setRows} />

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <button data-testid="bulk-confirm-btn" onClick={confirmBatch} className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 font-bold text-white active:scale-95">
          <Check className="h-4 w-4" /> Review &amp; Confirm Batch <Kbd keys={KEYS.save} tone="dark" />
        </button>
      </div>
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
