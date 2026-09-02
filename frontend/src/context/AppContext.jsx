import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import * as api from "@/services/api";
import { errorMessage } from "@/services/apiError";
import { onAuth, signOut as authSignOut } from "@/services/auth";
import { normalizeTileSize } from "@/lib/tileSizes";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

/** If Supabase never answers (blocked network, bad keys), stop the boot spinner. */
const AUTH_BOOT_TIMEOUT_MS = 12_000;

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [shop, setShop] = useState(null);
  // Set when /shops/me (or auth itself) fails during boot → Shell shows a retry screen.
  const [bootError, setBootError] = useState(null);
  // Set when the background list loads fail; screens keep rendering stale data + a hint.
  const [dataError, setDataError] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [returns, setReturns] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [draft, setDraft] = useState(null);
  const userRef = useRef(null);

  // Put caret at end (never select-all) when a text field is focused.
  useEffect(() => {
    const h = (e) => {
      const el = e.target;
      if (el && el.tagName === "INPUT" && ["text", "search", "tel", "url", "email"].includes(el.type)) {
        const v = el.value; requestAnimationFrame(() => { try { el.setSelectionRange(v.length, v.length); } catch {} });
      }
    };
    document.addEventListener("focusin", h);
    return () => document.removeEventListener("focusin", h);
  }, []);

  // ── Load all data from backend ──
  // Each list is fetched independently: one failing endpoint must not blank
  // the others. Failures are surfaced (toast + dataError), never swallowed.
  const loadAll = useCallback(async ({ silent = false } = {}) => {
    const results = await Promise.allSettled([
      api.listProducts(),
      api.listCustomers(),
      api.listInvoices(),
      api.listExpenses(),
    ]);
    const [p, c, i, e] = results;
    if (p.status === "fulfilled") setProducts(p.value);
    if (c.status === "fulfilled") setCustomers(c.value);
    if (i.status === "fulfilled") setInvoices(i.value);
    if (e.status === "fulfilled") setExpenses(e.value);

    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length === 0) {
      setDataError(null);
      return true;
    }
    const first = failed[0].reason;
    // eslint-disable-next-line no-console
    console.error("Failed to load data:", ...failed.map((r) => r.reason));
    // A 401 already signed the user out; no toast needed on top of the login screen.
    if (first?.status !== 401) {
      setDataError(first);
      if (!silent) toast.error(errorMessage(first));
    }
    return false;
  }, []);

  const bootShop = useCallback(async (u) => {
    setBootError(null);
    try {
      const s = await api.getShop();
      setShop(s);
      await loadAll({ silent: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to initialize shop:", err);
      if (err?.status === 401) return; // signed out by the API layer → login screen
      setBootError(err);
    }
  }, [loadAll]);

  // ── Auth listener ──
  useEffect(() => {
    let settled = false;
    const bootTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      setAuthLoading(false);
      setBootError(new Error("Login check nahi ho paya. Internet check karke dobara try karein."));
    }, AUTH_BOOT_TIMEOUT_MS);

    const unsub = onAuth(async (u) => {
      settled = true;
      clearTimeout(bootTimer);
      userRef.current = u;
      setUser(u);
      setAuthLoading(false);
      if (u) {
        await bootShop(u);
      } else {
        setShop(null);
        setBootError(null);
        setDataError(null);
        setProducts([]);
        setCustomers([]);
        setInvoices([]);
        setReturns([]);
        setExpenses([]);
      }
    });
    return () => {
      clearTimeout(bootTimer);
      unsub();
    };
  }, [bootShop]);

  const refresh = useCallback(() => loadAll(), [loadAll]);

  /** Retry from the boot error screen (server down at startup, etc.). */
  const retryBoot = useCallback(async () => {
    if (userRef.current) {
      await bootShop(userRef.current);
    } else {
      // Auth itself never resolved — a reload re-runs the Supabase handshake.
      window.location.reload();
    }
  }, [bootShop]);

  const saveShop = useCallback(async (patch) => {
    const s = await api.updateShop(patch);
    setShop(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    await authSignOut();
  }, []);

  // ── Create a sale invoice — all logic is now SERVER-SIDE ──
  const commitBill = useCallback(async (d) => {
    if (d.type === "return") {
      // Returns go through the dedicated returns endpoint
      const inv = await api.createReturn({
        originalInvoiceNo: d.originalInvoiceNo,
        items: d.items,
        refundTotal: d.refundTotal || 0,
        settlement: d.settlement || "cash",
        customerId: d.customerId || null,
        customerName: d.customerName || "Walk-in",
      });
      await refresh();
      return { invoice: inv, customer: null };
    }

    // Sale — server computes totals, validates stock, manages everything
    const inv = await api.createBill({
      type: d.type,
      items: (d.items || []).map((it) => ({
        productId: it.productId,
        name: it.name || "",
        qty: Number(it.qty) || 0,
        pieces: Number(it.pieces) || 0,
        unit: it.unit || "box",
        rate: Number(it.rate) || 0,
        piecesPerBox: Number(it.piecesPerBox) || 1,
        size: it.unit === "piece" ? "" : (it.size || ""),
      })),
      gstEnabled: !!d.gstEnabled,
      gstRate: Number(d.gstRate) || 18,
      discount: d.discount || null,
      payments: d.payments || [],
      customerId: d.customerId || null,
      customerName: d.customerName || "",
      customerPhone: d.customerPhone || "",
      isContractor: !!d.isContractor,
      siteNote: d.siteNote || "",
      createdVia: d.createdVia || "manual",
      language: d.language || "hi",
    });

    await refresh();
    return { invoice: inv, customer: null };
  }, [refresh]);

  // ── Record payment allocated across specific pending bills ──
  const allocatePayment = useCallback(async (customerId, allocations, mode) => {
    const result = await api.allocatePayment(customerId, allocations, mode || "cash");
    await refresh();
    return result;
  }, [refresh]);

  const reconcileCustomer = useCallback(async (customerId) => {
    const result = await api.reconcileCustomer(customerId);
    await refresh();
    return result;
  }, [refresh]);

  // ── Generic draft commit for expense / stock transfer / bulk ──
  const commitDraft = useCallback(async () => {
    if (!draft) return;

    if (draft.kind === "stock_transfer") {
      await api.transferStock(draft.productId, Number(draft.qty) || 0);
    } else if (draft.kind === "expense") {
      await api.createExpense({
        amount: Number(draft.amount) || 0,
        note: draft.note || "",
        mode: draft.mode || "cash",
      });
    } else if (draft.kind === "bulk_stock") {
      await api.bulkImportProducts(
        draft.rows.map((r) => ({
          name: r.name || "",
          code: r.code || "",
          company: r.company || "",
          size: r.unit === "piece" ? "" : (normalizeTileSize(r.size) || r.size || ""),
          unit: r.unit === "piece" ? "piece" : "box",
          piecesPerBox: r.unit === "piece" ? 1 : (Number(r.piecesPerBox) || 1),
          qty: Number(r.qty) || 0,
          price: Number(r.price) || 0,
        }))
      );
    }

    const onCommitted = draft.onCommitted;
    setDraft(null);
    await refresh();
    if (typeof onCommitted === "function") onCommitted();
    return { ok: true };
  }, [draft, refresh]);

  // ── Add customer ──
  const addCustomer = useCallback(async (c) => {
    const saved = await api.createCustomer({
      name: (c.name || "").trim(),
      phone: c.phone || "",
      isContractor: !!c.isContractor,
      siteNote: c.siteNote || "",
    });
    await refresh();
    return saved;
  }, [refresh]);

  // ── Products ──
  // Creation happens from Add Stock (bulk) or the quick-add while billing.
  const addProduct = useCallback(async (p) => {
    const unit = p.unit === "piece" ? "piece" : "box";
    const saved = await api.createProduct({
      name: (p.name || "").trim(),
      code: p.code || "",
      company: p.company || "",
      size: unit === "piece" ? "" : (normalizeTileSize(p.size) || p.size || ""),
      unit,
      piecesPerBox: unit === "piece" ? 1 : Math.max(1, Number(p.piecesPerBox) || 1),
      sellPrice: Number(p.sellPrice) || 0,
      stockQty: Number(p.stockQty) || 0,
      lowStockThreshold: Number(p.lowStockThreshold) || 0,
    });
    await refresh();
    return saved;
  }, [refresh]);

  const updateProduct = useCallback(async (id, p) => {
    const unit = p.unit === "piece" ? "piece" : "box";
    await api.updateProduct(id, {
      ...p,
      unit,
      size: unit === "piece" ? "" : (normalizeTileSize(p.size) || p.size || ""),
      piecesPerBox: unit === "piece" ? 1 : Math.max(1, Number(p.piecesPerBox) || 1),
    });
    await refresh();
  }, [refresh]);

  // ── Convert store-credit return → cash / adjust udhari ──
  const convertStoreCreditReturn = useCallback(async (invoiceId, patch) => {
    const inv = await api.convertStoreCreditReturn(invoiceId, patch);
    await refresh();
    return inv;
  }, [refresh]);

  // ── Gemini readiness (always true now since it's proxied through backend) ──
  const geminiReady = true;

  const value = {
    user, authLoading, shop, saveShop, logout,
    bootError, retryBoot, dataError,
    products, customers, invoices, returns, expenses, refresh,
    draft, setDraft, commitDraft, cancelDraft: () => setDraft(null), commitBill, allocatePayment, reconcileCustomer,
    isDemo: false, geminiReady,
    addProduct, updateProduct, convertStoreCreditReturn, addCustomer,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
