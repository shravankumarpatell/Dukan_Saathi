import React from "react";
import { formatBinding } from "@/lib/hotkeys";
import { cn } from "@/lib/utils";

/**
 * On-screen key hint. Hidden below `lg` (phone / tablet); keyboard-first
 * shopkeepers on desktop still see the chord on every action.
 */
export default function Kbd({ keys, className, tone = "default" }) {
  if (!keys) return null;
  const tones = {
    default: "border-border bg-panel text-ink-muted",
    dark: "border-white/25 bg-white/15 text-white",
    accent: "border-mint/30 bg-mint-soft text-mint-dark",
  };
  return (
    <kbd
      className={cn(
        "select-none items-center rounded-control border px-1.5 py-0.5 font-sans text-[10px] font-bold leading-none tracking-wide whitespace-nowrap",
        tones[tone] || tones.default,
        className,
        "hidden lg:inline-flex"
      )}
    >
      {formatBinding(keys)}
    </kbd>
  );
}
