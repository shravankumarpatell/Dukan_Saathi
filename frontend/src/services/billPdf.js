// Client-side PDFs. jsPDF + jspdf-autotable + to-words. Amounts are plain numbers
// (all amounts are in Rupees — no "Rs." printed anywhere per requirement).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ToWords } from "to-words";
import { computeBillTotals, fmtDate, fmtTime, itemAmount, round2 } from "@/lib/calc";
import { settlementParts } from "@/lib/settlement";
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
  const title = isReturn ? "RETURN INVOICE" : (shop?.gstEnabled ? "TAX INVOICE" : "INVOICE");
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
  // Party heading follows the role ticked on the bill: contractor/dealer vs customer.
  const isContractor = !!(draft.isContractor ?? customer?.isContractor);
  const partyHeading = isContractor ? "CONTRACTOR / DEALER" : "BILL TO";
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
    let py = yy + 12;
    const parts = settlementParts(draft.settlementDetail);
    if (parts.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(5, 150, 105);
      doc.text("Settlement", M, py); py += 14;
      parts.forEach((p) => {
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(70);
        doc.text(`${p.label}: ${num(p.amount)}`, M, py);
        py += 13;
      });
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(5, 150, 105);
      const sMap = { cash: "Cash refund", adjust_udhari: "Adjusted against udhari", store_credit: "Store credit issued" };
      doc.text("Settlement: " + (sMap[draft.settlement] || draft.settlement || "-"), M, py);
    }
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
 * Slim receipt when store credit is converted to cash refund or udhari.
 * Not a full return invoice — conversion proof for the customer.
 */
export function generateStoreCreditConvertReceiptPDF(
  { shop, customer, returnInvoice, amount, at, target } = {},
  output = "bloburl"
) {
  const toCash = (target || returnInvoice?.settlementConvertedTo || "cash") !== "adjust_udhari";
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const retNo = returnInvoice?.invoiceNo || "RET";
  const custName = customer?.name || returnInvoice?.customerName || "Walk-in";
  const when = new Date(at || returnInvoice?.settlementConvertedAt || Date.now());
  const convertedAmt = Number(returnInvoice?.settlementConvertedAmount) || 0;
  const passed = Number(amount);
  const payOut = round2(
    (Number.isFinite(passed) && passed > 0.01 ? passed : 0)
    || (convertedAmt > 0.01 ? convertedAmt : 0)
    || (toCash ? Number(returnInvoice?.settlementDetail?.cash) || 0 : 0)
  );
  const heading = toCash ? "STORE CREDIT -> CASH REFUND" : "STORE CREDIT -> UDHARI";
  const conversion = toCash ? "Store credit -> Cash refund" : "Store credit -> Against udhari";
  const amountLabel = toCash ? "Amount paid (cash)" : "Amount adjusted (udhari)";
  const leftoverCredit = round2(Number(returnInvoice?.settlementDetail?.storeCredit) || 0);
  const note = toCash
    ? "Customer ne store credit ke badle cash liya. Ye chhota receipt unke liye hai."
    : "Sirf utni store credit udhari me gayi jitni pending thi. Baaki credit wahi rehti hai.";
  const filename = `${safeFilePart(custName)}_${toCash ? "SC-Cash" : "SC-Udhari"}_${safeFilePart(retNo)}.pdf`;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INDIGO);
  doc.text(shop?.name || "DukanSaathi", M, 54);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  let ly = 72;
  if (shop?.address) { doc.text(shop.address, M, ly); ly += 12; }
  if (shop?.phone) { doc.text("Ph: " + shop.phone, M, ly); ly += 12; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(190, 30, 45);
  doc.text(heading, W - M, 54, { align: "right" });
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
    ["Conversion", conversion],
    [amountLabel, num(payOut)],
  ];
  if (!toCash && leftoverCredit > 0.01) {
    rows.push(["Store credit remaining", num(leftoverCredit)]);
  }
  rows.push([
    "Date & time",
    when.toLocaleDateString("en-IN") + "  " + when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }),
  ]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    body: rows,
    styles: { fontSize: 10, textColor: 40, cellPadding: 8 },
    columnStyles: {
      0: { cellWidth: 180, fontStyle: "bold", textColor: 80 },
      1: { cellWidth: W - 2 * M - 180 },
    },
    margin: { left: M, right: M },
  });

  y = doc.lastAutoTable.finalY + 24;
  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(note, M, y);

  doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
  doc.text("This is a computer-generated receipt.", M, H - 30);
  doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, filename);
}

