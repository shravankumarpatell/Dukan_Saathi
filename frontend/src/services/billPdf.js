// Client-side PDFs. jsPDF + jspdf-autotable + to-words. Amounts are plain numbers
// (all amounts are in Rupees — no "Rs." printed anywhere per requirement).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ToWords } from "to-words";
import { computeBillTotals, fmtDate, fmtTime, itemAmount, round2 } from "@/lib/calc";
import { settlementParts } from "@/lib/settlement";
import { catalogShowsPpb, catalogShowsSize, formatQtyLabel, normalizeUnit } from "@/lib/units";
import { formatArea, hasMeasurements, rowAreaSqft, totalArea } from "@/lib/slab";
import { formatTileSize } from "@/lib/tileSizes";
import { CATEGORIES, SQM_TO_SQFT, UNITS, normalizeCategory, unitShort } from "@/lib/uom";

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
  if (output === "blob") return doc.output("blob");
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

function fmtDim(n) {
  const v = Number(n) || 0;
  if (!Number.isFinite(v)) return "0";
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1000) / 1000);
}

function rowSheetArea(row, measureUnit, areaUnit) {
  const sqft = rowAreaSqft(row.length ?? row.l, row.width ?? row.w, measureUnit);
  return areaUnit === "sqm" ? sqft / SQM_TO_SQFT : sqft;
}

function measureUnitLabel(mu) {
  if (mu === "cm") return "CM";
  if (mu === "inch") return "Inches";
  return "Feet";
}

function dimText(row) {
  return `${fmtDim(row.length ?? row.l)} X ${fmtDim(row.width ?? row.w)}`;
}

function metaCell(label) {
  return { content: label, styles: { fontStyle: "bold", textColor: 90, fillColor: [245, 245, 252] } };
}

const SLAB_PDF_BANK = 25;
const SLAB_PDF_PAGE_ROWS = SLAB_PDF_BANK * 2;

function emptyPdfRow() {
  return { length: "", width: "" };
}

function rowHasSize(row) {
  return Number(row?.length ?? row?.l) > 0 && Number(row?.width ?? row?.w) > 0;
}

