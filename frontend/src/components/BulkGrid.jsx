import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2, ChevronsDown } from "lucide-react";
import { toast } from "sonner";
import { sanitizeNumber } from "@/components/NumberInput";
import SegmentedControl from "@/components/SegmentedControl";
import TileSizeSelect from "@/components/TileSizeSelect";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Kbd from "@/components/Kbd";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { SCOPES, KEYS } from "@/lib/keymap";
import { normalizeTileSize } from "@/lib/tileSizes";
import {
  applyColumnFill,
  coerceFillValue,
  FIELD_LABELS,
  fillDownFrom,
  formatFillToast,
  hasColumnRange,
  isCellEmpty,
  isFillableField,
  isRowEligible,
  selectedRowIds,
} from "@/lib/bulkFill";
import {
  UNIT_BOX, UNIT_PIECE, isBoxUnit, isPieceUnit, isTileOnlyCatalogField, applyCatalogUnitChange,
} from "@/lib/units";

// Type first so the cashier picks tiles/sanitary before filling the row.
const FIELDS = ["unit", "name", "code", "company", "size", "piecesPerBox", "qty", "price"];
const NUMERIC_FIELDS = new Set(["qty", "price", "piecesPerBox"]);
const HEADER_LABELS = {
  unit: "Type",
  name: "Product Name",
  code: "Code",
  company: "Company",
  size: "Size",
  piecesPerBox: "Pcs/box",
  qty: "Qty",
  price: "Price",
};
const REQUIRED_HEADERS = new Set(["unit", "name", "qty"]);

export const emptyRow = (id) => ({
  id, name: "", code: "", company: "", size: "",
  unit: UNIT_BOX, piecesPerBox: "", qty: "", price: "",
});

function snapshotRows(rows) {
  return rows.map((r) => ({ ...r }));
}

function seedFillValue(rows, field, focused) {
  if (focused?.field === field) {
    const row = rows.find((r) => r.id === focused.rowId);
    if (row && isRowEligible(row, field) && !isCellEmpty(row, field)) {
      return field === "unit" ? row.unit : String(row[field] ?? "");
    }
  }
  const hit = rows.find((r) => isRowEligible(r, field) && !isCellEmpty(r, field));
  if (hit) return field === "unit" ? hit.unit : String(hit[field] ?? "");
  return field === "unit" ? UNIT_BOX : "";
}

