import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { usePWA } from "@/hooks/usePWA";
import { toast } from "sonner";
import { Store, Download } from "lucide-react";

export default function Settings({ isOnboarding = false }) {
  const { shop, saveShop } = useApp();
  const { isInstallable, isInstalled, installApp } = usePWA();
  const [form, setForm] = useState({ 
    name: shop?.name || "", 
    ownerName: shop?.ownerName || "", 
    phone: shop?.phone || "", 
    address: shop?.address || "", 
    gstEnabled: shop?.gstEnabled ?? true, 
    gstin: shop?.gstin || "" 
  });

  const save = async () => { 
    if (!form.name.trim() || !form.phone.trim()) {
      return toast.error("Please enter your shop name and phone number");
    }
    await saveShop(form); 
    toast.success(isOnboarding ? "Shop setup complete!" : "Shop details saved"); 
  };

  return (
    <div className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="settings-page">
      <div className="flex items-center gap-2">
        <Store className="h-5 w-5 text-indigo-900 dark:text-[#F5F5F7]" />
        <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-[#F5F5F7]">
          {isOnboarding ? "Welcome! Setup your shop" : "Shop Settings"}
        </h2>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
        {[
          ["name", "Shop name *"], 
          ["ownerName", "Owner name"], 
          ["phone", "Phone *"], 
          ["address", "Address"], 
          ["gstin", "GSTIN"]
        ].map(([k, l]) => (
          <div key={k}>
            <label className="text-xs font-semibold text-slate-600 dark:text-[#A1A1A6]">{l}</label>
            <input 
              data-testid={`set-${k}`} 
              value={form[k]} 
              onChange={(e) => setForm({ ...form, [k]: e.target.value })} 
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#A1A1A6] dark:placeholder-[#6E6E73]" 
              placeholder={k === "phone" ? "e.g. 9876543210" : ""}
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm dark:text-[#A1A1A6]">
          <input data-testid="set-gst" type="checkbox" checked={form.gstEnabled} onChange={(e) => setForm({ ...form, gstEnabled: e.target.checked })} /> 
          GST invoicing enabled (default 18%)
        </label>
        <button data-testid="save-settings-btn" onClick={save} className="w-full rounded-xl bg-indigo-900 px-4 py-3 font-semibold text-white active:scale-95 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]">
          {isOnboarding ? "Continue to Dashboard" : "Save"}
        </button>
      </div>

      {!isOnboarding && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
          <h3 className="font-semibold text-slate-900 dark:text-[#F5F5F7]">App Installation</h3>
          <p className="text-sm text-slate-500 dark:text-[#A1A1A6]">
            {isInstalled ? "DukanSaathi is already installed on your device." : "Install DukanSaathi on your home screen for quick access and offline capabilities."}
          </p>
          {!isInstalled && isInstallable && (
            <button 
              onClick={installApp} 
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 font-semibold text-indigo-800 active:scale-95 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] dark:text-[#818CF8]"
            >
              <Download className="h-4 w-4" /> Download App
            </button>
          )}
          {!isInstalled && !isInstallable && (
            <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
              (To install on iOS, tap the Share icon in Safari and select "Add to Home Screen")
            </p>
          )}
        </div>
      )}
    </div>
  );
}
