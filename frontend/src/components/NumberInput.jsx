import React from "react";

// Numeric text field: allows fully clearing (no stuck "0"), decimals, and places
// the caret at the end (least-significant digit) on focus. Stores raw string.
export default function NumberInput({ value, onChange, className = "", ...props }) {
  const sanitize = (raw) => {
    let v = String(raw).replace(/[^0-9.]/g, "");
    const i = v.indexOf(".");
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
    return v;
  };
  const handleFocus = (e) => {
    const el = e.target; const val = el.value;
    requestAnimationFrame(() => { try { el.setSelectionRange(val.length, val.length); } catch {} });
  };
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => onChange(sanitize(e.target.value))}
      onFocus={handleFocus}
      className={className}
    />
  );
}
