import React, { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import { sanitizeNumber } from "@/components/NumberInput";
import { UNIT_BOX, UNIT_PIECE, unitOptionLabel } from "@/lib/units";

// Column keys in display order. `unit` and `piecesPerBox` are special (select / conditional).
const FIELDS = ["name", "code", "company", "size", "unit", "piecesPerBox", "qty", "price"];
const NUMERIC_FIELDS = new Set(["qty", "price", "piecesPerBox"]);
const emptyRow = (id) => ({
  id, name: "", code: "", company: "", size: "",
  unit: UNIT_BOX, piecesPerBox: "", qty: "", price: "",
});

export default function BulkGrid({ rows, setRows }) {
  const tableRef = useRef(null);

  const updateRow = (id, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      if (field === "unit") {
        const unit = value === UNIT_PIECE ? UNIT_PIECE : UNIT_BOX;
        return { ...r, unit, piecesPerBox: unit === UNIT_PIECE ? "1" : (r.piecesPerBox === "1" ? "" : r.piecesPerBox) };
      }
      const next = NUMERIC_FIELDS.has(field) ? sanitizeNumber(value) : value;
      return { ...r, [field]: next };
    }));
  };

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(Date.now())]);
    setTimeout(() => {
      const inputs = tableRef.current?.querySelectorAll("input, select");
      if (inputs && inputs.length >= FIELDS.length) {
        inputs[inputs.length - FIELDS.length].focus();
      }
    }, 50);
  };

  const removeRow = (id) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
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
            newRows[targetRowIndex].unit =
              lower.startsWith("p") || lower.includes("sanit") || lower.includes("piece")
                ? UNIT_PIECE : UNIT_BOX;
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

  const handleKeyDown = (e, id, fieldIndex) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (fieldIndex === FIELDS.length - 1) {
      const index = rows.findIndex((r) => r.id === id);
      if (index === rows.length - 1) addRow();
      else document.querySelector(`input[data-rowid="${rows[index + 1].id}"][data-field="name"]`)?.focus();
    } else {
      const next = FIELDS[fieldIndex + 1];
      // Skip piecesPerBox focus when sanitary
      const row = rows.find((r) => r.id === id);
      let fi = fieldIndex + 1;
      if (next === "piecesPerBox" && row?.unit === UNIT_PIECE) fi += 1;
      const f = FIELDS[fi];
      document.querySelector(`[data-rowid="${id}"][data-field="${f}"]`)?.focus();
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto p-1">
        <table className="w-full text-sm" ref={tableRef}>
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50">
              <th className="p-3 w-[40px] text-center">#</th>
              <th className="p-3 min-w-[180px]">Product Name*</th>
              <th className="p-3 min-w-[100px]">Code</th>
              <th className="p-3 min-w-[100px]">Company</th>
              <th className="p-3 min-w-[90px]">Size</th>
              <th className="p-3 min-w-[140px]">Type*</th>
              <th className="p-3 min-w-[80px]">Pcs/box</th>
              <th className="p-3 min-w-[80px]">Qty*</th>
              <th className="p-3 min-w-[90px]">Price</th>
              <th className="p-3 w-[50px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, index) => {
              const isTile = r.unit !== UNIT_PIECE;
              return (
                <tr key={r.id} className="group hover:bg-slate-50/50 transition-colors">
                  <td className="p-2 text-center text-xs text-slate-400">{index + 1}</td>

                  {FIELDS.map((field, fieldIdx) => (
                    <td key={field} className="p-1">
                      {field === "unit" ? (
                        <select
                          data-rowid={r.id}
                          data-field={field}
                          value={isTile ? UNIT_BOX : UNIT_PIECE}
                          onChange={(e) => updateRow(r.id, "unit", e.target.value)}
                          className="w-full rounded-md border border-transparent bg-transparent px-1 py-1.5 text-xs font-semibold focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                        >
                          <option value={UNIT_BOX}>{unitOptionLabel(UNIT_BOX)}</option>
                          <option value={UNIT_PIECE}>{unitOptionLabel(UNIT_PIECE)}</option>
                        </select>
                      ) : field === "piecesPerBox" && !isTile ? (
                        <span className="block px-2 py-1.5 text-xs text-slate-300">—</span>
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
                              : field === "size" ? (isTile ? "2x2 ft" : "")
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
                      title="Remove row"
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

      <div className="p-2 border-t border-slate-100 bg-slate-50/50">
        <button
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-all"
        >
          <Plus className="h-4 w-4" /> Add Row
        </button>
      </div>
    </div>
  );
}
