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

function Shell() {
  const { user, authLoading, shop } = useApp();
  const pathname = usePathname();

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
          <AppProvider>
            <HotkeyProvider>
              <QuickCreateProvider>
                <Shell />
                <ThemedToaster />
              </QuickCreateProvider>
            </HotkeyProvider>
          </AppProvider>
        </ThemeProvider>
      </AppHistoryProvider>
    </div>
  );
}
