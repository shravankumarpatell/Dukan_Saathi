import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/services/data";
import { onAuth, signOut as authSignOut } from "@/services/auth";
import { computeBillTotals, genInvoiceNo, round2, todayISO } from "@/lib/calc";
import { matchCustomer } from "@/lib/fuzzy";
import { speak } from "@/hooks/useSpeech";
import { IS_DEMO, GEMINI_READY } from "@/services/config";

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
  const [loadingData, setLoadingData] = useState(false);
  const [draft, setDraft] = useState(null); // confirmation-before-commit

  const shopId = user?.uid || null;

  const loadAll = useCallback(async (sid) => {
    if (!sid) return;
    setLoadingData(true);
    const [p, c, i, r, e] = await Promise.all([
      api.list(sid, "products"),
      api.list(sid, "customers"),
      api.list(sid, "invoices"),
      api.list(sid, "returns"),
      api.list(sid, "expenses"),
    ]);
    setProducts(p);
    setCustomers(c);
    setInvoices(i.sort((a, b) => new Date(b.date) - new Date(a.date)));
    setReturns(r);
    setExpenses(e);
    setLoadingData(false);
  }, []);

  useEffect(() => {
    const unsub = onAuth(async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        const s = await api.ensureShop(u.uid, { name: u.shopName || u.name, ownerName: u.name });
        setShop(s);
        await loadAll(u.uid);
      } else {
        setShop(null); setProducts([]); setCustomers([]); setInvoices([]); setReturns([]); setExpenses([]);
      }
    });
    return unsub;
  }, [loadAll]);

  const refresh = useCallback(() => loadAll(shopId), [loadAll, shopId]);

  const saveShop = useCallback(async (patch) => {
    const s = await api.saveShop(shopId, patch);
    setShop(s);
    return s;
  }, [shopId]);

  const logout = useCallback(async () => { await authSignOut(); }, []);

  /* ---------- Customer resolve/create ---------- */
  const resolveCustomer = useCallback(async (draftC) => {
    if (!draftC) return null;
    if (draftC.customerId) return customers.find((c) => c.id === draftC.customerId) || null;
    const name = draftC.customerName;
    if (!name) return null;
    const m = matchCustomer(customers, name, draftC.customerPhone);
    if (m.best && !draftC.forceNew) return m.best;
    return api.add(shopId, "customers", {
      name, phone: draftC.customerPhone || "", isContractor: !!draftC.isContractor,
      siteNote: draftC.siteNote || "", totalPending: 0,
    });
  }, [customers, shopId]);

  /* ---------- Stock movement helpers ---------- */
  const applyStockOut = async (item) => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return;
    let qty = Number(item.qty) || 0;
    let showroom = prod.showroomQty || 0;
    let godown = prod.godownQty || 0;
    const fromShowroom = Math.min(showroom, qty);
    showroom -= fromShowroom;
    godown -= (qty - fromShowroom);
    await api.update(shopId, "products", prod.id, { showroomQty: showroom, godownQty: Math.max(0, godown) });
    await api.add(shopId, "stockLedger", { productId: prod.id, change: -qty, reason: "sale", timestamp: todayISO() });
  };
  const applyStockIn = async (item, reason = "purchase") => {
    const prod = products.find((p) => p.id === item.productId);
    if (!prod) return;
    const qty = Number(item.qty) || 0;
    await api.update(shopId, "products", prod.id, { godownQty: (prod.godownQty || 0) + qty });
    await api.add(shopId, "stockLedger", { productId: prod.id, change: qty, reason, timestamp: todayISO() });
  };

  /* ---------- Commit a draft (the ONLY path that writes money/stock) ---------- */
  const commitDraft = useCallback(async () => {
    if (!draft) return;
    const kind = draft.kind;

    if (kind === "sale" || kind === "purchase") {
      const totals = computeBillTotals(draft);
      const customer = await resolveCustomer(draft);
      const seq = await api.nextInvoiceSeq(shopId);
      const invoiceNo = draft.invoiceNo || genInvoiceNo(seq, draft.gstEnabled);
      const inv = {
        invoiceNo, date: draft.date || todayISO(), type: draft.type,
        customerId: customer?.id || null, customerName: customer?.name || draft.customerName || "Walk-in",
        items: draft.items, discount: draft.discount || null,
        gstEnabled: !!draft.gstEnabled, gstRate: totals.gstRate,
        subtotal: totals.subtotal, discountOff: totals.discountOff, gstAmount: totals.gstAmount, grandTotal: totals.grandTotal,
        payments: draft.payments || [], amountPaid: totals.amountPaid, amountPending: totals.amountPending,
        paymentStatus: totals.paymentStatus, ewayRequired: totals.ewayRequired, createdVia: draft.createdVia || "manual",
      };
      const saved = await api.add(shopId, "invoices", inv);
      for (const it of draft.items) {
        if (kind === "sale") await applyStockOut(it); else await applyStockIn(it);
      }
      if (kind === "sale" && customer && totals.amountPending > 0) {
        await api.update(shopId, "customers", customer.id, { totalPending: round2((customer.totalPending || 0) + totals.amountPending) });
      }
      setDraft(null);
      await refresh();
      speak(draft.language === "en" ? "Bill saved." : "Bill ban gaya. Stock update ho gaya.");
      return { ok: true, invoiceNo, invoice: saved, customer };
    }

    if (kind === "payment") {
      const customer = await resolveCustomer(draft);
      if (customer) {
        await api.update(shopId, "customers", customer.id, { totalPending: round2((customer.totalPending || 0) - (Number(draft.amount) || 0)) });
        await api.add(shopId, "payments", { customerId: customer.id, customerName: customer.name, amount: Number(draft.amount) || 0, mode: draft.mode || "cash", date: todayISO() });
      }
      setDraft(null); await refresh();
      speak(draft.language === "en" ? "Payment recorded." : "Payment jama ho gaya.");
      return { ok: true };
    }

    if (kind === "return") {
      const customer = await resolveCustomer(draft);
      await api.add(shopId, "returns", {
        customerId: customer?.id || null, customerName: customer?.name || draft.customerName || "",
        productId: draft.productId, productName: draft.productName, qty: Number(draft.qty) || 0,
        invoiceId: draft.invoiceId || null, settlement: draft.settlement || "cash", date: todayISO(), createdVia: draft.createdVia || "manual",
      });
      if (draft.productId) await applyStockIn({ productId: draft.productId, qty: draft.qty }, "return");
      if (customer && (draft.settlement === "adjust_udhari" || draft.settlement === "store_credit")) {
        await api.update(shopId, "customers", customer.id, { totalPending: round2((customer.totalPending || 0) - (Number(draft.refundValue) || 0)) });
      }
      setDraft(null); await refresh();
      speak(draft.language === "en" ? "Return recorded and stock restored." : "Return ho gaya, stock wapas add ho gaya.");
      return { ok: true };
    }

    if (kind === "stock_transfer") {
      const prod = products.find((p) => p.id === draft.productId);
      if (prod) {
        const qty = Number(draft.qty) || 0;
        await api.update(shopId, "products", prod.id, {
          godownQty: Math.max(0, (prod.godownQty || 0) - qty),
          showroomQty: (prod.showroomQty || 0) + qty,
        });
      }
      setDraft(null); await refresh();
      speak("Stock showroom me aa gaya.");
      return { ok: true };
    }

    if (kind === "product_save") {
      if (draft.productId) await api.update(shopId, "products", draft.productId, draft.product);
      else await api.add(shopId, "products", draft.product);
      setDraft(null); await refresh();
      return { ok: true };
    }

    if (kind === "bulk_stock") {
      for (const row of draft.rows) {
        const existing = products.find((p) => (p.code && row.code && p.code.toLowerCase() === row.code.toLowerCase()) || p.name.toLowerCase() === (row.name || "").toLowerCase());
        if (existing) {
          await api.update(shopId, "products", existing.id, { godownQty: (existing.godownQty || 0) + (Number(row.qty) || 0), costPrice: Number(row.price) || existing.costPrice });
        } else {
          await api.add(shopId, "products", {
            name: row.name, code: row.code || "", company: row.company || "", size: row.size || "",
            unit: "box", piecesPerBox: 1, costPrice: Number(row.price) || 0, sellPrice: round2((Number(row.price) || 0) * 1.4),
            showroomQty: 0, godownQty: Number(row.qty) || 0, lowStockThreshold: 10,
          });
        }
        await api.add(shopId, "stockLedger", { productName: row.name, change: Number(row.qty) || 0, reason: "bulk_intake", timestamp: todayISO() });
      }
      setDraft(null); await refresh();
      speak("Bulk stock add ho gaya.");
      return { ok: true };
    }

    if (kind === "expense") {
      await api.add(shopId, "expenses", { date: draft.date || todayISO(), amount: Number(draft.amount) || 0, note: draft.note || "", mode: draft.mode || "cash" });
      setDraft(null); await refresh();
      return { ok: true };
    }

    setDraft(null);
  }, [draft, shopId, products, customers, resolveCustomer, refresh]);

  const cancelDraft = useCallback(() => setDraft(null), []);

  const value = {
    user, authLoading, shop, shopId, saveShop, logout,
    products, customers, invoices, returns, expenses, loadingData, refresh,
    draft, setDraft, commitDraft, cancelDraft,
    isDemo: IS_DEMO, geminiReady: GEMINI_READY,
    addProduct: (p) => api.add(shopId, "products", p).then(refresh),
    updateProduct: (id, p) => api.update(shopId, "products", id, p).then(refresh),
    deleteProduct: (id) => api.remove(shopId, "products", id).then(refresh),
    addCustomer: (c) => api.add(shopId, "customers", { totalPending: 0, ...c }).then(refresh),
    updateCustomer: (id, c) => api.update(shopId, "customers", id, c).then(refresh),
    listPayments: () => api.list(shopId, "payments"),
    speak,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
