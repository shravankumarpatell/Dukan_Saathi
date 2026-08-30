"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { cn } from "@/lib/utils";

/**
 * Small light/dark switcher. Icon is CSS-driven (`dark:`) so it matches the
 * html class even before React hydrates. No "system" option.
 */
export default function ThemeToggle({ className, tone = "light" }) {
  const { toggleTheme, theme } = useTheme();
  const onChrome = tone === "chrome";

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-full transition-transform active:scale-95",
        onChrome
          ? "border border-white/15 bg-white/10 text-white hover:bg-white/20"
          : "border border-border bg-card text-ink hover:border-mint/40 hover:text-mint-dark",
        className,
      )}
    >
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
    </button>
  );
}
