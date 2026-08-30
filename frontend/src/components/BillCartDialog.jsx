import React, { useEffect, useRef, useState, useCallback } from "react";
import NumberInput from "@/components/NumberInput";
import Kbd from "@/components/Kbd";
import SqftDialog from "@/components/SqftDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVisibleOpen } from "@/context/PageKeepAliveContext";
import { itemAmount, money } from "@/lib/calc";
import {
  isBoxUnit, qtyFieldLabel, rateSuffix, productMetaLine, unitKindLabel, unitKindChipClass,
  stockAvailPieces, clampSaleQtyFields, formatAvailLabel, lineSoldPieces,
} from "@/lib/units";
import { useHotkeyScope, useHotkeys } from "@/hooks/useHotkeys";
import { useFormFlow } from "@/hooks/useFormFlow";
import { KEYS } from "@/lib/keymap";
import { toast } from "sonner";
import { Trash2, ShoppingCart, Calculator } from "lucide-react";

const NUM = "w-full rounded-dense border border-border bg-panel px-1.5 py-1 text-sm text-right tabular-nums outline-none focus:border-mint";
const FLD = "w-[4.25rem]";
const FLD_RATE = "w-[5.25rem]";
const FLD_AMT = "w-[6.25rem]";

const CART_SCOPE = "modal:bill-cart";

/**
 * Floating editable cart for New Bill — line items live here, not on the page.
 * Esc closes; Alt+X deletes the focused row; Alt+Q opens sq-ft for a tile line;
 * ↑/↓ move between rows.
 */
