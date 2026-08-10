// Client-side PDFs. jsPDF + jspdf-autotable + to-words. Amounts are plain numbers
// (all amounts are in Rupees — no "Rs." printed anywhere per requirement).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ToWords } from "to-words";
import { computeBillTotals, fmtDate, itemAmount, round2 } from "@/lib/calc";

const toWords = new ToWords({ localeCode: "en-IN", converterOptions: { currency: true, ignoreDecimal: false, ignoreZeroCurrency: false } });
const words = (n) => { try { return toWords.convert(Math.round(Number(n) || 0), { currency: true }); } catch { return ""; } };
const num = (n) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INDIGO = [49, 46, 129];

function emit(doc, output, filename) {
  if (output === "doc") return doc;
  if (output === "save") return doc.save(filename || "document.pdf");
  if (output === "newtab") { window.open(doc.output("bloburl"), "_blank"); return; }
  if (output === "datauristring") return doc.output("datauristring");
  return doc.output("bloburl");
}

const qtyLabel = (it) => `${it.qty}${it.unit === "box" ? " box" : " " + (it.unit || "")}${Number(it.pieces) > 0 ? ` + ${it.pieces} pc` : ""}`;

export function generateBillPDF({ shop, invoice, customer }, output = "bloburl") {
  const draft = invoice;
  const isReturn = draft.type === "return";
  const totals = computeBillTotals(draft);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;

  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...INDIGO);
  doc.text(shop?.name || "DukanSaathi", M, 54);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  let ly = 72;
  if (shop?.address) { doc.text(shop.address, M, ly); ly += 12; }
  if (shop?.phone) { doc.text("Ph: " + shop.phone, M, ly); ly += 12; }
  if (shop?.gstEnabled && shop?.gstin) { doc.text("GSTIN: " + shop.gstin, M, ly); ly += 12; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(isReturn ? 190 : 20, isReturn ? 30 : 20, isReturn ? 45 : 20);
  const title = isReturn ? "RETURN INVOICE" : (draft.type === "purchase" ? "PURCHASE / STOCK-IN" : (shop?.gstEnabled ? "TAX INVOICE" : "INVOICE"));
  doc.text(title, W - M, 54, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text("No: " + (draft.invoiceNo || "DRAFT"), W - M, 72, { align: "right" });
  doc.text("Date: " + new Date(draft.date || Date.now()).toLocaleDateString("en-IN"), W - M, 86, { align: "right" });
  if (isReturn && draft.originalInvoiceNo) doc.text("Against: " + draft.originalInvoiceNo, W - M, 100, { align: "right" });

  let y = Math.max(ly, 108) + 6;
  doc.setDrawColor(...INDIGO); doc.setLineWidth(2); doc.line(M, y, W - M, y); doc.setLineWidth(0.5); y += 18;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30);
  doc.text(draft.type === "purchase" ? "SUPPLIER" : "PARTY", M, y);
  doc.setFont("helvetica", "normal"); y += 14; doc.setFontSize(11);
  doc.text(customer?.name || draft.customerName || "Walk-in Customer", M, y);
  doc.setFontSize(9); doc.setTextColor(90);
  if (customer?.phone) { y += 12; doc.text("Ph: " + customer.phone, M, y); }
  y += 12;

  const body = (draft.items || []).map((it, i) => [i + 1, it.name, qtyLabel(it), num(it.rate), num(itemAmount(it))]);
  autoTable(doc, {
    startY: y + 6,
    head: [["#", "Item", "Qty", "Rate", "Amount"]],
    body, theme: "grid",
    headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: 40 },
    columnStyles: { 0: { cellWidth: 26 }, 2: { halign: "center", cellWidth: 90 }, 3: { halign: "right", cellWidth: 85 }, 4: { halign: "right", cellWidth: 90 } },
    margin: { left: M, right: M },
  });

  let yy = doc.lastAutoTable.finalY + 20;
  const rx = W - M, lx = W - M - 240;
  const trow = (label, val, bold) => { doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(bold ? 12 : 9); doc.setTextColor(bold ? 20 : 80); doc.text(label, lx, yy); doc.text(val, rx, yy, { align: "right" }); yy += bold ? 4 : 15; };

  if (isReturn) {
    trow("Items Value", num(totals.subtotal));
    yy += 6; doc.setDrawColor(190); doc.setLineWidth(0.8); doc.line(lx, yy, rx, yy); doc.setLineWidth(0.5); yy += 18;
    trow("Refund Total", num(draft.refundTotal ?? totals.grandTotal), true);
    let py = yy + 12; doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(5, 150, 105);
    const sMap = { cash: "Cash refund", adjust_udhari: "Adjusted against udhari", store_credit: "Store credit issued" };
    doc.text("Settlement: " + (sMap[draft.settlement] || draft.settlement || "-"), M, py);
  } else {
    trow("Subtotal", num(totals.subtotal));
    if (totals.discountOff > 0) trow("Discount", "- " + num(totals.discountOff));
    if (totals.gstRate > 0) trow(`GST @ ${totals.gstRate}%`, num(totals.gstAmount));
    yy += 6; doc.setDrawColor(190); doc.setLineWidth(0.8); doc.line(lx, yy, rx, yy); doc.setLineWidth(0.5); yy += 18;
    trow("Grand Total", num(totals.grandTotal), true);
    doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90);
    const wl = doc.splitTextToSize("Amount in words: " + words(totals.grandTotal), W - 2 * M - 250);
    doc.text(wl, M, doc.lastAutoTable.finalY + 30);
    let py = yy + 12;
    (draft.payments || []).forEach((p) => { doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70); doc.text(`Paid via ${p.mode}: ${num(p.amount)}`, M, py); py += 13; });
    doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    if (totals.amountPending > 0.5) { doc.setTextColor(225, 29, 72); doc.text("Status: PENDING", M, py); py += 14; doc.text(`Balance Due: ${num(totals.amountPending)}`, M, py); py += 15; }
    else { doc.setTextColor(5, 150, 105); doc.text("Status: PAID", M, py); py += 15; }
    if (totals.ewayRequired) { doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(217, 119, 6); doc.text("* E-way bill required (value >= 50,000)", M, py); }
  }

  doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
  doc.text(isReturn ? "This is a computer-generated credit note." : "This is a computer-generated invoice.", M, H - 30);
  doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, `${draft.invoiceNo || "bill"}.pdf`);
}

