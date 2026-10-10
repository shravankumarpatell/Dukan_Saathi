import { createClient } from "@supabase/supabase-js";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.REACT_APP_SUPABASE_URL ||
  "";
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY ||
  process.env.REACT_APP_SUPABASE_ANON_KEY ||
  "";

const REMEMBER_KEY = "ds-remember-me";

function rememberMeOn() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(REMEMBER_KEY) !== "0";
}

/** Session stays in localStorage when Remember me is on, otherwise only until the browser closes. */
const authStorage = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    const primary = rememberMeOn() ? window.localStorage : window.sessionStorage;
    return primary.getItem(key) ?? window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    const keep = rememberMeOn() ? window.localStorage : window.sessionStorage;
    const drop = rememberMeOn() ? window.sessionStorage : window.localStorage;
    drop.removeItem(key);
    keep.setItem(key, value);
  },
  removeItem(key) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  publishableKey || "placeholder-publishable-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: authStorage,
    },
  },
);
