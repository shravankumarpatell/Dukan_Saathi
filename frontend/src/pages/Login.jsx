import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { signInGoogle, signInEmail, resetPassword } from "@/services/auth";
import { usePWA } from "@/hooks/usePWA";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { LOGIN } from "@/constants/testIds/auth";
import AuthLayout, { GoogleButton, OrDivider } from "@/components/AuthLayout";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [params] = useSearchParams();
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
    setBusy(true);
    try {
      await signInGoogle();
    } catch (e) {
      toast.error(e?.message || "Google sign-in failed. Check Supabase redirect URLs.");
      setBusy(false);
    }
  };

  const doEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signInEmail(email.trim(), password);
    } catch (err) {
      toast.error(err?.message || "Sign-in failed. Email ya password check karein.");
    }
    setBusy(false);
  };

  const doReset = async () => {
    if (!email.trim()) {
      toast.error("Reset ke liye pehle email likhiye");
      return;
    }
    try {
      await resetPassword(email.trim());
      toast.success("Password reset link email par bhej diya.");
    } catch (err) {
      toast.error(err?.message || "Reset email nahi bhej paye.");
    }
  };

  const card = isInstallMode && isInstallable ? (
    <div className="w-full max-w-sm rounded-2xl border border-indigo-200 bg-white p-8 text-center shadow-xl">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
        <Download className="h-8 w-8 text-indigo-600" />
      </div>
      <h2 className="font-display text-2xl font-bold text-slate-900">Install DukanSaathi</h2>
      <p className="mt-2 text-sm text-slate-500">
        Install the app to your home screen for instant access and a native experience before logging in.
      </p>
      <div className="mt-8 space-y-3">
        <button
          onClick={handleInstallClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-bold text-white transition-transform active:scale-95"
        >
          <Download className="h-5 w-5" /> Install App to Continue
        </button>
        <button onClick={() => navigate("/")} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
          Skip for now
        </button>
      </div>
    </div>
  ) : (
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-display text-2xl font-bold text-slate-900">Apni dukaan kholiye</h2>
      <p className="mt-1 text-sm text-slate-500">Sign in to manage stock, billing & udhari.</p>

      <div className="mt-6">
        <GoogleButton onClick={doGoogle} disabled={busy} />
        <OrDivider />
        <form onSubmit={doEmail} className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid={LOGIN.emailInput}
            placeholder="Email"
            className="w-full rounded-xl border border-slate-200 bg-stone-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-900/20 focus:border-indigo-400 focus:ring-2"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid={LOGIN.passwordInput}
            placeholder="Password"
            className="w-full rounded-xl border border-slate-200 bg-stone-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-900/20 focus:border-indigo-400 focus:ring-2"
          />
          <button
            type="submit"
            disabled={busy}
            data-testid={LOGIN.submitButton}
            className="flex w-full items-center justify-center rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
          >
            Sign in
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={doReset}
            data-testid={LOGIN.forgotPasswordLink}
            className="font-semibold text-slate-500 hover:text-indigo-900"
          >
            Forgot password?
          </button>
          <Link
            to="/signup"
            data-testid={LOGIN.registerLink}
            className="font-semibold text-indigo-900 hover:underline"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );

  return <AuthLayout>{card}</AuthLayout>;
}
