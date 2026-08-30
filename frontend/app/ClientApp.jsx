"use client";

import dynamic from "next/dynamic";

function Boot() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-mint" />
        <p className="font-display font-semibold tracking-tight text-ink">DukanSaathi</p>
      </div>
    </div>
  );
}

const App = dynamic(() => import("@/App"), { ssr: false, loading: () => <Boot /> });

/** Mounted once in the root layout so POS keep-alive survives URL changes. */
export default function ClientApp() {
  return <App />;
}
