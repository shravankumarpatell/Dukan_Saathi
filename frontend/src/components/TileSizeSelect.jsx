import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, PlusCircle } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useListNavigation } from "@/hooks/useListNavigation";
import {
  allTileSizes, filterTileSizes, formatTileSize, normalizeTileSize,
  proposeCustomTileSize, saveCustomTileSize,
} from "@/lib/tileSizes";

const WRAP =
  "flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-indigo-500";

/**
 * Searchable tile-size combobox. Type "2x2" / "12*18" to filter.
 * If the size is not in the list, an Add row saves it for this shop.
 */
export default function TileSizeSelect({
  value,
  onChange,
  testId = "tile-size",
  className = WRAP,
  inputClassName = "w-full bg-transparent text-sm outline-none placeholder:text-slate-400",
  placeholder = "Size search karein…",
  onKeyDown,
  onPaste,
  "data-rowid": dataRowId,
  "data-field": dataField,
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rev, setRev] = useState(0);
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);
  const skipBlurRef = useRef(false);

  const catalog = useMemo(() => allTileSizes(), [rev]);
  const matches = useMemo(() => filterTileSizes(q, catalog), [q, catalog]);
  const proposal = useMemo(() => proposeCustomTileSize(q), [q, rev]);

  const rows = useMemo(() => [
    ...matches.map((s) => ({ kind: "size", size: s })),
    ...(proposal ? [{ kind: "add", size: proposal }] : []),
  ], [matches, proposal]);

  const pick = (size) => {
    skipBlurRef.current = true;
    onChange(size.value);
    setQ("");
    setOpen(false);
  };

  const addSize = (size) => {
    saveCustomTileSize(size);
    setRev((n) => n + 1);
    pick(size);
  };

  const selectRow = (i) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "add") addSize(row.size);
    else pick(row.size);
  };

  const nav = useListNavigation({
    count: rows.length,
    enabled: open,
    onSelect: selectRow,
    onEscape: () => setOpen(false),
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useEffect(() => {
    const mapped = normalizeTileSize(q);
    const idx = rows.findIndex((r) => r.kind === "size" && r.size.value === mapped);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [q, rows, setActiveIndex]);

  const commitQuery = (raw, addIfNew) => {
    const t = String(raw || "").trim();
    if (!t) {
      onChange("");
      return true;
    }
    const known = normalizeTileSize(t);
    if (known) {
      onChange(known);
      return true;
    }
    if (addIfNew) {
      const custom = proposeCustomTileSize(t);
      if (custom) {
        saveCustomTileSize(custom);
        setRev((n) => n + 1);
        onChange(custom.value);
        return true;
      }
    }
    return false;
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
        return;
      }
      onKeyDown?.(e);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape" || e.key === "Home" || e.key === "End") {
      e.stopPropagation();
    }
    nav.handleKeyDown(e);
  };

  const display = open ? q : (formatTileSize(value) || "");

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor asChild>
        <div ref={wrapperRef} className={className}>
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            data-testid={testId}
            data-rowid={dataRowId}
            data-field={dataField}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${testId}-list`}
            autoComplete="off"
            value={display}
            placeholder={placeholder}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => {
              setQ(formatTileSize(value) || "");
              setOpen(true);
              requestAnimationFrame(() => inputRef.current?.select());
            }}
            onBlur={() => {
              setTimeout(() => {
                if (skipBlurRef.current) {
                  skipBlurRef.current = false;
                  return;
                }
                if (document.activeElement === inputRef.current) return;
                commitQuery(q, true);
              }, 80);
            }}
            onPaste={onPaste}
            onKeyDown={handleKeyDown}
            className={inputClassName}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        id={`${testId}-list`}
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        className="z-[80] max-h-60 w-[var(--radix-popover-trigger-width)] min-w-[220px] overflow-auto p-0"
      >
        <div ref={nav.listRef} role="listbox">
          {rows.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">Size nahi mili. 2x2 ft ya 12x18 in likhiye.</div>
          )}
          {rows.map((row, i) => {
            const active = i === activeIndex;
            const common = {
              id: `${testId}-opt-${i}`,
              role: "option",
              "aria-selected": active,
              "data-list-index": i,
              type: "button",
              onMouseEnter: () => hover(i),
            };
            if (row.kind === "add") {
              return (
                <button
                  key="add-size"
                  {...common}
                  data-testid={`${testId}-add`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addSize(row.size)}
                  className={`flex w-full items-center gap-2 border-t border-emerald-100 px-3 py-2 text-left text-sm font-semibold text-emerald-800 ${active ? "bg-emerald-100" : "bg-emerald-50"}`}
                >
                  <PlusCircle className="h-4 w-4 shrink-0" />
                  Add {row.size.value}
                </button>
              );
            }
            return (
              <button
                key={row.size.value}
                {...common}
                data-testid={`${testId}-opt-${row.size.value}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(row.size)}
                className={`flex w-full flex-col items-start px-3 py-1.5 text-left ${active ? "bg-indigo-50" : ""}`}
              >
                <span className="text-sm font-medium text-slate-800">{row.size.option}</span>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{row.size.group}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
