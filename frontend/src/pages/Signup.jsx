import React, { useState } from "react";
import { Link } from "react-router-dom";
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
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-2xl font-bold text-slate-900">Naya account</h2>
        <p className="mt-1 text-sm text-slate-500">Email se register karein, ya Google se continue karein.</p>

        <div className="mt-6">
          <GoogleButton onClick={doGoogle} disabled={busy} label="Continue with Google" />
          <OrDivider />
          <form onSubmit={doSignup} className="space-y-3">
            <input
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid={REGISTER.nameInput}
              placeholder="Aapka naam"
              className="w-full rounded-xl border border-slate-200 bg-stone-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-900/20 focus:border-indigo-400 focus:ring-2"
            />
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid={REGISTER.emailInput}
              placeholder="Email"
              className="w-full rounded-xl border border-slate-200 bg-stone-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-900/20 focus:border-indigo-400 focus:ring-2"
            />
            <input
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid={REGISTER.passwordInput}
              placeholder="Password"
              className="w-full rounded-xl border border-slate-200 bg-stone-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-900/20 focus:border-indigo-400 focus:ring-2"
            />
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid={REGISTER.passwordConfirmInput}
              placeholder="Password confirm"
              className="w-full rounded-xl border border-slate-200 bg-stone-50 px-3 py-2.5 text-sm text-slate-900 outline-none ring-indigo-900/20 focus:border-indigo-400 focus:ring-2"
            />
            <button
              type="submit"
              disabled={busy}
              data-testid={REGISTER.submitButton}
              className="flex w-full items-center justify-center rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60"
            >
              Create account
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-slate-500">
            Pehle se account hai?{" "}
            <Link
              to="/"
              data-testid={REGISTER.loginLink}
              className="font-semibold text-indigo-900 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
