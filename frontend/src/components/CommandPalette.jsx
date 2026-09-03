"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@/hooks/useNavigate";
import { useApp } from "@/context/AppContext";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { SCOPES, NAV_ITEMS, NAV_BOTTOM, KEYS } from "@/lib/keymap";
import { searchProducts, searchCustomers, searchInvoices } from "@/lib/fuzzy";
import { money, fmtDate, piecesBreakdown } from "@/lib/calc";
import { catalogShowsPpb, catalogShowsSize, formatStockLabel, piecesPerBoxOf, unitKindLabel } from "@/lib/units";
import { formatTileSize } from "@/lib/tileSizes";
import Kbd from "@/components/Kbd";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import CustomerDetailDialog from "@/components/CustomerDetailDialog";
import PaymentDialog from "@/components/PaymentDialog";
import PdfViewerDialog from "@/components/PdfViewerDialog";
import { usePdfPreview } from "@/hooks/usePdfPreview";
import {
  generateBillPDF,
  generateStoreCreditConvertReceiptPDF,
  generateUdhariVusoolReceiptPDF,
} from "@/services/billPdf";
import { toast } from "sonner";
import { Plus, IndianRupee, Wallet, Printer, Package, Users, Undo2, Calculator, ReceiptText, Ruler } from "lucide-react";

/**
 * Spotlight-style search: Alt+K. Lookup results (bills, customers, items) open
 * as overlays on the current page. Screens and actions still navigate.
 */

const ACTIONS = [
  { id: "new-bill", label: "Naya bill banayein", hint: "New sale invoice", icon: Plus, to: "/bill", keys: KEYS.gotoBill, keywords: "bill invoice sale sell naya" },
  { id: "slab", label: "Slab estimate", hint: "Stone L×W measurement worksheet", icon: Ruler, to: "/slab", keys: KEYS.gotoSlab, keywords: "slab stone marble granite naap estimate paththar sheet" },
  { id: "expense", label: "Kharcha add karein", hint: "Record an expense", icon: IndianRupee, to: "/?focus=expense", keys: KEYS.gotoExpense, keywords: "expense kharcha spend cost daily" },
  { id: "sqft", label: "Sq-ft calculator", hint: "Quick tile area → boxes calculator", icon: Calculator, to: "/?focus=sqft", keys: KEYS.sqftCalc, keywords: "sqft square feet tiles boxes area calculator" },
  { id: "udhari", label: "Udhari payment lein", hint: "Record a customer payment", icon: Wallet, to: "/customers?tab=udhari&focus=payment", keys: KEYS.gotoUdhari, keywords: "udhari payment collect credit due paisa" },
  { id: "return", label: "Return / refund karein", hint: "Take goods back against a bill", icon: Undo2, to: "/returns", keys: KEYS.gotoReturns, keywords: "return refund wapas credit note" },
  { id: "stock-in", label: "Stock intake karein", hint: "Bulk add products from a supplier sheet", icon: Package, to: "/bulk", keys: KEYS.gotoBulk, keywords: "stock intake bulk upload supplier maal" },
  { id: "summary", label: "Aaj ka summary print karein", hint: "Daily day-book PDF", icon: Printer, to: "/?print=summary", keywords: "print summary daybook daily report pdf aaj" },
  { id: "summary-yesterday", label: "Kal ka summary print karein", hint: "Yesterday's day-book PDF", icon: Printer, to: "/?print=summary&date=yesterday", keywords: "print summary yesterday kal daybook daily report pdf" },
];

const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((token) => haystack.includes(token));
};

