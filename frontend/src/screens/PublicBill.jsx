"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getSharedBill } from "@/services/api";
import { billPdfFilename, generateBillPDF } from "@/services/billPdf";
import { money } from "@/lib/calc";

/**
 * Customer page for a bill link. Rebuilds the PDF in the browser from the saved bill.
 */
export default function PublicBill({ token }) {
  const [status, setStatus] = useState(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : "This invoice link is not valid.");
  const [pdfUrl, setPdfUrl] = useState("");
  const [filename, setFilename] = useState("invoice.pdf");
  const [heading, setHeading] = useState("Invoice");
  const [total, setTotal] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const prev = document.title;
    document.title = heading || "Invoice";
    return () => {
      document.title = prev;
    };
  }, [heading]);

  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      document.head.appendChild(meta);
    }
    const prev = meta.getAttribute("content");
    meta.setAttribute("content", "noindex, nofollow");
    return () => {
      if (created) meta.remove();
      else if (prev == null) meta.removeAttribute("content");
      else meta.setAttribute("content", prev);
    };
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    let blobUrl = "";
    setStatus("loading");
    setMessage("");
    setPdfUrl("");

    (async () => {
      try {
        const data = await getSharedBill(token);
        const invoice = data?.invoice || {};
        const shop = data?.shop || {};
        const customer = {
          name: invoice.customerName || "",
          phone: invoice.customerPhone || "",
          isContractor: !!invoice.isContractor,
          siteNote: invoice.siteNote || "",
        };
        const blob = generateBillPDF({ shop, invoice, customer }, "blob");
        blobUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        const file = billPdfFilename({ invoice, customer });
        setFilename(file);
        setPdfUrl(blobUrl);
        setHeading(invoice.invoiceNo ? `${shop.name || "Invoice"} · ${invoice.invoiceNo}` : (shop.name || "Invoice"));
        const amount = invoice.type === "return" ? invoice.refundTotal : invoice.grandTotal;
        setTotal(money(amount));
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setMessage(
          err?.isNetwork
            ? "Could not load this invoice. Check the internet and try again."
            : "This invoice link is not valid.",
        );
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [token, attempt]);

  const download = () => {
    if (!pdfUrl) return;
    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = filename || "invoice.pdf";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink" data-testid="public-bill">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-display text-base font-bold text-ink">{heading}</p>
          {total ? <p className="text-sm text-ink-muted">Total {total}</p> : null}
        </div>
        {status === "ready" ? (
          <button
            type="button"
            onClick={download}
            data-testid="public-bill-download"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-control bg-mint px-3 py-2 text-sm font-semibold text-white hover:bg-mint-dark"
          >
            <Download className="h-4 w-4" />
            Download
          </button>
        ) : null}
      </header>

      {status === "loading" ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-border border-t-mint" />
            <p className="text-sm text-ink-muted">Opening invoice…</p>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="ds-panel w-full max-w-md p-6 text-center">
            <p className="font-display text-lg font-bold text-ink">{message}</p>
            {token ? (
              <button
                type="button"
                onClick={() => setAttempt((n) => n + 1)}
                className="mt-4 rounded-control bg-mint px-4 py-2 text-sm font-semibold text-white hover:bg-mint-dark"
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {status === "ready" && pdfUrl ? (
        <iframe
          title={filename}
          src={pdfUrl}
          data-testid="public-bill-frame"
          className="min-h-[70vh] w-full flex-1 border-0 bg-white"
        />
      ) : null}
    </div>
  );
}
