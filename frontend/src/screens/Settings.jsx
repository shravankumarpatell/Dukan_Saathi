import React, { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import Kbd from "@/components/Kbd";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { usePageFocus } from "@/hooks/usePageFocus";
import { SCOPES, KEYS } from "@/lib/keymap";
import { validateGstin } from "@/lib/gstin";
import { toast } from "sonner";
import { Store, Pencil, LogOut } from "lucide-react";

function shopToForm(shop) {
  return {
    name: shop?.name || "",
    ownerName: shop?.ownerName || "",
    phone: shop?.phone || "",
    address: shop?.address || "",
    gstEnabled: shop?.gstEnabled ?? true,
    gstin: shop?.gstin || "",
  };
}

export default function Settings({ isOnboarding = false }) {
  const { shop, saveShop, logout, user } = useApp();
  const [form, setForm] = useState(() => shopToForm(shop));
  const [editing, setEditing] = useState(!!isOnboarding);
  const editBtnRef = useRef(null);
  const cancelEditRef = useRef(() => {});

  const startEdit = useCallback(() => {
    setForm(shopToForm(shop));
    setEditing(true);
  }, [shop]);

  const cancelEdit = useCallback(() => {
    setForm(shopToForm(shop));
    setEditing(false);
    setTimeout(() => editBtnRef.current?.focus(), 60);
  }, [shop]);
  cancelEditRef.current = cancelEdit;

  const save = useCallback(async () => {
    if (!editing) return;
    if (!form.name.trim() || !form.phone.trim()) {
      return toast.error("Please enter your shop name and phone number");
    }
    const gstCheck = validateGstin(form.gstin, { required: !!form.gstEnabled });
    if (!gstCheck.ok) return toast.error(gstCheck.error);

    await saveShop({
      ...form,
      gstin: form.gstEnabled ? gstCheck.gstin : gstCheck.gstin,
    });
    toast.success(isOnboarding ? "Shop setup complete!" : "Shop details saved");
    if (!isOnboarding) {
      setEditing(false);
      setTimeout(() => editBtnRef.current?.focus(), 60);
    }
  }, [form, saveShop, isOnboarding, editing]);

  const flow = useFormFlow({
    onCancel: editing && !isOnboarding ? () => cancelEditRef.current() : undefined,
  });

  const focusStart = useCallback(() => {
    if (editing || isOnboarding) flow.focusFirst();
    else editBtnRef.current?.focus();
  }, [editing, isOnboarding, flow]);

  usePageFocus(focusStart);

  useEffect(() => {
    if (!(editing || isOnboarding)) return undefined;
    const t = setTimeout(() => flow.focusFirst(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, isOnboarding]);

  useHotkeyScope(SCOPES.SETTINGS);
  useHotkeys(SCOPES.SETTINGS, [
    { keys: KEYS.save, label: "Shop details save karein", handler: save, disabled: !editing },
    { keys: KEYS.saveAlt, label: "Shop details save karein", handler: save, disabled: !editing, hidden: true },
    { keys: KEYS.cancel, label: "Edit cancel", handler: cancelEdit, disabled: !editing || isOnboarding },
    { keys: KEYS.focusSearch, label: "Start field par jaayein", handler: () => focusStart() },
  ]);

  const gstinRequired = !!form.gstEnabled;
  const gstinEditable = editing && form.gstEnabled;

  return (
    <div className="mx-auto max-w-xl space-y-4 ds-fade" data-testid="settings-page">
      <div className={`flex items-center gap-2 ${isOnboarding ? "justify-between" : "justify-end"}`}>
        {isOnboarding && (
          <div className="flex items-center gap-2">
            <Store className="h-5 w-5 text-ink" />
            <h2 className="font-display text-2xl font-bold text-slate-900">Welcome! Setup your shop</h2>
          </div>
        )}
        {!isOnboarding && !editing && (
          <button
            ref={editBtnRef}
            type="button"
            data-testid="edit-settings-btn"
            onClick={startEdit}
            className="flex items-center gap-1.5 rounded-control border border-mint/30 bg-mint-soft px-3 py-2 text-sm font-semibold text-mint-dark active:scale-95"
          >
            <Pencil className="h-4 w-4" /> Edit
          </button>
        )}
      </div>

      <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="space-y-3 ds-panel p-4">
        {[
          ["name", "Shop name *"],
          ["ownerName", "Owner name"],
          ["phone", "Phone *"],
          ["address", "Address"],
        ].map(([k, l]) => (
          <div key={k}>
            <label className="text-xs font-semibold text-slate-600">{l}</label>
            <input
              data-testid={`set-${k}`}
              value={form[k]}
              readOnly={!editing}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              className={`w-full rounded-control border px-3 py-2 text-sm ${
                editing
                  ? "border-border bg-white"
                  : "border-border bg-canvas text-ink-muted"
              }`}
              placeholder={k === "phone" ? "e.g. 9876543210" : ""}
            />
          </div>
        ))}

        <label className={`flex items-center gap-2 text-sm ${editing ? "text-slate-700" : "text-slate-500"}`}>
          <input
            data-testid="set-gst"
            type="checkbox"
            checked={form.gstEnabled}
            disabled={!editing}
            onChange={(e) => setForm({ ...form, gstEnabled: e.target.checked })}
          />
          GST invoicing enabled (default 18%)
          {editing && <Kbd keys={KEYS.toggleCheckbox} />}
        </label>

        <div>
          <label className={`text-xs font-semibold ${gstinEditable ? "text-slate-600" : "text-slate-400"}`}>
            GSTIN{gstinRequired ? " *" : ""}
          </label>
          <input
            data-testid="set-gstin"
            value={form.gstin}
            disabled={!gstinEditable}
            readOnly={!gstinEditable}
            required={gstinRequired}
            aria-required={gstinRequired}
            onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
            className={`w-full rounded-control border px-3 py-2 text-sm uppercase tracking-wide ${
              gstinEditable
                ? "border-border bg-white text-ink"
                : "cursor-not-allowed border-border bg-canvas text-ink-muted"
            }`}
            placeholder={gstinRequired ? "15-character GSTIN required" : "GST off — GSTIN locked"}
            maxLength={15}
          />
        </div>

        {editing ? (
          <div className="flex gap-2">
            {!isOnboarding && (
              <button
                type="button"
                data-flow-skip
                data-testid="cancel-settings-btn"
                onClick={cancelEdit}
                className="flex-1 rounded-control border border-border px-4 py-3 font-semibold text-ink active:scale-95"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              data-flow-skip
              data-testid="save-settings-btn"
              onClick={save}
              className="flex flex-[2] items-center justify-center gap-2 rounded-control bg-mint px-4 py-3 font-semibold text-white active:scale-95 hover:bg-mint-dark"
            >
              {isOnboarding ? "Continue to Dashboard" : "Save"} <Kbd keys={KEYS.save} tone="dark" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="ds-panel space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Account</p>
        {user?.email && (
          <p className="truncate text-sm text-ink">{user.email}</p>
        )}
        <button
          type="button"
          data-testid="logout-settings-btn"
          onClick={logout}
          className="flex w-full items-center justify-center gap-2 rounded-control border border-border px-4 py-3 font-semibold text-ink active:scale-95"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
}