export default function CommandPalette({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { products, customers, invoices, shop, allocatePayment, reconcileCustomer } = useApp();
  const [query, setQuery] = useState("");
  const [detailFor, setDetailFor] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [peekProduct, setPeekProduct] = useState(null);
  const [pdfTitle, setPdfTitle] = useState("PDF");
  const [pendingPeek, setPendingPeek] = useState(false);
  const [searchGate, setSearchGate] = useState(true);
  const [selectedValue, setSelectedValue] = useState("");
  const restoreItemRef = useRef("");
  const restoringRef = useRef(false);
  const inputRef = useRef(null);
  const { pdfUrl, filename: pdfFilename, showPdf, closePdf } = usePdfPreview();

  const peekOpen = !!(detailFor || payFor || peekProduct || pdfUrl || pendingPeek);
  const peekOpenRef = useRef(peekOpen);
  peekOpenRef.current = peekOpen;
  const searchUiOpen = open && searchGate && !peekOpen;

  useHotkeyScope(SCOPES.PALETTE, { exclusive: true, enabled: searchUiOpen });
  useHotkeys(SCOPES.PALETTE, [
    { keys: KEYS.palette, label: "Close search", handler: () => onOpenChange(false), allowInInput: true },
  ]);

  // Fresh query only when the search session starts — not when returning from a peek.
  const wasSession = useRef(false);
  useEffect(() => {
    if (open && !wasSession.current) {
      setQuery("");
      setSelectedValue("");
      restoreItemRef.current = "";
    }
    wasSession.current = open;
  }, [open]);

  // Drop leftover peeks if the whole search session is dismissed.
  useEffect(() => {
    if (open) return undefined;
    setDetailFor(null);
    setPayFor(null);
    setPeekProduct(null);
    setPendingPeek(false);
    closePdf();
    return undefined;
  }, [open, closePdf]);

  // Hide search under a peek immediately; delay showing it again so Esc that
  // closed the peek cannot also dismiss the search dialog.
  const hadPeek = useRef(false);
  useEffect(() => {
    if (peekOpen) {
      hadPeek.current = true;
      setSearchGate(false);
      return undefined;
    }
    if (!hadPeek.current) return undefined;
    hadPeek.current = false;
    const t = window.setTimeout(() => setSearchGate(true), 80);
    return () => window.clearTimeout(t);
  }, [peekOpen]);

  // After search remounts, put the highlight back on the item the user opened.
  // Bounce "" → value so cmdk's controlled-value effect actually re-runs
  // (setting the same string is a no-op and leaves the first-row highlight).
  useLayoutEffect(() => {
    if (!searchUiOpen) return undefined;
    const v = restoreItemRef.current;
    if (!v) return undefined;
    restoringRef.current = true;
    setSelectedValue("");
    const apply = () => {
      setSelectedValue(v);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        const el = document.querySelector(`[cmdk-item][data-value="${CSS.escape(v)}"]`);
        el?.scrollIntoView({ block: "nearest" });
      });
    };
    const t0 = window.setTimeout(apply, 0);
    const t1 = window.setTimeout(() => {
      apply();
      restoringRef.current = false;
    }, 40);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
      restoringRef.current = false;
    };
  }, [searchUiOpen]);

  // Arrow keys must not steal the caret. cmdk will focus the listbox unless we
  // pull focus back onto the search field after each highlight change.
  useLayoutEffect(() => {
    if (!searchUiOpen) return;
    const node = inputRef.current;
    if (!node) return;
    const active = document.activeElement;
    if (active === node) return;
    if (
      active?.closest?.("[cmdk-root], [cmdk-list], [cmdk-item], [role='dialog']")
    ) {
      node.focus({ preventScroll: true });
    }
  }, [searchUiOpen, selectedValue]);

  const screens = useMemo(
    () => [...NAV_ITEMS, ...NAV_BOTTOM].filter((n) => matches(query, n.label, n.keywords, n.to)),
    [query]
  );
  const actions = useMemo(
    () => ACTIONS.filter((a) => matches(query, a.label, a.hint, a.keywords)),
    [query]
  );
  const looking = query.trim().length >= 2;
  const productHits = useMemo(
    () => (looking ? searchProducts(products, query).slice(0, 6) : []),
    [products, query, looking]
  );
  const customerHits = useMemo(
    () => (looking ? searchCustomers(customers, query).slice(0, 6) : []),
    [customers, query, looking]
  );
  const invoiceHits = useMemo(
    () => (looking ? searchInvoices(invoices, query).slice(0, 6) : []),
    [invoices, query, looking]
  );

  const go = (to) => { onOpenChange(false); navigate(to); };

  /** Hide search, then open the overlay so two Radix modals are not open at once. */
  const showPeek = useCallback((fn) => {
    setPendingPeek(true);
    window.setTimeout(() => {
      fn();
      setPendingPeek(false);
    }, 60);
  }, []);

  const liveDetail = detailFor
    ? (customers.find((c) => c.id === detailFor.id) || detailFor)
    : null;

  const partyFor = useCallback((inv) => {
    const found = customers.find((c) => c.id === inv?.customerId);
    return found || { name: inv?.customerName || "Walk-in" };
  }, [customers]);

  const openBillPdf = useCallback((inv) => {
    if (!inv) return;
    setSelectedValue(`bill-${inv.id}-${inv.invoiceNo}`);
    restoreItemRef.current = `bill-${inv.id}-${inv.invoiceNo}`;
    showPeek(() => {
      setPdfTitle(inv.type === "return" ? "Return PDF" : "Invoice PDF");
      showPdf(generateBillPDF({ shop, invoice: inv, customer: partyFor(inv) }, "bloburl"));
    });
  }, [showPeek, partyFor, shop, showPdf]);

  const openCustomer = useCallback((c) => {
    if (!c) return;
    setSelectedValue(`customer-${c.id}`);
    restoreItemRef.current = `customer-${c.id}`;
    const live = customers.find((x) => x.id === c.id) || c;
    showPeek(() => setDetailFor(live));
  }, [showPeek, customers]);

  const openProduct = useCallback((p) => {
    if (!p) return;
    setSelectedValue(`product-${p.id}`);
    restoreItemRef.current = `product-${p.id}`;
    showPeek(() => setPeekProduct(p));
  }, [showPeek]);

  const handleSearchOpenChange = useCallback((next) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    // Radix fires this when we hide the search under a peek — keep the session.
    if (peekOpenRef.current) return;
    onOpenChange(false);
  }, [onOpenChange]);

  const pendingBills = useCallback(
    (cid) => invoices
      .filter((i) => i.customerId === cid && i.type === "sale" && (i.amountPending || 0) > 0.5)
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [invoices]
  );

  const openPay = useCallback((c) => {
    if (!c) return;
    if (pendingBills(c.id).length === 0) return toast.error(`${c.name} ka koi pending bill nahi`);
    setDetailFor(null);
    setPayFor(c);
  }, [pendingBills]);

  const closePayment = useCallback(() => {
    const c = payFor;
    setPayFor(null);
    if (!c) return;
    setPendingPeek(true);
    window.setTimeout(() => {
      setDetailFor(customers.find((x) => x.id === c.id) || c);
      setPendingPeek(false);
    }, 60);
  }, [payFor, customers]);

  const openActivityPdf = useCallback((evOrInv) => {
    const inv = evOrInv?.invoice || evOrInv;
    if (!inv) return;
    const party = customers.find((c) => c.id === inv.customerId) || detailFor || { name: inv.customerName };
    if (evOrInv?.kind === "conversion" || evOrInv?.pdfKind === "convert-receipt") {
      setPdfTitle("Receipt");
      showPdf(
        generateStoreCreditConvertReceiptPDF({
          shop,
          customer: party,
          returnInvoice: inv,
          amount: evOrInv.amount,
          at: evOrInv.date,
          target: evOrInv.convertedTo || inv.settlementConvertedTo,
        }, "bloburl")
      );
      return;
    }
    if (evOrInv?.pdfKind === "udhari-vusool") {
      setPdfTitle("Udhari vusool");
      showPdf(
        generateUdhariVusoolReceiptPDF({
          shop,
          customer: party,
          amount: evOrInv.amount,
          mode: evOrInv.mode,
          allocations: evOrInv.allocations,
          remainingUdhari: evOrInv.remainingUdhari,
          at: evOrInv.date,
        }, "bloburl")
      );
      return;
    }
    setPdfTitle(inv.type === "return" ? "Return PDF" : "Invoice PDF");
    showPdf(generateBillPDF({ shop, invoice: inv, customer: party }, "bloburl"));
  }, [customers, detailFor, shop, showPdf]);

  return (
    <>
      <CommandDialog
        open={searchUiOpen}
        onOpenChange={handleSearchOpenChange}
        value={selectedValue}
        onValueChange={(v) => {
          if (restoringRef.current) return;
          setSelectedValue(v);
          inputRef.current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(e) => {
          if (peekOpenRef.current) e.preventDefault();
        }}
      >
        <CommandInput
          ref={inputRef}
          data-testid="palette-input"
          value={query}
          onValueChange={setQuery}
          placeholder="Bill, item, customer, screen — kuch bhi likhein…"
        />
        <CommandList className="max-h-[min(60vh,420px)]">
          <CommandEmpty>Kuch nahi mila.</CommandEmpty>

          {actions.length > 0 && (
            <CommandGroup heading="Kaam — Actions">
              {actions.map((a) => (
                <CommandItem key={a.id} value={a.id} onSelect={() => go(a.to)} className="gap-3">
                  <a.icon className="h-4 w-4 shrink-0 text-mint-dark" />
                  <span className="flex-1">
                    <span className="font-semibold">{a.label}</span>
                    <span className="ml-2 text-xs text-slate-400">{a.hint}</span>
                  </span>
                  {a.keys && <Kbd keys={a.keys} />}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {screens.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Screens">
                {screens.map((n) => (
                  <CommandItem key={n.to} value={`screen-${n.to}`} onSelect={() => go(n.to)} className="gap-3">
                    <n.icon className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="flex-1 font-semibold">{n.label}</span>
                    <Kbd keys={n.keys} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {invoiceHits.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Bills">
                {invoiceHits.map((inv) => (
                  <CommandItem
                    key={inv.id || inv.invoiceNo}
                    value={`bill-${inv.id}-${inv.invoiceNo}`}
                    onSelect={() => openBillPdf(inv)}
                    className="gap-3"
                  >
                    <ReceiptText className="h-4 w-4 shrink-0 text-mint-dark" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{inv.customerName || "Walk-in"}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {[inv.invoiceNo, inv.type === "return" ? "return" : null, fmtDate(inv.date)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-mint-dark">{money(inv.grandTotal || inv.refundTotal)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {productHits.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Items">
                {productHits.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`product-${p.id}`}
                    onSelect={() => openProduct(p)}
                    className="gap-3"
                  >
                    <Package className="h-4 w-4 shrink-0 text-mint-dark" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {[p.code, p.company, formatStockLabel(p, piecesBreakdown)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold text-mint-dark">{money(p.sellPrice)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {customerHits.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Customers">
                {customerHits.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`customer-${c.id}`}
                    onSelect={() => openCustomer(c)}
                    className="gap-3"
                  >
                    <Users className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.name}</span>
                      <span className="block truncate text-xs text-slate-400">{c.phone || "—"}</span>
                    </span>
                    {c.totalPending > 0 && (
                      <span className="shrink-0 text-xs font-bold text-rose-600">{money(c.totalPending)}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>

      <CustomerDetailDialog
        customer={liveDetail}
        invoices={invoices}
        suppressed={!!pdfUrl}
        onClose={() => setDetailFor(null)}
        onRecordPayment={() => openPay(liveDetail)}
        onOpenPdf={openActivityPdf}
      />
      <PaymentDialog
        customer={payFor}
        bills={payFor ? pendingBills(payFor.id) : []}
        shop={shop}
        onClose={closePayment}
        onSubmit={allocatePayment}
        onReconcile={reconcileCustomer}
        onShowPdf={(result) => { setPdfTitle("Udhari vusool"); showPdf(result); }}
      />
      <ProductPeekDialog product={peekProduct} onClose={() => setPeekProduct(null)} />
      <PdfViewerDialog url={pdfUrl} filename={pdfFilename} onClose={closePdf} title={pdfTitle} restoreFocus={false} />
    </>
  );
}

function ProductPeekDialog({ product, onClose }) {
  const open = useVisibleOpen(!!product);
  useHotkeyScope("modal:palette-product", { exclusive: true, enabled: open });
  useHotkeys("modal:palette-product", [
    { keys: KEYS.cancel, label: "Close", handler: onClose },
  ]);
  if (!product) return null;
  const showSize = catalogShowsSize(product);
  const showPpb = catalogShowsPpb(product);
  const totalStock = (product.showroomQty || 0) + (product.godownQty || 0) + (product.stockQty || 0);
  const ppb = piecesPerBoxOf(product);
  const bd = piecesBreakdown(totalStock, ppb);
  const low = showPpb
    ? bd.totalPieces <= (product.lowStockThreshold || 0) * ppb
    : totalStock <= (product.lowStockThreshold || 0);
  const rows = [
    ["Type", unitKindLabel(product)],
    ["Code", product.code || "—"],
    ["Company", product.company || "—"],
    ...(showSize ? [
      ["Size", formatTileSize(product.size) || "—"],
    ] : []),
    ...(showPpb ? [
      ["Pcs / box", String(ppb)],
    ] : []),
    ["Stock", formatStockLabel(product, piecesBreakdown)],
    ["Rate", money(product.sellPrice)],
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        data-testid="palette-product-peek"
        className="max-w-md"
        onEscapeKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="pr-8">
            <span className="flex flex-wrap items-center gap-2">
              {product.name}
              {low ? (
                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-900 dark:text-rose-200">LOW</span>
              ) : null}
            </span>
          </DialogTitle>
        </DialogHeader>
        <dl className="divide-y divide-border rounded-control border border-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{k}</dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
