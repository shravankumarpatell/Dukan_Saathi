import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { IS_DEMO, GEMINI_READY, FIREBASE_READY } from "@/services/config";
import { Store, KeyRound } from "lucide-react";

export default function Settings() {
  const { shop, saveShop } = useApp();
  const [form, setForm] = useState({ name: shop?.name || "", ownerName: shop?.ownerName || "", phone: shop?.phone || "", address: shop?.address || "", gstEnabled: shop?.gstEnabled ?? true, gstin: shop?.gstin || "" });

  const save = async () => { await saveShop(form); toast.success("Shop details saved"); };

  return (
    <div className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="settings-page">
      <div className="flex items-center gap-2"><Store className="h-5 w-5 text-indigo-900" /><h2 className="font-display text-2xl font-bold text-slate-900">Shop Settings</h2></div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        {[["name", "Shop name"], ["ownerName", "Owner name"], ["phone", "Phone"], ["address", "Address"], ["gstin", "GSTIN"]].map(([k, l]) => (
          <div key={k}><label className="text-xs font-semibold text-slate-600">{l}</label><input data-testid={`set-${k}`} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div>
        ))}
        <label className="flex items-center gap-2 text-sm"><input data-testid="set-gst" type="checkbox" checked={form.gstEnabled} onChange={(e) => setForm({ ...form, gstEnabled: e.target.checked })} /> GST invoicing enabled (default 18%)</label>
        <button data-testid="save-settings-btn" onClick={save} className="w-full rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95">Save</button>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-slate-500" /><h3 className="font-display font-bold text-slate-900">Integration Status</h3></div>
        <StatusRow label="Firebase (Auth + Firestore)" ok={FIREBASE_READY} okText="Connected" offText="Not configured — running on local demo storage" />
        <StatusRow label="Gemini AI (voice NLU + vision)" ok={GEMINI_READY} okText="Connected" offText="Not configured — using built-in local parser" />
        <p className="pt-1 text-xs text-slate-400">Add your keys in <code className="rounded bg-slate-100 px-1">frontend/src/config.json</code> or <code className="rounded bg-slate-100 px-1">frontend/.env</code>, then reload.</p>
      </div>
    </div>
  );
}

const StatusRow = ({ label, ok, okText, offText }) => (
  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
    <span className="font-semibold text-slate-700">{label}</span>
    <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{ok ? okText : offText}</span>
  </div>
);
