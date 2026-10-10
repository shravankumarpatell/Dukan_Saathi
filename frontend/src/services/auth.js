/**
 * Authentication service — Supabase Auth (phone/password + Google).
 */

import { supabase } from "@/supabase";
import { indianMobileDigits } from "@/lib/whatsapp";

const PHONE_EMAIL_DOMAIN = "phone.dukansaathi.app";
const REMEMBER_KEY = "ds-remember-me";
const REMEMBER_PHONE_KEY = "ds-remember-phone";

export function getRememberMe() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(REMEMBER_KEY) !== "0";
}

export function rememberedPhone() {
  if (typeof window === "undefined" || !getRememberMe()) return "";
  return window.localStorage.getItem(REMEMBER_PHONE_KEY) || "";
}

/** Call before sign-in so the session is written to the right store. */
export function setRememberMe(on, phone) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_KEY, on ? "1" : "0");
  if (on && phone) window.localStorage.setItem(REMEMBER_PHONE_KEY, phone);
  else window.localStorage.removeItem(REMEMBER_PHONE_KEY);
}

export function toAuthPhone(raw) {
  const digits = indianMobileDigits(raw);
  return digits ? `+91${digits}` : "";
}

/** Supabase email login, keyed by the mobile number. No SMS provider. */
export function phoneLoginEmail(raw) {
  const digits = indianMobileDigits(raw);
  return digits ? `91${digits}@${PHONE_EMAIL_DOMAIN}` : "";
}

function phoneFromLoginEmail(email) {
  const match = String(email || "").match(/^91(\d{10})@phone\.dukansaathi\.app$/i);
  return match ? `+91${match[1]}` : "";
}

function mapUser(sessionUser) {
  if (!sessionUser) return null;
  const meta = sessionUser.user_metadata || {};
  const phone = sessionUser.phone || meta.phone || phoneFromLoginEmail(sessionUser.email) || "";
  const email = phoneFromLoginEmail(sessionUser.email) ? "" : sessionUser.email;
  return {
    uid: sessionUser.id,
    name: meta.full_name || meta.name || phone || email?.split("@")[0] || "User",
    email: email || null,
    phone,
    picture: meta.avatar_url || meta.picture || null,
  };
}

/**
 * Listen for auth state changes. Calls cb with user object or null.
 * Returns an unsubscribe function.
 */
export function onAuth(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(mapUser(session?.user || null));
  });
  return () => data.subscription.unsubscribe();
}

export async function getSessionToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/**
 * Sign in with Google via a full-page OAuth redirect.
 */
export async function signInGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInPhone(phone, password) {
  const email = phoneLoginEmail(phone);
  if (!email) throw new Error("10 digit mobile number likhein");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpPhone(phone, password, name) {
  const email = phoneLoginEmail(phone);
  if (!email) throw new Error("10 digit mobile number likhein");
  const { signupPhoneAccount } = await import("@/services/api");
  await signupPhoneAccount({ phone, password, name: name || "" });
  return signInPhone(phone, password);
}

/**
 * Sign out.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
