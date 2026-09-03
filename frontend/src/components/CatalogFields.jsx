import React from "react";
import {
  CATEGORIES,
  CATEGORY_CODES,
  UNIT_CODES,
  UNITS,
  allowedUnitsOf,
  categoryMeta,
  defaultAllowedUnits,
  ratePerSqft,
  unitShort,
} from "@/lib/uom";
import { needsPackQty } from "@/lib/units";

const SELECT = "ds-field";

export function CategorySelect({ value, onChange, testId = "category", className = "" }) {
  const cat = value && CATEGORIES[value] ? value : "tiles";
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">Category</label>
      <select
        data-testid={testId}
        value={cat}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT}
      >
        {CATEGORY_CODES.map((code) => (
          <option key={code} value={code}>{CATEGORIES[code].label}</option>
        ))}
      </select>
    </div>
  );
}

export function PriceUnitSelect({ product, onChange, testId = "price-unit", className = "" }) {
  const unit = product?.unit || categoryMeta(product?.category).defaultUnit;
  const options = allowedUnitsOf(product);
  const extras = UNIT_CODES.filter((u) => !options.includes(u));
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">Price unit</label>
      <select
        data-testid={testId}
        value={unit}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT}
      >
        {options.map((code) => (
          <option key={code} value={code}>{UNITS[code]?.label || code}</option>
        ))}
        {extras.length > 0 && (
          <optgroup label="Other">
            {extras.map((code) => (
              <option key={code} value={code}>{UNITS[code]?.label || code}</option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}

export function AllowedUnitChips({ product, onChange, testId = "allowed-units" }) {
  const selected = allowedUnitsOf(product);
  const suggested = defaultAllowedUnits(product?.category, product?.unit);
  const priceUnit = product?.unit || suggested[0];
  const extra = selected.filter((u) => !suggested.includes(u));
  const shown = [...suggested, ...extra];
  const addable = UNIT_CODES.filter((u) => !shown.includes(u));

  const toggle = (code) => {
    if (code === priceUnit) return;
    const next = selected.includes(code)
      ? selected.filter((u) => u !== code)
      : [...selected, code];
    if (!next.includes(priceUnit)) next.unshift(priceUnit);
    onChange(next);
  };

  return (
    <div className="col-span-2" data-testid={testId}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">Bill units</label>
      <div className="flex flex-wrap gap-1.5">
        {shown.map((code) => {
          const on = selected.includes(code);
          const locked = code === priceUnit;
          return (
            <button
              key={code}
              type="button"
              data-flow-skip
              data-testid={`${testId}-${code}`}
              onClick={() => toggle(code)}
              disabled={locked}
              className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                on ? "bg-mint-soft text-mint-dark" : "bg-slate-100 text-slate-500"
              } ${locked ? "ring-1 ring-mint/40" : ""}`}
              title={locked ? "Price unit" : on ? "Bill me hataao" : "Bill me add"}
            >
              {unitShort(code)}
            </button>
          );
        })}
        {addable.length > 0 && (
          <select
            data-flow-skip
            data-testid={`${testId}-add`}
            value=""
            onChange={(e) => {
              if (e.target.value) toggle(e.target.value);
            }}
            className="rounded-md border border-border bg-panel px-1.5 py-1 text-[11px] text-slate-600"
          >
            <option value="">Add…</option>
            {addable.map((code) => (
              <option key={code} value={code}>{UNITS[code]?.label || code}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

export function DerivedSqftHint({ product, rate }) {
  const r = ratePerSqft(product, rate);
  if (!(r > 0)) return null;
  return (
    <p className="col-span-2 text-xs text-slate-500" data-testid="derived-sqft-rate">
      ≈ ₹{Math.round(r * 100) / 100} /sq.ft
    </p>
  );
}

export function PackQtyField({ product, value, onChange, testId = "pack-qty" }) {
  if (!needsPackQty(product)) return null;
  const u = product?.unit;
  const hint = u === "bag" ? "kg in 1 bag" : u === "set" ? "pcs in 1 set" : "qty in 1 pack";
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-slate-600">Pack ({hint})</label>
      <input
        data-testid={testId}
        inputMode="decimal"
        value={value ?? product?.packQty ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="ds-field text-right tabular-nums"
      />
    </div>
  );
}
