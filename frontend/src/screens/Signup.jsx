"use client";

import React, { useState } from "react";
import AppLink from "@/components/AppLink";
import { signInGoogle, signUpEmail } from "@/services/auth";
import { toast } from "sonner";
import { REGISTER } from "@/constants/testIds/auth";
import AuthLayout, { GoogleButton, OrDivider } from "@/components/AuthLayout";

export default function Signup() {
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const doGoogle = async () => {
    setBusy(true);
    try {
      await signInGoogle();
    } catch (e) {
      toast.error(e?.message || "Google sign-in failed. Check Supabase redirect URLs.");
      setBusy(false);
    }
  };

  const doSignup = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Dono passwords match nahi karte");
      return;
    }
    if (password.length < 6) {
      toast.error("Password kam se kam 6 characters ka hona chahiye");
      return;
    }
    setBusy(true);
    try {
      const data = await signUpEmail(email.trim(), password, name.trim());
      if (!data.session) {
        toast.success("Account ban gaya. Email confirm karke sign in karein.");
      }
    } catch (err) {
      toast.error(err?.message || "Sign up failed.");
    }
    setBusy(false);
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-sm ds-panel p-6">
        <h2 className="font-display text-2xl font-bold text-ink">Naya account</h2>

        <div className="mt-6">
          <GoogleButton onClick={doGoogle} disabled={busy} label="Continue with Google" />
          <OrDivider />
          <form onSubmit={doSignup} className="space-y-3">
            <div>
              <label htmlFor="signup-name" className="mb-1 block text-xs font-semibold text-ink-muted">Naam</label>
              <input
                id="signup-name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                data-testid={REGISTER.nameInput}
                placeholder="Aapka naam"
                className="w-full rounded-control border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-mint"
              />
            </div>
            <div>
              <label htmlFor="signup-email" className="mb-1 block text-xs font-semibold text-ink-muted">Email</label>
              <input
                id="signup-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid={REGISTER.emailInput}
                placeholder="shop@email.com"
                className="w-full rounded-control border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-mint"
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="mb-1 block text-xs font-semibold text-ink-muted">Password</label>
              <input
                id="signup-password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid={REGISTER.passwordInput}
                placeholder="Kam se kam 6 characters"
                className="w-full rounded-control border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-mint"
              />
            </div>
            <div>
              <label htmlFor="signup-confirm" className="mb-1 block text-xs font-semibold text-ink-muted">Password confirm</label>
              <input
                id="signup-confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                data-testid={REGISTER.passwordConfirmInput}
                placeholder="Dobara likhein"
                className="w-full rounded-control border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-mint"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              data-testid={REGISTER.submitButton}
              className="flex w-full items-center justify-center rounded-control bg-mint px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
            >
              Create account
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-ink-muted">
            Pehle se account hai?{" "}
            <AppLink
              href="/login"
              data-testid={REGISTER.loginLink}
              className="font-semibold text-ink hover:underline"
            >
              Sign in
            </AppLink>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
