import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/context/AppContext";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NumberInput from "@/components/NumberInput";
import { AllowedUnitChips, CategorySelect, DerivedSqftHint, PackQtyField, PriceUnitSelect } from "@/components/CatalogFields";
import TileSizeSelect from "@/components/TileSizeSelect";
import Kbd from "@/components/Kbd";
import { KEYS } from "@/lib/keymap";
import { catalogShowsPpb, catalogShowsSize, applyCatalogUnitChange, applyCatalogCategoryChange, normalizeProductUnitFields, rateSuffix, stockUnitWord, isSlabProduct } from "@/lib/units";
import { PackagePlus, UserPlus } from "lucide-react";
import MeasureToAdd from "@/components/MeasureToAdd";

/**
 * "Create on the fly" — Tally's Alt+C.
 *
 * When a cashier types an item or customer that doesn't exist yet, the calling
 * form awaits a lightweight, fully keyboard-fillable popup and drops the result
 * straight back into the field that asked for it. The bill in progress is never
 * touched.
 *
 *   const product = await quickCreate("product", typedName);
 *   if (product) addLineItem(product);   // null means the user pressed Esc
 */

const QuickCreateContext = createContext(null);

const NUM = "ds-field text-sm text-right tabular-nums";
const TXT = "ds-field text-sm";

export function QuickCreateProvider({ children }) {
  const [request, setRequest] = useState(null);
  const resolveRef = useRef(null);

  const quickCreate = useCallback((type, initialName = "") => {
    // A second request while one is open cancels the first rather than leaking
    // a promise that never settles.
    resolveRef.current?.(null);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setRequest({ type, initialName: initialName || "" });
    });
  }, []);

  const finish = useCallback((result) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    resolve?.(result ?? null);
  }, []);

  return (
    <QuickCreateContext.Provider value={quickCreate}>
      {children}
      {request?.type === "product" && (
        <QuickProductDialog initialName={request.initialName} onDone={finish} />
      )}
      {request?.type === "customer" && (
        <QuickCustomerDialog initialName={request.initialName} onDone={finish} />
      )}
    </QuickCreateContext.Provider>
  );
}

export function useQuickCreate() {
  const ctx = useContext(QuickCreateContext);
  if (!ctx) throw new Error("useQuickCreate must be used inside <QuickCreateProvider>");
  return ctx;
}

