import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { signInGoogle } from "@/services/auth";
import { usePWA } from "@/hooks/usePWA";
import { toast } from "sonner";
import { Zap, ShieldCheck, ScanLine, ReceiptIndianRupee, Download } from "lucide-react";

export default function Login() {
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { isInstallable, installApp } = usePWA();
  
  const isInstallMode = params.get("install") === "true";

  const handleInstallClick = async () => {
    const installed = await installApp();
    if (installed) {
      toast.success("App installed successfully!");
      navigate("/"); // Clear the install param
    }
  };

  const doGoogle = async () => {
    setBusy(true);
    try { await signInGoogle(); }
    catch (e) { toast.error("Google sign-in failed. Add your preview domain to Firebase Authorized domains."); }
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Left: brand / hero */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-indigo-950 p-10 text-white md:flex">
        <img src="https://images.unsplash.com/photo-1785216346524-38260d16f87f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="relative">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">DukanSaathi</h1>
          <p className="mt-2 text-lg text-indigo-200">Smart shop management for modern retail.</p>
        </div>
        <div className="relative space-y-4">
          {[
            { icon: Zap, t: "Instant Data Entry", d: "Fast keyboard grids & AI extraction." },
            { icon: ReceiptIndianRupee, t: "GST-ready PDF bill", d: "Professional invoicing & udhari tracking." },
            { icon: ScanLine, t: "Photo se stock intake", d: "Supplier sheet ki photo, automatic entry." },
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="rounded-lg bg-orange-600 p-2"><f.icon className="h-5 w-5" /></div>
              <div><p className="font-semibold">{f.t}</p><p className="text-sm text-indigo-200">{f.d}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: auth or install */}
      <div className="flex items-center justify-center bg-stone-100 p-6">
        {isInstallMode && isInstallable ? (
          <div className="w-full max-w-sm rounded-2xl border border-indigo-200 bg-white p-8 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
              <Download className="h-8 w-8 text-indigo-600" />
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">Install DukanSaathi</h2>
            <p className="mt-2 text-sm text-slate-500">
              Install the app to your home screen for instant access and a native experience before logging in.
            </p>
            <div className="mt-8 space-y-3">
              <button onClick={handleInstallClick} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-bold text-white transition-transform active:scale-95">
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

            <div className="mt-6 space-y-3">
              <button data-testid="google-login-btn" onClick={doGoogle} disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60">
                Continue with Google
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
