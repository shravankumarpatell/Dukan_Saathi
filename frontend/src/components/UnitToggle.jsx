import React from "react";
import SegmentedControl from "@/components/SegmentedControl";
import { UNIT_BOX, UNIT_PIECE, unitOptionLabel } from "@/lib/units";

/** Two-option picker: Tiles (Boxes + Pcs) vs Sanitary (Pieces). */
export default function UnitToggle({ value, onChange, testId = "unit-toggle", label = "Product type" }) {
  const unit = value === UNIT_PIECE ? UNIT_PIECE : UNIT_BOX;
  return (
    <div className="col-span-2" data-testid={testId}>
      <SegmentedControl
        label={label}
        value={unit}
        onChange={onChange}
        testPrefix={testId}
        className="grid grid-cols-2 gap-2"
        options={[
          { value: UNIT_BOX, label: unitOptionLabel(UNIT_BOX) },
          { value: UNIT_PIECE, label: unitOptionLabel(UNIT_PIECE) },
        ]}
      />
    </div>
  );
}
