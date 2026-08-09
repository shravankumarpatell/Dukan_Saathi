// Fully client-side PDF generation (no server, ₹0 cost, works on Firebase Hosting).
// jsPDF (document) + jspdf-autotable (line-item tables) + to-words (amount in words, en-IN Rupees).
// NOTE: jsPDF's built-in fonts cannot render the ₹ glyph (it prints as "¹"), so all PDF
// amounts use the "Rs." prefix with Indian-style digit grouping — matching the target design.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ToWords } from "to-words";
import { computeBillTotals, fmtDate } from "@/lib/calc";

const toWords = new ToWords({
  localeCode: "en-IN",
  converterOptions: { currency: true, ignoreDecimal: false, ignoreZeroCurrency: false },
});

function amountInWords(n) {
  try { return toWords.convert(Math.round(Number(n) || 0), { currency: true }); }
  catch { return ""; }
}

// "Rs. 1,23,456.00" — Indian grouping, 2 decimals, no unicode rupee glyph.
function inr(n) {
  const v = Number(n) || 0;
  return "Rs. " + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const INDIGO = [49, 46, 129];

function emit(doc, output, filename) {
  if (output === "doc") return doc;
  if (output === "save") return doc.save(filename || "document.pdf");
  if (output === "newtab") { window.open(doc.output("bloburl"), "_blank"); return; }
  if (output === "datauristring") return doc.output("datauristring");
  return doc.output("bloburl");
}

// Tally-style invoice with optional GST breakup, discount rows, payment/udhari status.
export function generateBillPDF({ shop, invoice, customer }, output = "bloburl") {
  const draft = invoice;
  const totals = computeBillTotals(draft);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  // Header: shop (left) + document type & meta (right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...INDIGO);
  doc.text(shop?.name || "DukanSaathi", M, 54);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  let ly = 72;
  if (shop?.address) { doc.text(shop.address, M, ly); ly += 12; }
  if (shop?.phone) { doc.text("Ph: " + shop.phone, M, ly); ly += 12; }
  if (shop?.gstEnabled && shop?.gstin) { doc.text("GSTIN: " + shop.gstin, M, ly); ly += 12; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20);
  const title = draft.type === "purchase" ? "PURCHASE / STOCK-IN" : (shop?.gstEnabled ? "TAX INVOICE" : "INVOICE");
  doc.text(title, W - M, 54, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text("Invoice No: " + (draft.invoiceNo || "DRAFT"), W - M, 72, { align: "right" });
  doc.text("Date: " + new Date(draft.date || Date.now()).toLocaleDateString("en-IN"), W - M, 86, { align: "right" });
  doc.text("Via: " + (draft.createdVia === "voice" ? "Voice" : "Manual"), W - M, 100, { align: "right" });

  let y = Math.max(ly, 108) + 6;
  doc.setDrawColor(...INDIGO);
  doc.setLineWidth(2);
  doc.line(M, y, W - M, y);
  doc.setLineWidth(0.5);
  y += 18;

  // Bill To
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(30);
  doc.text(draft.type === "purchase" ? "SUPPLIER" : "BILL TO", M, y);
  doc.setFont("helvetica", "normal");
  y += 14;
  doc.setFontSize(11);
  doc.text(customer?.name || draft.customerName || "Walk-in Customer", M, y);
  doc.setFontSize(9); doc.setTextColor(90);
  if (customer?.phone) { y += 12; doc.text("Ph: " + customer.phone, M, y); }
  if (customer?.siteNote) { y += 12; doc.text("Site: " + customer.siteNote, M, y); }
  y += 12;

  const body = (draft.items || []).map((it, i) => [
    i + 1,
    it.name + (it.unit ? `  (${it.unit})` : ""),
    String(it.qty),
    inr(it.rate),
    inr((Number(it.qty) || 0) * (Number(it.rate) || 0)),
  ]);

  autoTable(doc, {
    startY: y + 6,
    head: [["#", "Item", "Qty", "Rate", "Amount"]],
    body,
    theme: "grid",
    headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 9, halign: "left" },
    bodyStyles: { fontSize: 9, textColor: 40 },
    columnStyles: {
      0: { cellWidth: 28, halign: "left" },
      1: { halign: "left" },
      2: { halign: "center", cellWidth: 55 },
      3: { halign: "right", cellWidth: 95 },
      4: { halign: "right", cellWidth: 100 },
    },
    margin: { left: M, right: M },
  });

  // Totals block (right aligned)
  let yy = doc.lastAutoTable.finalY + 18;
  const rx = W - M;
  const lx = W - M - 230;
  const row = (label, val, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 9);
    doc.setTextColor(bold ? 20 : 80);
    doc.text(label, lx, yy);
    doc.text(val, rx, yy, { align: "right" });
    yy += bold ? 20 : 15;
  };
  row("Subtotal", inr(totals.subtotal));
  if (totals.discountOff > 0) row("Discount", "- " + inr(totals.discountOff));
  if (totals.gstRate > 0) row(`GST @ ${totals.gstRate}%`, inr(totals.gstAmount));
  doc.setDrawColor(200); doc.line(lx, yy - 7, rx, yy - 7);
  row("Grand Total", inr(totals.grandTotal), true);

  // Amount in words (left)
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  doc.setTextColor(90);
  const wl = doc.splitTextToSize("Amount in words: " + amountInWords(totals.grandTotal), W - 2 * M - 240);
  doc.text(wl, M, doc.lastAutoTable.finalY + 30);

  // Payments + status
  let py = yy + 6;
  (draft.payments || []).forEach((p) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70);
    doc.text(`Paid via ${p.mode}: ${inr(p.amount)}`, M, py); py += 13;
  });
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  if (totals.amountPending > 0.5) {
    doc.setTextColor(225, 29, 72);
    doc.text(`Status: PENDING (Udhari) ${inr(totals.amountPending)}`, M, py); py += 15;
  } else {
    doc.setTextColor(5, 150, 105);
    doc.text("Status: PAID", M, py); py += 15;
  }
  if (totals.ewayRequired) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(217, 119, 6);
    doc.text("* E-way bill required (invoice value >= Rs. 50,000)", M, py);
  }

  // Footer
  doc.setDrawColor(225); doc.setLineWidth(0.5);
  doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
  doc.text("This is a computer-generated invoice.", M, H - 30);
  doc.setTextColor(...INDIGO);
  doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });

  return emit(doc, output, `${draft.invoiceNo || "bill"}.pdf`);
}

