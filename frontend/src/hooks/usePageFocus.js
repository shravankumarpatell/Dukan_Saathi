import { useCallback, useEffect, useRef } from "react";
import { useIsPageActive } from "@/context/PageKeepAliveContext";

/**
 * Keep the caret on each page's start control the first time the page is shown.
 * Returning to a kept-alive page restores the previous field (see KeepAliveRoutes).
 *
 * Pass `enabled: false` while an exclusive modal owns the keyboard so we
 * don't steal focus from dialogs.
 */
export function usePageFocus(focusFn, { enabled = true, delay = 60 } = {}) {
  const pageActive = useIsPageActive();
  const focusFnRef = useRef(focusFn);
  focusFnRef.current = focusFn;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const didInitialFocus = useRef(false);

  const focusStart = useCallback((ms = delay) => {
    const run = () => {
      if (!enabledRef.current) return;
      try { focusFnRef.current?.(); } catch { /* ignore unmounted targets */ }
    };
    if (ms <= 0) {
      run();
      return undefined;
    }
    return setTimeout(run, ms);
  }, [delay]);

  useEffect(() => {
    if (!enabled || !pageActive) return undefined;
    if (didInitialFocus.current) return undefined;
    didInitialFocus.current = true;
    const t = setTimeout(() => {
      try { focusFnRef.current?.(); } catch { /* ignore */ }
    }, delay);
    return () => clearTimeout(t);
  }, [pageActive, enabled, delay]);

  return focusStart;
}
