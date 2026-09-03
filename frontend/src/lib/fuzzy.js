import Fuse from "fuse.js";
import { stockAvailPieces } from "./units";

/** In-stock first (by sales qty desc), then zero-stock at bottom. */
export function sortProductsForSearch(products, salesQty = {}) {
  return [...products].sort((a, b) => {
    const aZero = stockAvailPieces(a) <= 0;
    const bZero = stockAvailPieces(b) <= 0;
    if (aZero !== bZero) return aZero ? 1 : -1;
    const diff = (salesQty[b.id] || 0) - (salesQty[a.id] || 0);
    if (diff !== 0) return diff;
    return String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" });
  });
}

export function matchProduct(products, query) {
  if (!query) return { best: null, matches: [] };
  const fuse = new Fuse(products, {
    keys: ["name", "code", "company"],
    threshold: 0.45,
    includeScore: true,
  });
  const res = fuse.search(String(query)).slice(0, 5);
  return {
    best: res[0] ? res[0].item : null,
    bestScore: res[0] ? res[0].score : 1,
    matches: res.map((r) => r.item),
    ambiguous: res.length > 1 && res[1].score - res[0].score < 0.12,
  };
}

export function matchCustomer(customers, query, phone) {
  if (phone) {
    const byPhone = customers.find((c) => c.phone && c.phone.replace(/\D/g, "") === String(phone).replace(/\D/g, ""));
    if (byPhone) return { best: byPhone, matches: [byPhone], ambiguous: false };
  }
  if (!query) return { best: null, matches: [] };
  const fuse = new Fuse(customers, { keys: ["name", "phone"], threshold: 0.4, includeScore: true });
  const res = fuse.search(String(query)).slice(0, 5);
  return {
    best: res[0] ? res[0].item : null,
    matches: res.map((r) => r.item),
    ambiguous: res.length > 1 && res[1].score - res[0].score < 0.1,
  };
}

export function searchProducts(products, query, salesQty = {}, limit = 30) {
  let list;
  if (!query || !query.trim()) {
    list = products;
  } else {
    const fuse = new Fuse(products, { keys: ["name", "code", "company", "size"], threshold: 0.4 });
    list = fuse.search(query).map((r) => r.item);
  }
  const sorted = sortProductsForSearch(list, salesQty);
  // limit falsy/Infinity → return the full catalog (e.g. the Stock page).
  return limit && Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
}

export function searchCustomers(customers, query) {
  if (!query || !query.trim()) return customers.slice(0, 8);
  const fuse = new Fuse(customers, { keys: ["name", "phone"], threshold: 0.4 });
  return fuse.search(query).map((r) => r.item).slice(0, 8);
}

export function searchInvoices(invoices, query) {
  const q = String(query || "").trim();
  if (!q) return [];
  const fuse = new Fuse(invoices, { keys: ["invoiceNo", "customerName"], threshold: 0.4 });
  return fuse.search(q).map((r) => r.item).slice(0, 8);
}
