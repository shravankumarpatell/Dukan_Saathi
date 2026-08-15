import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Keep the caret on each page's start control.
 *
 * - Fires on every fresh navigation to the page (`location.key` / pathname)
 * - Returns `focusStart()` for post-submit / reset / modal-close callers
 *
 * Pass `enabled: false` while an exclusive modal owns the keyboard so we
 * don't steal focus from dialogs.
 */
export function usePageFocus(focusFn, { enabled = true, delay = 60 } = {}) {
  const location = useLocation();
  const focusFnRef = useRef(focusFn);
  focusFnRef.current = focusFn;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

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
    if (!enabled) return undefined;
    const t = setTimeout(() => {
      try { focusFnRef.current?.(); } catch { /* ignore */ }
    }, delay);
    return () => clearTimeout(t);
  }, [location.key, location.pathname, enabled, delay]);

  return focusStart;
}
