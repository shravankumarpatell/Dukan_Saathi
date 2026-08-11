import React, { useState } from "react";
import { signInGoogle } from "@/services/auth";
import { toast } from "sonner";
import { Mic, ShieldCheck, ScanLine, ReceiptIndianRupee } from "lucide-react";

export default function Login() {
  const [busy, setBusy] = useState(false);

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
      <div className="flex items-center justify-center bg-stone-100 p-6 dark:bg-[#111113]">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-[#F5F5F7]">Apni dukaan kholiye</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-[#A1A1A6]">Sign in to manage stock, billing & udhari.</p>

          <div className="mt-6 space-y-3">
            <button data-testid="google-login-btn" onClick={doGoogle} disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white transition-transform active:scale-95 disabled:opacity-60 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]">
              Continue with Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
