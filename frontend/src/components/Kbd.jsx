import React from "react";
import { formatBinding } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

/**
 * On-screen key hint. Discoverability matters as much as the shortcut itself —
 * shopkeepers won't read a manual, so every button that has a shortcut shows it.
 */
export default function Kbd({ keys, className, tone = "default" }) {
  if (!keys) return null;
  const tones = {
    default: "border-slate-300 bg-slate-100 text-slate-600",
    dark: "border-white/25 bg-white/15 text-white",
    accent: "border-indigo-200 bg-indigo-50 text-indigo-700",
  };
  return (
    <kbd
      className={cn(
        "hidden lg:inline-flex select-none items-center rounded border px-1.5 py-0.5 font-sans text-[10px] font-bold leading-none tracking-wide whitespace-nowrap",
        tones[tone] || tones.default,
        className
      )}
    >
      {formatBinding(keys)}
    </kbd>
  );
}
