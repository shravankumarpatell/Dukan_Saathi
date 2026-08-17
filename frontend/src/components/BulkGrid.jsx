import React, { useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { sanitizeNumber } from "@/components/NumberInput";
import Kbd from "@/components/Kbd";
import SegmentedControl from "@/components/SegmentedControl";
import TileSizeSelect from "@/components/TileSizeSelect";
import { normalizeTileSize } from "@/lib/tileSizes";
import {
  UNIT_BOX, UNIT_PIECE, isBoxUnit, isPieceUnit, isTileOnlyCatalogField, applyCatalogUnitChange,
} from "@/lib/units";

// Type first so the cashier picks tiles/sanitary before filling the row.
const FIELDS = ["unit", "name", "code", "company", "size", "piecesPerBox", "qty", "price"];
const NUMERIC_FIELDS = new Set(["qty", "price", "piecesPerBox"]);

export const emptyRow = (id) => ({
  id, name: "", code: "", company: "", size: "",
  unit: UNIT_BOX, piecesPerBox: "", qty: "", price: "",
});

export default function BulkGrid({ rows, setRows }) {
  const tableRef = useRef(null);
  const seededFocus = useRef(false);

  // Autofocus the Type control of the first row once it exists.
  useEffect(() => {
    if (seededFocus.current || rows.length === 0) return;
    seededFocus.current = true;
    const t = setTimeout(() => cellAt(rows[0].id, "unit")?.focus(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (field === "unit") return applyCatalogUnitChange(r, value);
      const next = NUMERIC_FIELDS.has(field) ? sanitizeNumber(value) : value;
      return { ...r, [field]: next };
    }));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(Date.now())]);
    setTimeout(() => {
      const last = rows[rows.length - 1];
      // After state update the new row is last+1 — query by newest data-rowid for unit.
      const cells = tableRef.current?.querySelectorAll('[data-field="unit"]');
      const lastCell = cells?.[cells.length - 1];
      lastCell?.focus();
      void last;
    }, 50);
  };

  const removeRow = (id) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
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
      const cell = cellAt(target.id, FIELDS[fieldIndex]) || cellAt(target.id, "unit");
      cell?.focus();
      return;
    }

    // Alt+X drops the line you're standing on (keep at least one row).
    if (e.altKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      e.stopPropagation();
      if (rows.length <= 1) return;
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

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto p-1">
        <table className="w-full text-sm" ref={tableRef}>
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
              <th className="p-3 w-[40px] text-center">#</th>
              <th className="p-3 min-w-[160px]">Type*</th>
              <th className="p-3 min-w-[180px]">Product Name*</th>
              <th className="p-3 min-w-[100px]">Code</th>
              <th className="p-3 min-w-[100px]">Company</th>
              <th className="p-3 min-w-[170px]">Size</th>
              <th className="p-3 min-w-[80px]">Pcs/box</th>
              <th className="p-3 min-w-[80px]">Qty*</th>
              <th className="p-3 min-w-[90px]">Price</th>
              <th className="p-3 w-[50px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, index) => {
              const isTile = isBoxUnit(r);
              return (
                <tr key={r.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="p-2 text-center text-xs text-slate-400">{index + 1}</td>

                  {FIELDS.map((field, fieldIdx) => (
                    <td key={field} className="p-1">
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
                        <span className="block px-2 py-1.5 text-xs text-slate-300">—</span>
                      ) : field === "size" ? (
                        <TileSizeSelect
                          testId={`bulk-size-${r.id}`}
                          value={r.size || ""}
                          onChange={(v) => updateRow(r.id, "size", v)}
                          data-rowid={r.id}
                          data-field="size"
                          onPaste={(e) => handlePaste(e, r.id, fieldIdx)}
                          onKeyDown={(e) => handleKeyDown(e, r.id, fieldIdx)}
                          className="flex min-w-[150px] items-center gap-1 rounded-md border border-transparent bg-transparent px-1 py-1 focus-within:border-indigo-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100"
                          inputClassName="w-full bg-transparent text-xs outline-none placeholder:text-slate-300"
                        />
                      ) : (
                        <input
                          data-rowid={r.id}
                          data-field={field}
                          type="text"
                          inputMode={NUMERIC_FIELDS.has(field) ? "decimal" : "text"}
                          value={r[field] || ""}
                          onChange={(e) => updateRow(r.id, field, e.target.value)}
                          onPaste={(e) => handlePaste(e, r.id, fieldIdx)}
                          onKeyDown={(e) => {
                            if (NUMERIC_FIELDS.has(field) && (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-")) {
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
                          className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none transition-all placeholder:text-slate-300"
                        />
                      )}
                    </td>
                  ))}

                  <td className="p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => removeRow(r.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                      title="Remove row (Alt + X)"
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
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
        >
          <Plus className="h-4 w-4" /> Add Row
        </button>
        <p className="hidden text-center text-[11px] text-slate-400 lg:block">
          Type pe ←/→ · <Kbd keys="enter" /> agla cell · <Kbd keys="shift+enter" /> pichla · <Kbd keys="arrowup" /> <Kbd keys="arrowdown" /> line ·{" "}
          <Kbd keys="alt+x" /> line hataayein · aakhri cell par <Kbd keys="enter" /> se nayi line
        </p>
      </div>
    </div>
  );
}
