import React, { useState } from "react";
import SlabMeasureGrid from "@/components/SlabMeasureGrid";
import SegmentedControl from "@/components/SegmentedControl";
import { filledRows, formatArea, padMeasureRows, roundArea, totalArea } from "@/lib/slab";
import { toProductUnit, unitShort } from "@/lib/uom";
import { toast } from "sonner";
import { Ruler } from "lucide-react";

/**
 * Optional incoming L×W grid. Only the summed area is written to stockQty.
 * Individual leftover pieces are not persisted.
 */
export default function MeasureToAdd({ product, onAdd, testPrefix = "measure-add" }) {
  const [open, setOpen] = useState(false);
  const [measureUnit, setMeasureUnit] = useState("ft");
  const dest = product?.unit === "sqm" ? "sqm" : "sqft";
  const [rows, setRows] = useState(() => padMeasureRows([], 4));

  if (!product) return null;

  const area = totalArea(rows, measureUnit, dest);
  const qty = roundArea(toProductUnit(product, dest, area), 4);

  const add = () => {
    if (filledRows(rows).length === 0) return toast.error("Kam se kam ek slab naapiye");
    if (!(qty > 0)) return;
    onAdd(qty);
    setRows(padMeasureRows([], 4));
    setOpen(false);
    toast.success(`+${formatArea(qty)} ${unitShort(product.unit)} stock me add`);
  };

  return (
    <div className="col-span-2 rounded-lg border border-dashed border-border p-3" data-testid={testPrefix}>
      <button
        type="button"
        data-flow-skip
        data-testid={`${testPrefix}-toggle`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint-dark hover:underline"
      >
        <Ruler className="h-3.5 w-3.5" />
        {open ? "Hide measure to add" : "Measure to add (optional)"}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <SegmentedControl
            label="Measure"
            testPrefix={`${testPrefix}-measure`}
            value={measureUnit}
            onChange={setMeasureUnit}
            className="grid grid-cols-3 gap-1"
            showArrowHint={false}
            options={[
              { value: "cm", label: "CM" },
              { value: "inch", label: "Inches" },
              { value: "ft", label: "Feet" },
            ]}
          />
          <SlabMeasureGrid
            rows={rows}
            onChange={setRows}
            measureUnit={measureUnit}
            testPrefix={testPrefix}
            minRows={4}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold tabular-nums text-ink">
              {formatArea(qty)} {unitShort(product.unit)}
            </p>
            <button
              type="button"
              data-flow-skip
              data-testid={`${testPrefix}-apply`}
              onClick={add}
              className="rounded-control bg-mint px-3 py-1.5 text-xs font-semibold text-white hover:bg-mint-dark"
            >
              Add to remaining stock
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
