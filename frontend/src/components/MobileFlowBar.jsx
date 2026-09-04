"use client";

import React, { useCallback, useEffect, useState } from "react";
import { formFlowFields } from "@/hooks/useFormFlow";

const BAR_H = 44;

function isFlowField(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.hasAttribute?.("data-flow-skip")) return false;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "SELECT") return true;
  if (tag === "INPUT") {
    const t = (el.type || "text").toLowerCase();
    return t !== "hidden" && t !== "button" && t !== "submit" && t !== "checkbox" && t !== "radio" && t !== "file";
  }
  return el.hasAttribute?.("data-flow-field");
}

function fireEnter(shift) {
  const el = document.activeElement;
  if (!el) return;
  const root = el.closest?.("[data-form-flow]");
  const fields = formFlowFields(root);
  const idx = fields.indexOf(el);
  el.dispatchEvent(new KeyboardEvent("keydown", {
    key: "Enter",
    code: "Enter",
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
    shiftKey: !!shift,
  }));
  // iOS sometimes ignores untrusted Enter; step the chain ourselves.
  requestAnimationFrame(() => {
    if (document.activeElement !== el) return;
    if (shift && idx > 0) fields[idx - 1]?.focus();
    else if (!shift && idx >= 0 && idx < fields.length - 1) fields[idx + 1]?.focus();
  });
}

function readViewport() {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) {
    return { offsetTop: 0, height: typeof window !== "undefined" ? window.innerHeight : 0, offsetLeft: 0, width: 0, inset: 0 };
  }
  const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  return { offsetTop: vv.offsetTop, height: vv.height, offsetLeft: vv.offsetLeft, width: vv.width, inset };
}

/**
 * Keyboard accessory: equal Back / Next|Done, glued to the visual viewport
 * (the top of the on-screen keyboard) so page scroll does not drag it.
 */
export default function MobileFlowBar() {
  const [vp, setVp] = useState(readViewport);
  const [active, setActive] = useState(null);

  const syncActive = useCallback(() => {
    const el = document.activeElement;
    setActive(isFlowField(el) ? el : null);
  }, []);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const pin = () => setVp(readViewport());
    pin();
    vv?.addEventListener("resize", pin);
    vv?.addEventListener("scroll", pin);
    window.addEventListener("scroll", pin, { passive: true });
    document.addEventListener("focusin", syncActive);
    document.addEventListener("focusout", syncActive);
    return () => {
      vv?.removeEventListener("resize", pin);
      vv?.removeEventListener("scroll", pin);
      window.removeEventListener("scroll", pin);
      document.removeEventListener("focusin", syncActive);
      document.removeEventListener("focusout", syncActive);
    };
  }, [syncActive]);

  if (!active) return null;
  const root = active.closest?.("[data-form-flow]");
  if (!root) return null;
  // Only while the keyboard is up — hide when it closes so we don't float over the page.
  if (vp.inset < 80) return null;

  const fields = formFlowFields(root);
  const idx = fields.indexOf(active);
  const last = idx >= 0 && idx === fields.length - 1;
  const canBack = idx > 0;
  const y = vp.offsetTop + vp.height - BAR_H;
  const btn = "h-11 min-w-0 flex-1 text-[15px] font-semibold";

  return (
    <div
      className="fixed z-[80] grid grid-cols-2 lg:hidden"
      style={{
        top: 0,
        left: vp.offsetLeft || 0,
        width: vp.width || "100%",
        height: BAR_H,
        transform: `translate3d(0, ${y}px, 0)`,
      }}
      data-testid="mobile-flow-bar"
    >
      <button
        type="button"
        data-testid="mobile-flow-back"
        disabled={!canBack}
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => fireEnter(true)}
        className={`${btn} bg-slate-200 text-ink disabled:opacity-40 dark:bg-slate-300 dark:text-slate-900`}
      >
        Back
      </button>
      <button
        type="button"
        data-testid="mobile-flow-next"
        onPointerDown={(e) => e.preventDefault()}
        onClick={() => fireEnter(false)}
        className={`${btn} bg-mint text-white`}
      >
        {last ? "Done" : "Next"}
      </button>
    </div>
  );
}
