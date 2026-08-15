import React from "react";
import { toYMD, toYM } from "@/lib/dates";

export default function DateNav({
  mode = "day",
  value,
  onChange,
  min,
  max,
  testId = "date-nav",
}) {
  if (mode === "month") {
    const maxYm = max || toYM(new Date());
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
        <input
          type="month"
          data-testid={`${testId}-input`}
          value={value}
          min={min ? min.slice(0, 7) : undefined}
          max={maxYm}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
        />
      </div>
    );
  }

  if (mode === "year") {
    const year = Number(value) || new Date().getFullYear();
    const maxY = Number(max) || new Date().getFullYear();
    const minY = min ? Number(String(min).slice(0, 4)) : maxY - 20;
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
        <input
          type="number"
          data-testid={`${testId}-input`}
          value={year}
          min={minY}
          max={maxY}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (n >= minY && n <= maxY) onChange(String(n));
          }}
          className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm tabular-nums"
        />
      </div>
    );
  }

  const maxY = max || toYMD(new Date());
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <input
        type="date"
        data-testid={`${testId}-input`}
        value={value}
        min={min || undefined}
        max={maxY}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
      />
    </div>
  );
}
