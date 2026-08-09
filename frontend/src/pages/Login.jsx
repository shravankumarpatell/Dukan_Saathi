import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { signInGoogle, signInDemo } from "@/services/auth";
import { toast } from "sonner";
import { Mic, ShieldCheck, ScanLine, ReceiptIndianRupee } from "lucide-react";

export default function Login() {
  const { isDemo } = useApp();
  const [shopName, setShopName] = useState("");
  const [busy, setBusy] = useState(false);

  const doGoogle = async () => {
    setBusy(true);
    try { await signInGoogle(); }
    catch (e) { toast.error("Google sign-in failed. Add your preview domain to Firebase Authorized domains."); }
    setBusy(false);
  };
  const doDemo = async () => {
    setBusy(true);
    await signInDemo(shopName || "Demo Tiles & Sanitary");
    setBusy(false);
  };

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      {/* Left: brand / hero */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-indigo-950 p-10 text-white md:flex">
        <img src="https://images.unsplash.com/photo-1785216346524-38260d16f87f?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="relative">
          <h1 className="font-display text-4xl font-extrabold tracking-tight">DukanSaathi</h1>
          <p className="mt-2 text-lg text-indigo-200">Bolo, bill banao, stock sambhalo.</p>
        </div>
        <div className="relative space-y-4">
          {[
            { icon: Mic, t: "Bol kar bill banao", d: "Hindi ya English — voice se sale, stock, udhari." },
            { icon: ReceiptIndianRupee, t: "GST-ready PDF bill", d: "Customer ko dikhao, phir confirm karo." },
            { icon: ScanLine, t: "Photo se stock intake", d: "Supplier sheet ki photo, automatic entry." },
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="rounded-lg bg-orange-600 p-2"><f.icon className="h-5 w-5" /></div>
              <div><p className="font-semibold">{f.t}</p><p className="text-sm text-indigo-200">{f.d}</p></div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: auth */}
      <div className="flex items-center justify-center bg-stone-100 p-6">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-2xl font-bold text-slate-900">Apni dukaan kholiye</h2>
          <p className="mt-1 text-sm text-slate-500">Sign in to manage stock, billing & udhari.</p>

          <div className="mt-6 space-y-3">
            <label className="block text-sm font-semibold text-slate-700">Shop ka naam</label>
            <input data-testid="shop-name-input" value={shopName} onChange={(e) => setShopName(e.target.value)}
              placeholder="e.g. Sharma Tiles & Sanitary"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />

            {!isDemo && (
              <button data-testid="google-login-btn" onClick={doGoogle} disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60">
                Continue with Google
              </button>
            )}

            <button data-testid="demo-login-btn" onClick={doDemo} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-orange-600 bg-orange-600 px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60">
              {isDemo ? "Enter Demo Shop" : "Try a Demo Shop"}
            </button>
          </div>

          <div className="mt-5 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {isDemo
              ? "Running in DEMO mode with sample data (stored in your browser). Add Firebase config in config.json / .env to enable Google login and cloud sync."
              : "Firebase connected. Use Google to sign in to your shop."}
          </div>
        </div>
      </div>
    </div>
  );
}