export default function BillCartDialog({
  open,
  onClose,
  items,
  type,
  products = [],
  updItem,
  updItemQty,
  updItemAmount,
  delItem,
  onSave,
  onPreview,
  onRequestClear,
  saving,
}) {
  const visible = useVisibleOpen(open);
  const itemsRef = useRef(null);
  const closeBtnRef = useRef(null);
  const [sqftFor, setSqftFor] = useState(null); // { index, item }
  const sqftOpen = !!sqftFor;

  const focusedRow = () => {
    const row = document.activeElement?.dataset?.row;
    return row == null ? -1 : Number(row);
  };

  const openSqftForFocused = useCallback(() => {
    const i = focusedRow();
    if (i < 0) {
      toast.error("Pehle kisi line par jaayein");
      return;
    }
    const it = items[i];
    if (!it || !isBoxUnit(it)) {
      toast.error("Sq-ft sirf tiles (box) items ke liye");
      return;
    }
    setSqftFor({
      index: i,
      item: {
        name: it.name,
        piecesPerBox: Number(it.piecesPerBox) || 1,
        rate: Number(it.rate) || 0,
        size: it.size || "",
      },
    });
  }, [items]);

  const applySqft = useCallback((res) => {
    if (!sqftFor) return;
    const i = sqftFor.index;
    const it = items[i];
    if (!it) { setSqftFor(null); return; }

    const ppb = Number(it.piecesPerBox) || 1;
    let nextQty = String(res.boxesNeeded);
    let nextPcs = String(res.loosePieces);
    const wanted = (Number(res.boxesNeeded) || 0) * ppb + (Number(res.loosePieces) || 0);
    const limitStock = true;

    if (limitStock) {
      const p = products.find((x) => x.id === it.productId) || it;
      const reserved = items.reduce((s, x, idx) => (
        idx === i || x.productId !== it.productId ? s : s + lineSoldPieces(x)
      ), 0);
      const availPieces = Math.max(0, stockAvailPieces(p) - reserved);
      const availLabel = formatAvailLabel(p, availPieces);
      const product = { ...p, unit: it.unit, piecesPerBox: it.piecesPerBox };
      const afterBoxes = clampSaleQtyFields({
        product, qty: "0", pieces: "0", field: "qty", raw: nextQty, availPieces,
      });
      const afterPcs = clampSaleQtyFields({
        product, qty: afterBoxes.qty, pieces: "0", field: "pieces", raw: nextPcs, availPieces,
      });
      nextQty = afterPcs.qty;
      nextPcs = afterPcs.pieces;
      const got = (Number(nextQty) || 0) * ppb + (Number(nextPcs) || 0);
      if (got < wanted) toast.error(`Stock sirf ${availLabel} hai — sq-ft qty adjust hui`);
      else toast.success(`${nextQty} box + ${nextPcs || 0} pc (${res.tilesNeeded} tiles)`);
    } else {
      toast.success(`${nextQty} box + ${nextPcs || 0} pc (${res.tilesNeeded} tiles)`);
    }

    updItem(i, { qty: nextQty, pieces: nextPcs, amount: undefined });
    setSqftFor(null);
    setTimeout(() => {
      itemsRef.current?.querySelector(`[data-row="${i}"][data-cell="rate"]`)?.focus();
    }, 60);
  }, [sqftFor, items, type, products, updItem]);

  const onItemsKeyDown = (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const { row, cell } = e.target.dataset || {};
    if (row == null || !cell) return;
    const next = Number(row) + (e.key === "ArrowDown" ? 1 : -1);
    const target =
      itemsRef.current?.querySelector(`[data-row="${next}"][data-cell="${cell}"]`) ||
      itemsRef.current?.querySelector(`[data-row="${next}"]`);
    if (!target) return;
    e.preventDefault();
    target.focus();
  };

  useHotkeyScope(CART_SCOPE, { exclusive: true, enabled: visible && !sqftOpen });
  useHotkeys(CART_SCOPE, [
    { keys: KEYS.cancel, label: "Close cart", handler: onClose },
    { keys: KEYS.save, label: "Save bill", handler: onSave, disabled: saving },
    { keys: KEYS.saveAlt, label: "Save bill", handler: onSave, disabled: saving, hidden: true },
    { keys: KEYS.preview, label: "Preview PDF", handler: onPreview },
    {
      keys: KEYS.clearBill,
      label: "Bill clear / reset",
      handler: onRequestClear,
      disabled: !onRequestClear,
    },
    {
      keys: KEYS.sqftCalc,
      label: "Sq-ft calculator (focused tile)",
      handler: openSqftForFocused,
    },
    {
      keys: KEYS.deleteRow,
      label: "Is line ko hataayein",
      handler: () => {
        const i = focusedRow();
        if (i >= 0) {
          delItem(i);
          setTimeout(() => {
            const next =
              itemsRef.current?.querySelector(`[data-row="${Math.min(i, items.length - 2)}"]`) ||
              closeBtnRef.current;
            next?.focus?.();
          }, 30);
        }
      },
      disabled: items.length === 0,
    },
  ]);

  const flow = useFormFlow({ onSave: undefined, onCancel: onClose, enabled: visible && !sqftOpen });

  useEffect(() => {
    if (!visible) {
      setSqftFor(null);
      return undefined;
    }
    const t = setTimeout(() => {
      const first = itemsRef.current?.querySelector('[data-row="0"]');
      if (first) first.focus();
      else closeBtnRef.current?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [visible]);

  const subtotal = items.reduce((s, it) => s + itemAmount(it), 0);

  const handleContainerKeyDown = (e) => {
    onItemsKeyDown(e);
    flow.handleKeyDown(e);
  };

  return (
    <>
      <Dialog open={visible} onOpenChange={(o) => !o && !sqftOpen && onClose()}>
        <DialogContent
          data-testid="bill-cart-dialog"
          className="max-w-2xl"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-600">
                {items.length}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div
            ref={(el) => {
              flow.containerRef.current = el;
              itemsRef.current = el;
            }}
            onKeyDown={handleContainerKeyDown}
            className="max-h-[60vh] space-y-2 overflow-y-auto"
          >
            {items.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-400" data-testid="bill-cart-empty">
                Koi item nahi. Search karke add karein.
              </p>
            )}
            {items.map((it, i) => {
              const tile = isBoxUnit(it);
              return (
                <div
                  key={`${it.productId}-${i}`}
                  data-testid={`bill-item-${i}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1 basis-36">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-900" title={it.name}>
                        {it.name}
                      </p>
                      <span className={`shrink-0 ${unitKindChipClass(it)}`}>
                        {unitKindLabel(it)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-slate-400" title={productMetaLine(it)}>
                      {productMetaLine(it)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-end gap-1.5">
                    <div className={FLD}>
                      <label className="text-[10px] leading-none text-slate-500">{qtyFieldLabel(it)}</label>
                      <NumberInput
                        data-testid={`item-qty-${i}`}
                        data-row={i}
                        data-cell="qty"
                        value={it.qty}
                        onChange={(v) => updItemQty(i, "qty", v)}
                        className={NUM}
                      />
                    </div>
                    {tile && (
                      <div className={FLD}>
                        <label className="text-[10px] leading-none text-slate-500">Pcs</label>
                        <NumberInput
                          data-testid={`item-pieces-${i}`}
                          data-row={i}
                          data-cell="pieces"
                          value={it.pieces}
                          onChange={(v) => updItemQty(i, "pieces", v)}
                          className={NUM}
                        />
                      </div>
                    )}
                    <div className={FLD_RATE}>
                      <label className="text-[10px] leading-none text-slate-500">Rate{rateSuffix(it)}</label>
                      <NumberInput
                        data-testid={`item-rate-${i}`}
                        data-row={i}
                        data-cell="rate"
                        value={it.rate}
                        onChange={(v) => updItem(i, { rate: v, amount: undefined })}
                        className={NUM}
                      />
                    </div>
                    <div className={FLD_AMT}>
                      <label className="text-[10px] leading-none text-slate-500">Amount</label>
                      <NumberInput
                        data-testid={`item-amount-${i}`}
                        data-row={i}
                        data-cell="amount"
                        value={it.amount != null ? it.amount : itemAmount(it)}
                        onChange={(v) => updItemAmount(i, v)}
                        className={NUM}
                      />
                    </div>
                    {tile && (
                      <button
                        type="button"
                        data-testid={`item-sqft-${i}`}
                        data-flow-skip
                        title={`Sq-ft (${KEYS.sqftCalc})`}
                        onClick={() => setSqftFor({
                          index: i,
                          item: {
                            name: it.name,
                            piecesPerBox: Number(it.piecesPerBox) || 1,
                            rate: Number(it.rate) || 0,
                            size: it.size || "",
                          },
                        })}
                        className="mb-0.5 rounded-lg p-1.5 text-mint hover:bg-mint-soft"
                      >
                        <Calculator className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    data-testid={`del-item-${i}`}
                    data-flow-skip
                    onClick={() => delItem(i)}
                    title={`Delete (${KEYS.deleteRow})`}
                    className="shrink-0 rounded-lg p-1.5 text-rose-500 hover:bg-rose-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-3">
            <div className="text-sm font-semibold text-slate-700">
              Subtotal{" "}
              <span className="tabular-nums text-slate-900" data-testid="bill-cart-subtotal">
                {money(subtotal)}
              </span>
            </div>
            <button
              ref={closeBtnRef}
              type="button"
              data-testid="bill-cart-close"
              data-flow-skip
              onClick={onClose}
              className="rounded-control border border-border bg-white px-4 py-2 text-sm font-semibold text-ink hover:bg-canvas"
            >
              Close <Kbd keys={KEYS.cancel} />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <SqftDialog
        sqftFor={sqftFor}
        onClose={() => {
          const i = sqftFor?.index;
          setSqftFor(null);
          setTimeout(() => {
            const rate = itemsRef.current?.querySelector(`[data-row="${i}"][data-cell="qty"]`);
            const any = itemsRef.current?.querySelector(`[data-row="${i}"]`);
            (rate || any)?.focus();
          }, 60);
        }}
        onApply={applySqft}
      />
    </>
  );
}