/** @deprecated use generateStoreCreditConvertReceiptPDF */
export function generateStoreCreditCashReceiptPDF(args, output = "bloburl") {
  return generateStoreCreditConvertReceiptPDF({ ...args, target: args?.target || "cash" }, output);
}

/**
 * Slim receipt when a customer pays pending bills (Record Payment).
 * Not a full tax invoice — collection proof for the customer.
 */
export function generateUdhariVusoolReceiptPDF(
  { shop, customer, amount, mode, allocations, remainingUdhari, at } = {},
  output = "bloburl"
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 48;
  const custName = customer?.name || "Walk-in";
  const when = new Date(at || Date.now());
  const payIn = round2(Number(amount) || 0);
  const remaining = round2(Number(remainingUdhari) || 0);
  const modeLabel = (mode || "cash").toLowerCase() === "online" ? "Online" : "Cash";
  const rowsAlloc = (allocations || []).filter((a) => round2(Number(a.amount) || 0) > 0.01);
  const ymd = Number.isNaN(when.getTime())
    ? "receipt"
    : `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, "0")}-${String(when.getDate()).padStart(2, "0")}`;
  const filename = `${safeFilePart(custName)}_Udhari-Vusool_${safeFilePart(ymd)}.pdf`;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INDIGO);
  doc.text(shop?.name || "DukanSaathi", M, 54);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  let ly = 72;
  if (shop?.address) { doc.text(shop.address, M, ly); ly += 12; }
  if (shop?.phone) { doc.text("Ph: " + shop.phone, M, ly); ly += 12; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...INDIGO);
  doc.text("UDHARI VUSOOL", W - M, 54, { align: "right" });
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
    ["Mode", modeLabel],
    ["Amount received", num(payIn)],
    ["Udhari remaining", num(remaining)],
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
      0: { cellWidth: 180, fontStyle: "bold", textColor: 80 },
      1: { cellWidth: W - 2 * M - 180 },
    },
    margin: { left: M, right: M },
  });

  y = doc.lastAutoTable.finalY + 16;
  if (rowsAlloc.length) {
    const showPending = rowsAlloc.some((a) => a.amountPending != null);
    autoTable(doc, {
      startY: y,
      theme: "grid",
      head: [showPending ? ["Against bill", "Received", "Bill pending"] : ["Against bill", "Received"]],
      headStyles: { fillColor: INDIGO, textColor: 255 },
      body: rowsAlloc.map((a) => {
        const bill = a.invoiceNo || a.invoiceId || "Bill";
        const rec = num(round2(Number(a.amount) || 0));
        if (!showPending) return [bill, rec];
        const pendingVal = a.amountPending;
        return [bill, rec, pendingVal == null ? "—" : num(round2(Number(pendingVal) || 0))];
      }),
      styles: { fontSize: 10, textColor: 40, cellPadding: 8 },
      columnStyles: showPending
        ? {
          0: { cellWidth: W - 2 * M - 240 },
          1: { cellWidth: 120, halign: "right" },
          2: { cellWidth: 120, halign: "right" },
        }
        : {
          0: { cellWidth: W - 2 * M - 120 },
          1: { cellWidth: 120, halign: "right" },
        },
      margin: { left: M, right: M },
    });
    y = doc.lastAutoTable.finalY + 24;
  } else {
    y += 8;
  }

  doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text("Customer ne udhari jama kar di. Ye chhota receipt unke liye hai.", M, y);

  doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
  doc.text("This is a computer-generated receipt.", M, H - 30);
  doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  return emit(doc, output, filename);
}

