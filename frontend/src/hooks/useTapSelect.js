import { useCallback, useRef } from "react";

/** Finger moved farther than this → treat as a scroll, not a tap. */
const TAP_PX = 12;

/**
 * Distinguish a tap from a finger-scroll on overflow lists.
 * Arm on pointerdown, commit on pointerup only if the pointer barely moved.
 * Never preventDefault — that would block native scrolling.
 */
export function useTapSelect() {
  const tapRef = useRef(null);
  const holdOpenRef = useRef(false);

  const arm = useCallback((e) => {
    if (e.button != null && e.button !== 0) return;
    holdOpenRef.current = true;
    tapRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }, []);

  const cancel = useCallback(() => {
    tapRef.current = null;
  }, []);

  const releaseHold = useCallback(() => {
    holdOpenRef.current = false;
  }, []);

  const commit = useCallback((e, action) => {
    const tap = tapRef.current;
    tapRef.current = null;
    holdOpenRef.current = false;
    if (!tap || tap.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_PX) return;
    action();
  }, []);

  return { arm, commit, cancel, holdOpenRef, releaseHold };
}
