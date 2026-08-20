/**
 * Authentication service — Supabase Auth (email/password + Google).
 */

import { supabase } from "@/supabase";

function mapUser(sessionUser) {
  if (!sessionUser) return null;
  const meta = sessionUser.user_metadata || {};
  return {
    uid: sessionUser.id,
    name: meta.full_name || meta.name || sessionUser.email?.split("@")[0] || "User",
    email: sessionUser.email,
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

export async function signInEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpEmail(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.origin,
      data: { full_name: name || "" },
    },
  });
  if (error) throw error;
  return data;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

/**
 * Sign out.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
