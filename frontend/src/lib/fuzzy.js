import Fuse from "fuse.js";

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

export function searchProducts(products, query) {
  if (!query || !query.trim()) return products.slice(0, 30);
  const fuse = new Fuse(products, { keys: ["name", "code", "company", "size"], threshold: 0.4 });
  return fuse.search(query).map((r) => r.item).slice(0, 30);
}
