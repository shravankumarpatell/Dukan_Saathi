"use client";

import { useEffect } from "react";

/** Next.js route-segment error boundary (outside the React SPA boundary). */
export default function Error({ error, reset }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[next:error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="ds-panel w-full max-w-md px-5 py-8 text-center">
        <p className="font-display text-lg font-semibold tracking-tight text-ink">Kuch gadbad ho gayi</p>
        <p className="mt-1 text-sm text-ink-muted">Aapka data safe hai. Dobara try karein.</p>
        <div className="mt-4 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-control bg-mint px-3.5 py-2 text-sm font-semibold text-white hover:bg-mint-dark"
          >
            Dobara try karein
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-control border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink-muted hover:text-ink"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
