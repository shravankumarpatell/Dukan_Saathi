import React from "react";
import { UNIT_BOX, UNIT_PIECE, unitOptionLabel } from "@/lib/units";

/** Two-option picker: Tiles (Boxes + Pcs) vs Sanitary (Pieces). */
export default function UnitToggle({ value, onChange, testId = "unit-toggle" }) {
  const unit = value === UNIT_PIECE ? UNIT_PIECE : UNIT_BOX;
  return (
    <div className="col-span-2" data-testid={testId}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">Product type</label>
      <div className="grid grid-cols-2 gap-2">
        {[UNIT_BOX, UNIT_PIECE].map((u) => (
          <button
            key={u}
            type="button"
            data-testid={`${testId}-${u}`}
            onClick={() => onChange(u)}
            className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition-colors ${
              unit === u
                ? "border-indigo-900 bg-indigo-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-indigo-300"
            }`}
          >
            {unitOptionLabel(u)}
          </button>
        ))}
      </div>
    </div>
  );
}
