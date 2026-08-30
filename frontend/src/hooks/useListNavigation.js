import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Arrow-key + Enter navigation for dropdowns and result lists.
 *
 * The caller stays in charge of rendering; this only tracks which row is
 * highlighted, keeps it scrolled into view, and translates key presses:
 *
 *   ↓ / ↑        move the highlight (wraps around)
 *   Home / End   jump to first / last
 *   Enter        pick the highlighted row
 *   Esc          close
 *   Tab          close without picking, so focus moves on naturally
 *
 * Mark each rendered row with `data-list-index={i}` inside `listRef` and the
 * scrolling takes care of itself.
 *
 * `move` / `selectActive` are also exposed so pages can bind the same
 * behaviour to page-level hotkeys (arrows work before "/" focuses search).
 *
 * Hover note: after a keyboard move we ignore mouseenter until the pointer
 * actually moves. Otherwise scrolling a full-page list under a stationary
 * cursor jumps the highlight to whatever row slides under the mouse.
 */

export function useListNavigation({ count, onSelect, onEscape, enabled = true } = {}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);
  const activeIndexRef = useRef(0);
  const ignoreHoverRef = useRef(false);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  // Keep the highlight inside range as results filter down while typing.
  useEffect(() => {
    setActiveIndex((i) => (count <= 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  useEffect(() => {
    const root = listRef.current;
    if (!root || root.closest("[hidden]")) return;
    const row = root.querySelector(`[data-list-index="${activeIndex}"]`);
    if (!row) return;
    // nearest + inline nearest: scroll the least amount, never sideways.
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex]);

  // Re-enable hover highlighting only after the user moves the mouse.
  useEffect(() => {
    const onPointer = () => { ignoreHoverRef.current = false; };
    window.addEventListener("pointermove", onPointer, { passive: true });
    return () => window.removeEventListener("pointermove", onPointer);
  }, []);

  const setActiveIndexFromUser = useCallback((i) => {
    setActiveIndex(i);
  }, []);

  /** Highlight a row from mouse hover — no-op while keyboard-scrolling. */
  const hover = useCallback((i) => {
    if (ignoreHoverRef.current) return;
    setActiveIndex(i);
  }, []);

  const reset = useCallback(() => setActiveIndex(0), []);

  const move = useCallback((delta) => {
    if (!enabled || count <= 0) return;
    ignoreHoverRef.current = true;
    setActiveIndex((i) => (i + delta + count) % count);
  }, [enabled, count]);

  const jump = useCallback((i) => {
    if (!enabled || count <= 0) return;
    ignoreHoverRef.current = true;
    setActiveIndex(Math.max(0, Math.min(i, count - 1)));
  }, [enabled, count]);

  const selectActive = useCallback(() => {
    if (!enabled || count <= 0) return;
    onSelect?.(activeIndexRef.current);
  }, [enabled, count, onSelect]);

  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        move(-1);
        return;
      case "Home":
        e.preventDefault();
        jump(0);
        return;
      case "End":
        e.preventDefault();
        jump(count - 1);
        return;
      case "Enter":
        // Never let Enter escape to the surrounding form-flow — picking a row
        // is a complete action on its own.
        e.preventDefault();
        e.stopPropagation();
        selectActive();
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        onEscape?.();
        return;
      case "Tab":
        onEscape?.();
        return;
      default:
    }
  }, [enabled, count, move, jump, selectActive, onEscape]);

  return {
    activeIndex,
    setActiveIndex: setActiveIndexFromUser,
    hover,
    listRef,
    handleKeyDown,
    reset,
    move,
    selectActive,
  };
}
