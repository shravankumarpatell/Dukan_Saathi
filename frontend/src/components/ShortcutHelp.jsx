import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useHotkeyScope } from "@/hooks/useHotkeys";
import { SCOPES, SHORTCUT_GUIDE, KEYS } from "@/lib/keymap";
import Kbd from "@/components/Kbd";
import { Keyboard } from "lucide-react";

/**
 * The cheat sheet (Ctrl+K / ⌘K).
 *
 * `pageBindings` is a snapshot taken by Layout at the moment help was
 * requested — the dialog pushes an exclusive scope of its own, so reading the
 * live stack from in here would only ever show the dialog's own keys.
 */
export default function ShortcutHelp({ open, onOpenChange, pageBindings = [] }) {
  useHotkeyScope(SCOPES.HELP, { exclusive: true, enabled: open });

  const thisScreen = pageBindings.filter((b) => b.scopeId?.startsWith("page:") && b.label);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto" data-testid="shortcut-help">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-mint-dark" /> Keyboard shortcuts
          </DialogTitle>
        </DialogHeader>
        <p className="-mt-2 text-sm text-slate-500">
          Mouse ki zaroorat nahi. <Kbd keys={KEYS.palette} /> se kahin bhi jaayein,
          Enter se field aage badhe, <Kbd keys={KEYS.save} /> se save.
        </p>

        {thisScreen.length > 0 && (
          <Section title="Is screen par — On this screen" tone="accent">
            {thisScreen.map((b) => (
              <Line key={`${b.scopeId}-${b.keys}`} keys={b.keys} label={b.label} />
            ))}
          </Section>
        )}

        {SHORTCUT_GUIDE.map((g) => (
          <Section key={g.group} title={g.group}>
            {g.items.map((i) => (
              <Line key={`${g.group}-${i.keys}-${i.label}`} keys={i.keys} label={i.label} />
            ))}
          </Section>
        ))}

        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Browser kuch keys apne paas rakhta hai (F5 reload, F11 fullscreen, Ctrl+T naya tab).
          Isliye kharcha <Kbd keys={KEYS.gotoExpense} /> par hai aur udhari payment <Kbd keys={KEYS.gotoUdhari} /> par.
        </p>
      </DialogContent>
    </Dialog>
  );
}

const Section = ({ title, tone, children }) => (
  <div className={`rounded-2xl border p-3 ${tone === "accent" ? "border-mint/30 bg-mint-soft/50" : "border-border"}`}>
    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h4>
    <div className="grid gap-1 sm:grid-cols-2">{children}</div>
  </div>
);

const Line = ({ keys, label }) => (
  <div className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm">
    <span className="min-w-0 flex-1 text-slate-700">{label}</span>
    <Kbd keys={keys} />
  </div>
);
