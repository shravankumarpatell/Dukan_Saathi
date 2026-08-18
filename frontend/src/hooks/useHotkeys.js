import { useEffect, useRef } from "react";
import { useHotkeyContext, GLOBAL_SCOPE } from "@/context/HotkeyContext";
import { useIsPageActive } from "@/context/PageKeepAliveContext";

/**
 * Push a scope onto the stack while this component is mounted.
 *
 * Pages use it plainly; dialogs pass `exclusive: true` so that everything
 * beneath them stops responding while they're open.
 *
 *   useHotkeyScope("page:billing");
 *   useHotkeyScope("modal:item-details", { exclusive: true, enabled: isOpen });
 */
export function useHotkeyScope(scopeId, { exclusive = false, enabled = true } = {}) {
  const { pushScope } = useHotkeyContext();
  const pageActive = useIsPageActive();
  useEffect(() => {
    if (!enabled || !pageActive) return undefined;
    return pushScope(scopeId, { exclusive });
  }, [pushScope, scopeId, exclusive, enabled, pageActive]);
}

/**
 * Register shortcuts into a scope.
 *
 * `defs` is re-read on every render through a ref, so handlers always see fresh
 * state without needing a dependency array. Only the shape (keys / label /
 * disabled) triggers re-registration.
 *
 *   useHotkeys("page:billing", [
 *     { keys: "F9", label: "Save bill", handler: save },
 *     { keys: "alt+c", label: "New item", handler: openQuickCreate },
 *   ]);
 */
export function useHotkeys(scopeId, defs) {
  const { registerMany } = useHotkeyContext();
  const list = (defs || []).filter(Boolean);

  const defsRef = useRef(list);
  defsRef.current = list;

  const signature = list
    .map((d) => `${d.keys}|${d.label || ""}|${d.group || ""}|${d.disabled ? 1 : 0}|${d.hidden ? 1 : 0}|${d.allowInInput ? 1 : 0}`)
    .join(";");

  useEffect(() => {
    const entries = defsRef.current.map((d, i) => ({
      id: `${scopeId}::${d.keys}::${i}`,
      keys: d.keys,
      label: d.label,
      group: d.group,
      disabled: d.disabled,
      hidden: d.hidden,
      allowInInput: d.allowInInput,
      run: (e) => defsRef.current[i]?.handler?.(e),
    }));
    return registerMany(scopeId, entries);
  }, [registerMany, scopeId, signature]);
}

/** Convenience for app-wide shortcuts. */
export function useGlobalHotkeys(defs) {
  useHotkeys(GLOBAL_SCOPE, defs);
}
