import React, { useCallback, useEffect, useRef, useState } from "react";
import NumberInput from "@/components/NumberInput";
import { formatArea, rowAreaSqft } from "@/lib/slab";
import { SQM_TO_SQFT, unitShort } from "@/lib/uom";
import { Plus, Trash2 } from "lucide-react";

const CELL = "w-full rounded-dense border border-border bg-panel px-1.5 py-1 text-right text-sm tabular-nums outline-none focus:border-mint";

function rowDisplayArea(row, measureUnit, areaUnit) {
  const sqft = rowAreaSqft(row.length, row.width, measureUnit);
  if (!(sqft > 0)) return 0;
  return areaUnit === "sqm" ? sqft / SQM_TO_SQFT : sqft;
}

/**
 * SR | Length | Width | area grid. Enter / mobile Next advances
 * Length → Width → next Length, appending a row at the end.
 * Enter on an empty cell copies the cell above first.
 */
export default function SlabMeasureGrid({
  rows,
  onChange,
  measureUnit = "ft",
  areaUnit = "sqft",
  startSr = 1,
  offset = 0,
  pageSize = 0,
  testPrefix = "slab",
  minRows = 8,
  showAddRows = true,
  maxRows = 700,
}) {
  const rootRef = useRef(null);
  const pendingFocusRef = useRef(null);
  const [active, setActive] = useState(null);
  const [kbInset, setKbInset] = useState(0);
  const view = pageSize > 0 ? rows.slice(offset, offset + pageSize) : rows;
  const absIndex = (i) => offset + i;

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;
    const sync = () => {
      setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  const focusCell = useCallback((abs, field) => {
    const el = rootRef.current?.querySelector(
      `[data-testid="${testPrefix}-${field}-${abs}"]`,
    );
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      setActive({ abs, field });
      pendingFocusRef.current = null;
      return;
    }
    pendingFocusRef.current = { abs, field };
  }, [testPrefix]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    focusCell(pending.abs, pending.field);
  }, [rows, focusCell]);

  const setCell = useCallback((index, field, value) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [field]: value } : r));
    const last = next[next.length - 1];
    if (
      last
      && (String(last.length || "").trim() || String(last.width || "").trim())
      && next.length < maxRows
    ) {
      onChange([...next, { length: "", width: "" }]);
    } else {
      onChange(next);
    }
  }, [rows, onChange, maxRows]);

  const advance = useCallback((index, field) => {
    const empty = !String(rows[index]?.[field] ?? "").trim();
    if (empty && index > 0) {
      const above = rows[index - 1]?.[field];
      if (String(above || "").trim()) {
        setCell(index, field, String(above));
      }
    }
    if (field === "length") {
      focusCell(index, "width");
      return;
    }
    const nextRow = index + 1;
    if (nextRow >= rows.length) {
      if (rows.length >= maxRows) return;
      pendingFocusRef.current = { abs: nextRow, field: "length" };
      onChange([...rows, { length: "", width: "" }]);
      return;
    }
    focusCell(nextRow, "length");
  }, [rows, maxRows, onChange, setCell, focusCell]);

  const handleCellKeyDown = (e, index, field) => {
    if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    advance(index, field);
  };

  const addTen = () => {
    onChange([...rows, ...Array.from({ length: 10 }, () => ({ length: "", width: "" }))]);
  };

  const removeRow = (index) => {
    if (rows.length <= 1) {
      onChange([{ length: "", width: "" }]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  const showNextBar = !!active;

  return (
    <div ref={rootRef} className="space-y-2">
      <div className="max-h-[min(52vh,28rem)] overflow-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-canvas">
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              <th className="w-10 px-2 py-1.5 text-left">Sr</th>
              <th className="px-2 py-1.5 text-right">Length</th>
              <th className="px-2 py-1.5 text-right">Width</th>
              <th className="w-24 px-2 py-1.5 text-right">{unitShort(areaUnit)}</th>
              <th className="w-8 px-1 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => {
              const abs = absIndex(i);
              const area = rowDisplayArea(r, measureUnit, areaUnit);
              return (
                <tr key={abs} className="border-t border-border/80">
                  <td className="px-2 py-0.5 tabular-nums text-ink-muted">{startSr + abs}</td>
                  <td className="px-1 py-0.5">
                    <NumberInput
                      data-testid={`${testPrefix}-length-${abs}`}
                      enterKeyHint="next"
                      autoComplete="off"
                      value={r.length}
                      onChange={(v) => setCell(abs, "length", v)}
                      onFocus={() => setActive({ abs, field: "length" })}
                      onKeyDown={(e) => handleCellKeyDown(e, abs, "length")}
                      className={CELL}
                    />
                  </td>
                  <td className="px-1 py-0.5">
                    <NumberInput
                      data-testid={`${testPrefix}-width-${abs}`}
                      enterKeyHint="next"
                      autoComplete="off"
                      value={r.width}
                      onChange={(v) => setCell(abs, "width", v)}
                      onFocus={() => setActive({ abs, field: "width" })}
                      onKeyDown={(e) => handleCellKeyDown(e, abs, "width")}
                      className={CELL}
                    />
                  </td>
                  <td className="px-2 py-0.5 text-right tabular-nums text-ink">
                    {area > 0 ? formatArea(area) : "—"}
                  </td>
                  <td className="px-0.5 py-0.5">
                    {abs > 0 ? (
                      <button
                        type="button"
                        data-flow-skip
                        data-testid={`${testPrefix}-del-${abs}`}
                        onClick={() => removeRow(abs)}
                        className="rounded p-1 text-rose-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Delete row"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {showAddRows ? (
        <button
          type="button"
          data-flow-skip
          data-testid={`${testPrefix}-add-10`}
          onClick={addTen}
          className="inline-flex items-center gap-1.5 rounded-control border border-border bg-canvas px-2.5 py-1.5 text-xs font-semibold text-ink-muted hover:bg-mint-soft"
        >
          <Plus className="h-3.5 w-3.5" /> Add {Math.max(10, minRows)} rows
        </button>
      ) : null}
      {showNextBar ? (
        <div
          className="fixed inset-x-0 z-[70] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
          style={{ bottom: Math.max(kbInset, 72) }}
        >
          <button
            type="button"
            data-flow-skip
            data-testid={`${testPrefix}-next`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => active && advance(active.abs, active.field)}
            className="w-full rounded-control bg-mint py-3 text-sm font-semibold text-white shadow-lg active:scale-[0.99]"
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}