export function generateDailySummaryPDF(
  {
    shop,
    dateISO,
    stats,
    sales,
    expenses,
    bills,
    returns,
    vusool,
    converts,
  } = {},
  output = "bloburl"
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const tableW = W - 2 * M;
  const filename = dailySummaryPdfFilename(dateISO);
  const s = stats || {};

  const footer = () => {
    doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, H - 44, W - M, H - 44);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
    doc.text("This is a computer-generated daily summary.", M, H - 30);
    doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  };

  const col5 = {
    0: { cellWidth: 62 },
    1: { cellWidth: 88 },
    2: { cellWidth: 88 },
    3: { cellWidth: tableW - 62 - 88 - 88 - 88 },
    4: { cellWidth: 88, halign: "right" },
  };

  const drawSection = (title, headColor, startY, head, body, columnStyles) => {
    if (!body || !body.length) return startY;
    let y0 = startY;
    if (y0 > H - 100) {
      doc.addPage();
      footer();
      y0 = 56;
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(30);
    doc.text(title, M, y0);
    autoTable(doc, {
      startY: y0 + 8,
      theme: "striped",
      tableWidth: tableW,
      head: [head],
      headStyles: { fillColor: headColor, textColor: 255 },
      body,
      styles: { fontSize: 8, cellPadding: 5, overflow: "linebreak", valign: "top" },
      columnStyles,
      margin: { left: M, right: M, bottom: 56 },
      didDrawPage: footer,
    });
    return doc.lastAutoTable.finalY + 18;
  };

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...INDIGO); doc.text(shop?.name || "DukanSaathi", M, 50);
  doc.setFontSize(13); doc.setTextColor(30); doc.text("Daily Summary", M, 72);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90); doc.text(fmtDate(dateISO), W - M, 72, { align: "right" });

  const summaryBody = [
    ["Net Sales / Kamayi", num(s.salesRevenue)],
    ["Cash Collected", num(s.cashCollected)],
    ["Online Collected", num(s.onlineCollected)],
    ["Udhari diya", num(s.udhariAdded)],
    ["Udhari vusool", num(s.udhariCollected)],
    ["Credit convert (cash)", num(s.convertCash ?? 0)],
    ["Credit convert (udhari)", num(s.convertUdhari ?? 0)],
    ["Cash Expenses", num(s.cashExpenses ?? 0)],
    ["Online Expenses", num(s.onlineExpenses ?? 0)],
    ["Net Cash Position", num(s.netCash)],
    ["Net Online Position", num(s.netOnline ?? 0)],
  ];

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
    body: summaryBody,
    margin: { left: M, right: M, bottom: 56 },
    didDrawPage: footer,
  });

  let y = doc.lastAutoTable.finalY + 20;

  const billRows = (bills && bills.length
    ? bills
    : (sales || []).filter((row) => row.grandTotal >= 0 && !(row.customerName || "").includes("("))
  );
  y = drawSection(
    "Bills",
    [5, 150, 105],
    y,
    ["Time", "Invoice", "Party", "At bill / udhari", { content: "Total", styles: { halign: "right" } }],
    billRows.length
      ? billRows.map((b) => [
        fmtTime(b.date),
        b.invoiceNo || "-",
        b.customerName || "Walk-in",
        b.detail || "-",
        num(b.grandTotal),
      ])
      : [],
    col5,
  );

  y = drawSection(
    "Returns",
    [180, 83, 9],
    y,
    ["Time", "Invoice", "Party", "Settlement", { content: "Cash out", styles: { halign: "right" } }],
    (returns || []).map((r) => [
      fmtTime(r.date),
      r.invoiceNo || "-",
      r.customerName || "Walk-in",
      r.detail || "-",
      num(r.amount),
    ]),
    col5,
  );

  y = drawSection(
    "Udhari vusool",
    [37, 99, 235],
    y,
    ["Time", "Invoice", "Party", "Mode / against", { content: "Received", styles: { halign: "right" } }],
    (vusool || []).map((v) => [
      fmtTime(v.date),
      v.invoiceNo || "-",
      v.customerName || "Walk-in",
      v.detail || v.mode || "-",
      num(v.amount),
    ]),
    col5,
  );

  y = drawSection(
    "Credit convert",
    [124, 58, 237],
    y,
    ["Time", "Invoice", "Party", "Conversion", { content: "Amount", styles: { halign: "right" } }],
    (converts || []).map((c) => [
      fmtTime(c.date),
      c.invoiceNo || "-",
      c.customerName || "Walk-in",
      c.detail || "-",
      num(c.amount),
    ]),
    col5,
  );

  drawSection(
    "Expenses",
    [234, 88, 12],
    y,
    ["Time", "Note", "Mode", "", { content: "Amount", styles: { halign: "right" } }],
    (expenses || []).map((e) => [fmtTime(e.date), e.note || "-", e.mode || "cash", "", num(e.amount)]),
    col5,
  );

  return emit(doc, output, filename);
}
