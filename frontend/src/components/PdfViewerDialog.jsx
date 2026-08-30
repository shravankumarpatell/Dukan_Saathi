import React, { useCallback, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { KEYS } from "@/lib/keymap";
import { Download } from "lucide-react";

/**
 * Floating PDF preview. Esc / overlay / X closes.
 *
 * Browser PDF viewers inside <iframe> steal focus; key events then never reach
 * the parent document. We keep focus on the dialog shell so Esc always works,
 * while still allowing wheel-scroll over the iframe.
 *
 * On close we restore the caret to whatever had focus before the dialog opened
 * (Radix's default restore is disabled because the shell / iframe otherwise
 * leaves focus on a dead node → "cursor gayab") — unless the parent passes
 * `restoreFocus={false}` and owns focus itself (e.g. New Bill after F9 save).
 *
 * Download uses the provided filename (blob: URLs ignore Content-Disposition).
 */
export default function PdfViewerDialog({
  url,
  filename = "document.pdf",
  onClose,
  title = "PDF",
  testId = "pdf-viewer-frame",
  restoreFocus = true,
}) {
  const open = useVisibleOpen(!!url);
  const shellRef = useRef(null);
  const previousFocusRef = useRef(null);
  const restoreFocusRef = useRef(restoreFocus);
  restoreFocusRef.current = restoreFocus;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    onCloseRef.current?.();
  }, []);

  const download = useCallback(() => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "document.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, [url, filename]);

  useHotkeyScope("modal:pdf-viewer", { exclusive: true, enabled: open });
  useHotkeys("modal:pdf-viewer", [
    { keys: KEYS.cancel, label: "Close PDF", handler: close },
  ]);

  // Revoke previous blob URL when the dialog closes or swaps documents.
  useEffect(() => {
    if (!url || !String(url).startsWith("blob:")) return undefined;
    return () => {
      try { URL.revokeObjectURL(url); } catch { /* ignore */ }
    };
  }, [url]);

  // Keep keyboard focus on the dialog shell (PDF plugins grab it on load/click).
  useEffect(() => {
    if (!open) return undefined;

    const focusShell = () => {
      const el = shellRef.current;
      if (!el) return;
      if (!el.contains(document.activeElement) || document.activeElement?.tagName === "IFRAME") {
        el.focus({ preventScroll: true });
      }
    };

    focusShell();
    const t1 = setTimeout(focusShell, 50);
    const t2 = setTimeout(focusShell, 300);

    const onFocusIn = (e) => {
      if (e.target?.tagName === "IFRAME") focusShell();
    };

    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      close();
    };

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, url, close]);

  const restorePreviousFocus = useCallback(() => {
    if (!restoreFocusRef.current) {
      previousFocusRef.current = null;
      return;
    }
    const el = previousFocusRef.current;
    previousFocusRef.current = null;
    if (!el || typeof el.focus !== "function") return;
    // After unmount / focus-trap teardown so we win over a blank body focus.
    requestAnimationFrame(() => {
      try {
        if (document.contains(el)) el.focus({ preventScroll: true });
      } catch { /* ignore */ }
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        ref={shellRef}
        tabIndex={-1}
        className="max-w-3xl p-2 outline-none"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          // Capture page focus here — before we move it onto the shell.
          const active = document.activeElement;
          if (
            active
            && active !== document.body
            && active !== document.documentElement
            && active !== shellRef.current
            && typeof active.focus === "function"
          ) {
            previousFocusRef.current = active;
          }
          shellRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          restorePreviousFocus();
        }}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          close();
        }}
        data-testid="pdf-viewer-dialog"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        {url && (
          <iframe
            title={title}
            src={url}
            tabIndex={-1}
            className="h-[80vh] w-full rounded-md"
            data-testid={testId}
            onMouseDown={(e) => {
              // Cancel focus transfer into the PDF viewer so Esc keeps working.
              e.preventDefault();
              shellRef.current?.focus({ preventScroll: true });
            }}
          />
        )}
        <div className="flex items-center justify-end gap-2 px-2 pb-1">
          <button
            type="button"
            data-testid="pdf-download-btn"
            onClick={download}
            className="inline-flex items-center gap-1.5 rounded-control border border-border bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-canvas active:scale-95"
            title={filename}
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
