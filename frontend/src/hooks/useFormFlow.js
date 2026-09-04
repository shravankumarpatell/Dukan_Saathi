import { useCallback, useLayoutEffect, useRef } from "react";
import { isMobileViewport } from "@/hooks/useMediaQuery";

/**
 * Tally-style Enter-driven field flow.
 *
 * Enter advances to the next field instead of submitting; Enter on the *last*
 * field runs `onSave` — which should be Preview when a Preview exists, never
 * the F9 save handler. Shift+Enter steps back, Esc backs out one level.
 * Alt+Enter on a checkbox/radio toggles it without advancing.
 * Alt+Enter on a focused button activates it (e.g. View cart).
 * Enrolled buttons (`data-flow-field`) advance on plain Enter like other fields.
 * Elements with `data-flow-activate` open/activate on Enter or Alt+Enter
 * instead of advancing to the next field.
 *
 * Fields are discovered from the live DOM in document order rather than from a
 * ref array, so tab order always matches visual order and conditionally
 * rendered fields (tiles-only "Pcs", contractor-only "site note") drop in and
 * out of the chain automatically.
 *
 *   const { containerRef, handleKeyDown, focusFirst } = useFormFlow({ onSave, onCancel });
 *   <div ref={containerRef} onKeyDown={handleKeyDown}> … </div>
 *
 * Opt out of the chain with `data-flow-skip`, or opt a non-input in with
 * `data-flow-field`. Use `data-flow-activate` only when Enter should fire the
 * control instead of advancing (View cart uses Alt+Enter only — no activate).
 */

const FIELD_SELECTOR = [
  "input:not([type=hidden]):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[data-flow-field]:not([disabled])",
].join(",");

const isVisible = (el) =>
  !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

export function formFlowFields(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FIELD_SELECTOR)).filter(
    (el) => !el.hasAttribute("data-flow-skip") && !el.readOnly && isVisible(el)
  );
}

function isCheckable(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT") {
    const t = (el.type || "").toLowerCase();
    return t === "checkbox" || t === "radio";
  }
  return el.getAttribute("role") === "checkbox" || el.getAttribute("role") === "radio";
}

function isButtonLike(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "BUTTON") return true;
  if (tag === "A") return true;
  return el.getAttribute("role") === "button";
}

function activate(el) {
  el.click();
}

export function useFormFlow({ onSave, onCancel, enabled = true } = {}) {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    el.setAttribute("data-form-flow", "");
    return () => el.removeAttribute("data-form-flow");
  });

  const getFields = useCallback(() => formFlowFields(containerRef.current), []);

  const focusField = useCallback((el) => {
    if (!el) return;
    el.focus();
    try { el.scrollIntoView({ block: "center", inline: "nearest" }); } catch { /* ignore */ }
  }, []);

  const focusFirst = useCallback(() => {
    // Phones: don't auto-open comboboxes / <select> pickers on dialog open.
    if (isMobileViewport()) return;
    focusField(getFields()[0]);
  }, [getFields, focusField]);

  const focusIndex = useCallback((i) => {
    focusField(getFields()[i]);
  }, [getFields, focusField]);

  const handleKeyDown = useCallback((e) => {
    if (!enabled) return;
    if (e.defaultPrevented) return;

    if (e.key === "Escape") {
      if (!onCancel) return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
      return;
    }

    if (e.key !== "Enter") return;

    // Ctrl/Cmd+Enter is reserved for draft Confirm (KEYS.confirmDraft) — never
    // swallow it inside a page form chain.
    if (e.ctrlKey || e.metaKey) return;

    const target = e.target;
    const tag = (target.tagName || "").toUpperCase();
    const activateOnEnter = target.hasAttribute?.("data-flow-activate");

    // Alt+Enter: toggle checkboxes, or activate buttons / data-flow-activate.
    if (e.altKey) {
      if (isCheckable(target) || isButtonLike(target) || activateOnEnter) {
        e.preventDefault();
        e.stopPropagation();
        activate(target);
      }
      return;
    }

    // Enter on data-flow-activate controls fires click instead of advancing.
    if (activateOnEnter) {
      e.preventDefault();
      e.stopPropagation();
      activate(target);
      return;
    }

    // Let buttons and links act on Enter — unless they've been explicitly
    // enrolled in the chain (e.g. a radio-group of settlement options).
    if ((tag === "BUTTON" || tag === "A") && !target.hasAttribute("data-flow-field")) return;
    if (tag === "TEXTAREA" && !e.ctrlKey && !e.metaKey) return;

    const fields = getFields();
    const idx = fields.indexOf(target);
    if (idx === -1) return;

    e.preventDefault();

    if (e.shiftKey) {
      focusField(fields[Math.max(0, idx - 1)]);
      return;
    }

    if (idx === fields.length - 1) {
      onSave?.();
      return;
    }
    focusField(fields[idx + 1]);
  }, [enabled, onCancel, onSave, getFields, focusField]);

  return { containerRef, handleKeyDown, focusFirst, focusIndex, getFields };
}
