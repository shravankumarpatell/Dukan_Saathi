"use client";

import React from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

/**
 * React error boundary. A render/effect crash inside `children` shows a
 * friendly panel (with retry) instead of unmounting the whole app.
 *
 * Props:
 *  - name       label used in console logs ("Dashboard", "app")
 *  - fallback   custom render: ({ error, reset }) => node
 *  - onReset    called after "Dobara try karein"
 *  - fullScreen  center the panel in the viewport (root boundary)
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Stack goes to the console (dev tools); the user sees only the friendly panel.
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary:${this.props.name || "app"}]`, error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Navigating to another screen clears a stale crash for that screen.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset() {
    this.setState({ error: null });
    if (typeof this.props.onReset === "function") this.props.onReset();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === "function") {
      return this.props.fallback({ error, reset: this.reset });
    }

    const { fullScreen = false, name } = this.props;
    const panel = (
      <div
        role="alert"
        data-testid="error-boundary"
        className="ds-panel mx-auto flex w-full max-w-md flex-col items-center gap-3 px-5 py-8 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <div>
          <p className="font-display text-lg font-semibold tracking-tight text-ink">
            {name ? `${name} mein kuch gadbad ho gayi` : "Kuch gadbad ho gayi"}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Aapka data safe hai. Dobara try karein — agar phir bhi na chale to page reload karein.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={this.reset}
            data-testid="error-boundary-retry"
            className="inline-flex items-center gap-1.5 rounded-control bg-mint px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-mint-dark"
          >
            <RefreshCw className="h-4 w-4" />
            Dobara try karein
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 rounded-control border border-border bg-white px-3.5 py-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
          >
            <RotateCcw className="h-4 w-4" />
            Reload
          </button>
        </div>
      </div>
    );

    if (fullScreen) {
      return <div className="flex min-h-screen items-center justify-center bg-canvas px-4">{panel}</div>;
    }
    return <div className="flex min-h-[40vh] items-center justify-center px-2 py-6">{panel}</div>;
  }
}
