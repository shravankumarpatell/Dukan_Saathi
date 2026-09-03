import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronsDown, CheckSquare, Square, ChevronDown, ChevronUp, AlertCircle, Check } from "lucide-react";
import { toast } from "sonner";
import { sanitizeNumber } from "@/components/NumberInput";
import TileSizeSelect from "@/components/TileSizeSelect";
import Kbd from "@/components/Kbd";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { SCOPES, KEYS } from "@/lib/keymap";
import { normalizeTileSize } from "@/lib/tileSizes";
import {
  FILLABLE_FIELDS,
  applyColumnFill,
  coerceFillValue,
  FIELD_LABELS,
  fillDownFrom,
  formatFillToast,
  hasColumnRange,
  isCellEmpty,
  isRowEligible,
  selectedRowIds,
} from "@/lib/bulkFill";
import {
  UNIT_BOX, applyCatalogCategoryChange, applyCatalogUnitChange,
  catalogShowsPpb, catalogShowsSize, catalogUnitForCategory, isBoxUnit, isTileOnlyCatalogField,
} from "@/lib/units";
import { CATEGORIES, CATEGORY_CODES, UNITS, suggestedUnits } from "@/lib/uom";

// Type first so the cashier picks tiles/sanitary before filling the row.
const FIELDS = ["category", "unit", "name", "code", "company", "size", "piecesPerBox", "qty", "price"];
const NUMERIC_FIELDS = new Set(["qty", "price", "piecesPerBox"]);
const HEADER_LABELS = {
  category: "Category",
  unit: "Unit",
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
  unit: UNIT_BOX, category: "tiles", allowedUnits: ["box", "piece", "sqft"],
  piecesPerBox: "", qty: "", price: "",
});

function snapshotRows(rows) {
  return rows.map((r) => ({ ...r }));
}

function formatSummarySize(size) {
  const s = String(size || "").trim();
  return s.replace(/\s*[xX*]\s*/g, "×");
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
  if (field === "unit") return UNIT_BOX;
  if (field === "category") return "tiles";
  return "";
}

