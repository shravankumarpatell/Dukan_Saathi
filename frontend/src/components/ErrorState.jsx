"use client";

import React from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { errorMessage } from "@/services/apiError";

/**
 * Friendly, keyboard-reachable error panel with a retry action.
 *
 * Use inside a screen when its data failed to load — never leave a blank
 * panel or a spinner that cannot end.
 */
export default function ErrorState({
  error,
  title,
  message,
  onRetry,
  retryLabel = "Dobara try karein",
  compact = false,
  className = "",
  testId = "error-state",
}) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  const text = message || errorMessage(error);
  const requestId = error?.requestId;
  const Icon = offline || error?.isNetwork ? WifiOff : AlertTriangle;
  const heading = title || (offline ? "Internet nahi hai" : "Load nahi ho paya");

  return (
    <div
      role="alert"
      data-testid={testId}
      className={`flex flex-col items-center justify-center text-center ${compact ? "gap-2 px-3 py-6" : "gap-3 px-4 py-10"} ${className}`}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="font-display text-base font-semibold tracking-tight text-ink">{heading}</p>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-ink-muted">{text}</p>
        {requestId ? (
          <p className="mt-1 font-mono text-[10px] text-ink-muted/70">ref: {requestId}</p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          data-testid={`${testId}-retry`}
          className="inline-flex items-center gap-1.5 rounded-control bg-mint px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-mint-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-mint/40"
        >
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
