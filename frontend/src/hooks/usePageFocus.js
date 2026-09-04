"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname } from "@/context/AppHistoryContext";
import { usePageKeepAlive } from "@/context/PageKeepAliveContext";
import { isMobileViewport } from "@/hooks/useMediaQuery";

/**
 * Keep the caret on each page's start control (desktop).
 *
 * On phones we skip auto-focus: focusing a combobox/select opens the list or
 * native picker and covers the page. Callers can still focus after a tap.
 *
 * - Fires on pathname change and when keep-alive `active` flips true
 * - Returns `focusStart()` for post-submit / reset / modal-close callers
 *
 * Pass `enabled: false` while an exclusive modal owns the keyboard so we
 * don't steal focus from dialogs.
 */
export function usePageFocus(focusFn, { enabled = true, delay = 60 } = {}) {
  const pathname = usePathname();
  const { active: pageActive } = usePageKeepAlive();
  const on = enabled && pageActive;
  const focusFnRef = useRef(focusFn);
  focusFnRef.current = focusFn;
  const enabledRef = useRef(on);
  enabledRef.current = on;

  const focusStart = useCallback((ms = delay) => {
    const run = () => {
      if (!enabledRef.current) return;
      if (isMobileViewport()) return;
      try { focusFnRef.current?.(); } catch { /* ignore unmounted targets */ }
    };
    if (ms <= 0) {
      run();
      return undefined;
    }
    return setTimeout(run, ms);
  }, [delay]);

  useEffect(() => {
    if (!on) return undefined;
    if (isMobileViewport()) return undefined;
    const t = setTimeout(() => {
      try { focusFnRef.current?.(); } catch { /* ignore */ }
    }, delay);
    return () => clearTimeout(t);
  }, [pathname, on, delay]);

  return focusStart;
}
