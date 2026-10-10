/** Click-to-chat helpers. Opens the shopkeeper's WhatsApp with a filled message. */

function rs(n) {
  const v = Number(n) || 0;
  const formatted = v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `Rs ${formatted}`;
}

/** 10-digit Indian mobile, or "" when the value is not one. */
export function indianMobileDigits(raw) {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10 || !/^[6-9]/.test(d)) return "";
  return d;
}

export function firstNonEmptyPhone(...values) {
  for (const v of values) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

export function waMeUrl(phone, text) {
  const d = indianMobileDigits(phone);
  if (!d) return null;
  // Desktop app protocol. A https:// link opens a browser tab instead.
  return `whatsapp://send?phone=91${d}&text=${encodeURIComponent(text || "")}`;
}

export function shopWantsWhatsApp(shop) {
  if (shop && shop.whatsappAfterSave === false) return false;
  return true;
}

export function shouldAutoOpenWhatsApp(shop, phone) {
  return shopWantsWhatsApp(shop) && !!indianMobileDigits(phone);
}


function invoicePdfUrl(raw) {
  const url = String(raw || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return "";
  return url;
}

export function buildBillWaText({
  shopName,
  customerName,
  invoiceNo,
  grandTotal,
  amountPaid,
  amountPending,
  pdfUrl,
} = {}) {
  const lines = [
    `Namaste 🙏 ${customerName || ""}`.trim(),
    "",
    "🧾 *Invoice Details*",
    "━━━━━━━━━━━━━━",
    `Bill No: *${invoiceNo || ""}*`,
    `Total: *${rs(grandTotal)}*`,
    `Paid: *${rs(amountPaid)}*`,
    `Balance: *${rs(amountPending)}*`,
    "━━━━━━━━━━━━━━",
  ];
  const link = invoicePdfUrl(pdfUrl);
  if (link) {
    lines.push("", "Your invoice PDF:", link);
  }
  lines.push("", `Thank you for shopping with *${shopName || "DukanSaathi"}*.❤️`);

  return lines.join("\n");
}

/**
 * Build a polished return/refund message.
 */
export function buildReturnWaText({
  shopName,
  invoiceNo,
  amount,
  settlement,
  settlementDetail,
} = {}) {
  const shop = String(shopName || "DukanSaathi").trim();
  const invoice = String(invoiceNo || "").trim();
  const returnAmount = Number(amount) || 0;
  const adjusted = Number(settlementDetail?.udhariAdjusted) || 0;

  const lines = [
    "Namaste 🙏",
    "",
    `*${shop}*`,
    invoice ? `↩️ *Return: ${invoice}*` : "↩️ *Return*",
    "",
  ];

  if (settlement === "adjust_udhari" || adjusted > 0) {
    lines.push(
      `💰 *Udhari Adjusted:* ${rs(adjusted || returnAmount)}`,
      "",
      "Your outstanding balance has been adjusted accordingly."
    );
  } else {
    lines.push(
      `💰 *Return Amount:* ${rs(returnAmount)}`,
      "",
      "The return amount has been processed as per the transaction."
    );
  }

  lines.push(
    "",
    "Thank you for your cooperation. 🙏",
    "Dhanyavaad."
  );

  return lines.join("\n");
}

/**
 * Build a polished udhari collection/payment message.
 */
export function buildVusoolWaText({
  shopName,
  amount,
  mode,
  remainingUdhari,
} = {}) {
  const shop = String(shopName || "DukanSaathi").trim();
  const collected = Number(amount) || 0;
  const remaining = Number(remainingUdhari) || 0;
  const how = mode ? ` (${mode})` : "";

  const lines = [
    "Namaste 🙏",
    "",
    `*${shop}*`,
    "💳 *Payment Received*",
    "",
    `💰 *Amount Received:* ${rs(collected)}${how}`,
    `📌 *Remaining Udhari:* ${rs(remaining)}`,
    "",
    remaining > 0
      ? "Thank you for your payment. Your remaining balance is mentioned above."
      : "🎉 Your account is now fully settled.",
    "",
    "Dhanyavaad 🙏",
  ];

  return lines.join("\n");
}

/**
 * Build a polite customer balance reminder.
 */
export function buildCustomerPingWaText({
  shopName,
  customerName,
  udhari,
} = {}) {
  const shop = String(shopName || "DukanSaathi").trim();
  const customer = String(customerName || "").trim();
  const balance = Number(udhari) || 0;

  const lines = [
    "Namaste 🙏",
    "",
    `*${shop}*`,
  ];

  if (customer) {
    lines.push(`Dear *${customer}*,`);
  }

  lines.push(
    "",
    "This is a gentle reminder regarding your outstanding balance.",
    "",
    `📌 *Udhari Amount:* ${rs(balance)}`,
    "",
    "Kindly clear the pending amount at your convenience.",
    "If you have already made the payment, please ignore this message.",
    "",
    "Thank you for your continued support. 🙏",
    "Dhanyavaad."
  );

  return lines.join("\n");
}

export function openWhatsAppTab({ phone, text, preopened } = {}) {
  const url = waMeUrl(phone, text);
  try { preopened?.close?.(); } catch { /* ignore */ }
  if (!url) return { opened: false, blocked: false, url: null };
  if (typeof document === "undefined") return { opened: false, blocked: true, url };
  try {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { opened: true, blocked: false, url };
  } catch {
    return { opened: false, blocked: true, url };
  }
}

/** Kept so older callers do not open a browser tab. The desktop app is launched after save. */
export function beginWhatsAppOpen() {
  return null;
}
