import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import { toast } from "sonner";
import { Upload, Loader2, Check } from "lucide-react";
import BulkGrid from "@/components/BulkGrid";
import Kbd from "@/components/Kbd";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { UNIT_BOX, UNIT_PIECE, normalizeUnit } from "@/lib/units";
import { normalizeTileSize } from "@/lib/tileSizes";

export default function BulkUpload() {
  const { setDraft, draft } = useApp();
  const [rows, setRows] = useState(() => []);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [gridKey, setGridKey] = useState(0);
  const pageRef = useRef(null);
  const focusRef = useRef(null);
  const visitedRef = useRef(false);

  // After draft confirm/cancel, remount the grid so Type cell gets autofocus again.
  const prevDraft = useRef(draft);
  useEffect(() => {
    if (prevDraft.current && !draft) {
      focusRef.current = null;
      visitedRef.current = false;
      setGridKey((k) => k + 1);
    }
    prevDraft.current = draft;
  }, [draft]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  // Remember last focused grid control across keep-alive navigations.
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return undefined;
    const onFocusIn = (e) => {
      const el = e.target?.closest?.("[data-rowid][data-field], [data-testid^='bulk-unit-']");
      if (!el || !root.contains(el)) return;
      focusRef.current = el;
      visitedRef.current = true;
    };
    root.addEventListener("focusin", onFocusIn);
    return () => root.removeEventListener("focusin", onFocusIn);
  }, []);

  const focusCaret = useCallback(() => {
    if (draft) return;
    const focusEl = (el) => {
      if (!el || typeof el.focus !== "function") return;
      try {
        el.focus({ focusVisible: true });
      } catch {
        el.focus();
      }
    };
    const saved = focusRef.current;
    if (visitedRef.current && saved && document.contains(saved)) {
      focusEl(saved);
      return;
    }
    const firstType =
      pageRef.current?.querySelector('[data-field="unit"]') ||
      pageRef.current?.querySelector('[data-testid^="bulk-unit-"]');
    if (firstType) {
      focusEl(firstType);
      visitedRef.current = true;
      return;
    }
    focusEl(pageRef.current?.querySelector('[data-testid="bulk-add-row-btn"]'));
  }, [draft]);

  usePageFocus(focusCaret, { enabled: !draft, delay: 80 });

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    try {
      const base64 = await toBase64(file);
      const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      const result = await api.extractStockSheet(base64.split(",")[1], mime);
      const extracted = result.rows || [];
      if (extracted.length === 0) {
        toast.error("Koi product nahi mila. Clearer photo try karein, ya grid me khud daalein.");
        return;
      }
      const idBase = Date.now();
      const mapped = extracted.map((r, i) => {
        const unit = normalizeUnit(r.unit);
        const tile = unit === UNIT_BOX;
        return {
          id: idBase + i,
          ...r,
          unit,
          size: tile ? (normalizeTileSize(r.size) || "") : "",
          piecesPerBox: tile ? (r.piecesPerBox || "") : 1,
          price: r.price ?? "",
        };
      });
      setRows((prev) => {
        const kept = prev.filter((r) => r.name?.trim() || r.code?.trim() || r.qty?.toString().trim());
        return [...kept, ...mapped];
      });
      toast.success(`${mapped.length} items add hue — aur sheet bhi laga sakte hain`);
    } catch (err) {
      toast.error(
        err?.message ||
          "Extraction failed. Try a clearer photo, or check that Gemini is set up on the server.",
      );
    } finally {
      setBusy(false);
    }
  };

  const resetPage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setRows([]);
    setPreview(null);
    setFileName("");
    setBusy(false);
    focusRef.current = null;
    visitedRef.current = false;
    setGridKey((k) => k + 1);
  };

  const confirmBatch = useCallback(() => {
    const validRows = rows.filter(r => r.name?.trim() || r.code?.trim() || r.qty?.toString().trim());

    if (validRows.length === 0) return toast.error("Please enter at least one valid product");

    const hasErrors = validRows.some(r => !r.name?.trim() || !r.qty?.toString().trim());
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
      kind: "bulk_stock", rows: validRows.map((r) => ({
        ...r,
        unit: normalizeUnit(r.unit),
        size: normalizeUnit(r.unit) === UNIT_PIECE ? "" : (normalizeTileSize(r.size) || r.size || ""),
        piecesPerBox: normalizeUnit(r.unit) === UNIT_PIECE ? 1 : (Number(r.piecesPerBox) || 1),
      })),
      title: "Confirm Bulk Stock Intake", subtitle: `${validRows.length} products stock me add honge`,
      summaryRows: validRows.slice(0, 5).map((r) => ({
        label: r.name,
        new: `+${r.qty} ${normalizeUnit(r.unit) === UNIT_PIECE ? "pcs" : "box"}`,
      })),
      onCommitted: resetPage,
    });
  }, [rows, setDraft, preview]);

  useHotkeyScope(SCOPES.BULK);
  useHotkeys(SCOPES.BULK, [
    { keys: KEYS.save, label: "Batch confirm karein", handler: confirmBatch, disabled: rows.length === 0 },
    { keys: KEYS.saveAlt, label: "Batch confirm karein", handler: confirmBatch, disabled: rows.length === 0, hidden: true },
  ]);

  const isPdf = (fileName || "").toLowerCase().endsWith(".pdf");

  return (
    <div ref={pageRef} className="space-y-4 ds-fade" data-testid="bulk-upload-page">

      <label
        data-testid="bulk-file-label"
        className="flex min-h-[5.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-mint/40 bg-white px-4 py-5 text-center hover:bg-mint-soft"
      >
        {busy ? (
          <Loader2 className="h-7 w-7 animate-spin text-mint" />
        ) : preview && !isPdf ? (
          <img src={preview} alt="" className="h-12 w-12 rounded-lg border border-slate-200 object-cover" />
        ) : (
          <Upload className="h-7 w-7 text-mint" />
        )}
        <p className="font-semibold text-slate-700">
          {busy ? "Extracting…" : fileName ? `${fileName} — aur file add karein` : "Photo ya pdf choose karein"}
        </p>
        <p className="text-xs text-slate-400">
          {busy ? "Products grid me add ho rahe hain" : "JPG, PNG, PDF — har nayi file ke products grid ke neeche add honge"}
        </p>
        <input
          data-testid="bulk-file-input"
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={onFile}
        />
      </label>

      <BulkGrid key={gridKey} rows={rows} setRows={setRows} autofocus={false} />

      <button
        data-testid="bulk-confirm-btn"
        onClick={confirmBatch}
        className="flex w-full items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-bold text-white active:scale-95 hover:bg-mint-dark"
      >
        <Check className="h-4 w-4" /> Review &amp; Confirm Batch <Kbd keys={KEYS.save} tone="dark" />
      </button>
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
