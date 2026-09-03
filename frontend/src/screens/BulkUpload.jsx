import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import * as api from "@/services/api";
import { toast } from "sonner";
import { Upload, Check, FileText, Sparkles, X, FileImage } from "lucide-react";
import BulkGrid from "@/components/BulkGrid";
import Kbd from "@/components/Kbd";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import { generateStockIntakePDF } from "@/services/billPdf";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { UNIT_BOX, UNIT_PIECE, catalogShowsPpb, catalogShowsSize, normalizeUnit } from "@/lib/units";
import { normalizeTileSize } from "@/lib/tileSizes";
import { mapExtractedPiecesPerBox } from "@/lib/bulkFill";

export default function BulkUpload() {
  const { setDraft, draft, shop } = useApp();
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();
  const [rows, setRows] = useState(() => []);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [gridKey, setGridKey] = useState(0);
  const progressTimer = useRef(null);
  const lastSourceRef = useRef("");
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

  usePageFocus(focusCaret, { enabled: !draft && !pdfUrl, delay: 80 });

  const stopProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };
  useEffect(() => stopProgressTimer, []);

  /** Stage a file; extraction only starts when the user presses Extract. */
  const pickFile = (file) => {
    if (!file) return;
    const okType = file.type?.startsWith("image/") || file.type === "application/pdf" || /\.(pdf|jpe?g|png|webp)$/i.test(file.name);
    if (!okType) return toast.error("Sirf JPG, PNG ya PDF chalega");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setFileName(file.name);
    setPendingFile(file);
    setProgress(0);
    setStage("");
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    pickFile(file);
  };

  const clearPending = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFileName("");
    setPendingFile(null);
    setProgress(0);
    setStage("");
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    pickFile(e.dataTransfer?.files?.[0]);
  };

  /**
   * Progress model: reading + upload are real steps; the AI call is a single
   * request with no server-side progress, so we ramp 25→92% on an easing curve
   * sized to a typical extraction and snap to 100% when the response lands.
   */
  const startAiRamp = () => {
    const t0 = Date.now();
    const EXPECTED_MS = 22000;
    stopProgressTimer();
    progressTimer.current = setInterval(() => {
      const elapsed = Date.now() - t0;
      const frac = 1 - Math.exp(-elapsed / (EXPECTED_MS / 2.5));
      setProgress((p) => Math.max(p, Math.min(92, 25 + Math.round(frac * 67))));
    }, 250);
  };

  const runExtract = async () => {
    const file = pendingFile;
    if (!file || busy) return;
    setBusy(true);
    setProgress(2);
    setStage("File padh rahe hain…");
    lastSourceRef.current = file.name;
    try {
      const base64 = await toBase64(file);
      setProgress(15);
      setStage("Server pe bhej rahe hain…");
      const mime = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
      await new Promise((r) => setTimeout(r, 120));
      setProgress(25);
      setStage("AI products padh raha hai…");
      startAiRamp();
      const result = await api.extractStockSheet(base64.split(",")[1], mime);
      stopProgressTimer();
      setProgress(95);
      setStage("Grid me add ho rahe hain…");
      const extracted = result.rows || [];
      if (extracted.length === 0) {
        toast.error("Koi product nahi mila. Clearer photo try karein, ya grid me khud daalein.");
        return;
      }
      const idBase = Date.now();
      const mapped = extracted.map((r, i) => {
        const unit = normalizeUnit(r.unit);
        const category = r.category || (unit === UNIT_PIECE ? "sanitaryware" : "tiles");
        const tile = catalogShowsSize({ unit, category });
        return {
          id: idBase + i,
          ...r,
          unit,
          category,
          size: tile ? (normalizeTileSize(r.size) || "") : (r.size || ""),
          piecesPerBox: catalogShowsPpb({ unit, category }) ? mapExtractedPiecesPerBox(unit, r.piecesPerBox) : 1,
          price: r.price ?? "",
        };
      });
      setRows((prev) => {
        const kept = prev.filter((r) => r.name?.trim() || r.code?.trim() || r.qty?.toString().trim());
        return [...kept, ...mapped];
      });
      setProgress(100);
      setStage("Ho gaya");
      toast.success(`${mapped.length} items add hue — aur sheet bhi laga sakte hain`);
      // Done: drop the staged file so the box is ready for the next sheet.
      setTimeout(() => clearPending(), 500);
    } catch (err) {
      stopProgressTimer();
      setProgress(0);
      setStage("");
      toast.error(
        err?.message ||
          "Extraction failed. Try a clearer photo, or check that Gemini is set up on the server.",
      );
    } finally {
      stopProgressTimer();
      setBusy(false);
    }
  };

  const resetPage = () => {
    clearPending();
    setRows([]);
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
      (r) => catalogShowsSize(r) && !String(r.size || "").trim()
    );
    if (tileMissingSize) return toast.error("Tiles ke liye size choose karein");

    const tileMissingPpb = validRows.some(
      (r) => catalogShowsPpb(r) && !(Number(r.piecesPerBox) > 0)
    );
    if (tileMissingPpb) return toast.error("Tiles ke liye Pieces/box daaliye");

    setDraft({
      kind: "bulk_stock", rows: validRows.map((r) => ({
        ...r,
        unit: normalizeUnit(r.unit),
        category: r.category || "",
        size: catalogShowsSize(r) ? (normalizeTileSize(r.size) || r.size || "") : (r.size || ""),
        piecesPerBox: catalogShowsPpb(r) ? (Number(r.piecesPerBox) || 1) : 1,
      })),
      title: "Confirm Bulk Stock Intake", subtitle: `${validRows.length} products stock me add honge`,
      summaryRows: validRows.slice(0, 5).map((r) => ({
        label: r.name,
        new: `+${r.qty} ${normalizeUnit(r.unit) === UNIT_PIECE ? "pcs" : normalizeUnit(r.unit)}`,
      })),
      onCommitted: resetPage,
    });
  }, [rows, setDraft, preview]);

  const reviewPdf = useCallback(() => {
    const filled = rows.filter((r) => r.name?.trim() || r.code?.trim() || r.qty?.toString().trim());
    if (filled.length === 0) return toast.error("Pehle kam se kam ek product daaliye");
    showPdf(generateStockIntakePDF({ shop, rows, sourceFile: lastSourceRef.current }, "bloburl"));
  }, [rows, shop, showPdf]);

  useHotkeyScope(SCOPES.BULK, { enabled: !pdfUrl });
  useHotkeys(SCOPES.BULK, [
    { keys: KEYS.save, label: "Batch confirm karein", handler: confirmBatch, disabled: rows.length === 0 },
    { keys: KEYS.saveAlt, label: "Batch confirm karein", handler: confirmBatch, disabled: rows.length === 0, hidden: true },
    { keys: KEYS.preview, label: "Review PDF", handler: reviewPdf, disabled: rows.length === 0 },
  ]);

  const isPdf = (fileName || "").toLowerCase().endsWith(".pdf");

  return (
    <div ref={pageRef} className="space-y-4 ds-fade" data-testid="bulk-upload-page">

      {busy ? (
        /* ── Extracting: staged progress 0–100% ── */
        <div
          data-testid="bulk-progress"
          className="rounded-2xl border border-mint/40 bg-white px-4 py-4"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-5 w-5 shrink-0 animate-pulse text-mint" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-700">{stage || "Extracting…"}</p>
                <p className="truncate text-xs text-slate-400">{fileName}</p>
              </div>
            </div>
            <span className="shrink-0 font-mono text-lg font-bold tabular-nums text-mint-dark" data-testid="bulk-progress-pct">
              {progress}%
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-mint transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : pendingFile ? (
        /* ── File staged: confirm before spending an AI call ── */
        <div data-testid="bulk-file-staged" className="rounded-2xl border-2 border-mint/40 bg-white p-3">
          <div className="flex items-center gap-3">
            {preview && !isPdf ? (
              <img src={preview} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
                <FileText className="h-6 w-6 text-slate-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-slate-700">{fileName}</p>
              <p className="text-xs text-slate-400">
                {isPdf ? "PDF" : "Photo"} · {(pendingFile.size / 1024).toFixed(0)} KB — sahi file hai? Extract dabao.
              </p>
            </div>
            <button
              type="button"
              data-testid="bulk-file-clear"
              onClick={clearPending}
              className="shrink-0 rounded-control p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
              aria-label="File hatao"
              title="File hatao"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-control border border-border px-3 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50">
              <FileImage className="h-4 w-4" /> Doosri file
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
            </label>
            <button
              type="button"
              data-testid="bulk-extract-btn"
              onClick={runExtract}
              className="flex items-center justify-center gap-2 rounded-control bg-mint px-3 py-2.5 text-sm font-bold text-white active:scale-95 hover:bg-mint-dark"
            >
              <Sparkles className="h-4 w-4" /> Extract karo
            </button>
          </div>
        </div>
      ) : (
        /* ── Empty: pick or drop a file ── */
        <label
          data-testid="bulk-file-label"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex min-h-[5.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
            dragOver ? "border-mint bg-mint-soft" : "border-mint/40 bg-white hover:bg-mint-soft"
          }`}
        >
          <Upload className="h-7 w-7 text-mint" />
          <p className="font-semibold text-slate-700">
            {dragOver ? "Yahan chhodo" : rows.length ? "Aur sheet add karein" : "Photo ya pdf choose karein"}
          </p>
          <p className="text-xs text-slate-400">
            JPG, PNG, PDF — drag &amp; drop bhi chalega. Har nayi file ke products grid ke neeche add honge.
          </p>
          <input
            data-testid="bulk-file-input"
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={onFile}
          />
        </label>
      )}

      <BulkGrid key={gridKey} rows={rows} setRows={setRows} autofocus={false} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          data-testid="bulk-review-btn"
          onClick={reviewPdf}
          className="flex w-full items-center justify-center gap-2 rounded-control border border-mint/40 bg-mint-soft px-4 py-3 font-bold text-mint-dark active:scale-95 hover:bg-mint/20"
        >
          <FileText className="h-4 w-4" /> Review (PDF) <Kbd keys={KEYS.preview} />
        </button>
        <button
          type="button"
          data-testid="bulk-confirm-btn"
          onClick={confirmBatch}
          className="flex w-full items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-bold text-white active:scale-95 hover:bg-mint-dark"
        >
          <Check className="h-4 w-4" /> Confirm Batch <Kbd keys={KEYS.save} tone="dark" />
        </button>
      </div>

      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={closePdf} title="Stock intake — review" />
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