// Printable daily day-book (F6): sales, cash/online, udhari, expenses, net cash.
export function generateDailySummaryPDF({ shop, dateISO, stats, expenses }, output = "newtab") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INDIGO);
  doc.text(shop?.name || "DukanSaathi", M, 50);
  doc.setFontSize(13);
  doc.setTextColor(30);
  doc.text("Daily Day-book", M, 72);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(fmtDate(dateISO), W - M, 72, { align: "right" });

  autoTable(doc, {
    startY: 92,
    theme: "grid",
    head: [["Metric", "Amount"]],
    headStyles: { fillColor: INDIGO, textColor: 255 },
    bodyStyles: { fontSize: 10 },
    columnStyles: { 1: { halign: "right", cellWidth: 180 } },
    body: [
      ["Sales Revenue", inr(stats.salesRevenue)],
      ["Cash Collected", inr(stats.cashCollected)],
      ["Online Collected", inr(stats.onlineCollected)],
      ["Udhari Added Today", inr(stats.udhariAdded)],
      ["Udhari Collected Today", inr(stats.udhariCollected)],
      ["Expenses", inr(stats.expensesTotal)],
      ["Net Cash Position", inr(stats.netCash)],
    ],
    margin: { left: M, right: M },
  });

  let y = doc.lastAutoTable.finalY + 20;
  if (expenses && expenses.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30);
    doc.text("Expenses Detail", M, y);
    autoTable(doc, {
      startY: y + 8,
      theme: "striped",
      head: [["Note", "Mode", "Amount"]],
      headStyles: { fillColor: [234, 88, 12], textColor: 255 },
      body: expenses.map((e) => [e.note || "-", e.mode, inr(e.amount)]),
      columnStyles: { 2: { halign: "right" } },
      margin: { left: M, right: M },
    });
  }

  doc.setDrawColor(225); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
  doc.text("This is a computer-generated day-book.", M, H - 30);
  doc.setTextColor(...INDIGO);
  doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, "daily-summary.pdf");
}
