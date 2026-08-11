import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as api from "@/services/api";
import { onAuth, signOut as authSignOut } from "@/services/auth";
import { speak } from "@/hooks/useSpeech";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [returns, setReturns] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [draft, setDraft] = useState(null);

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
  const loadAll = useCallback(async () => {
    try {
      const [p, c, i, e] = await Promise.all([
        api.listProducts(),
        api.listCustomers(),
        api.listInvoices(),
        api.listExpenses(),
      ]);
      setProducts(p);
      setCustomers(c);
      setInvoices(i);
      setExpenses(e);
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  }, []);

  // ── Auth listener ──
  useEffect(() => {
    const unsub = onAuth(async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        try {
          const s = await api.getShop();
          setShop(s);
          await loadAll();
        } catch (err) {
          console.error("Failed to initialize shop:", err);
        }
      } else {
        setShop(null);
        setProducts([]);
        setCustomers([]);
        setInvoices([]);
        setReturns([]);
        setExpenses([]);
      }
    });
    return unsub;
  }, [loadAll]);

  const refresh = useCallback(() => loadAll(), [loadAll]);

  const saveShop = useCallback(async (patch) => {
    const s = await api.updateShop(patch);
    setShop(s);
    return s;
  }, []);

  const logout = useCallback(async () => {
    await authSignOut();
  }, []);

  // ── Create a sale or purchase invoice — all logic is now SERVER-SIDE ──
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
      speak("Return ho gaya.");
      return { invoice: inv, customer: null };
    }

    // Sale or purchase — server computes totals, validates stock, manages everything
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
        size: it.size || "",
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
    speak(d.type === "sale" ? "Bill ban gaya." : "Purchase save ho gayi.");
    return { invoice: inv, customer: null };
  }, [refresh]);

  // ── Record payment allocated across specific pending bills ──
  const allocatePayment = useCallback(async (customerId, allocations, mode) => {
    const result = await api.allocatePayment(customerId, allocations, mode || "cash");
    await refresh();
    return result.totalPaid;
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
          size: r.size || "",
          qty: Number(r.qty) || 0,
          price: Number(r.price) || 0,
        }))
      );
    }

    setDraft(null);
    await refresh();
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

  // ── Product CRUD ──
  const addProduct = useCallback(async (p) => {
    await api.createProduct(p);
    await refresh();
  }, [refresh]);

  const updateProduct = useCallback(async (id, p) => {
    await api.updateProduct(id, p);
    await refresh();
  }, [refresh]);

  // ── Gemini readiness (always true now since it's proxied through backend) ──
  const geminiReady = true;

  const value = {
    user, authLoading, shop, saveShop, logout,
    products, customers, invoices, returns, expenses, refresh,
    draft, setDraft, commitDraft, cancelDraft: () => setDraft(null), commitBill, allocatePayment,
    isDemo: false, geminiReady,
    addProduct, updateProduct, addCustomer, speak,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
