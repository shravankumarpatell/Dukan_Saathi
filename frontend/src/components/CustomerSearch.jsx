import React, { useState, useMemo, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import { searchCustomers } from "@/lib/fuzzy";
import { money } from "@/lib/calc";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useTapSelect } from "@/hooks/useTapSelect";
import { KEYS } from "@/lib/keymap";
import Kbd from "@/components/Kbd";
import { Search, UserPlus } from "lucide-react";

/**
 * Keyboard-native customer/supplier combobox.
 *
 * ↑/↓ move, Enter picks, Esc closes. Alt+C / "Add new" keeps the typed name
 * on the bill (no popup) — the parent decides what happens next (usually focus phone).
 */
const CustomerSearch = forwardRef(function CustomerSearch(
  { customers, value, onChangeText, onPick, onCreateNew, placeholder, inputTestId = "customer-name" },
  ref
) {
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchCustomers(customers, value), [customers, value]);
  const typed = (value || "").trim();
  const exact = results.find((c) => c.name.toLowerCase() === typed.toLowerCase());
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const tap = useTapSelect();

  const showCreate = !!typed && !exact;
  const rows = useMemo(
    () => [...results.map((c) => ({ kind: "customer", customer: c })), ...(showCreate ? [{ kind: "create" }] : [])],
    [results, showCreate]
  );

  const createNew = () => {
    setOpen(false);
    if (onCreateNew) onCreateNew(typed);
    else onPick(null);
  };

  const selectRow = (i) => {
    const row = rows[i];
    if (!row) return;
    if (row.kind === "create") return createNew();
    onPick(row.customer);
    setOpen(false);
  };

  const nav = useListNavigation({
    count: rows.length,
    enabled: open && !!typed,
    onSelect: selectRow,
    onEscape: () => setOpen(false),
  });
  const { activeIndex, setActiveIndex, hover } = nav;

  useImperativeHandle(ref, () => ({
    focus: () => { inputRef.current?.focus(); setOpen(true); },
  }));

  useEffect(() => { setActiveIndex(0); }, [value, setActiveIndex]);

  useEffect(() => {
    function handleClickOutside(e) {
      const root = wrapperRef.current;
      if (!root) return;
      const path = typeof e.composedPath === "function" ? e.composedPath() : [];
      if (root.contains(e.target) || path.includes(root)) return;
      setOpen(false);
    }
    if (open) {
      document.addEventListener("pointerdown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
    };
  }, [open]);

  const listOpen = open && !!typed;

  const onKeyDown = (e) => {
    if (e.altKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      e.stopPropagation();
      return createNew();
    }
    // Esc stays local to this combobox so a page-level Esc never steals it.
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (listOpen || open) setOpen(false);
      // Keep caret on the input — never blur on Esc.
      return;
    }
    if (!listOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); }
      return;
    }
    nav.handleKeyDown(e);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="ds-combo">
        <Search className="h-4 w-4 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          data-testid={inputTestId}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls="customer-search-list"
          aria-activedescendant={listOpen ? `customer-opt-${activeIndex}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(e) => { onChangeText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            const next = e.relatedTarget;
            if (next && wrapperRef.current?.contains(next)) return;
            window.setTimeout(() => {
              if (tap.holdOpenRef.current) return;
              if (!wrapperRef.current?.contains(document.activeElement)) setOpen(false);
            }, 180);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder || "Search existing or type a new name…"}
          className="ds-bare-input w-full placeholder:text-slate-400"
        />
      </div>

      {listOpen && rows.length > 0 && (
        <div
          id="customer-search-list"
          role="listbox"
          ref={nav.listRef}
          className="absolute z-[60] mt-1 max-h-64 w-full overflow-auto overscroll-contain rounded-lg border border-border bg-panel shadow-lg touch-manipulation"
          onScroll={tap.cancel}
          onPointerCancel={tap.releaseHold}
        >
          {rows.map((row, i) => {
            const active = i === activeIndex;
            const common = {
              id: `customer-opt-${i}`,
              role: "option",
              "aria-selected": active,
              "data-list-index": i,
              onMouseEnter: () => hover(i),
            };

            if (row.kind === "create") {
              return (
                <button
                  key="create-new"
                  {...common}
                  type="button"
                  data-testid="customer-add-new"
                  onPointerDown={tap.arm}
                  onPointerUp={(e) => tap.commit(e, createNew)}
                  className={`flex w-full min-h-11 items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-mint-dark ${active ? "bg-mint-soft" : ""}`}
                >
                  <UserPlus className="h-4 w-4 shrink-0" />
                  <span className="flex-1">Add new: "{typed}"</span>
                  <Kbd keys={KEYS.quickCreate} />
                </button>
              );
            }

            const c = row.customer;
            return (
              <button
                key={c.id}
                {...common}
                type="button"
                data-testid={`customer-option-${c.id}`}
                onPointerDown={tap.arm}
                onPointerUp={(e) => tap.commit(e, () => selectRow(i))}
                className={`flex w-full min-h-11 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left ${active ? "bg-mint-soft" : ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{c.name}</p>
                  <p className="truncate text-xs text-slate-500">{[c.phone, c.isContractor ? "Contractor" : null].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {c.totalPending > 0 && <p className="font-bold text-rose-600">Udhari {money(c.totalPending)}</p>}
                  {c.storeCredit > 0 && <p className="font-bold text-violet-600">Credit {money(c.storeCredit)}</p>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default CustomerSearch;