export default function BulkGrid({ rows, setRows, autofocus = true }) {
  const tableRef = useRef(null);
  const seededFocus = useRef(false);
  const undoRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [focused, setFocused] = useState(null);
  const [fill, setFill] = useState(null);

  useHotkeyScope("modal:bulk-fill", { exclusive: true, enabled: !!fill });

  // Autofocus the Type control of the first row once it exists (first visit only).
  useEffect(() => {
    if (!autofocus || seededFocus.current || rows.length === 0) return;
    seededFocus.current = true;
    const t = setTimeout(() => {
      const el = cellAt(rows[0].id, "unit");
      try {
        el?.focus({ focusVisible: true });
      } catch {
        el?.focus();
      }
    }, 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, autofocus]);

  const commitFillResult = useCallback((result, field, value) => {
    if (result.count === 0) {
      toast.error("Koi row nahi mili");
      return false;
    }
    setRows(result.rows);
    toast.success(formatFillToast(result.count, field, value), {
      action: {
        label: <span data-testid="bulk-fill-undo">Undo</span>,
        onClick: () => {
          if (undoRef.current) setRows(undoRef.current);
        },
      },
    });
    return true;
  }, [setRows]);

  const runFillDown = useCallback(() => {
    const field = (hasColumnRange(selection) ? selection.field : focused?.field);
    if (!field || rows.length === 0) return;
    undoRef.current = snapshotRows(rows);
    let selectedIds = [];
    let startIndex = focused?.index ?? 0;
    if (selection && selection.field === field && hasColumnRange(selection)) {
      selectedIds = selectedRowIds(rows, selection.startIndex, selection.endIndex);
      startIndex = Math.min(selection.startIndex, selection.endIndex);
    } else if (focused?.field === field) {
      startIndex = focused.index;
    }
    const source = rows[startIndex];
    const value = field === "unit" ? source?.unit : source?.[field];
    const result = fillDownFrom({ rows, field, startIndex, selectedIds });
    commitFillResult(result, field, field === "unit" ? value : coerceFillValue(field, value));
  }, [commitFillResult, focused, rows, selection]);

  useHotkeys(SCOPES.BULK, [
    {
      keys: KEYS.fillDown,
      label: "Column fill-down",
      handler: runFillDown,
      allowInInput: true,
      disabled: rows.length === 0 || !!fill,
    },
  ]);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (field === "unit") return applyCatalogUnitChange(r, value);
      const next = NUMERIC_FIELDS.has(field) ? sanitizeNumber(value) : value;
      return { ...r, [field]: next };
    }));
  };

  const addRow = () => {
    const id = Date.now();
    setRows((prev) => [...prev, emptyRow(id)]);
    setTimeout(() => {
      const el = tableRef.current?.querySelector(`[data-rowid="${id}"][data-field="unit"]`)
        || tableRef.current?.querySelector(`[data-testid="bulk-unit-${id}-box"]`);
      try {
        el?.focus({ focusVisible: true });
      } catch {
        el?.focus();
      }
    }, 50);
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelection(null);
    setFocused((cur) => (cur?.rowId === id ? null : cur));
  };

  const handlePaste = (e, rowId, fieldIndex) => {
    const text = e.clipboardData.getData("text");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;

    e.preventDefault();
    const clipboardRows = text.split(/\r?\n/).filter((r) => r.trim());

    setRows((prev) => {
      const newRows = [...prev];
      const startIndex = newRows.findIndex((r) => r.id === rowId);
      if (startIndex === -1) return prev;

      clipboardRows.forEach((rowStr, i) => {
        const cells = rowStr.split("\t");
        const targetRowIndex = startIndex + i;
        if (!newRows[targetRowIndex]) newRows.push(emptyRow(Date.now() + i));

        cells.forEach((cellVal, j) => {
          const targetField = FIELDS[fieldIndex + j];
          if (!targetField || !cellVal) return;
          const trimmed = cellVal.trim();
          if (targetField === "unit") {
            const lower = trimmed.toLowerCase();
            const unit =
              lower.startsWith("p") || lower.includes("sanit") || lower.includes("piece")
                ? UNIT_PIECE : UNIT_BOX;
            newRows[targetRowIndex] = applyCatalogUnitChange(newRows[targetRowIndex], unit);
          } else if (isTileOnlyCatalogField(targetField) && isPieceUnit(newRows[targetRowIndex])) {
            return;
          } else if (targetField === "size") {
            newRows[targetRowIndex][targetField] = normalizeTileSize(trimmed) || trimmed;
          } else if (NUMERIC_FIELDS.has(targetField)) {
            newRows[targetRowIndex][targetField] = sanitizeNumber(trimmed);
          } else {
            newRows[targetRowIndex][targetField] = trimmed;
          }
        });
      });
      return newRows;
    });
  };

  const cellAt = (rowId, field) =>
    tableRef.current?.querySelector(`[data-rowid="${rowId}"][data-field="${field}"]`);

  /** Step sideways within a row, skipping Size and Pcs/box on sanitary lines. */
  const moveWithinRow = (id, fieldIndex, dir) => {
    const row = rows.find((r) => r.id === id);
    let fi = fieldIndex + dir;
    while (FIELDS[fi] && isTileOnlyCatalogField(FIELDS[fi]) && isPieceUnit(row)) fi += dir;
    return FIELDS[fi] ? cellAt(id, FIELDS[fi]) : null;
  };

  const markFocus = (id, field, index) => {
    setFocused({ rowId: id, field, index });
  };

  const onCellPointerDown = (e, field, index) => {
    if (e.button != null && e.button !== 0) return;
    const id = rows[index]?.id;
    if (id == null) return;
    if (e.shiftKey) {
      e.preventDefault();
      setSelection((prev) => {
        if (prev && prev.field === field) {
          return { field, startIndex: prev.startIndex, endIndex: index };
        }
        const anchor = focused?.field === field ? focused.index : index;
        return { field, startIndex: anchor, endIndex: index };
      });
      markFocus(id, field, index);
      return;
    }
    setSelection({ field, startIndex: index, endIndex: index });
    markFocus(id, field, index);
  };

  const handleKeyDown = (e, id, fieldIndex) => {
    // ↑/↓ on Type are owned by SegmentedControl (cycle options) — don't walk rows.
    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && FIELDS[fieldIndex] === "unit") {
      return;
    }

    // ↑/↓ walk the same column, spreadsheet style.
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const index = rows.findIndex((r) => r.id === id);
      const target = rows[index + (e.key === "ArrowDown" ? 1 : -1)];
      if (!target) return;
      e.preventDefault();
      const field = FIELDS[fieldIndex];
      const nextIndex = index + (e.key === "ArrowDown" ? 1 : -1);
      const cell = cellAt(target.id, field) || cellAt(target.id, "unit");
      cell?.focus();
      markFocus(target.id, field, nextIndex);
      return;
    }

    // Alt+X drops the line you're standing on (keep at least one row).
    if (e.altKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      e.stopPropagation();
      if (rows.length === 0) return;
      const index = rows.findIndex((r) => r.id === id);
      const neighbour = rows[index + 1] || rows[index - 1];
      removeRow(id);
      if (neighbour) setTimeout(() => cellAt(neighbour.id, "unit")?.focus(), 20);
      return;
    }

    if (e.key !== "Enter") return;
    e.preventDefault();

    if (e.shiftKey) {
      moveWithinRow(id, fieldIndex, -1)?.focus();
      return;
    }

    if (fieldIndex === FIELDS.length - 1) {
      const index = rows.findIndex((r) => r.id === id);
      if (index === rows.length - 1) addRow();
      else cellAt(rows[index + 1].id, "unit")?.focus();
      return;
    }
    moveWithinRow(id, fieldIndex, 1)?.focus();
  };

  const openFill = (field) => {
    if (rows.length === 0) return toast.error("Pehle rows add karein");
    const rangeOnField = hasColumnRange(selection) && selection.field === field;
    setFill({
      field,
      value: seedFillValue(rows, field, focused),
      mode: rangeOnField ? "selected" : "empty",
    });
  };

  const applyFillDialog = () => {
    if (!fill) return;
    if (fill.field !== "unit" && !String(fill.value ?? "").trim()) {
      toast.error("Value daaliye");
      return;
    }
    undoRef.current = snapshotRows(rows);
    const selectedIds =
      hasColumnRange(selection) && selection.field === fill.field
        ? selectedRowIds(rows, selection.startIndex, selection.endIndex)
        : [];
    const value = fill.field === "unit" ? fill.value : coerceFillValue(fill.field, fill.value);
    const result = applyColumnFill({
      rows,
      field: fill.field,
      value: fill.value,
      mode: fill.mode,
      selectedIds,
    });
    if (commitFillResult(result, fill.field, value)) setFill(null);
  };

  const applyFocusedToEmpty = () => {
    if (!focused) return;
    const row = rows.find((r) => r.id === focused.rowId);
    if (!row || !isFillableField(focused.field) || !isRowEligible(row, focused.field)) return;
    const raw = focused.field === "unit" ? row.unit : row[focused.field];
    if (focused.field !== "unit" && isCellEmpty(row, focused.field)) {
      toast.error("Pehle is cell me value daaliye");
      return;
    }
    undoRef.current = snapshotRows(rows);
    const value = focused.field === "unit" ? raw : coerceFillValue(focused.field, raw);
    const result = applyColumnFill({
      rows,
      field: focused.field,
      value: raw,
      mode: "empty",
    });
    commitFillResult(result, focused.field, value);
  };

  const rangeOnFillField = fill && hasColumnRange(selection) && selection.field === fill.field;
  const focusedRow = focused ? rows.find((r) => r.id === focused.rowId) : null;
  const showMobileFill =
    !!focused &&
    !!focusedRow &&
    isFillableField(focused.field) &&
    isRowEligible(focusedRow, focused.field);
  const mobileValueLabel = !focusedRow || !focused
    ? ""
    : focused.field === "unit"
      ? (isBoxUnit(focusedRow) ? "Tiles" : "Sanitary")
      : String(focusedRow[focused.field] ?? "").trim() || "—";

  const cellSelected = (field, index) => {
    if (!selection || selection.field !== field) return false;
    const lo = Math.min(selection.startIndex, selection.endIndex);
    const hi = Math.max(selection.startIndex, selection.endIndex);
    return index >= lo && index <= hi;
  };

  return (
    <div className="ds-panel overflow-hidden">
      {rows.length > 0 && (
        <p className="px-3 pt-2 text-[11px] text-ink-muted">
          Column header pe tap karke fill. Phone: value type karo, phir Sab pe lagaao.
          <span className="hidden lg:inline">
            {" "}Shift+click range · <Kbd keys={KEYS.fillDown} />
          </span>
        </p>
      )}
      <div className="overflow-x-auto p-1">
        <table className="w-full text-sm" ref={tableRef}>
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
              <th className="w-10 bg-slate-50 p-3 text-center">#</th>
              {FIELDS.map((field) => {
                const label = HEADER_LABELS[field];
                const required = REQUIRED_HEADERS.has(field);
                const stickyName = field === "name";
                return (
                  <th
                    key={field}
                    className={
                      stickyName
                        ? "sticky left-0 z-20 min-w-[180px] bg-slate-50 p-3 shadow-[4px_0_8px_-4px_rgba(27,54,93,0.12)]"
                        : field === "unit"
                          ? "min-w-[160px] p-3"
                          : field === "size"
                            ? "min-w-[170px] p-3"
                            : "min-w-[90px] p-3"
                    }
                  >
                    {isFillableField(field) ? (
                      <button
                        type="button"
                        data-testid={`bulk-fill-header-${field}`}
                        onClick={() => openFill(field)}
                        className="inline-flex items-center gap-1 uppercase tracking-wider text-slate-500 hover:text-mint-dark"
                        title="Column fill"
                      >
                        {label}{required ? "*" : ""}
                        <ChevronsDown className="h-3 w-3 opacity-60" />
                      </button>
                    ) : (
                      <span>{label}{required ? "*" : ""}</span>
                    )}
                  </th>
                );
              })}
              <th className="w-[50px] p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, index) => {
              const isTile = isBoxUnit(r);
              return (
                <tr key={r.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="p-2 text-center text-xs text-slate-400">{index + 1}</td>

                  {FIELDS.map((field, fieldIdx) => {
                    const selected = cellSelected(field, index);
                    const stickyName = field === "name";
                    const tdCls = [
                      "p-1",
                      selected ? "bg-mint-soft" : "",
                      stickyName
                        ? `sticky left-0 z-10 shadow-[4px_0_8px_-4px_rgba(27,54,93,0.12)] ${selected ? "bg-mint-soft" : "bg-white group-hover:bg-slate-50/50"}`
                        : "",
                    ].filter(Boolean).join(" ");
                    return (
                      <td
                        key={field}
                        className={tdCls}
                        onPointerDown={(e) => onCellPointerDown(e, field, index)}
                        onFocus={() => markFocus(r.id, field, index)}
                      >
                        {field === "unit" ? (
                          <SegmentedControl
                            value={isTile ? UNIT_BOX : UNIT_PIECE}
                            onChange={(v) => updateRow(r.id, "unit", v)}
                            testPrefix={`bulk-unit-${r.id}`}
                            showArrowHint={false}
                            className="grid grid-cols-2 gap-1"
                            selectedAttrs={{ "data-rowid": r.id, "data-field": "unit" }}
                            onKeyDown={(e) => handleKeyDown(e, r.id, fieldIdx)}
                            options={[
                              { value: UNIT_BOX, label: "Tiles" },
                              { value: UNIT_PIECE, label: "Sanitary" },
                            ]}
                          />
                        ) : isTileOnlyCatalogField(field) && !isTile ? (
                          <span className="block min-h-11 px-2 py-2 text-xs text-slate-300">—</span>
                        ) : field === "size" ? (
                          <TileSizeSelect
                            testId={`bulk-size-${r.id}`}
                            value={r.size || ""}
                            onChange={(v) => updateRow(r.id, "size", v)}
                            data-rowid={r.id}
                            data-field="size"
                            onPaste={(e) => handlePaste(e, r.id, fieldIdx)}
                            onKeyDown={(e) => handleKeyDown(e, r.id, fieldIdx)}
                            className="flex min-h-11 min-w-[150px] items-center gap-1 rounded-control border border-transparent bg-transparent px-1 py-1 focus-within:border-mint/40 focus-within:bg-white focus-within:ring-2 focus-within:ring-mint/20"
                            inputClassName="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
                          />
                        ) : (
                          <input
                            data-rowid={r.id}
                            data-field={field}
                            type="text"
                            inputMode={NUMERIC_FIELDS.has(field) ? "decimal" : "text"}
                            value={r[field] || ""}
                            onFocus={() => markFocus(r.id, field, index)}
                            onChange={(e) => updateRow(r.id, field, e.target.value)}
                            onPaste={(e) => handlePaste(e, r.id, fieldIdx)}
                            onKeyDown={(e) => {
                              if (NUMERIC_FIELDS.has(field) && (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-") && !e.altKey && !e.ctrlKey && !e.metaKey) {
                                e.preventDefault();
                              }
                              handleKeyDown(e, r.id, fieldIdx);
                            }}
                            placeholder={
                              field === "name" ? "E.g. 2130 Highlight"
                                : field === "price" ? "optional"
                                : field === "qty" ? (isTile ? "boxes" : "pcs")
                                : field === "piecesPerBox" ? "e.g. 4" : ""
                            }
                            className="min-h-11 w-full rounded-control border border-transparent bg-transparent px-2 py-2 text-sm focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint/20 outline-none transition-all placeholder:text-slate-300"
                          />
                        )}
                      </td>
                    );
                  })}

                  <td className="p-1 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(r.id)}
                      className="rounded-control p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                      title="Remove row (Alt + X)"
                      aria-label="Remove row"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-2">
        <button
          type="button"
          data-testid="bulk-add-row-btn"
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-control border-2 border-dashed border-border py-3 text-sm font-semibold text-ink-muted hover:border-mint/40 hover:bg-mint-soft hover:text-mint-dark transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Row
        </button>
        {showMobileFill ? <div className="h-16 lg:hidden" /> : null}
      </div>

      {showMobileFill && (
        <div className="fixed inset-x-0 bottom-[4.75rem] z-[45] px-3 lg:hidden">
          <div className="mx-auto flex max-w-md items-center gap-2 border border-border ds-panel p-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                {FIELD_LABELS[focused.field]}
              </p>
              <p className="truncate text-sm font-semibold text-ink">{mobileValueLabel}</p>
            </div>
            <button
              type="button"
              data-testid="bulk-fill-mobile-apply"
              onClick={applyFocusedToEmpty}
              className="shrink-0 rounded-control bg-mint px-3 py-2.5 text-sm font-semibold text-white active:scale-95"
            >
              Sab pe lagaao
            </button>
          </div>
        </div>
      )}

      <Dialog open={!!fill} onOpenChange={(open) => { if (!open) setFill(null); }}>
        <DialogContent className="max-w-md" data-testid="bulk-fill-dialog">
          <DialogHeader>
            <DialogTitle>
              {fill ? FIELD_LABELS[fill.field] : "Fill"} column
            </DialogTitle>
          </DialogHeader>
          {fill && (
            <div className="space-y-3">
              {fill.field === "unit" ? (
                <SegmentedControl
                  value={fill.value}
                  onChange={(v) => setFill((f) => ({ ...f, value: v }))}
                  testPrefix="bulk-fill-unit"
                  showArrowHint={false}
                  className="grid grid-cols-2 gap-2"
                  options={[
                    { value: UNIT_BOX, label: "Tiles" },
                    { value: UNIT_PIECE, label: "Sanitary" },
                  ]}
                />
              ) : fill.field === "size" ? (
                <TileSizeSelect
                  testId="bulk-fill-size"
                  value={fill.value}
                  onChange={(v) => setFill((f) => ({ ...f, value: v }))}
                />
              ) : (
                <input
                  data-testid="bulk-fill-value"
                  type="text"
                  inputMode={NUMERIC_FIELDS.has(fill.field) ? "decimal" : "text"}
                  value={fill.value}
                  onChange={(e) => setFill((f) => ({
                    ...f,
                    value: NUMERIC_FIELDS.has(fill.field) ? sanitizeNumber(e.target.value) : e.target.value,
                  }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyFillDialog();
                    }
                  }}
                  placeholder={fill.field === "piecesPerBox" ? "e.g. 6" : ""}
                  className="w-full rounded-control border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/20"
                  autoFocus
                />
              )}
              <SegmentedControl
                value={fill.mode}
                onChange={(v) => setFill((f) => ({ ...f, mode: v }))}
                testPrefix="bulk-fill-mode"
                showArrowHint={false}
                className="grid grid-cols-2 gap-2 lg:grid-cols-3"
                options={[
                  { value: "empty", label: "Khali cells" },
                  { value: "all", label: "Saari rows" },
                  {
                    value: "selected",
                    label: "Selected",
                    disabled: !rangeOnFillField,
                    className: "hidden lg:block",
                  },
                ]}
              />
              <p className="hidden text-xs text-ink-muted lg:block">
                Fill-down <Kbd keys={KEYS.fillDown} /> — Shift+click se range.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setFill(null)}
              className="rounded-control border border-border px-4 py-2.5 text-sm font-semibold text-ink"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="bulk-fill-apply"
              onClick={applyFillDialog}
              className="rounded-control bg-mint px-4 py-2.5 text-sm font-semibold text-white hover:bg-mint-dark"
            >
              Lagaao
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
