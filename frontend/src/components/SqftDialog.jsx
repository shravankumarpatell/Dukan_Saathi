import React, { useState, useEffect, useRef, useCallback } from "react";
import NumberInput from "@/components/NumberInput";
import TileSizeSelect from "@/components/TileSizeSelect";
import Kbd from "@/components/Kbd";
import SegmentedControl from "@/components/SegmentedControl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import { money, sqftCalc } from "@/lib/calc";
import { tileSizeToInches } from "@/lib/tileSizes";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { KEYS } from "@/lib/keymap";
import { Calculator } from "lucide-react";

function Field({ label, htmlFor, children, className = "" }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-ink-muted">{label}</label>
      {children}
    </div>
  );
}

/**
 * Sq-ft → boxes/pcs calculator. `sqftFor.item` needs name, piecesPerBox, rate, size.
 * Enter on the last field (or Apply) calls onApply with the computed result.
 * Layout matches the dashboard Quick sq-ft calculator.
 */
export default function SqftDialog({ sqftFor, onClose, onApply }) {
  const [mode, setMode] = useState("lw");
  const [d, setD] = useState({
    roomArea: "", roomLengthFt: "", roomWidthFt: "",
    size: "",
  });
  const open = useVisibleOpen(!!sqftFor);
  const pendingMeasure = useRef(false);

  const lastRes = useRef(null);
  const apply = useCallback(() => { if (lastRes.current) onApply(lastRes.current); }, [onApply]);

  useHotkeyScope("modal:sqft", { exclusive: true, enabled: open });
  useHotkeys("modal:sqft", [
    { keys: KEYS.cancel, label: "Cancel", handler: onClose },
  ]);
  const flow = useFormFlow({ onSave: apply, onCancel: onClose });

  const focusMeasure = useCallback(() => {
    const root = flow.containerRef.current;
    const el =
      root?.querySelector('[data-testid="sqft-roomArea"]') ||
      root?.querySelector('[data-testid="sqft-roomLengthFt"]');
    el?.focus();
  }, [flow.containerRef]);

  useEffect(() => {
    if (!open) return undefined;
    setMode("lw");
    setD({
      roomArea: "", roomLengthFt: "", roomWidthFt: "",
      size: sqftFor?.item?.size || "",
    });
    const t = setTimeout(() => flow.focusFirst(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sqftFor?.item?.name, sqftFor?.item?.size]);

  useEffect(() => {
    if (!pendingMeasure.current) return;
    pendingMeasure.current = false;
    focusMeasure();
  }, [mode, focusMeasure]);

  const focusMode = useCallback(() => {
    const root = flow.containerRef.current;
    const el =
      root?.querySelector(`[data-testid="sqft-mode-${mode}"]`) ||
      root?.querySelector('[data-testid="sqft-mode-lw"]');
    el?.focus();
  }, [flow.containerRef, mode]);

  const handleSqftKeys = useCallback((e) => {
    if (e.key === "Enter" && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const id = e.target?.getAttribute?.("data-testid") || "";
      if (id === "sqft-roomLengthFt" || id === "sqft-roomArea") {
        e.preventDefault();
        e.stopPropagation();
        focusMode();
        return;
      }
    }
    flow.handleKeyDown(e);
  }, [flow, focusMode]);

  if (!sqftFor) return null;
  const it = sqftFor.item;
  const input = mode === "area"
    ? { roomArea: d.roomArea }
    : { roomLengthFt: d.roomLengthFt, roomWidthFt: d.roomWidthFt };
  const inches = tileSizeToInches(d.size);
  const res = sqftCalc({
    ...input,
    ...inches,
    wastagePct: 0,
    piecesPerBox: it.piecesPerBox || 1,
    ratePerBox: it.rate,
  });
  lastRes.current = res;
  const quoted = res.tilesNeeded > 0;
  const numCls = "w-full rounded-control border border-border bg-canvas/40 px-3 py-2 text-right text-sm tabular-nums outline-none hover:border-mint focus:border-mint";
  const sizeCls = "ds-combo bg-canvas/40";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[70] gap-4 sm:max-w-xl" overlayClassName="z-[65]" data-testid="sqft-dialog" onCloseAutoFocus={(e) => e.preventDefault()}>
        <div ref={flow.containerRef} onKeyDown={handleSqftKeys} className="space-y-4">
          <DialogHeader>
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="flex items-center gap-2 text-left font-display text-base font-semibold text-ink">
                  <Calculator className="h-4 w-4 shrink-0 text-ink-muted" />
                  Quick sq-ft calculator
                </DialogTitle>
                <p className="mt-1 truncate text-xs text-ink-muted">{it.name}</p>
              </div>
              <SegmentedControl
                value={mode}
                onChange={setMode}
                testPrefix="sqft-mode"
                className="grid w-full grid-cols-2 gap-1 sm:w-44"
                showArrowHint={false}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey) return;
                  if (e.defaultPrevented) pendingMeasure.current = true;
                }}
                options={[
                  { value: "lw", label: "L × W" },
                  { value: "area", label: "Sq-ft" },
                ]}
              />
            </div>
          </DialogHeader>

          <div className={mode === "area" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-2 gap-3 sm:grid-cols-3"}>
            {mode === "area" ? (
              <Field label="Area (sq-ft)" htmlFor="sqft-roomArea">
                <NumberInput id="sqft-roomArea" data-testid="sqft-roomArea" value={d.roomArea} onChange={(v) => setD({ ...d, roomArea: v })} className={numCls} />
              </Field>
            ) : (
              <>
                <Field label="Length (ft)" htmlFor="sqft-roomLengthFt">
                  <NumberInput id="sqft-roomLengthFt" data-testid="sqft-roomLengthFt" value={d.roomLengthFt} onChange={(v) => setD({ ...d, roomLengthFt: v })} className={numCls} />
                </Field>
                <Field label="Width (ft)" htmlFor="sqft-roomWidthFt">
                  <NumberInput id="sqft-roomWidthFt" data-testid="sqft-roomWidthFt" value={d.roomWidthFt} onChange={(v) => setD({ ...d, roomWidthFt: v })} className={numCls} />
                </Field>
              </>
            )}
            <Field label="Tile size">
              <TileSizeSelect testId="sqft-size" value={d.size} onChange={(v) => setD({ ...d, size: v })} className={sizeCls} />
            </Field>
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-canvas/50">
            <div className="border-r border-border px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Area</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">
                <span>{res.roomArea}</span>
                <span className="ml-1 font-sans text-xs font-normal text-ink-muted">sq-ft</span>
              </p>
            </div>
            <div className="border-r border-border px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Tiles</p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-ink">{res.tilesNeeded}</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">Boxes + loose</p>
              <p className={`mt-1 font-mono text-lg font-semibold tabular-nums ${quoted ? "text-ink" : "text-ink-muted/50"}`} data-testid="sqft-boxes">
                {res.boxesNeeded} + {res.loosePieces}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          data-testid="sqft-apply-btn"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onApply(res);
          }}
          className="flex items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-semibold text-white hover:bg-mint-dark active:scale-95"
        >
          Use {res.boxesNeeded} box + {res.loosePieces} pc
          {quoted && <span className="font-mono text-sm font-normal opacity-90">{money(res.price)}</span>}
          <Kbd keys="enter" tone="dark" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
