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
  const [draft, setDraft] = useState(null);
  const shopId = user?.uid || null;

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

  const loadAll = useCallback(async (sid) => {
    if (!sid) return;
    const [p, c, i, r, e] = await Promise.all([api.list(sid, "products"), api.list(sid, "customers"), api.list(sid, "invoices"), api.list(sid, "returns"), api.list(sid, "expenses")]);
    setProducts(p); setCustomers(c); setInvoices(i.sort((a, b) => new Date(b.date) - new Date(a.date))); setReturns(r); setExpenses(e);
  }, []);

  useEffect(() => {
    const unsub = onAuth(async (u) => {
      setUser(u); setAuthLoading(false);
      if (u) { const s = await api.ensureShop(u.uid, { name: u.shopName || u.name, ownerName: u.name }); setShop(s); await loadAll(u.uid); }
      else { setShop(null); setProducts([]); setCustomers([]); setInvoices([]); setReturns([]); setExpenses([]); }
    });
    return unsub;
  }, [loadAll]);

  const refresh = useCallback(() => loadAll(shopId), [loadAll, shopId]);
  const saveShop = useCallback(async (patch) => { const s = await api.saveShop(shopId, patch); setShop(s); return s; }, [shopId]);
  const logout = useCallback(async () => { await authSignOut(); }, []);

  const resolveCustomer = useCallback(async (d) => {
    if (!d) return null;
    if (d.customerId) return customers.find((c) => c.id === d.customerId) || null;
    const name = (d.customerName || "").trim();
    if (!name) return null;
    if (!d.forceNew) { const m = matchCustomer(customers, name, d.customerPhone); if (m.best) return m.best; }
    return api.add(shopId, "customers", { name, phone: d.customerPhone || "", isContractor: !!d.isContractor, siteNote: d.siteNote || "", totalPending: 0, storeCredit: 0 });
  }, [customers, shopId]);

  const stockOut = async (it) => {
    const p = products.find((x) => x.id === it.productId); if (!p) return;
    const ppb = Number(p.piecesPerBox) || 1;
    const soldPieces = (Number(it.qty) || 0) * ppb + (Number(it.pieces) || 0);
    const showPieces = Math.round((p.showroomQty || 0) * ppb);
    const fromShow = Math.min(showPieces, soldPieces);
    const remShow = showPieces - fromShow;
    const remGod = Math.max(0, Math.round((p.godownQty || 0) * ppb) - (soldPieces - fromShow));
    await api.update(shopId, "products", p.id, { showroomQty: round2(remShow / ppb), godownQty: round2(remGod / ppb) });
    await api.add(shopId, "stockLedger", { productId: p.id, change: -soldPieces, reason: "sale", timestamp: todayISO() });
  };
  const stockIn = async (it, reason = "purchase") => {
    const p = products.find((x) => x.id === it.productId); if (!p) return;
    const ppb = Number(p.piecesPerBox) || 1;
    const addPieces = (Number(it.qty) || 0) * ppb + (Number(it.pieces) || 0);
    const godPieces = Math.round((p.godownQty || 0) * ppb) + addPieces;
    await api.update(shopId, "products", p.id, { godownQty: round2(godPieces / ppb) });
    await api.add(shopId, "stockLedger", { productId: p.id, change: addPieces, reason, timestamp: todayISO() });
  };

  // Commit a sale / purchase / return invoice (the write path for bills). Returns saved invoice.
  const commitBill = useCallback(async (d) => {
    const customer = await resolveCustomer(d);
    const isReturn = d.type === "return";
    const seq = await api.nextInvoiceSeq(shopId);
    const invoiceNo = genInvoiceNo(seq, d.gstEnabled, isReturn ? "RET" : (d.type === "purchase" ? "PUR" : undefined));
    const totals = computeBillTotals(d);
    const inv = {
      invoiceNo, date: d.date || todayISO(), type: d.type,
      customerId: customer?.id || null, customerName: customer?.name || d.customerName || "Walk-in",
      items: d.items, discount: d.discount || null, gstEnabled: !!d.gstEnabled, gstRate: totals.gstRate,
      subtotal: totals.subtotal, discountOff: totals.discountOff, gstAmount: totals.gstAmount,
      grandTotal: isReturn ? round2(d.refundTotal || totals.subtotal) : totals.grandTotal,
      payments: d.payments || [], amountPaid: isReturn ? 0 : totals.amountPaid,
      amountPending: isReturn ? 0 : totals.amountPending, paymentStatus: isReturn ? "return" : totals.paymentStatus,
      ewayRequired: totals.ewayRequired, createdVia: d.createdVia || "manual",
      settlement: d.settlement || null, originalInvoiceNo: d.originalInvoiceNo || null, refundTotal: isReturn ? round2(d.refundTotal || totals.subtotal) : undefined,
    };
    const saved = await api.add(shopId, "invoices", inv);
    for (const it of d.items) { if (d.type === "sale") await stockOut(it); else await stockIn(it, isReturn ? "return" : "purchase"); }
    if (customer) {
      if (d.type === "sale" && totals.amountPending > 0) await api.update(shopId, "customers", customer.id, { totalPending: round2((customer.totalPending || 0) + totals.amountPending) });
      const creditUsed = (d.payments || []).filter((p) => p.mode === "credit").reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (d.type === "sale" && creditUsed > 0) await api.update(shopId, "customers", customer.id, { storeCredit: Math.max(0, round2((customer.storeCredit || 0) - creditUsed)) });
      if (isReturn) {
        const r = Number(d.refundTotal || totals.subtotal) || 0;
        if (d.settlement === "adjust_udhari") await api.update(shopId, "customers", customer.id, { totalPending: round2((customer.totalPending || 0) - r) });
        else if (d.settlement === "store_credit") await api.update(shopId, "customers", customer.id, { storeCredit: round2((customer.storeCredit || 0) + r) });
      }
    }
    if (isReturn) await api.add(shopId, "returns", { invoiceNo, originalInvoiceNo: d.originalInvoiceNo || null, customerId: customer?.id || null, customerName: customer?.name || d.customerName, items: d.items, refundTotal: inv.refundTotal, settlement: d.settlement, date: todayISO() });
    await refresh();
    speak(d.type === "sale" ? "Bill ban gaya." : isReturn ? "Return ho gaya." : "Purchase save ho gayi.");
    return { invoice: saved, customer };
  }, [resolveCustomer, shopId, products, refresh]);

  // Record a payment allocated across specific pending bills (udhari settlement).
  const allocatePayment = useCallback(async (customerId, allocations, mode) => {
    const customer = customers.find((c) => c.id === customerId);
    let total = 0;
    for (const a of allocations) {
      const amt = Number(a.amount) || 0; if (amt <= 0) continue; total += amt;
      const inv = invoices.find((i) => i.id === a.invoiceId); if (!inv) continue;
      const paid = round2((inv.amountPaid || 0) + amt);
      const pending = round2((inv.grandTotal || 0) - paid);
      const status = pending <= 0.5 ? "paid" : (paid > 0.5 ? "partial" : "pending");
      await api.update(shopId, "invoices", inv.id, { amountPaid: paid, amountPending: Math.max(0, pending), paymentStatus: status, payments: [...(inv.payments || []), { mode: mode || "cash", amount: amt }] });
    }
    if (customer && total > 0) await api.update(shopId, "customers", customer.id, { totalPending: Math.max(0, round2((customer.totalPending || 0) - total)) });
    await refresh();
    return total;
  }, [customers, invoices, shopId, refresh]);

  // Generic draft commit for expense / stock transfer / bulk (confirmation cards).
  const commitDraft = useCallback(async () => {
    if (!draft) return;
    if (draft.kind === "stock_transfer") {
      const p = products.find((x) => x.id === draft.productId);
      if (p) { const qty = Number(draft.qty) || 0; await api.update(shopId, "products", p.id, { godownQty: Math.max(0, (p.godownQty || 0) - qty), showroomQty: (p.showroomQty || 0) + qty }); }
    } else if (draft.kind === "expense") {
      await api.add(shopId, "expenses", { date: draft.date || todayISO(), amount: Number(draft.amount) || 0, note: draft.note || "", mode: draft.mode || "cash" });
    } else if (draft.kind === "bulk_stock") {
      for (const row of draft.rows) {
        const ex = products.find((p) => (p.code && row.code && p.code.toLowerCase() === row.code.toLowerCase()) || p.name.toLowerCase() === (row.name || "").toLowerCase());
        if (ex) await api.update(shopId, "products", ex.id, { godownQty: (ex.godownQty || 0) + (Number(row.qty) || 0), costPrice: Number(row.price) || ex.costPrice });
        else await api.add(shopId, "products", { name: row.name, code: row.code || "", company: row.company || "", size: row.size || "", unit: "box", piecesPerBox: 1, costPrice: Number(row.price) || 0, sellPrice: round2((Number(row.price) || 0) * 1.4), showroomQty: 0, godownQty: Number(row.qty) || 0, lowStockThreshold: 10 });
      }
    }
    setDraft(null); await refresh();
    return { ok: true };
  }, [draft, shopId, products, refresh]);

  // Add a customer; names are UNIQUE — if the name already exists, return that customer.
  const addCustomer = useCallback(async (c) => {
    const name = (c.name || "").trim();
    if (name) { const existing = customers.find((x) => (x.name || "").trim().toLowerCase() === name.toLowerCase()); if (existing) return existing; }
    const saved = await api.add(shopId, "customers", { totalPending: 0, storeCredit: 0, ...c, name });
    await refresh();
    return saved;
  }, [customers, shopId, refresh]);

  const value = {
    user, authLoading, shop, shopId, saveShop, logout,
    products, customers, invoices, returns, expenses, refresh,
    draft, setDraft, commitDraft, cancelDraft: () => setDraft(null), commitBill, allocatePayment,
    isDemo: IS_DEMO, geminiReady: GEMINI_READY,
    addProduct: (p) => api.add(shopId, "products", p).then(refresh),
    updateProduct: (id, p) => api.update(shopId, "products", id, p).then(refresh),
    addCustomer,
    speak,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
