import React from "react";
import { Zap, ScanLine, ReceiptIndianRupee } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const FEATURES = [
  { icon: Zap, t: "Ledger in real time", d: "Kamai, udhari, cash — ek private console." },
  { icon: ReceiptIndianRupee, t: "GST-ready bills", d: "Clean PDFs, split payments, vusool." },
  { icon: ScanLine, t: "Stock from a photo", d: "Supplier sheet in, catalog out." },
];

export default function AuthLayout({ children }) {
  return (
    <div className="relative grid min-h-screen ds-mesh md:grid-cols-2">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>
      <div className="relative hidden flex-col justify-between overflow-hidden bg-surface p-12 text-white md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.38),transparent_55%)]" />
        <div className="relative">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-mint">DukanSaathi</p>
          <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight">The dukaan,<br />as a ledger.</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
            Keyboard-first POS for tile shops — bills, stock, and udhari without the circus.
          </p>
        </div>
        <div className="relative space-y-5">
          {FEATURES.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="rounded-control bg-mint/15 p-2 text-mint"><f.icon className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-medium">{f.t}</p>
                <p className="text-sm text-white/50">{f.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        {children}
      </div>
    </div>
  );
}

export function GoogleButton({ onClick, disabled, label = "Continue with Google" }) {
  return (
    <button
      type="button"
      data-testid="google-login-btn"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center justify-center gap-2 rounded-control bg-surface px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3">
      <div className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">or</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
