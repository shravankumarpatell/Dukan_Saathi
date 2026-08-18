import React, {
  createContext, useContext, useCallback, useEffect, useMemo, useRef,
} from "react";
import { parseBinding, eventMatches, isTypingTarget, allowedWhileTyping } from "@/lib/hotkeys";

/**
 * Global hotkey manager with a scope stack.
 *
 * One keydown listener at the document root resolves shortcuts against a stack
 * of active scopes, top-down:
 *
 *   [ global ]                 always at the bottom
 *   [ page:billing ]           pushed by the route while mounted
 *   [ modal:item-details ]     exclusive — blocks everything beneath it
 *
 * "Exclusive" is what makes modals safe: while a dialog is open, page and
 * global shortcuts stop firing entirely, so Esc/Enter/F9 mean whatever the
 * dialog says they mean and nothing else.
 */

const HotkeyContext = createContext(null);

export const GLOBAL_SCOPE = "global";

export function HotkeyProvider({ children }) {
  // The stack and the registry live in refs: the keydown listener and the help
  // sheet both read them on demand, so registering a shortcut never has to
  // re-render the app.
  //
  // scope stack: [{ id, exclusive }] — index 0 is the bottom (global)
  const stackRef = useRef([{ id: GLOBAL_SCOPE, exclusive: false }]);
  // scopeId -> Map<entryId, entry>
  const bindingsRef = useRef(new Map());

  const pushScope = useCallback((id, { exclusive = false } = {}) => {
    const rest = stackRef.current.filter((s) => s.id !== id);
    const next = { id, exclusive };
    if (exclusive) {
      stackRef.current = [...rest, next];
    } else {
      const excl = rest.filter((s) => s.exclusive);
      const restNon = rest.filter((s) => !s.exclusive);
      stackRef.current = [...restNon, next, ...excl];
    }
    return () => {
      stackRef.current = stackRef.current.filter((s) => s.id !== id);
    };
  }, []);

  const registerMany = useCallback((scopeId, entries) => {
    let map = bindingsRef.current.get(scopeId);
    if (!map) { map = new Map(); bindingsRef.current.set(scopeId, map); }
    entries.forEach((entry) => {
      map.set(entry.id, { ...entry, parsed: parseBinding(entry.keys) });
    });
    return () => {
      const current = bindingsRef.current.get(scopeId);
      if (!current) return;
      entries.forEach((entry) => current.delete(entry.id));
      if (current.size === 0) bindingsRef.current.delete(scopeId);
    };
  }, []);

  /** Bindings that would fire right now, ordered top-of-stack first (for the help sheet). */
  const getActiveBindings = useCallback(() => {
    const stack = stackRef.current;
    const out = [];
    const seen = new Set();
    for (let i = stack.length - 1; i >= 0; i--) {
      const scope = stack[i];
      const map = bindingsRef.current.get(scope.id);
      if (map) {
        for (const entry of map.values()) {
          if (entry.disabled || entry.hidden) continue;
          if (seen.has(entry.keys)) continue; // shadowed by a higher scope
          seen.add(entry.keys);
          out.push({ ...entry, scopeId: scope.id });
        }
      }
      if (scope.exclusive) break;
    }
    return out;
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      // Something closer to the element already handled this key.
      if (e.defaultPrevented) return;
      // Ignore the modifier keypresses themselves
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;

      const typing = isTypingTarget(e.target);
      const stack = stackRef.current;

      for (let i = stack.length - 1; i >= 0; i--) {
        const scope = stack[i];
        const map = bindingsRef.current.get(scope.id);
        if (map) {
          for (const entry of map.values()) {
            if (entry.disabled) continue;
            if (!eventMatches(e, entry.parsed)) continue;
            if (typing && !allowedWhileTyping(entry.parsed, entry.allowInInput)) continue;
            e.preventDefault();
            e.stopPropagation();
            entry.run(e);
            return;
          }
        }
        // A modal swallows everything below it, matched or not.
        if (scope.exclusive) return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ pushScope, registerMany, getActiveBindings }),
    [pushScope, registerMany, getActiveBindings]
  );

  return <HotkeyContext.Provider value={value}>{children}</HotkeyContext.Provider>;
}

export function useHotkeyContext() {
  const ctx = useContext(HotkeyContext);
  if (!ctx) throw new Error("useHotkeyContext must be used inside <HotkeyProvider>");
  return ctx;
}
