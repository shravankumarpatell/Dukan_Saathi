/** Text and figures for the public invoice link preview. */

const API =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.REACT_APP_API_URL ||
  "http://localhost:8000/api";

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export function rsAmount(value) {
  const amount = Number(value) || 0;
  return `Rs ${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function lineAmount(item) {
  const priced = Number(item?.priceQty) || 0;
  const qty = Number(item?.qty) || 0;
  const rate = Number(item?.rate) || 0;
  return (priced > 0 ? priced : qty) * rate;
}

/** Title and description WhatsApp shows above the invoice picture. */
export function invoiceShareText(payload) {
  const shop = payload?.shop || {};
  const invoice = payload?.invoice || {};
  const shopName = String(shop.name || "").trim() || "Invoice";
  const number = String(invoice.invoiceNo || "").trim();
  const customer = String(invoice.customerName || "").trim() || "Walk-in";
  const isReturn = invoice.type === "return";
  const total = rsAmount(isReturn ? invoice.refundTotal : invoice.grandTotal);
  const paid = rsAmount(invoice.amountPaid);
  const balance = rsAmount(invoice.amountPending);
  const title = number ? `${number} · ${shopName}` : shopName;
  const description = isReturn
    ? `${customer}. Refund ${total}.`
    : `${customer}. Total ${total}. Paid ${paid}. Balance ${balance}.`;
  const items = (invoice.items || []).slice(0, 4).map((item) => ({
    name: String(item?.name || "Item").trim() || "Item",
    amount: rsAmount(lineAmount(item)),
  }));
  return {
    title,
    description,
    shopName,
    number: number || "Invoice",
    customer,
    total,
    paid,
    balance,
    pending: (Number(invoice.amountPending) || 0) > 0.5,
    isReturn,
    items,
    found: !!payload?.invoice,
  };
}

export async function loadSharedBill(token) {
  const value = String(token || "");
  if (!TOKEN.test(value)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API}/b/${encodeURIComponent(value)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
