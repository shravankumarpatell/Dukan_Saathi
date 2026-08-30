import { Wallet, Package, ReceiptIndianRupee, Users } from "lucide-react";

function stockQty(p) {
  return (Number(p?.showroomQty) || 0) + (Number(p?.godownQty) || 0) + (Number(p?.stockQty) || 0);
}

function firstName(name) {
  const n = String(name || "").trim();
  return n || null;
}

/**
 * Four empty-state prompts grounded in this shop's customers / stock / bills.
 * Falls back to generic Hinglish when the ledger is empty.
 */
export function buildChatSuggestions({ customers = [], products = [], invoices = [] } = {}) {
  const out = [];

  const sales = (invoices || [])
    .filter((i) => i.type === "sale")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const recentParty =
    firstName(sales[0]?.customerName)
    || firstName(
      [...customers]
        .filter((c) => (c.name || "").trim())
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))[0]?.name
    );

  out.push({
    hint: "Bill",
    icon: ReceiptIndianRupee,
    q: recentParty ? `${recentParty} ka last bill` : "aaj ke bills dikhao",
  });

  out.push({
    hint: "Kamai",
    icon: Wallet,
    q: "aaj ki kamai",
  });

  const due = [...customers]
    .filter((c) => (Number(c.totalPending) || 0) > 0.5 && firstName(c.name))
    .sort((a, b) => (Number(b.totalPending) || 0) - (Number(a.totalPending) || 0));

  if (due[0]) {
    out.push({
      hint: "Udhari",
      icon: Users,
      q: `${due[0].name} ki udhari kitni hai?`,
    });
  } else {
    out.push({
      hint: "Udhari",
      icon: Users,
      q: "sabse zyada udhari kiska",
    });
  }

  const low = [...products]
    .filter((p) => firstName(p.name) && stockQty(p) <= (Number(p.lowStockThreshold) || 0))
    .sort((a, b) => stockQty(a) - stockQty(b));

  if (low[0]) {
    out.push({
      hint: "Stock",
      icon: Package,
      q: `${low[0].name} ka stock kitna hai?`,
    });
  } else {
    const any = [...products]
      .filter((p) => firstName(p.name))
      .sort((a, b) => stockQty(a) - stockQty(b))[0];
    out.push({
      hint: "Stock",
      icon: Package,
      q: any ? `${any.name} ka stock kitna hai?` : "low stock kaunsa",
    });
  }

  return out.slice(0, 4);
}
