
import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2 } from "lucide-react";

export default function BulkGrid({ rows, setRows }) {
  const tableRef = useRef(null);

  // Add empty row if empty
  useEffect(() => {
    if (rows.length === 0) {
      setRows([{ id: Date.now(), name: "", code: "", company: "", qty: "", price: "" }]);
    }
  }, [rows, setRows]);

  const updateRow = (id, field, value) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => {
    setRows(prev => [...prev, { id: Date.now(), name: "", code: "", company: "", qty: "", price: "" }]);
    setTimeout(() => {
      const inputs = tableRef.current?.querySelectorAll("input");
      if (inputs && inputs.length > 0) {
        inputs[inputs.length - 5].focus(); // Focus first input of new row
      }
    }, 50);
  };

  const removeRow = (id) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handlePaste = (e, rowId, fieldIndex) => {
    const text = e.clipboardData.getData("text");
    if (!text || !text.includes("\t") && !text.includes("\n")) return; // Only intercept if tabular data

    e.preventDefault();
    const clipboardRows = text.split(/\r?\n/).filter(r => r.trim());
    
    setRows(prev => {
      const newRows = [...prev];
      const startIndex = newRows.findIndex(r => r.id === rowId);
      if (startIndex === -1) return prev;

      const fields = ["name", "code", "company", "qty", "price"];
      
      clipboardRows.forEach((rowStr, i) => {
        const cells = rowStr.split("\t");
        const targetRowIndex = startIndex + i;
        
        // If we need a new row, create one
        if (!newRows[targetRowIndex]) {
          newRows.push({ id: Date.now() + i, name: "", code: "", company: "", qty: "", price: "" });
        }

        // Fill cells starting from fieldIndex
        cells.forEach((cellVal, j) => {
          const targetField = fields[fieldIndex + j];
          if (targetField && cellVal) {
            newRows[targetRowIndex][targetField] = cellVal.trim();
          }
        });
      });
      return newRows;
    });
  };

  const handleKeyDown = (e, id, fieldIndex) => {
    const fields = ["name", "code", "company", "qty", "price"];
    
    if (e.key === "Enter") {
      e.preventDefault();
      // If at end of row, go to next row or create new
      if (fieldIndex === fields.length - 1) {
        const index = rows.findIndex(r => r.id === id);
        if (index === rows.length - 1) {
          addRow();
        } else {
          const nextRowId = rows[index + 1].id;
          document.querySelector(`input[data-rowid="${nextRowId}"][data-field="name"]`)?.focus();
        }
      } else {
        // Go to next cell
        document.querySelector(`input[data-rowid="${id}"][data-field="${fields[fieldIndex + 1]}"]`)?.focus();
      }
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-[#2C2C2E] dark:bg-[#1C1C1E] overflow-hidden">
      <div className="overflow-x-auto p-1">
        <table className="w-full text-sm" ref={tableRef}>
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-[#A1A1A6] bg-slate-50 dark:bg-[#2C2C2E]/50">
              <th className="p-3 w-[50px] text-center">#</th>
              <th className="p-3 w-[250px]">Product Name*</th>
              <th className="p-3 w-[150px]">Code/SKU</th>
              <th className="p-3 w-[150px]">Company</th>
              <th className="p-3 w-[100px]">Qty*</th>
              <th className="p-3 w-[120px]">Price (₹)*</th>
              <th className="p-3 w-[50px]"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#2C2C2E]">
            {rows.map((r, index) => (
              <tr key={r.id} className="group hover:bg-slate-50/50 dark:hover:bg-[#2C2C2E]/30 transition-colors">
                <td className="p-2 text-center text-xs text-slate-400 dark:text-[#6E6E73]">{index + 1}</td>
                
                {["name", "code", "company", "qty", "price"].map((field, fieldIdx) => (
                  <td key={field} className="p-1">
                    <input
                      data-rowid={r.id}
                      data-field={field}
                      value={r[field] || ""}
                      onChange={(e) => updateRow(r.id, field, e.target.value)}
                      onPaste={(e) => handlePaste(e, r.id, fieldIdx)}
                      onKeyDown={(e) => handleKeyDown(e, r.id, fieldIdx)}
                      placeholder={field === "name" ? "E.g. Parle G 10rs" : field === "qty" ? "100" : ""}
                      className="w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100 dark:text-[#F5F5F7] dark:focus:border-[#6366F1] dark:focus:bg-[#1C1C1E] dark:focus:ring-indigo-900/50 outline-none transition-all placeholder:text-slate-300 dark:placeholder:text-[#3A3A3C]"
                    />
                  </td>
                ))}

                <td className="p-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={() => removeRow(r.id)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    title="Remove row"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="p-2 border-t border-slate-100 dark:border-[#2C2C2E] bg-slate-50/50 dark:bg-[#1C1C1E]/50">
        <button
          onClick={addRow}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 py-3 text-sm font-semibold text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-[#3A3A3C] dark:text-[#A1A1A6] dark:hover:border-[#6366F1] dark:hover:bg-[#2C2C2E] dark:hover:text-[#F5F5F7] transition-all"
        >
          <Plus className="h-4 w-4" /> Add Row
        </button>
      </div>
    </div>
  );
}
