import React, { useEffect, useRef, useState } from "react";
import Kbd from "@/components/Kbd";

/**
 * Keyboard-native radio group for cash/online, tiles/sanitary, settlement, etc.
 *
 * - ← / → (and ↑ / ↓) move focus between options (do not commit yet)
 * - Enter / Space / click selects the focused option
 * - Enter on the already-selected option advances the form (data-flow-field)
 */
export default function SegmentedControl({
  value,
  onChange,
  options,
  label,
  testPrefix = "seg",
  className = "grid grid-cols-2 gap-2",
  showArrowHint = true,
  disabled = false,
  onKeyDown,
  selectedAttrs = null,
}) {
  const groupRef = useRef(null);
  const usable = options.filter((o) => !o.disabled);
  // Roving tabindex: which option shows the focus ring (may differ from value).
  const [focusValue, setFocusValue] = useState(value);

  useEffect(() => {
    setFocusValue(value);
  }, [value]);

  const active = focusValue ?? value;

  const focusOption = (nextValue) => {
    setFocusValue(nextValue);
    requestAnimationFrame(() => {
      const el = groupRef.current?.querySelector(
        `[data-testid="${testPrefix}-${CSS.escape(String(nextValue))}"]`
      );
      el?.focus();
    });
  };

  const move = (dir) => {
    if (disabled || usable.length === 0) return;
    const at = usable.findIndex((o) => o.value === active);
    const from = at < 0 ? 0 : at;
    const next = usable[(from + dir + usable.length) % usable.length];
    focusOption(next.value);
  };

  const selectFocused = () => {
    if (disabled || usable.length === 0) return;
    const opt = usable.find((o) => o.value === active) || usable[0];
    if (opt && opt.value !== value) onChange(opt.value);
  };

  return (
    <div>
      {label && (
        <label className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
          {label}
          {showArrowHint && (
            <>
              <Kbd keys="arrowleft" /> <Kbd keys="arrowright" />
            </>
          )}
        </label>
      )}
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={typeof label === "string" ? label : undefined}
        className={className}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            move(1);
          } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            e.preventDefault();
            e.stopPropagation();
            move(-1);
          } else if (e.key === " " || e.key === "Spacebar") {
            // Space always commits the focused option.
            e.preventDefault();
            e.stopPropagation();
            selectFocused();
          } else if (e.key === "Enter") {
            // Enter on a non-selected option commits it; if already selected,
            // let useFormFlow advance to the next field.
            if (active !== value) {
              e.preventDefault();
              e.stopPropagation();
              selectFocused();
            }
          }
          onKeyDown?.(e);
        }}
      >
        {options.map((o) => {
          const selected = o.value === value;
          const focused = o.value === active;
          const blocked = !!o.disabled || disabled;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={!blocked && focused ? 0 : -1}
              {...(selected && !blocked ? { "data-flow-field": "" } : {})}
              {...(selected && selectedAttrs ? selectedAttrs : {})}
              data-testid={`${testPrefix}-${o.value}`}
              disabled={blocked}
              title={o.title || o.label}
              onFocus={() => !blocked && setFocusValue(o.value)}
              onClick={() => !blocked && onChange(o.value)}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1 ${
                blocked
                  ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300"
                  : selected
                    ? "border-indigo-900 bg-indigo-900 text-white"
                    : "border-slate-300 bg-white text-slate-600 hover:border-indigo-300"
              } ${o.className || ""}`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
