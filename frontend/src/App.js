"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/context/AppContext";
import { HotkeyProvider } from "@/context/HotkeyContext";
import { QuickCreateProvider } from "@/context/QuickCreateContext";
import Layout from "@/components/Layout";
import KeepAliveRoutes from "@/components/KeepAliveRoutes";
import Login from "@/screens/Login";
import Signup from "@/screens/Signup";
import Settings from "@/screens/Settings";
import { AppHistoryProvider, usePathname } from "@/context/AppHistoryContext";
import { ThemeProvider, useTheme } from "@/context/ThemeContext";
import ThemeToggle from "@/components/ThemeToggle";
import ErrorBoundary from "@/components/ErrorBoundary";
import ErrorState from "@/components/ErrorState";
import GlobalErrorListeners from "@/components/GlobalErrorListeners";

function BootError({ error, onRetry, onLogout }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="ds-panel w-full max-w-md">
        <ErrorState
          error={error}
          title="Dukaan load nahi ho payi"
          onRetry={onRetry}
          testId="boot-error"
        />
        {onLogout ? (
          <div className="pb-5 text-center">
            <button
              type="button"
              onClick={onLogout}
              className="text-xs font-semibold text-ink-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Dusre account se login karein
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Shell() {
  const { user, authLoading, shop, bootError, retryBoot, logout } = useApp();
  const pathname = usePathname();

  // Backend / auth unreachable at startup: show a retry screen, never an endless spinner.
  if (bootError && (!user || !shop)) {
    return <BootError error={bootError} onRetry={retryBoot} onLogout={user ? logout : null} />;
  }

  // Wait until auth is resolved AND (if user is logged in) the shop profile is loaded
  if (authLoading || (user && !shop)) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-canvas">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="text-center">
          <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-mint" />
          <p className="font-display font-semibold tracking-tight text-ink">DukanSaathi</p>
        </div>
      </div>
    );
  }

  if (!user) {
    if (pathname === "/signup") return <Signup />;
    return <Login />;
  }

  // Enforce onboarding for new signups (require at least a phone number)
  if (!shop.phone) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-xl">
          <Settings isOnboarding={true} />
        </div>
      </div>
    );
  }

  return (
    <Layout>
      <KeepAliveRoutes />
    </Layout>
  );
}

function ThemedToaster() {
  const { theme } = useTheme();
  return <Toaster position="top-center" richColors theme={theme} />;
}

export default function App() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") {
      register();
      return undefined;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return (
    <div className="App">
      <AppHistoryProvider>
        <ThemeProvider>
          <ErrorBoundary name="DukanSaathi" fullScreen>
            <AppProvider>
              <HotkeyProvider>
                <QuickCreateProvider>
                  <GlobalErrorListeners />
                  <Shell />
                  <ThemedToaster />
                </QuickCreateProvider>
              </HotkeyProvider>
            </AppProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </AppHistoryProvider>
    </div>
  );
}
