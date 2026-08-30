"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyTheme, readDomTheme, readStoredTheme } from "@/lib/theme";

const ThemeContext = createContext({
  theme: "light",
  toggleTheme: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readDomTheme);

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === "dark" ? "dark" : "light";
    setThemeState(value);
    applyTheme(value);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  const value = useMemo(() => ({ theme, toggleTheme, setTheme }), [theme, toggleTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
