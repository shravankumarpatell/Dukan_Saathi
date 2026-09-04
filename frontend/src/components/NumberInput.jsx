import React, { forwardRef } from "react";

/** Strip everything except digits and at most one decimal point. */
export function sanitizeNumber(raw) {
  let v = String(raw ?? "").replace(/[^0-9.]/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "");
  return v;
}

// Numeric text field: digits/decimal only, empty by default (no stuck "0"),
// no spinner / scroll-to-change. Stores raw string.
// Forwards its ref so keyboard shortcuts can drop focus straight onto it.
const NumberInput = forwardRef(function NumberInput({ value, onChange, className = "", ...props }, ref) {
  const handleFocus = (e) => {
    const el = e.target;
    const val = el.value;
    requestAnimationFrame(() => {
      try { el.setSelectionRange(val.length, val.length); } catch { /* ignore */ }
    });
  };

  const handleKeyDown = (e) => {
    // Block scientific notation / sign characters that number keyboards may emit.
    // Do not swallow Alt/Ctrl/Meta chords (Alt+E expense, etc.).
    if (
      (e.key === "e" || e.key === "E" || e.key === "+" || e.key === "-")
      && !e.altKey && !e.ctrlKey && !e.metaKey
    ) {
      e.preventDefault();
    }
    props.onKeyDown?.(e);
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      enterKeyHint={props.enterKeyHint || "next"}
      pattern="[0-9]*[.]?[0-9]*"
      value={value == null || value === "" ? "" : String(value)}
      onChange={(e) => onChange(sanitizeNumber(e.target.value))}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onWheel={(e) => e.currentTarget.blur()}
      className={`outline-none ${className}`.trim()}
    />
  );
});

export default NumberInput;
