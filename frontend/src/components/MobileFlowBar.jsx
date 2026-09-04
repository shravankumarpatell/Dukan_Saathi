"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { formFlowFields } from "@/hooks/useFormFlow";

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

/**
 * Sits just above the on-screen keyboard and replays the desktop Enter flow
 * (Next / Back / Done on the last field).
 */
export default function MobileFlowBar() {
  const [kbInset, setKbInset] = useState(0);
  const [active, setActive] = useState(null);

  const syncActive = useCallback(() => {
    const el = document.activeElement;
    setActive(isFlowField(el) ? el : null);
  }, []);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const syncKb = () => {
      if (!vv) {
        setKbInset(0);
        return;
      }
      setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    syncKb();
    vv?.addEventListener("resize", syncKb);
    vv?.addEventListener("scroll", syncKb);
    document.addEventListener("focusin", syncActive);
    document.addEventListener("focusout", syncActive);
    return () => {
      vv?.removeEventListener("resize", syncKb);
      vv?.removeEventListener("scroll", syncKb);
      document.removeEventListener("focusin", syncActive);
      document.removeEventListener("focusout", syncActive);
    };
  }, [syncActive]);

  if (!active) return null;
  const root = active.closest?.("[data-form-flow]");
  if (!root) return null;
  const fields = formFlowFields(root);
  const idx = fields.indexOf(active);
  const last = root && idx >= 0 && idx === fields.length - 1;
  const canBack = !root || idx > 0;
  const bottom = kbInset > 24 ? kbInset : 76;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[70] px-3 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      style={{ bottom }}
      data-testid="mobile-flow-bar"
    >
      <div className="pointer-events-auto mx-auto flex max-w-md gap-2">
        <button
          type="button"
          data-testid="mobile-flow-back"
          disabled={!canBack}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => fireEnter(true)}
          className="inline-flex items-center justify-center gap-1 rounded-control border border-border bg-panel px-3 py-3 text-sm font-semibold text-ink shadow-lg disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <button
          type="button"
          data-testid="mobile-flow-next"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => fireEnter(false)}
          className="min-w-0 flex-1 rounded-control bg-mint py-3 text-sm font-semibold text-white shadow-lg active:scale-[0.99]"
        >
          {last ? "OK" : "Next"}
        </button>
      </div>
    </div>
  );
}
