"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const AppHistoryContext = createContext(null);

function readLoc() {
  return {
    pathname: window.location.pathname || "/",
    search: window.location.search || "",
  };
}

/**
 * SPA history for the POS shell. Next App Router remounts `[[...slug]]` when
 * the path changes, which would wipe keep-alive (bill cart, chat) and flash
 * the auth spinner. pushState keeps React mounted and the URL in sync.
 */
export function AppHistoryProvider({ children }) {
  const [loc, setLoc] = useState(() =>
    typeof window === "undefined" ? { pathname: "/", search: "" } : readLoc(),
  );

  useEffect(() => {
    const sync = () => setLoc(readLoc());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const navigate = useCallback((to, opts = {}) => {
    if (typeof to === "number") {
      window.history.go(to);
      return;
    }
    const url = String(to);
    const current = `${window.location.pathname}${window.location.search}`;
    if (url === current) {
      setLoc(readLoc());
      return;
    }
    if (opts.replace) window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    setLoc(readLoc());
  }, []);

  const searchParams = useMemo(() => new URLSearchParams(loc.search), [loc.search]);

  const value = useMemo(
    () => ({ pathname: loc.pathname, search: loc.search, searchParams, navigate }),
    [loc.pathname, loc.search, searchParams, navigate],
  );

  return <AppHistoryContext.Provider value={value}>{children}</AppHistoryContext.Provider>;
}

export function useAppHistory() {
  const ctx = useContext(AppHistoryContext);
  if (!ctx) throw new Error("useAppHistory must be used within AppHistoryProvider");
  return ctx;
}

export function usePathname() {
  return useAppHistory().pathname;
}

export function useSearchParams() {
  return useAppHistory().searchParams;
}