/* ── Shared dialog plumbing: exclusive scope + Enter chain ────────────────── */
function useQuickDialog({ scopeId, onSave, onCancel, busy, enterSaves = false }) {
  useHotkeyScope(scopeId, { exclusive: true });
  // enterSaves: last-field Enter submits (customer popup). Otherwise F9 only.
  const flow = useFormFlow({ onSave: enterSaves ? onSave : undefined, onCancel });

  useHotkeys(scopeId, [
    ...(!enterSaves ? [
      { keys: KEYS.save, label: "Save", handler: onSave, disabled: busy },
      { keys: KEYS.saveAlt, label: "Save", handler: onSave, disabled: busy, hidden: true },
    ] : []),
    { keys: KEYS.cancel, label: "Cancel", handler: onCancel },
  ]);

  useEffect(() => {
    const t = setTimeout(() => flow.focusFirst(), 60);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return flow;
}

function SaveBar({ busy, onSave, label, tone = "bg-mint", saveKeys = KEYS.save }) {
  return (
    <button
      data-flow-skip
      onClick={onSave}
      disabled={busy}
      className={`flex items-center justify-center gap-2 rounded-control ${tone} px-4 py-3 font-semibold text-white active:scale-95 disabled:opacity-60`}
    >
      {busy ? "…" : label}
      {!busy && <Kbd keys={saveKeys} tone="dark" />}
    </button>
  );
}

/* ── Product ──────────────────────────────────────────────────────────────── */
function QuickProductDialog({ initialName, onDone }) {
  const { addProduct } = useApp();
  const [f, setF] = useState({
    name: initialName, code: "", company: "", size: "",
    unit: "box", category: "tiles", allowedUnits: ["box", "piece", "sqft"],
    piecesPerBox: "", packQty: "1", sellPrice: "", stockQty: "", lowStockThreshold: "",
  });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const showSize = catalogShowsSize(f);
  const showPpb = catalogShowsPpb(f);

  const submit = useCallback(async () => {
    if (busyRef.current) return;
    if (!f.name.trim()) return toast.error("Item ka naam daaliye");
    if (catalogShowsPpb(f) && !(Number(f.piecesPerBox) > 0)) return toast.error("Tiles ke liye pieces / box daaliye");
    if (catalogShowsSize(f) && !String(f.size || "").trim()) return toast.error("Tiles ke liye size choose karein");
    busyRef.current = true;
    setBusy(true);
    try {
      const saved = await addProduct(normalizeProductUnitFields(f));
      toast.success(`${saved.name} stock me add ho gaya`);
      onDone(saved);
    } catch {
      toast.error("Item add nahi hua, dobara koshish karein");
      busyRef.current = false;
      setBusy(false);
    }
  }, [f, addProduct, onDone]);

  const cancel = useCallback(() => onDone(null), [onDone]);
  const flow = useQuickDialog({ scopeId: "modal:quick-product", onSave: submit, onCancel: cancel, busy });

  const T = (k, l, cls = "") => (
    <div key={k} className={cls}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{l}</label>
      <input data-testid={`np-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={TXT} />
    </div>
  );
  const N = (k, l, cls = "") => (
    <div key={k} className={cls}>
      <label className="mb-1 block text-xs font-semibold text-slate-600">{l}</label>
      <NumberInput data-testid={`np-${k}`} value={f[k]} onChange={(v) => setF({ ...f, [k]: v })} className={NUM} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && cancel()}>
      <DialogContent
        className="max-h-[90vh] overflow-auto"
        data-testid="new-product-dialog"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-emerald-600" /> Naya item
          </DialogTitle>
        </DialogHeader>
        <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="grid grid-cols-2 gap-3">
          <CategorySelect
            value={f.category}
            onChange={(cat) => setF(applyCatalogCategoryChange(f, cat))}
            testId="np-category"
            className="col-span-2"
          />
          <PriceUnitSelect product={f} onChange={(unit) => setF(applyCatalogUnitChange(f, unit))} testId="np-unit" />
          <AllowedUnitChips product={f} onChange={(allowedUnits) => setF({ ...f, allowedUnits })} testId="np-allowed" />
          {T("name", "Name", "col-span-2")}
          {T("code", "Code")}
          {T("company", "Company")}
          {showSize && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Size</label>
              <TileSizeSelect testId="np-size" value={f.size} onChange={(v) => setF({ ...f, size: v })} />
            </div>
          )}
          {showPpb && N("piecesPerBox", "Pieces / box")}
          <PackQtyField product={f} value={f.packQty} onChange={(v) => setF({ ...f, packQty: v })} testId="np-packQty" />
          {N("sellPrice", `Price optional (₹${rateSuffix(f)})`)}
          {N("stockQty", isSlabProduct(f) ? `Remaining (${stockUnitWord(f)})` : `Stock (${stockUnitWord(f)})`)}
          {isSlabProduct(f) && (
            <MeasureToAdd
              product={f}
              onAdd={(qty) => setF({ ...f, stockQty: String(Math.round(((Number(f.stockQty) || 0) + qty) * 10000) / 10000) })}
              testPrefix="np-measure"
            />
          )}
          {N("lowStockThreshold", "Low-stock alert")}
          <DerivedSqftHint product={f} rate={f.sellPrice} />
        </div>
        <SaveBar busy={busy} onSave={submit} label="Add & bill me lagayein" />
      </DialogContent>
    </Dialog>
  );
}

/* ── Customer ─────────────────────────────────────────────────────────────── */
function QuickCustomerDialog({ initialName, onDone }) {
  const { addCustomer, customers } = useApp();
  const [f, setF] = useState({ name: initialName, phone: "", isContractor: false, siteNote: "" });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = useCallback(async () => {
    if (busyRef.current) return;
    const name = f.name.trim();
    if (!name) return toast.error("Naam daaliye");
    if (customers.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
      return toast.error("Ye naam pehle se hai");
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const saved = await addCustomer({ ...f, name });
      toast.success(`${saved.name} add ho gaya`);
      onDone(saved);
    } catch {
      toast.error("Customer add nahi hua, dobara koshish karein");
      busyRef.current = false;
      setBusy(false);
    }
  }, [f, customers, addCustomer, onDone]);

  const cancel = useCallback(() => onDone(null), [onDone]);
  const flow = useQuickDialog({
    scopeId: "modal:quick-customer",
    onSave: submit,
    onCancel: cancel,
    busy,
    enterSaves: true,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && cancel()}>
      <DialogContent data-testid="quick-customer-dialog" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-mint-dark" /> Naya customer
          </DialogTitle>
        </DialogHeader>
        <div ref={flow.containerRef} onKeyDown={flow.handleKeyDown} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Name</label>
            <input data-testid="qc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={TXT} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Phone (optional)</label>
            <input data-testid="qc-phone" name="ds-qc-phone" inputMode="numeric" autoComplete="off" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="98xxxxxxxx" className={TXT} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-ink">
            <input data-testid="qc-contractor" type="checkbox" checked={f.isContractor} onChange={(e) => setF({ ...f, isContractor: e.target.checked })} />
            Contractor / Dealer <Kbd keys={KEYS.toggleCheckbox} />
          </label>
          {f.isContractor && (
            <div className="col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">Project / site note</label>
              <input data-testid="qc-site" value={f.siteNote} onChange={(e) => setF({ ...f, siteNote: e.target.value })} className={TXT} />
            </div>
          )}
        </div>
        <SaveBar busy={busy} onSave={submit} label="Add customer" tone="bg-mint" saveKeys="enter" />
      </DialogContent>
    </Dialog>
  );
}
