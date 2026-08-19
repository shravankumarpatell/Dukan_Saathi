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

/**
 * Sq-ft → boxes/pcs calculator. `sqftFor.item` needs name, piecesPerBox, rate, size.
 * Enter on the last field (or Apply) calls onApply with the computed result.
 */
export default function SqftDialog({ sqftFor, onClose, onApply }) {
  const [mode, setMode] = useState("lw");
  const [d, setD] = useState({
    roomArea: "", roomLengthFt: "", roomWidthFt: "",
    size: "", wastagePct: "",
  });
  const open = useVisibleOpen(!!sqftFor);

  const lastRes = useRef(null);
  const apply = useCallback(() => { if (lastRes.current) onApply(lastRes.current); }, [onApply]);

  useHotkeyScope("modal:sqft", { exclusive: true, enabled: open });
  useHotkeys("modal:sqft", [
    { keys: KEYS.cancel, label: "Cancel", handler: onClose },
  ]);
  const flow = useFormFlow({ onSave: apply, onCancel: onClose });

  useEffect(() => {
    if (!open) return undefined;
    setMode("lw");
    setD({
      roomArea: "", roomLengthFt: "", roomWidthFt: "",
      size: sqftFor?.item?.size || "",
      wastagePct: "",
    });
    const t = setTimeout(() => flow.focusFirst(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sqftFor?.item?.name, sqftFor?.item?.size]);

  if (!sqftFor) return null;
  const it = sqftFor.item;
  const input = mode === "area"
    ? { roomArea: d.roomArea }
    : { roomLengthFt: d.roomLengthFt, roomWidthFt: d.roomWidthFt };
  const inches = tileSizeToInches(d.size);
  const res = sqftCalc({
    ...input,
    ...inches,
    wastagePct: d.wastagePct,
    piecesPerBox: it.piecesPerBox || 1,
    ratePerBox: it.rate,
  });
  lastRes.current = res;

  const F = (k, l) => (
    <div key={k}>
      <label className="text-xs font-semibold text-slate-600">{l}</label>
      <NumberInput
        data-testid={`sqft-${k}`}
        value={d[k]}
        onChange={(v) => setD({ ...d, [k]: v })}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm tabular-nums"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="sqft-dialog" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>Sq-ft Calculator — {it.name}</DialogTitle></DialogHeader>
        <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="space-y-3">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            testPrefix="sqft-mode"
            className="grid grid-cols-2 gap-2"
            options={[
              { value: "lw", label: "Length × Width" },
              { value: "area", label: "Direct sq-ft" },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            {mode === "area"
              ? F("roomArea", "Area (sq-ft)")
              : (<>{F("roomLengthFt", "Room length (ft)")}{F("roomWidthFt", "Room width (ft)")}</>)}
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600">Tile size</label>
              <TileSizeSelect testId="sqft-size" value={d.size} onChange={(v) => setD({ ...d, size: v })} />
            </div>
            {F("wastagePct", "Wastage %")}
          </div>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3 text-sm">
          <div className="flex justify-between"><span>Area</span><b>{res.roomArea} sq-ft</b></div>
          <div className="flex justify-between"><span>Tiles needed</span><b>{res.tilesNeeded}</b></div>
          <div className="flex justify-between"><span>Boxes + Pcs</span><b data-testid="sqft-boxes">{res.boxesNeeded} box + {res.loosePieces} pc</b></div>
          <div className="flex justify-between"><span>Price</span><b>{money(res.price)}</b></div>
        </div>
        <button
          data-testid="sqft-apply-btn"
          onClick={() => onApply(res)}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95"
        >
          Use {res.boxesNeeded} box + {res.loosePieces} pc <Kbd keys="enter" tone="dark" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