export function generateDailySummaryPDF({ shop, dateISO, stats, sales, expenses }, output = "newtab") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const M = 40;
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INDIGO); doc.text(shop?.name || "DukanSaathi", M, 50);
  doc.setFontSize(13); doc.setTextColor(30); doc.text("Daily Day-book", M, 72);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90); doc.text(fmtDate(dateISO), W - M, 72, { align: "right" });
  autoTable(doc, {
    startY: 96, theme: "grid", head: [["Summary", "Amount"]],
    headStyles: { fillColor: INDIGO, textColor: 255 }, bodyStyles: { fontSize: 10 }, columnStyles: { 1: { halign: "right", cellWidth: 180 } },
    body: [["Sales Revenue", num(stats.salesRevenue)], ["Cash Collected", num(stats.cashCollected)], ["Online Collected", num(stats.onlineCollected)], ["Udhari Added Today", num(stats.udhariAdded)], ["Udhari Collected Today", num(stats.udhariCollected)], ["Expenses", num(stats.expensesTotal)], ["Net Cash Position", num(stats.netCash)]],
    margin: { left: M, right: M },
  });
  let y = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30); doc.text("Sales / Income Detail", M, y);
  autoTable(doc, { startY: y + 8, theme: "striped", head: [["Invoice", "Customer", "Amount"]], headStyles: { fillColor: [5, 150, 105], textColor: 255 }, body: (sales && sales.length ? sales : [{ invoiceNo: "-", customerName: "No sales today", grandTotal: 0 }]).map((s) => [s.invoiceNo, s.customerName, num(s.grandTotal)]), columnStyles: { 2: { halign: "right" } }, margin: { left: M, right: M } });
  y = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30); doc.text("Expenses Detail", M, y);
  autoTable(doc, { startY: y + 8, theme: "striped", head: [["Note", "Mode", "Amount"]], headStyles: { fillColor: [234, 88, 12], textColor: 255 }, body: (expenses && expenses.length ? expenses : [{ note: "No expenses today", mode: "-", amount: 0 }]).map((e) => [e.note || "-", e.mode, num(e.amount)]), columnStyles: { 2: { halign: "right" } }, margin: { left: M, right: M } });
  doc.setDrawColor(225); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150); doc.text("This is a computer-generated day-book.", M, H - 30);
  doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, "daily-summary.pdf");
}
