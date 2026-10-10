"""Invoice PDF for the public link.

WhatsApp builds a file preview only when the URL itself downloads a PDF.
The shopkeeper's Save button still downloads the browser-made invoice.
"""

from __future__ import annotations

import re
from datetime import datetime

from fpdf import FPDF

_INDIGO = (49, 46, 129)


def pdf_filename(payload: dict) -> str:
    invoice = payload.get("invoice") or {}
    name = invoice.get("customerName") or "Walk-in"
    number = invoice.get("invoiceNo") or "invoice"
    raw = f"{name}_{number}.pdf"
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", raw).strip("._")
    return safe or "invoice.pdf"


def _latin(value) -> str:
    return str(value or "").encode("latin-1", "replace").decode("latin-1")


def _inr(value) -> str:
    number = float(value or 0)
    sign = "-" if number < 0 else ""
    whole, frac = f"{abs(number):.2f}".split(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        groups = []
        while head:
            groups.append(head[-2:])
            head = head[:-2]
        whole = ",".join(reversed(groups)) + "," + tail
    return f"{sign}{whole}.{frac}"


def _when(value) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    try:
        moment = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return _latin(raw[:16])
    return moment.strftime("%d %b %Y")


class _InvoicePdf(FPDF):
    def footer(self):
        self.set_y(-14)
        self.set_font("Helvetica", size=8)
        self.set_text_color(150, 150, 150)
        self.cell(0, 6, "This is a computer-generated invoice.  Powered by DukanSaathi", align="L")


def render_invoice_pdf(payload: dict) -> bytes:
    shop = payload.get("shop") or {}
    invoice = payload.get("invoice") or {}
    is_return = invoice.get("type") == "return"
    title = "RETURN" if is_return else ("TAX INVOICE" if shop.get("gstEnabled") else "INVOICE")
    number = invoice.get("invoiceNo") or ""
    shop_name = shop.get("name") or "DukanSaathi"

    pdf = _InvoicePdf(format="A4", unit="mm")
    pdf.set_title(f"{title} {number}".strip())
    pdf.set_author(_latin(shop_name))
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.set_left_margin(14)
    pdf.set_right_margin(14)

    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*_INDIGO)
    pdf.cell(120, 8, _latin(shop_name), new_x="RIGHT", new_y="TOP")
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(20, 20, 20)
    pdf.cell(0, 8, title, align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(90, 90, 90)
    left = []
    if shop.get("address"):
        left.append(shop["address"])
    if shop.get("phone"):
        left.append("Ph: " + str(shop["phone"]))
    if shop.get("gstEnabled") and shop.get("gstin"):
        left.append("GSTIN: " + str(shop["gstin"]))
    right = [f"No: {number}" if number else ""]
    dated = _when(invoice.get("date"))
    if dated:
        right.append(dated)
    if is_return and invoice.get("originalInvoiceNo"):
        right.append("Against: " + str(invoice["originalInvoiceNo"]))
    rows = max(len(left), len(right), 1)
    for index in range(rows):
        pdf.cell(120, 4.5, _latin(left[index] if index < len(left) else ""), new_x="RIGHT", new_y="TOP")
        pdf.cell(0, 4.5, _latin(right[index] if index < len(right) else ""), align="R", new_x="LMARGIN", new_y="NEXT")

    pdf.ln(2)
    pdf.set_draw_color(*_INDIGO)
    pdf.set_line_width(0.4)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(4)

    party = "CONTRACTOR / DEALER" if invoice.get("isContractor") else "BILL TO"
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(0, 5, party, new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=11)
    pdf.cell(0, 6, _latin(invoice.get("customerName") or "Walk-in Customer"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(90, 90, 90)
    if invoice.get("customerPhone"):
        pdf.cell(0, 4.5, _latin("Ph: " + str(invoice["customerPhone"])), new_x="LMARGIN", new_y="NEXT")
    if invoice.get("isContractor") and invoice.get("siteNote"):
        pdf.cell(0, 4.5, _latin("Site: " + str(invoice["siteNote"])), new_x="LMARGIN", new_y="NEXT")
    if invoice.get("vehicleNo"):
        pdf.cell(0, 4.5, _latin("Vehicle: " + str(invoice["vehicleNo"])), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    headers = ["#", "Item", "Qty", "Rate", "Amount"]
    widths = [12, 88, 28, 28, 26]
    pdf.set_fill_color(*_INDIGO)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 9)
    for label, width in zip(headers, widths):
        align = "R" if label in {"Rate", "Amount"} else "L"
        pdf.cell(width, 7, label, border=0, align=align, fill=True)
    pdf.ln(7)

    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(40, 40, 40)
    items = invoice.get("items") or []
    for index, item in enumerate(items, start=1):
        qty = item.get("qty")
        unit = item.get("unit") or ""
        qty_label = f"{qty} {unit}".strip()
        priced = float(item.get("priceQty") or 0)
        rate = float(item.get("rate") or 0)
        amount = (priced if priced > 0 else float(item.get("qty") or 0)) * rate
        name = _latin(item.get("name") or "")
        if len(name) > 42:
            name = name[:39] + "..."
        if pdf.get_y() > 270:
            pdf.add_page()
        values = [str(index), name or "-", _latin(qty_label), _inr(rate), _inr(amount)]
        aligns = ["L", "L", "C", "R", "R"]
        for value, width, align in zip(values, widths, aligns):
            pdf.cell(width, 6, value, align=align)
        pdf.ln(6)

    pdf.ln(4)
    pdf.set_font("Helvetica", size=9)
    pdf.set_text_color(80, 80, 80)
    label_x = 130

    def total_row(label, value, bold=False):
        pdf.set_font("Helvetica", "B" if bold else "", 11 if bold else 9)
        pdf.set_text_color(20, 20, 20) if bold else pdf.set_text_color(80, 80, 80)
        pdf.set_x(label_x)
        pdf.cell(36, 6, label)
        pdf.cell(30, 6, _inr(value), align="R", new_x="LMARGIN", new_y="NEXT")

    if is_return:
        total_row("Items value", invoice.get("subtotal"))
        total_row("Refund total", invoice.get("refundTotal") if invoice.get("refundTotal") is not None else invoice.get("grandTotal"), bold=True)
    else:
        total_row("Subtotal", invoice.get("subtotal"))
        for charge in invoice.get("charges") or []:
            total_row(str(charge.get("label") or "Charge")[:40], charge.get("amount"))
        if float(invoice.get("discountOff") or 0) > 0:
            total_row("Discount", -float(invoice.get("discountOff") or 0))
        if float(invoice.get("gstRate") or 0) > 0:
            total_row(f"GST @ {invoice.get('gstRate')}%", invoice.get("gstAmount"))
        if abs(float(invoice.get("roundOff") or 0)) > 0.001:
            total_row("Round off", invoice.get("roundOff"))
        total_row("Grand total", invoice.get("grandTotal"), bold=True)
        pdf.ln(1)
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(70, 70, 70)
        for payment in invoice.get("payments") or []:
            pdf.cell(0, 5, _latin(f"Paid via {payment.get('mode')}: {_inr(payment.get('amount'))}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "B", 10)
        pending = float(invoice.get("amountPending") or 0)
        if pending > 0.5:
            pdf.set_text_color(225, 29, 72)
            pdf.cell(0, 6, _latin(f"PENDING  ·  Balance due {_inr(pending)}"), new_x="LMARGIN", new_y="NEXT")
        else:
            pdf.set_text_color(5, 150, 105)
            pdf.cell(0, 6, "PAID", new_x="LMARGIN", new_y="NEXT")

    return bytes(pdf.output())