/** Two-bank L×W measurement sheet: 25 + 25 rows per page, like the yard worksheet. */
function appendSlabSheets(doc, draft, { shop, M, W, H, INDIGO, addPage = true, allowEmpty = false }) {
  const lines = (draft.items || []).filter((it) => allowEmpty || hasMeasurements(it));
  if (!lines.length) return;

  const party = draft.customerName || "Walk-in";
  const rawDate = draft.date;
  const when = typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? new Date(...rawDate.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))))
    : new Date(rawDate || Date.now());
  const dateStr = Number.isNaN(when.getTime()) ? "" : when.toLocaleDateString("en-IN");
  const vehicle = draft.vehicleNo || "";
  const inner = W - 2 * M;
  const gridLine = [80, 84, 105];
  const halfW = inner / 2;
  const labelW = 78;
  const valueW = halfW - labelW;
  const srW = 32;
  const areaW = 78;
  const dimW = (inner / 2) - srW - areaW;

  const drawFooter = () => {
    doc.setDrawColor(225);
    doc.setLineWidth(0.5);
    doc.line(M, H - 44, W - M, H - 44);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text("This is a computer-generated measurement sheet.", M, H - 30);
    doc.setTextColor(...INDIGO);
    doc.text("Powered by DukanSaathi", W - M, H - 30, { align: "right" });
  };

  const pdfCell = (row, sr, mu, au) => {
    if (!rowHasSize(row)) return [String(sr), "0 X 0", "0"];
    return [String(sr), dimText(row), formatArea(rowSheetArea(row, mu, au))];
  };

  lines.forEach((it, idx) => {
    const mu = it.measureUnit || "ft";
    const au = it.areaUnit || "sqft";
    const areaLabel = au === "sqm" ? "Sq.m" : "Sq.ft";
    const filled = (it.measurements || []).filter(rowHasSize);
    const startSr = Math.max(1, Math.floor(Number(it.startingRow) || 1));
    let source;
    if (allowEmpty) {
      source = Array.isArray(it.measurements) ? it.measurements.slice() : [];
    } else {
      source = filled.slice();
    }
    const pageCount = Math.max(1, Math.ceil(source.length / SLAB_PDF_PAGE_ROWS) || 1);
    const netDisplay = totalArea(filled, mu, au);
    const price = Number(it.rate) || 0;
    const netCost = itemAmount(it);

    for (let p = 0; p < pageCount; p += 1) {
      if (addPage || idx > 0 || p > 0) doc.addPage();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...INDIGO);
      doc.text(shop?.name || "DukanSaathi", M, 48);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(110);
      let ly = 62;
      if (shop?.address) { doc.text(shop.address, M, ly); ly += 12; }
      if (shop?.phone) { doc.text("Ph: " + shop.phone, M, ly); ly += 12; }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...INDIGO);
      doc.text("SLAB MEASUREMENT ESTIMATE", W - M, 48, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(90);
      doc.text("Measurement sheet", W - M, 64, { align: "right" });
      const pageNote = pageCount > 1 ? `  ·  ${p + 1}/${pageCount}` : "";
      doc.text("No: " + (draft.invoiceNo || "DRAFT") + pageNote, W - M, 78, { align: "right" });

      let y = Math.max(ly, 90) + 4;
      doc.setDrawColor(...INDIGO);
      doc.setLineWidth(2);
      doc.line(M, y, W - M, y);
      doc.setLineWidth(0.5);
      y += 10;

      autoTable(doc, {
        startY: y,
        theme: "grid",
        tableWidth: inner,
        styles: {
          fontSize: 9,
          textColor: 30,
          cellPadding: 5,
          lineColor: gridLine,
          lineWidth: 0.7,
          valign: "middle",
          overflow: "linebreak",
        },
        columnStyles: {
          0: { cellWidth: labelW },
          1: { cellWidth: valueW },
          2: { cellWidth: labelW },
          3: { cellWidth: valueW },
        },
        body: [
          [metaCell("Party"), party, metaCell("Date"), dateStr],
          [metaCell("Quality"), it.name || "-", metaCell("Vehicle No"), vehicle || "-"],
          [metaCell("Lot No"), it.lotNo || "-", metaCell("Measure"), measureUnitLabel(mu)],
        ],
        margin: { left: M, right: M, bottom: 56 },
      });

      // Balance the page's rows across the two banks: 10 → 5 + 5,
      // 11 → 6 + 5 (right bank's last cell stays empty).
      const chunkStart = p * SLAB_PDF_PAGE_ROWS;
      const chunkRows = source.slice(chunkStart, chunkStart + SLAB_PDF_PAGE_ROWS);
      const half = Math.ceil(chunkRows.length / 2);
      const leftRows = chunkRows.slice(0, half);
      const rightRows = chunkRows.slice(half);
      const rowCount = Math.max(leftRows.length, rightRows.length);

      const body = [];
      for (let i = 0; i < rowCount; i += 1) {
        const leftExists = i < leftRows.length;
        const rightExists = i < rightRows.length;
        const lSr = leftExists ? startSr + chunkStart + i : "";
        const rSr = rightExists ? startSr + chunkStart + half + i : "";
        const [ls, ld, la] = leftExists ? pdfCell(leftRows[i], lSr, mu, au) : ["", "", ""];
        const [rs, rd, ra] = rightExists ? pdfCell(rightRows[i], rSr, mu, au) : ["", "", ""];
        body.push([ls, ld, la, rs, rd, ra]);
      }

      const leftArea = totalArea(leftRows, mu, au);
      const rightArea = totalArea(rightRows, mu, au);
      body.push([
        "",
        "Total",
        formatArea(leftArea),
        "",
        "Total",
        formatArea(rightArea),
      ]);

      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        theme: "grid",
        tableWidth: inner,
        head: [[
          { content: "Sr", styles: { halign: "center" } },
          { content: "L X W", styles: { halign: "center" } },
          { content: areaLabel, styles: { halign: "right" } },
          { content: "Sr", styles: { halign: "center" } },
          { content: "L X W", styles: { halign: "center" } },
          { content: areaLabel, styles: { halign: "right" } },
        ]],
        body,
        headStyles: {
          fillColor: INDIGO,
          textColor: 255,
          fontSize: 8,
          fontStyle: "bold",
          cellPadding: 4,
          valign: "middle",
          lineColor: INDIGO,
          lineWidth: 0.7,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: 30,
          cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
          minCellHeight: 16,
          valign: "middle",
          lineColor: gridLine,
          lineWidth: 0.7,
        },
        alternateRowStyles: { fillColor: [245, 245, 252] },
        columnStyles: {
          0: { cellWidth: srW, halign: "center", fontStyle: "bold", textColor: 80 },
          1: { cellWidth: dimW, halign: "center" },
          2: { cellWidth: areaW, halign: "right" },
          3: { cellWidth: srW, halign: "center", fontStyle: "bold", textColor: 80 },
          4: { cellWidth: dimW, halign: "center" },
          5: { cellWidth: areaW, halign: "right" },
        },
        margin: { left: M, right: M, bottom: 56 },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === rowCount) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [245, 245, 252];
          }
        },
      });

      const chunk = leftRows.concat(rightRows);
      const sheetDisplay = totalArea(chunk, mu, au);
      const sheetCost = netDisplay > 0 ? round2((sheetDisplay / netDisplay) * netCost) : 0;
      const totalsW = 300;
      autoTable(doc, {
        startY: doc.lastAutoTable.finalY + 10,
        theme: "grid",
        tableWidth: totalsW,
        styles: {
          fontSize: 9,
          textColor: 40,
          cellPadding: 5,
          lineColor: gridLine,
          lineWidth: 0.7,
          valign: "middle",
        },
        columnStyles: {
          0: { cellWidth: 160, textColor: 80, fillColor: [245, 245, 252] },
          1: { cellWidth: 140, halign: "right", fontStyle: "bold" },
        },
        body: [
          [`Sheet ${areaLabel}`, formatArea(sheetDisplay)],
          ["Sheet cost", num(sheetCost)],
          [`Net ${areaLabel}`, formatArea(netDisplay)],
          [`Price / ${unitShort(it.productUnit || it.unit || au)}`, num(price)],
          [
            { content: "Net cost", styles: { fontStyle: "bold", fillColor: INDIGO, textColor: 255 } },
            { content: num(netCost), styles: { fontStyle: "bold", fillColor: INDIGO, textColor: 255, halign: "right" } },
          ],
        ],
        margin: { left: W - M - totalsW, right: M, bottom: 56 },
      });
      drawFooter();
    }
  });
}

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
  if (draft.vehicleNo) { y += 12; doc.text("Vehicle: " + draft.vehicleNo, M, y); }
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
  if (!isReturn) appendSlabSheets(doc, draft, { shop, M, W, H, INDIGO });
  return emit(doc, output, filename);
}

