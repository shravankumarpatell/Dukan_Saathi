import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const ThemeContext = createContext({ theme: "system", resolved: "light", setTheme: () => {} });

const STORAGE_KEY = "ds-theme";
const MEDIA = "(prefers-color-scheme: dark)";

function getSystemPref() {
  return window.matchMedia(MEDIA).matches ? "dark" : "light";
}

function applyTheme(resolved) {
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  // Update theme-color meta tag for mobile browser chrome
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "dark" ? "#0f172a" : "#EA580C");
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || "system";
  });

  const resolved = theme === "system" ? getSystemPref() : theme;

  const setTheme = useCallback((t) => {
    setThemeState(t);
    if (t === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, t);
    }
  }, []);

  // Apply theme to DOM
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  // Listen for OS preference changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia(MEDIA);
    const handler = () => applyTheme(getSystemPref());
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