export default function BulkGrid({ rows, setRows, autofocus = true }) {
  const tableRef = useRef(null);
  const isMobile = useIsMobile();
  const seededFocus = useRef(false);
  const undoRef = useRef(null);
  const [selection, setSelection] = useState(null);
  const [focused, setFocused] = useState(null);
  // Phone: only one row is open for editing at a time; the rest are one-line summaries.
  const [expandedId, setExpandedId] = useState(null);

  // ── Bulk edit toolbar state ──
  const [bulkField, setBulkField] = useState("company");
  const [bulkValue, setBulkValue] = useState("");
  const [checked, setChecked] = useState(() => new Set());

  // Drop ids of rows that no longer exist.
  useEffect(() => {
    setChecked((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(rows.map((r) => r.id));
      let changed = false;
      const next = new Set();
      prev.forEach((id) => { if (live.has(id)) next.add(id); else changed = true; });
      return changed ? next : prev;
    });
  }, [rows]);

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
      disabled: rows.length === 0,
    },
  ]);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (field === "unit") {
        const suggested = suggestedUnits(r.category);
        const unit = catalogUnitForCategory(r.category, value);
        return applyCatalogUnitChange({ ...r, allowedUnits: suggested }, unit);
      }
      if (field === "category") return applyCatalogCategoryChange(r, value);
      const next = NUMERIC_FIELDS.has(field) ? sanitizeNumber(value) : value;
      return { ...r, [field]: next };
    }));
  };

  const addRow = () => {
    const id = Date.now();
    setRows((prev) => [...prev, emptyRow(id)]);
    if (isMobile) setExpandedId(id);
    setTimeout(() => {
      const el = tableRef.current?.querySelector(`[data-rowid="${id}"][data-field="unit"]`)
        || tableRef.current?.querySelector(`[data-testid="bulk-unit-${id}-box"]`);
      try {
        el?.focus({ focusVisible: true });
      } catch {
        el?.focus();
      }
      el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    }, 50);
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSelection(null);
    setFocused((cur) => (cur?.rowId === id ? null : cur));
    setExpandedId((cur) => (cur === id ? null : cur));
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
          if (targetField === "category") {
            newRows[targetRowIndex] = applyCatalogCategoryChange(newRows[targetRowIndex], trimmed);
          } else if (targetField === "unit") {
            const row = newRows[targetRowIndex];
            const suggested = suggestedUnits(row.category);
            const unit = catalogUnitForCategory(row.category, trimmed);
            newRows[targetRowIndex] = applyCatalogUnitChange({ ...row, allowedUnits: suggested }, unit);
          } else if (isTileOnlyCatalogField(targetField) && !catalogShowsSize(newRows[targetRowIndex]) && !catalogShowsPpb(newRows[targetRowIndex])) {
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

  /** Focus a cell; on phone, open that row first (inputs only exist when expanded). */
  const focusCell = (rowId, field, fallbackField = "unit") => {
    const doFocus = () => {
      const el = cellAt(rowId, field) || cellAt(rowId, fallbackField);
      try { el?.focus({ focusVisible: true }); } catch { el?.focus(); }
    };
    if (isMobile && expandedId !== rowId) {
      setExpandedId(rowId);
      setTimeout(doFocus, 40);
    } else {
      doFocus();
    }
  };

  /** Step sideways within a row, skipping Size and Pcs/box on sanitary lines. */
  const moveWithinRow = (id, fieldIndex, dir) => {
    const row = rows.find((r) => r.id === id);
    let fi = fieldIndex + dir;
    while (FIELDS[fi] && isTileOnlyCatalogField(FIELDS[fi]) && !catalogShowsSize(row) && !catalogShowsPpb(row)) fi += dir;
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
    // ↑/↓ on Type are owned by the select (cycle options) — don't walk rows.
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
      focusCell(target.id, field);
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
      if (neighbour) setTimeout(() => focusCell(neighbour.id, "unit"), 20);
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
      else focusCell(rows[index + 1].id, "unit");
      return;
    }
    moveWithinRow(id, fieldIndex, 1)?.focus();
  };

  // ── Bulk edit: field / value / apply ──
  const bulkUnitOptions = useMemo(
    () => [...new Set(rows.flatMap((r) => suggestedUnits(r.category)))],
    [rows],
  );

  const changeBulkField = (field) => {
    setBulkField(field);
    setBulkValue(seedFillValue(rows, field, focused));
  };

  const toggleChecked = (id) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const toggleAll = () => {
    setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  };

  const eligibleRows = rows.filter((r) => isRowEligible(r, bulkField));
  const eligibleChecked = eligibleRows.filter((r) => checked.has(r.id));
  const emptyTargets = (checked.size ? eligibleChecked : eligibleRows).filter((r) => isCellEmpty(r, bulkField));

  /**
   * mode: "all"      → every eligible row (when nothing is ticked)
   *       "selected" → ticked rows only
   *       "empty"    → empty cells, within ticked rows if any are ticked, else all rows
   */
  const applyBulk = (mode) => {
    if (rows.length === 0) return toast.error("Pehle rows add karein");
    const needsValue = bulkField !== "unit" && bulkField !== "category";
    if (needsValue && !String(bulkValue ?? "").trim()) return toast.error("Value daaliye");

    let raw = bulkValue;
    if (bulkField === "unit") raw = bulkUnitOptions.includes(bulkValue) ? bulkValue : (bulkUnitOptions[0] || UNIT_BOX);
    if (bulkField === "category") raw = CATEGORIES[bulkValue] ? bulkValue : "tiles";

    let fillMode = mode;
    let selectedIds = [];
    if (mode === "selected") {
      selectedIds = [...checked];
    } else if (mode === "empty") {
      // Empty within selection → express as an explicit id list.
      fillMode = "selected";
      selectedIds = emptyTargets.map((r) => r.id);
      if (selectedIds.length === 0) return toast.error("Koi khali cell nahi mila");
    }

    undoRef.current = snapshotRows(rows);
    const result = applyColumnFill({ rows, field: bulkField, value: raw, mode: fillMode, selectedIds });
    commitFillResult(result, bulkField, bulkField === "unit" || bulkField === "category" ? raw : coerceFillValue(bulkField, raw));
  };

  const cellSelected = (field, index) => {
    if (!selection || selection.field !== field) return false;
    const lo = Math.min(selection.startIndex, selection.endIndex);
    const hi = Math.max(selection.startIndex, selection.endIndex);
    return index >= lo && index <= hi;
  };

  /**
   * One editable cell. Shared by the desktop table and the phone cards so the
   * data-rowid / data-field hooks (Enter flow, fill-down, autofocus) stay identical.
   */
  const renderCell = (r, field, fieldIdx, index, mobile) => {
    const showSize = catalogShowsSize(r);
    const showPpb = catalogShowsPpb(r);
    const unitOptions = suggestedUnits(r.category);
    const base = mobile
      ? "min-h-11 w-full rounded-control border border-border bg-white px-3 py-2 text-sm outline-none focus:border-mint focus:ring-2 focus:ring-mint/20"
      : "min-h-11 w-full rounded-control border border-transparent bg-transparent px-2 py-2 text-sm focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint/20 outline-none transition-all placeholder:text-slate-300";
    const selectCls = mobile
      ? `${base} font-semibold`
      : "min-h-11 w-full rounded-control border border-transparent bg-transparent px-1 py-2 text-xs font-semibold outline-none focus:border-mint focus:bg-white focus:ring-2 focus:ring-mint/20";

    if (field === "category") {
      return (
        <select
          data-testid={`bulk-category-${r.id}`}
          data-rowid={r.id}
          data-field="category"
          value={r.category || "tiles"}
          onChange={(e) => updateRow(r.id, "category", e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, r.id, fieldIdx)}
          className={selectCls}
        >
          {CATEGORY_CODES.map((code) => (
            <option key={code} value={code}>{CATEGORIES[code].short}</option>
          ))}
        </select>
      );
    }
    if (field === "unit") {
      return (
        <select
          data-testid={`bulk-unit-${r.id}`}
          data-rowid={r.id}
          data-field="unit"
          value={unitOptions.includes(r.unit) ? r.unit : (CATEGORIES[r.category || "tiles"]?.defaultUnit || unitOptions[0])}
          onChange={(e) => updateRow(r.id, "unit", e.target.value)}
          onKeyDown={(e) => handleKeyDown(e, r.id, fieldIdx)}
          className={selectCls}
        >
          {unitOptions.map((code) => (
            <option key={code} value={code}>{UNITS[code]?.label || code}</option>
          ))}
        </select>
      );
    }
    if ((field === "size" && !showSize) || (field === "piecesPerBox" && !showPpb)) {
      return <span className="block min-h-11 px-2 py-2 text-xs text-slate-300">—</span>;
    }
    if (field === "size") {
      return (
        <TileSizeSelect
          testId={`bulk-size-${r.id}`}
          value={r.size || ""}
          onChange={(v) => updateRow(r.id, "size", v)}
          data-rowid={r.id}
          data-field="size"
          onPaste={(e) => handlePaste(e, r.id, fieldIdx)}
          onKeyDown={(e) => handleKeyDown(e, r.id, fieldIdx)}
          className={mobile
            ? "flex min-h-11 w-full items-center gap-1 rounded-control border border-border bg-white px-2 py-1 focus-within:border-mint focus-within:ring-2 focus-within:ring-mint/20"
            : "flex min-h-11 min-w-[150px] items-center gap-1 rounded-control border border-transparent bg-transparent px-1 py-1 focus-within:border-mint/40 focus-within:bg-white focus-within:ring-2 focus-within:ring-mint/20"}
          inputClassName="w-full bg-transparent text-sm outline-none placeholder:text-slate-300"
        />
      );
    }
    return (
      <input
        data-rowid={r.id}
        data-field={field}
        type="text"
        inputMode={NUMERIC_FIELDS.has(field) ? "decimal" : "text"}
        enterKeyHint={mobile ? (fieldIdx === FIELDS.length - 1 ? "done" : "next") : undefined}
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
            : field === "qty" ? (isBoxUnit(r) ? "boxes" : (UNITS[r.unit]?.short || "qty"))
            : field === "piecesPerBox" ? "e.g. 4" : ""
        }
        className={base}
      />
    );
  };

  const MobileLabel = ({ field }) => (
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
      {HEADER_LABELS[field]}{REQUIRED_HEADERS.has(field) ? "*" : ""}
    </span>
  );

  const RowCheckbox = ({ id, index }) => (
    <input
      type="checkbox"
      data-testid={`bulk-row-check-${id}`}
      checked={checked.has(id)}
      onChange={() => toggleChecked(id)}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-4 w-4 shrink-0 cursor-pointer accent-mint"
      aria-label={`Row ${index + 1} select`}
    />
  );

  const bulkValueField = () => {
    const cls = "ds-field min-h-11 w-full";
    if (bulkField === "unit") {
      return (
        <select data-testid="bulk-edit-value" value={bulkUnitOptions.includes(bulkValue) ? bulkValue : (bulkUnitOptions[0] || UNIT_BOX)} onChange={(e) => setBulkValue(e.target.value)} className={cls}>
          {bulkUnitOptions.map((code) => (
            <option key={code} value={code}>{UNITS[code]?.label || code}</option>
          ))}
        </select>
      );
    }
    if (bulkField === "category") {
      return (
        <select data-testid="bulk-edit-value" value={CATEGORIES[bulkValue] ? bulkValue : "tiles"} onChange={(e) => setBulkValue(e.target.value)} className={cls}>
          {CATEGORY_CODES.map((code) => (
            <option key={code} value={code}>{CATEGORIES[code].label}</option>
          ))}
        </select>
      );
    }
    if (bulkField === "size") {
      return <TileSizeSelect testId="bulk-edit-value" value={bulkValue} onChange={setBulkValue} />;
    }
    return (
      <input
        data-testid="bulk-edit-value"
        type="text"
        inputMode={NUMERIC_FIELDS.has(bulkField) ? "decimal" : "text"}
        value={bulkValue}
        onChange={(e) => setBulkValue(NUMERIC_FIELDS.has(bulkField) ? sanitizeNumber(e.target.value) : e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            applyBulk(checked.size ? "selected" : "all");
          }
        }}
        placeholder={bulkField === "piecesPerBox" ? "e.g. 6" : bulkField === "company" ? "e.g. Kajaria" : "value"}
        className={cls}
      />
    );
  };

  const primaryLabel = checked.size
    ? `Selected pe lagaao (${eligibleChecked.length})`
    : `Sab pe lagaao (${eligibleRows.length})`;

  return (
    <div className="ds-panel overflow-hidden" ref={tableRef}>
      {rows.length > 0 && (
        <div className="space-y-2 border-b border-slate-100 bg-slate-50/70 p-3" data-testid="bulk-edit-bar">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              <ChevronsDown className="h-3.5 w-3.5" /> Ek saath edit
            </p>
            <button
              type="button"
              data-testid="bulk-select-all"
              onClick={toggleAll}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-mint-dark active:bg-mint-soft"
            >
              {allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allChecked ? "Selection hatao" : "Sab select"}
            </button>
          </div>

          <div className="grid grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)] gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto]">
            <select
              data-testid="bulk-edit-field"
              value={bulkField}
              onChange={(e) => changeBulkField(e.target.value)}
              className="ds-field min-h-11 w-full font-semibold"
              aria-label="Kaunsa field"
            >
              {FILLABLE_FIELDS.map((f) => (
                <option key={f} value={f}>{FIELD_LABELS[f]}</option>
              ))}
            </select>
            <div className="min-w-0">{bulkValueField()}</div>
            <div className="col-span-2 flex gap-2 sm:col-span-1">
              <button
                type="button"
                data-testid="bulk-edit-apply"
                onClick={() => applyBulk(checked.size ? "selected" : "all")}
                className="flex-1 whitespace-nowrap rounded-control bg-mint px-3 py-2.5 text-sm font-semibold text-white active:scale-95 hover:bg-mint-dark sm:flex-none"
              >
                {primaryLabel}
              </button>
              <button
                type="button"
                data-testid="bulk-edit-apply-empty"
                onClick={() => applyBulk("empty")}
                disabled={emptyTargets.length === 0}
                className="flex-1 whitespace-nowrap rounded-control border border-border bg-white px-3 py-2.5 text-sm font-semibold text-ink disabled:opacity-50 sm:flex-none"
                title="Sirf khali cells bharo"
              >
                Khali pe ({emptyTargets.length})
              </button>
            </div>
          </div>

          <p className="text-[11px] text-ink-muted">
            {checked.size
              ? `${checked.size} rows select — sirf unpe lagega. Checkbox se badlo.`
              : "Rows ke checkbox tick karo to sirf unpe lagega; warna sab pe."}
            <span className="hidden lg:inline">
              {" "}Shift+click range · <Kbd keys={KEYS.fillDown} /> fill-down.
            </span>
          </p>
        </div>
      )}

      {isMobile ? (
        /* ── Phone: compact list; tap a row to open its editor (one at a time) ── */
        <div className="divide-y divide-slate-100" data-testid="bulk-mobile-cards">
          {rows.map((r, index) => {
            const showSize = catalogShowsSize(r);
            const showPpb = catalogShowsPpb(r);
            const isChecked = checked.has(r.id);
            const isOpen = expandedId === r.id;
            const unitShortLbl = UNITS[r.unit]?.short || r.unit;
            const missing = [
              !String(r.name || "").trim() && "name",
              !(Number(r.qty) > 0) && "qty",
              showSize && !String(r.size || "").trim() && "size",
              showPpb && !(Number(r.piecesPerBox) > 0) && "pcs/box",
            ].filter(Boolean);
            const summary = [
              CATEGORIES[r.category]?.short || r.category,
              showSize && r.size ? formatSummarySize(r.size) : null,
              showPpb && Number(r.piecesPerBox) > 0 ? `${r.piecesPerBox} pcs/box` : null,
              r.company || null,
            ].filter(Boolean).join(" · ");

            if (!isOpen) {
              return (
                <div
                  key={r.id}
                  data-testid={`bulk-card-${r.id}`}
                  className={`flex items-center gap-2 px-3 py-2.5 ${isChecked ? "bg-mint-soft/40" : missing.length ? "bg-rose-50/60" : ""}`}
                >
                  <RowCheckbox id={r.id} index={index} />
                  <button
                    type="button"
                    data-testid={`bulk-card-open-${r.id}`}
                    onClick={() => focusCell(r.id, missing.length ? (missing[0] === "name" ? "name" : missing[0] === "qty" ? "qty" : missing[0] === "size" ? "size" : "piecesPerBox") : "name")}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="w-6 shrink-0 text-right font-mono text-[11px] text-slate-400">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${r.name ? "text-ink" : "text-ink-muted"}`}>
                        {r.name || "Naya item — naam daalo"}
                      </p>
                      <p className="truncate text-[11px] text-slate-500">
                        {missing.length ? <span className="font-semibold text-rose-600">Missing: {missing.join(", ")}</span> : (summary || "—")}
                      </p>
                    </div>
                    <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${Number(r.qty) > 0 ? "text-ink" : "text-rose-500"}`}>
                      {Number(r.qty) > 0 ? `${r.qty} ${unitShortLbl}` : "—"}
                    </span>
                    {missing.length
                      ? <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                      : <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />}
                  </button>
                </div>
              );
            }

            return (
              <div
                key={r.id}
                data-testid={`bulk-card-${r.id}`}
                className={`p-3 ${isChecked ? "bg-mint-soft/40" : "bg-canvas/40"} border-l-2 border-l-mint`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <RowCheckbox id={r.id} index={index} />
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-mint-soft px-2 text-xs font-bold text-mint-dark">
                    {index + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                    {r.name || <span className="font-normal text-ink-muted">Naya item</span>}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    className="rounded-control p-2 text-slate-400 active:bg-rose-50 active:text-rose-500"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    data-testid={`bulk-card-close-${r.id}`}
                    onClick={() => setExpandedId(null)}
                    className="rounded-control p-2 text-slate-500 active:bg-slate-100"
                    aria-label="Band karo"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div onFocus={() => markFocus(r.id, "category", index)}>
                    <MobileLabel field="category" />
                    {renderCell(r, "category", FIELDS.indexOf("category"), index, true)}
                  </div>
                  <div onFocus={() => markFocus(r.id, "unit", index)}>
                    <MobileLabel field="unit" />
                    {renderCell(r, "unit", FIELDS.indexOf("unit"), index, true)}
                  </div>
                  <div className="col-span-2" onFocus={() => markFocus(r.id, "name", index)}>
                    <MobileLabel field="name" />
                    {renderCell(r, "name", FIELDS.indexOf("name"), index, true)}
                  </div>
                  <div onFocus={() => markFocus(r.id, "code", index)}>
                    <MobileLabel field="code" />
                    {renderCell(r, "code", FIELDS.indexOf("code"), index, true)}
                  </div>
                  <div onFocus={() => markFocus(r.id, "company", index)}>
                    <MobileLabel field="company" />
                    {renderCell(r, "company", FIELDS.indexOf("company"), index, true)}
                  </div>
                  {showSize && (
                    <div className={showPpb ? "" : "col-span-2"} onFocus={() => markFocus(r.id, "size", index)}>
                      <MobileLabel field="size" />
                      {renderCell(r, "size", FIELDS.indexOf("size"), index, true)}
                    </div>
                  )}
                  {showPpb && (
                    <div className={showSize ? "" : "col-span-2"} onFocus={() => markFocus(r.id, "piecesPerBox", index)}>
                      <MobileLabel field="piecesPerBox" />
                      {renderCell(r, "piecesPerBox", FIELDS.indexOf("piecesPerBox"), index, true)}
                    </div>
                  )}
                  <div onFocus={() => markFocus(r.id, "qty", index)}>
                    <MobileLabel field="qty" />
                    {renderCell(r, "qty", FIELDS.indexOf("qty"), index, true)}
                  </div>
                  <div onFocus={() => markFocus(r.id, "price", index)}>
                    <MobileLabel field="price" />
                    {renderCell(r, "price", FIELDS.indexOf("price"), index, true)}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid={`bulk-card-done-${r.id}`}
                    onClick={() => setExpandedId(null)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-control border border-border bg-white px-3 py-2.5 text-sm font-semibold text-ink"
                  >
                    <Check className="h-4 w-4" /> Done
                  </button>
                  <button
                    type="button"
                    data-testid={`bulk-card-next-${r.id}`}
                    onClick={() => {
                      const next = rows[index + 1];
                      if (next) focusCell(next.id, "name");
                      else addRow();
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-control bg-mint px-3 py-2.5 text-sm font-semibold text-white active:scale-95"
                  >
                    {rows[index + 1] ? "Agla item" : "Naya item"} <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto p-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
                <th className="w-16 bg-slate-50 p-2 text-center">
                  <input
                    type="checkbox"
                    data-testid="bulk-select-all-head"
                    checked={allChecked}
                    onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer accent-mint"
                    aria-label="Sab rows select"
                  />
                </th>
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
                          : field === "category" || field === "unit"
                            ? "min-w-[140px] p-3"
                            : field === "size"
                              ? "min-w-[170px] p-3"
                              : "min-w-[90px] p-3"
                      }
                    >
                      <span>{label}{required ? "*" : ""}</span>
                    </th>
                  );
                })}
                <th className="w-[50px] p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, index) => {
                const isChecked = checked.has(r.id);
                return (
                  <tr key={r.id} className={`group transition-colors ${isChecked ? "bg-mint-soft/40" : "hover:bg-slate-50/50"}`}>
                    <td className="p-2">
                      <div className="flex items-center justify-center gap-1.5">
                        <RowCheckbox id={r.id} index={index} />
                        <span className="text-xs text-slate-400">{index + 1}</span>
                      </div>
                    </td>

                    {FIELDS.map((field, fieldIdx) => {
                      const selected = cellSelected(field, index);
                      const stickyName = field === "name";
                      const tdCls = [
                        "p-1",
                        selected ? "bg-mint-soft" : "",
                        stickyName
                          ? `sticky left-0 z-10 shadow-[4px_0_8px_-4px_rgba(27,54,93,0.12)] ${selected ? "bg-mint-soft" : isChecked ? "bg-mint-soft/40" : "bg-white group-hover:bg-slate-50/50"}`
                          : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <td
                          key={field}
                          className={tdCls}
                          onPointerDown={(e) => onCellPointerDown(e, field, index)}
                          onFocus={() => markFocus(r.id, field, index)}
                        >
                          {renderCell(r, field, fieldIdx, index, false)}
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
      )}

      <div className="border-t border-slate-100 bg-slate-50/50 p-2">
        <button
          type="button"
          data-testid="bulk-add-row-btn"
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-control border-2 border-dashed border-border py-3 text-sm font-semibold text-ink-muted hover:border-mint/40 hover:bg-mint-soft hover:text-mint-dark transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Row
        </button>
      </div>
    </div>
  );
}