function slabEstimateFilename(form = {}) {
  const party = form.partyName || form.customerName || "Party";
  const quality = form.quality || "slab";
  return `${safeFilePart(party)}_${safeFilePart(quality)}_slab.pdf`;
}

/**
 * Standalone measurement worksheet (no tax invoice). Same grid as the bill appendix.
 */
export function generateSlabEstimatePDF({ shop, form } = {}, output = "bloburl") {
  const f = form || {};
  const rows = f.rows || f.measurements || [];
  const au = f.areaUnit || "sqft";
  const mu = f.measureUnit || "ft";
  const area = totalArea(rows, mu, au);
  const price = Number(f.rate) || 0;
  const draft = {
    customerName: f.partyName || "Walk-in",
    vehicleNo: f.vehicleNo || "",
    date: f.date || Date.now(),
    invoiceNo: f.invoiceNo || "",
    items: [{
      name: f.quality || "Slab",
      lotNo: f.lotNo || "",
      measureUnit: mu,
      areaUnit: au,
      startingRow: f.startingRow || 1,
      measurements: rows,
      rate: price,
      qty: area,
      unit: au,
      productUnit: au,
    }],
  };
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  appendSlabSheets(doc, draft, { shop, M, W, H, INDIGO, addPage: false, allowEmpty: true });
  return emit(doc, output, slabEstimateFilename(f));
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

/** Problems that would block "Confirm batch" for a single Add Stock row. */
export function stockIntakeRowIssues(row) {
  const issues = [];
  if (!String(row?.name || "").trim()) issues.push("Name");
  if (!(Number(row?.qty) > 0)) issues.push("Qty");
  if (catalogShowsSize(row) && !String(row?.size || "").trim()) issues.push("Size");
  if (catalogShowsPpb(row) && !(Number(row?.piecesPerBox) > 0)) issues.push("Pcs/box");
  return issues;
}

/**
 * Review sheet for the Add Stock grid: every row, what is missing, and totals
 * per unit — so the shopkeeper can eyeball the batch before confirming.
 */
export function generateStockIntakePDF({ shop, rows, sourceFile } = {}, output = "bloburl") {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  const tableW = W - 2 * M;
  const now = new Date();
  const filename = `stock_intake_${now.toISOString().slice(0, 10)}.pdf`;
  const list = (rows || []).filter((r) => String(r?.name || "").trim() || String(r?.code || "").trim() || String(r?.qty ?? "").trim());

  const footer = () => {
    doc.setDrawColor(225); doc.setLineWidth(0.5); doc.line(M, H - 40, W - M, H - 40);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(150);
    doc.text("Review sheet — stock abhi add nahi hua. Confirm batch dabane par add hoga.", M, H - 26);
    doc.setTextColor(...INDIGO); doc.text("Powered by DukanSaathi", W - M, H - 26, { align: "right" });
  };

  // Header
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...INDIGO);
  doc.text(shop?.name || "DukanSaathi", M, 46);
  doc.setFontSize(12); doc.setTextColor(30); doc.text("Stock Intake — Review", M, 66);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(90);
  doc.text(`${fmtDate(now)} ${fmtTime(now)}`, W - M, 46, { align: "right" });
  if (sourceFile) doc.text(`Source: ${sourceFile}`, W - M, 60, { align: "right" });

  // Totals per unit + issue count
  const perUnit = new Map();
  let issueRows = 0;
  const body = list.map((r, i) => {
    const unit = normalizeUnit(r.unit);
    const cat = normalizeCategory(r.category, unit);
    const qty = Number(r.qty) || 0;
    perUnit.set(unit, (perUnit.get(unit) || 0) + qty);
    const issues = stockIntakeRowIssues(r);
    if (issues.length) issueRows += 1;
    const unitLbl = UNITS[unit]?.short || unit;
    return {
      cells: [
        String(i + 1),
        CATEGORIES[cat]?.short || cat,
        String(r.name || "").trim() || "—",
        String(r.code || "").trim() || "—",
        String(r.company || "").trim() || "—",
        catalogShowsSize(r) ? (formatTileSize(r.size) || "—") : "—",
        catalogShowsPpb(r) ? (Number(r.piecesPerBox) > 0 ? String(r.piecesPerBox) : "—") : "—",
        qty > 0 ? `${qty} ${unitLbl}` : "—",
        Number(r.price) > 0 ? num(r.price) : "—",
        issues.length ? `Missing: ${issues.join(", ")}` : "OK",
      ],
      bad: issues.length > 0,
    };
  });

  const totalsText = [...perUnit.entries()]
    .filter(([, q]) => q > 0)
    .map(([u, q]) => `${UNITS[u]?.label || u}: ${Math.round(q * 1000) / 1000}`)
    .join("   ·   ");

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(30);
  doc.text(`${list.length} items`, M, 86);
  doc.setFont("helvetica", "normal"); doc.setTextColor(issueRows ? 185 : 22, issueRows ? 28 : 128, issueRows ? 28 : 61);
  doc.text(issueRows ? `${issueRows} rows me kuch missing hai — confirm se pehle theek karein` : "Sab rows complete hain", M + 70, 86);
  if (totalsText) {
    doc.setTextColor(90);
    doc.text(totalsText, W - M, 86, { align: "right" });
  }

  const fixed = 26 + 62 + 56 + 90 + 62 + 48 + 80 + 62 + 120;
  autoTable(doc, {
    startY: 96,
    theme: "grid",
    tableWidth: tableW,
    head: [["#", "Type", "Product", "Code", "Company", "Size", "Pcs/box", { content: "Qty", styles: { halign: "right" } }, { content: "Price", styles: { halign: "right" } }, "Status"]],
    headStyles: { fillColor: INDIGO, textColor: 255, fontSize: 8.5 },
    body: body.map((b) => b.cells),
    styles: { fontSize: 8.5, cellPadding: 4, overflow: "linebreak", valign: "middle" },
    columnStyles: {
      0: { cellWidth: 26, halign: "center", textColor: 120 },
      1: { cellWidth: 62 },
      2: { cellWidth: tableW - fixed, fontStyle: "bold" },
      3: { cellWidth: 56 },
      4: { cellWidth: 90 },
      5: { cellWidth: 62 },
      6: { cellWidth: 48, halign: "center" },
      7: { cellWidth: 80, halign: "right" },
      8: { cellWidth: 62, halign: "right" },
      9: { cellWidth: 120 },
    },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const row = body[data.row.index];
      if (!row?.bad) return;
      data.cell.styles.fillColor = [254, 242, 242];
      if (data.column.index === 9) {
        data.cell.styles.textColor = [185, 28, 28];
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: M, right: M, bottom: 52 },
    didDrawPage: footer,
  });

  return emit(doc, output, filename);
}
