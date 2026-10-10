"use client";

import React, { useState } from "react";
import AppLink from "@/components/AppLink";
import { useSearchParams } from "@/context/AppHistoryContext";
import { useNavigate } from "@/hooks/useNavigate";
import { signInGoogle, signInPhone, getRememberMe, rememberedPhone, setRememberMe } from "@/services/auth";
import { usePWA } from "@/hooks/usePWA";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { LOGIN } from "@/constants/testIds/auth";
import AuthLayout, { GoogleButton, OrDivider, PasswordField } from "@/components/AuthLayout";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(() => rememberedPhone());
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(() => getRememberMe());
  const params = useSearchParams();
  const navigate = useNavigate();
  const { isInstallable, installApp } = usePWA();

  const isInstallMode = params.get("install") === "true";

  const handleInstallClick = async () => {
    const installed = await installApp();
    if (installed) {
      toast.success("App installed successfully!");
      navigate("/");
    }
  };

  const doGoogle = async () => {
    setRememberMe(remember, phone);
    setBusy(true);
    try {
      await signInGoogle();
    } catch (e) {
      toast.error(e?.message || "Google sign-in failed. Check Supabase redirect URLs.");
      setBusy(false);
    }
  };

  const doPhone = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      setRememberMe(remember, phone);
      await signInPhone(phone, password);
    } catch (err) {
      toast.error(err?.message || "Sign-in failed. Number ya password check karein.");
    }
    setBusy(false);
  };

  const card = isInstallMode && isInstallable ? (
    <div className="w-full max-w-sm ds-panel p-8 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-mint-soft">
        <Download className="h-8 w-8 text-mint" />
      </div>
      <h2 className="font-display text-2xl font-bold text-ink">Install DukanSaathi</h2>
      <p className="mt-2 text-sm text-ink-muted">
        Install the app to your home screen for instant access and a native experience before logging in.
      </p>
      <div className="mt-8 space-y-3">
        <button
          onClick={handleInstallClick}
            className="flex w-full items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-semibold text-white transition-transform active:scale-95"
        >
          <Download className="h-5 w-5" /> Install App to Continue
        </button>
        <button onClick={() => navigate("/")} className="text-sm font-semibold text-ink-muted hover:text-ink">
          Skip for now
        </button>
      </div>
    </div>
  ) : (
    <div className="w-full max-w-sm ds-panel p-6">
      <h2 className="font-display text-2xl font-bold text-ink">Apni dukaan kholiye</h2>

      <div className="mt-6">
        <GoogleButton onClick={doGoogle} disabled={busy} />
        <OrDivider />
        <form onSubmit={doPhone} className="space-y-3">
          <div>
            <label htmlFor="login-phone" className="mb-1 block text-xs font-semibold text-ink-muted">Phone</label>
            <input
              id="login-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid={LOGIN.emailInput}
              placeholder="98xxxxxxxx"
              className="w-full rounded-control border border-border bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-mint"
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1 block text-xs font-semibold text-ink-muted">Password</label>
            <PasswordField
              id="login-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              testId={LOGIN.passwordInput}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              data-testid="login-remember-me"
              className="h-4 w-4 accent-mint"
            />
            Remember me
          </label>
          <button
            type="submit"
            disabled={busy}
            data-testid={LOGIN.submitButton}
            className="flex w-full items-center justify-center rounded-control bg-mint px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
        <div className="mt-4 text-right text-sm">
          <AppLink
            href="/signup"
            data-testid={LOGIN.registerLink}
            className="font-semibold text-ink hover:underline"
          >
            Create account
          </AppLink>
        </div>
      </div>
    </div>
  );

  return <AuthLayout>{card}</AuthLayout>;
}
