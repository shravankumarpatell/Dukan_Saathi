// Shop knowledge helpers for the assistant. Live chat streams via the backend
// OpenRouter proxy (`api.streamChat`). localAnswer is an offline fallback.
import { money } from "@/lib/calc";
import { formatStockLabel, unitKindLabel, isBoxUnit, piecesPerBoxOf } from "@/lib/units";

export function buildShopContext({ shop, products, customers, invoices, expenses }) {
  const prod = (products || []).map((p) => {
    const type = isBoxUnit(p)
      ? `tiles (${piecesPerBoxOf(p)} pcs/box${p.size ? `, ${p.size}` : ""})`
      : "sanitary (pcs)";
    return `- ${p.name}${p.code ? ` (${p.code})` : ""}${p.company ? ` — ${p.company}` : ""} | type: ${type} | stock: ${formatStockLabel(p)} | price ₹${p.sellPrice}`;
  }).join("\n");
  const custs = (customers || []).map((c) => `- ${c.name || "Walk-in"}${c.phone ? ` (${c.phone})` : ""}${c.isContractor ? " [contractor]" : ""} — udhari ₹${c.totalPending || 0}, store-credit ₹${c.storeCredit || 0}${c.siteNote ? `, site: ${c.siteNote}` : ""}`).join("\n");
  const recent = (invoices || []).slice(0, 30).map((i) => `- ${i.invoiceNo} | ${new Date(i.date).toLocaleDateString("en-IN")} | ${i.type} | ${i.customerName || "Walk-in"} | total ₹${i.grandTotal} | paid ₹${i.amountPaid || 0} | pending ₹${i.amountPending || 0} (${i.paymentStatus})`).join("\n");
  const today = new Date().toDateString();
  const todaySale = (invoices || []).filter((i) => i.type === "sale" && new Date(i.date).toDateString() === today).reduce((s, i) => s + (i.grandTotal || 0), 0);
  const totalUdhari = (customers || []).reduce((s, c) => s + (c.totalPending || 0), 0);
  const expTotal = (expenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  return `You are DukanSaathi, the AI assistant for a tiles & sanitaryware retail shop. Answer briefly and clearly in the user's language (Hindi/English/Hinglish is fine). Use ONLY the shop data below. If something is not in the data, say you don't have that information — never invent numbers, names, or stock.

SHOP: ${shop?.name || "-"} | Owner: ${shop?.ownerName || "-"} | Phone: ${shop?.phone || "-"} | Address: ${shop?.address || "-"} | GST: ${shop?.gstEnabled ? (shop?.gstin || "enabled") : "not enabled"}

SNAPSHOT: today's sale ₹${todaySale} | total udhari (all customers) ₹${totalUdhari} | total bills ${(invoices || []).length} | total expenses ₹${expTotal}

PRODUCTS (${(products || []).length}):
${prod || "none"}

CUSTOMERS (${(customers || []).length}):
${custs || "none"}

RECENT INVOICES (latest ${Math.min(30, (invoices || []).length)}):
${recent || "none"}`;
}

// Local, offline answer engine using shop data.
export function localAnswer(text, { products, customers, invoices }) {
  const q = text.toLowerCase();
  const findP = () => products.find((p) => q.includes((p.code || "").toLowerCase()) || (p.name && q.includes(p.name.toLowerCase().split(" ")[0])));
  if (/(stock|kitna|bacha|maal)/.test(q)) {
    const p = findP();
    if (p) return `${p.name}: ${formatStockLabel(p)} (${unitKindLabel(p)}). Price ${money(p.sellPrice)}.`;
    const low = products.filter((p) => ((p.showroomQty || 0) + (p.godownQty || 0) + (p.stockQty || 0)) <= (p.lowStockThreshold || 0));
    return low.length ? `Low stock: ${low.map((p) => p.name).join(", ")}.` : "Stock theek hai.";
  }
  if (/(udhari|udhar|pending|baaki|due|balance)/.test(q)) {
    const named = customers.find((c) => q.includes(c.name.toLowerCase().split(" ")[0]));
    if (named) return `${named.name} ka udhari ${money(named.totalPending)} baaki hai.`;
    const tot = customers.reduce((s, c) => s + (c.totalPending || 0), 0);
    const top = [...customers].filter((c) => c.totalPending > 0).sort((a, b) => b.totalPending - a.totalPending).slice(0, 3);
    return `Total udhari ${money(tot)}. Top: ${top.map((c) => `${c.name} (${money(c.totalPending)})`).join(", ") || "none"}.`;
  }
  if (/(top|sabse|best|zyada|bika|seller)/.test(q)) {
    const map = {}; invoices.filter((i) => i.type === "sale").forEach((iv) => iv.items.forEach((it) => { map[it.name] = (map[it.name] || 0) + (Number(it.qty) || 0); }));
    const top = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 3);
    return top.length ? `Top sellers: ${top.map(([n, qn]) => `${n} (${qn})`).join(", ")}.` : "Abhi sale record nahi.";
  }
  if (/(sale|revenue|aaj|today)/.test(q)) {
    const today = new Date().toDateString();
    const rev = invoices.filter((i) => i.type === "sale" && new Date(i.date).toDateString() === today).reduce((s, i) => s + (i.grandTotal || 0), 0);
    return `Aaj ki sale ${money(rev)} hai.`;
  }
  return "Main shop ke stock, udhari, sale aur top-sellers ke sawaalon me madad kar sakta hoon. Poochiye — jaise '2130 highlight ka stock kitna hai?'";
}
