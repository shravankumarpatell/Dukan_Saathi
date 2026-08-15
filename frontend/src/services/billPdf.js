// Client-side PDFs. jsPDF + jspdf-autotable + to-words. Amounts are plain numbers
// (all amounts are in Rupees — no "Rs." printed anywhere per requirement).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ToWords } from "to-words";
import { computeBillTotals, fmtDate, fmtTime, itemAmount, round2 } from "@/lib/calc";
import { formatQtyLabel } from "@/lib/units";

const toWords = new ToWords({ localeCode: "en-IN", converterOptions: { currency: true, ignoreDecimal: false, ignoreZeroCurrency: false } });
const words = (n) => { try { return toWords.convert(Math.round(Number(n) || 0), { currency: true }); } catch { return ""; } };
const num = (n) => (Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INDIGO = [49, 46, 129];

/** Safe single path segment for download filenames. */
function safeFilePart(s) {
  return String(s || "")
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    || "file";
}

export function billPdfFilename({ invoice, customer } = {}) {
  const name = customer?.name || invoice?.customerName || "Walk-in";
  const no = invoice?.invoiceNo || "DRAFT";
  return `${safeFilePart(name)}_${safeFilePart(no)}.pdf`;
}

export function dailySummaryPdfFilename(dateISO) {
  const d = new Date(dateISO || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `dailysummary_${y}-${m}-${day}.pdf`;
}

function emit(doc, output, filename) {
  const file = filename || "document.pdf";
  try {
    doc.setProperties({ title: file.replace(/\.pdf$/i, "") });
  } catch { /* ignore */ }

  if (output === "doc") return doc;
  if (output === "save") return doc.save(file);
  if (output === "newtab") {
    // Deprecated: prefer "bloburl" + PdfViewerDialog.
    window.open(doc.output("bloburl"), "_blank");
    return;
  }
  if (output === "datauristring") return doc.output("datauristring");
  return { url: doc.output("bloburl"), filename: file };
}

const qtyLabel = (it) => formatQtyLabel(it);

export function generateBillPDF({ shop, invoice, customer }, output = "bloburl") {
  const draft = invoice;
  const isReturn = draft.type === "return";
  const totals = computeBillTotals(draft);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const filename = billPdfFilename({ invoice: draft, customer });

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
  const when = new Date(draft.date || Date.now());
  doc.text(
    "Date: " + when.toLocaleDateString("en-IN") + "  " + when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
    W - M,
    86,
    { align: "right" },
  );
  if (isReturn && draft.originalInvoiceNo) doc.text("Against: " + draft.originalInvoiceNo, W - M, 100, { align: "right" });

  let y = Math.max(ly, 108) + 6;
  doc.setDrawColor(...INDIGO); doc.setLineWidth(2); doc.line(M, y, W - M, y); doc.setLineWidth(0.5); y += 18;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(30);
  // Party heading follows the role ticked on the bill: contractor/dealer vs retail customer.
  const isContractor = !!(draft.isContractor ?? customer?.isContractor);
  const partyHeading =
    draft.type === "purchase" ? "SUPPLIER"
      : isContractor ? "CONTRACTOR / DEALER"
        : "BILL TO";
  doc.text(partyHeading, M, y);
  doc.setFont("helvetica", "normal"); y += 14; doc.setFontSize(11);
  doc.text(customer?.name || draft.customerName || "Walk-in Customer", M, y);
  doc.setFontSize(9); doc.setTextColor(90);
  const phone = customer?.phone || draft.customerPhone;
  if (phone) { y += 12; doc.text("Ph: " + phone, M, y); }
  const site = draft.siteNote || customer?.siteNote;
  if (isContractor && site) { y += 12; doc.text("Site: " + site, M, y); }
  y += 12;

  const body = (draft.items || []).map((it, i) => [i + 1, it.name, qtyLabel(it), num(it.rate), num(itemAmount(it))]);
  autoTable(doc, {
    startY: y + 6,
    head: [["#", "Item", { content: "Qty", styles: { halign: "center" } }, { content: "Rate", styles: { halign: "right" } }, { content: "Amount", styles: { halign: "right" } }]],
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
  }

  doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
  doc.text(isReturn ? "This is a computer-generated credit note." : "This is a computer-generated invoice.", M, H - 30);
  doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, filename);
}

/**
 * Slim receipt when a store-credit return is paid out as cash.
 * Not a full return invoice — just the conversion proof for the customer.
 */
export function generateStoreCreditCashReceiptPDF(
  { shop, customer, returnInvoice, amount, at } = {},
  output = "bloburl"
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const retNo = returnInvoice?.invoiceNo || "RET";
  const custName = customer?.name || returnInvoice?.customerName || "Walk-in";
  const when = new Date(at || returnInvoice?.settlementConvertedAt || Date.now());
  const payOut = round2(amount ?? returnInvoice?.settlementDetail?.cash ?? returnInvoice?.refundTotal ?? 0);
  const filename = `${safeFilePart(custName)}_SC-Cash_${safeFilePart(retNo)}.pdf`;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INDIGO);
  doc.text(shop?.name || "DukanSaathi", M, 54);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  let ly = 72;
  if (shop?.address) { doc.text(shop.address, M, ly); ly += 12; }
  if (shop?.phone) { doc.text("Ph: " + shop.phone, M, ly); ly += 12; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(190, 30, 45);
  doc.text("STORE CREDIT → CASH REFUND", W - M, 54, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(
    "Date: " + when.toLocaleDateString("en-IN") + "  " + when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
    W - M,
    72,
    { align: "right" },
  );

  let y = Math.max(ly, 96) + 8;
  doc.setDrawColor(...INDIGO); doc.setLineWidth(2); doc.line(M, y, W - M, y); doc.setLineWidth(0.5);
  y += 28;

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(30);
  doc.text("Customer", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(12);
  y += 16;
  doc.text(custName, M, y);
  y += 28;

  const rows = [
    ["Against return invoice", retNo],
    ["Original sale", returnInvoice?.originalInvoiceNo || "—"],
    ["Conversion", "Store credit → Cash refund"],
    ["Amount paid (cash)", num(payOut)],
    [
      "Date & time",
      when.toLocaleDateString("en-IN") + "  " + when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
    ],
  ];

  autoTable(doc, {
    startY: y,
    theme: "grid",
    body: rows,
    styles: { fontSize: 10, textColor: 40, cellPadding: 8 },
    columnStyles: {
      0: { cellWidth: 160, fontStyle: "bold", textColor: 80 },
      1: { cellWidth: W - 2 * M - 160 },
    },
    margin: { left: M, right: M },
  });

  y = doc.lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text("Customer ne store credit ke badle cash liya. Ye chhota receipt unke liye hai.", M, y);

  doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
  doc.text("This is a computer-generated receipt.", M, H - 30);
  doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, filename);
}

export function generateDailySummaryPDF({ shop, dateISO, stats, sales, expenses }, output = "bloburl") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const tableW = W - 2 * M;
  const filename = dailySummaryPdfFilename(dateISO);

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INDIGO); doc.text(shop?.name || "DukanSaathi", M, 50);
  doc.setFontSize(13); doc.setTextColor(30); doc.text("Daily Day-book", M, 72);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90); doc.text(fmtDate(dateISO), W - M, 72, { align: "right" });

  // Summary: label left, amount right (space-between across full width).
  autoTable(doc, {
    startY: 96,
    theme: "grid",
    tableWidth: tableW,
    head: [["Summary", { content: "Amount", styles: { halign: "right" } }]],
    headStyles: { fillColor: INDIGO, textColor: 255 },
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: tableW - 120, halign: "left" },
      1: { cellWidth: 120, halign: "right" },
    },
    body: [
      ["Net Sales / Kamayi", num(stats.salesRevenue)],
      ["Cash Collected", num(stats.cashCollected)],
      ["Online Collected", num(stats.onlineCollected)],
      ["Udhari Given Today", num(stats.udhariAdded)],
      ["Udhari Collected Today", num(stats.udhariCollected)],
      ["Cash Expenses", num(stats.cashExpenses ?? 0)],
      ["Online Expenses", num(stats.onlineExpenses ?? 0)],
      ["Net Cash Position", num(stats.netCash)],
      ["Net Online Position", num(stats.netOnline ?? 0)],
    ],
    margin: { left: M, right: M },
  });

  let y = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30); doc.text("Sales Details", M, y);

  // Time | Invoice | Customer | Amount — full width, amount pinned right.
  const saleCol = {
    time: 72,
    invoice: 110,
    amount: 100,
  };
  saleCol.customer = tableW - saleCol.time - saleCol.invoice - saleCol.amount;

  const saleRows = (sales && sales.length
    ? sales
    : [{ invoiceNo: "-", customerName: "No sales today", grandTotal: 0, date: null }]
  ).map((s) => [fmtTime(s.date), s.invoiceNo, s.customerName, num(s.grandTotal)]);

  autoTable(doc, {
    startY: y + 8,
    theme: "striped",
    tableWidth: tableW,
    head: [[
      "Time",
      "Invoice",
      "Customer",
      { content: "Amount", styles: { halign: "right" } },
    ]],
    headStyles: { fillColor: [5, 150, 105], textColor: 255 },
    body: saleRows,
    columnStyles: {
      0: { cellWidth: saleCol.time, halign: "left" },
      1: { cellWidth: saleCol.invoice, halign: "left" },
      2: { cellWidth: saleCol.customer, halign: "left" },
      3: { cellWidth: saleCol.amount, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  y = doc.lastAutoTable.finalY + 20;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30); doc.text("Expenses Detail", M, y);

  const expCol = {
    time: 72,
    mode: 80,
    amount: 100,
  };
  expCol.note = tableW - expCol.time - expCol.mode - expCol.amount;

  const expRows = (expenses && expenses.length
    ? expenses
    : [{ note: "No expenses today", mode: "-", amount: 0, date: null }]
  ).map((e) => [fmtTime(e.date), e.note || "-", e.mode, num(e.amount)]);

  autoTable(doc, {
    startY: y + 8,
    theme: "striped",
    tableWidth: tableW,
    head: [[
      "Time",
      "Note",
      "Mode",
      { content: "Amount", styles: { halign: "right" } },
    ]],
    headStyles: { fillColor: [234, 88, 12], textColor: 255 },
    body: expRows,
    columnStyles: {
      0: { cellWidth: expCol.time, halign: "left" },
      1: { cellWidth: expCol.note, halign: "left" },
      2: { cellWidth: expCol.mode, halign: "left" },
      3: { cellWidth: expCol.amount, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  doc.setDrawColor(225); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150); doc.text("This is a computer-generated day-book.", M, H - 30);
  doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, filename);
}
