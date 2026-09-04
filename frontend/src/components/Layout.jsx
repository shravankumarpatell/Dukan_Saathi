"use client";

import React, { useCallback, useState } from "react";
import AppLink from "@/components/AppLink";
import AppNavLink from "@/components/AppNavLink";
import { useNavigate } from "@/hooks/useNavigate";
import { usePathname } from "@/context/AppHistoryContext";
import { useApp } from "@/context/AppContext";
import DraftCard from "@/components/DraftCard";
import CommandPalette from "@/components/CommandPalette";
import ShortcutHelp from "@/components/ShortcutHelp";
import Kbd from "@/components/Kbd";
import { useGlobalHotkeys } from "@/hooks/useHotkeys";
import { useHotkeyContext } from "@/context/HotkeyContext";
import { NAV_ITEMS, NAV_BOTTOM, KEYS } from "@/lib/keymap";
import { LayoutDashboard, Package, Undo2, Plus, LogOut, Keyboard, Search, Ruler } from "lucide-react";
import { signOut as signOutUser } from "@/services/auth";
import { LOGOUT } from "@/constants/testIds/auth";
import ThemeToggle from "@/components/ThemeToggle";
import MobileFlowBar from "@/components/MobileFlowBar";

/* ─── Mobile nav (a deliberately shorter list than the sidebar) ─── */
const MOBILE_LEFT = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Stock", icon: Package },
];
const MOBILE_RIGHT = [
  { to: "/slab", label: "Slab", icon: Ruler },
  { to: "/returns", label: "Returns", icon: Undo2 },
];

const mobileNavCls = ({ isActive }) =>
  `flex flex-1 flex-col items-center gap-0.5 rounded-control px-1 py-1 text-[10px] font-semibold transition-colors ${isActive ? "text-ink" : "text-ink-muted"}`;

const sidebarNavCls = ({ isActive }) =>
  `ds-sidebar-link flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium tracking-tight transition-all border-l-[3px] ${
    isActive
      ? "border-mint bg-white/10 text-white"
      : "border-transparent text-white/55 hover:bg-white/[0.06] hover:text-white"
  }`;

export default function Layout({ children }) {
  const { shop, user } = useApp();
  const pathname = usePathname();
  const navigate = useNavigate();
  const { getActiveBindings } = useHotkeyContext();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpBindings, setHelpBindings] = useState([]);

  // Snapshot the live stack before the help dialog pushes its own scope on top.
  const openHelp = useCallback(() => {
    setHelpBindings(getActiveBindings());
    setHelpOpen(true);
  }, [getActiveBindings]);

  useGlobalHotkeys([
    { keys: KEYS.palette, label: "Search anywhere", handler: () => setPaletteOpen(true), allowInInput: true },
    { keys: KEYS.help, label: "Shortcut help", handler: openHelp },

    { keys: KEYS.gotoDashboard, label: "Dashboard", handler: () => navigate("/") },
    { keys: KEYS.gotoBill, label: "New bill", handler: () => navigate("/bill") },
    { keys: KEYS.gotoSlab, label: "Slab estimate", handler: () => navigate("/slab") },
    { keys: KEYS.gotoStock, label: "Stock", handler: () => navigate("/inventory") },
    { keys: KEYS.gotoHistory, label: "Bill history", handler: () => navigate("/history") },
    { keys: KEYS.gotoReturns, label: "Returns", handler: () => navigate("/returns") },
    { keys: KEYS.gotoBulk, label: "Add stock", handler: () => navigate("/bulk") },
    { keys: KEYS.gotoCustomers, label: "Udhari & Customers", handler: () => navigate("/customers") },
    { keys: KEYS.gotoChat, label: "AI Saathi", handler: () => navigate("/chat") },
    { keys: KEYS.gotoAnalytics, label: "Analytics", handler: () => navigate("/analytics") },

    { keys: KEYS.gotoExpense, label: "Add expense", handler: () => navigate("/?focus=expense"), allowInInput: true },
    { keys: KEYS.sqftCalc, label: "Sq-ft calculator", handler: () => navigate("/?focus=sqft"), allowInInput: true },
    { keys: KEYS.gotoUdhari, label: "Record udhari payment", handler: () => navigate("/customers?tab=udhari&focus=payment") },
    { keys: KEYS.gotoSettings, label: "Settings", handler: () => navigate("/settings") },
  ]);

  return (
    <div className="relative min-h-screen ds-mesh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-control focus:bg-mint focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      {/* ════════════════════════════════════════════════════════════
          DESKTOP SIDEBAR — only visible at lg: (≥1024px)
         ════════════════════════════════════════════════════════════ */}
      <aside className="ds-glass-dark fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col lg:flex" aria-label="Primary">
        {/* Shop branding */}
        <div className="border-b border-white/10 px-5 py-5">
          <AppLink href="/" className="block">
            <h1 className="font-display text-lg font-semibold tracking-tight text-white truncate">
              {shop?.name || "DukanSaathi"}
            </h1>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-widest text-white/40">Ledger · Stock · Udhari</p>
          </AppLink>
        </div>

        {/* Gateway launcher */}
        <div className="px-3 pt-3">
          <button
            data-testid="open-palette-btn"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-control border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/50 transition-colors hover:border-white/20 hover:text-white"
          >
            <span className="flex-1 text-left">Jaayein kahin bhi…</span>
            <Kbd keys={KEYS.palette} tone="dark" />
          </button>
        </div>

        {/* Main nav links — each shows its own key, Tally style */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {NAV_ITEMS.map((n) => (
            <AppNavLink key={n.to} href={n.to} end={n.end} className={sidebarNavCls}>
              {({ isActive }) => (
                <>
                  <n.icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="flex-1">{n.label}</span>
                  <Kbd keys={n.keys} tone="dark" />
                </>
              )}
            </AppNavLink>
          ))}
        </nav>

        {/* Bottom section — settings, help, user */}
        <div className="border-t border-white/10 px-3 py-3 space-y-1">
          {NAV_BOTTOM.map((n) => (
            <AppNavLink key={n.to} href={n.to} end={n.end} className={sidebarNavCls}>
              {({ isActive }) => (
                <>
                  <n.icon className="h-4 w-4 shrink-0 opacity-80" />
                  <span className="flex-1">{n.label}</span>
                  <Kbd keys={n.keys} tone="dark" />
                </>
              )}
            </AppNavLink>
          ))}
          <button
            data-testid="open-help-btn"
            onClick={openHelp}
            className="flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-sm font-medium text-white/55 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Keyboard className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Shortcuts</span>
            <Kbd keys={KEYS.help} tone="dark" />
          </button>
          <div className="flex items-center gap-3 rounded-control px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold text-white">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user?.name || user?.email || "User"}</p>
              <p className="truncate text-[11px] text-white/40">{user?.email || ""}</p>
            </div>
            <button
              data-testid={LOGOUT.button}
              onClick={signOutUser}
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 hover:bg-white/10 hover:text-white transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
         ════════════════════════════════════════════════════════════ */}
      <div
        className={
          pathname === "/chat"
            ? "mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden lg:ml-[260px] lg:max-w-none"
            : "mx-auto max-w-md lg:ml-[260px] lg:max-w-none"
        }
      >
        {/* ── Mobile-only sticky header ── */}
        <header className="ds-glass sticky top-0 z-20 flex items-center justify-between px-4 py-3 lg:hidden">
          <AppLink href="/" data-testid="shop-name-header" className="truncate font-display text-lg font-semibold tracking-tight text-ink">
            {shop?.name || "DukanSaathi"}
          </AppLink>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="open-palette-mobile-btn"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="flex h-8 w-8 items-center justify-center rounded-control text-ink-muted hover:bg-canvas/60 hover:text-ink"
            >
              <Search className="h-4 w-4" />
            </button>
            <ThemeToggle />
            <button
              type="button"
              data-testid="logout-mobile-btn"
              onClick={signOutUser}
              aria-label="Sign out"
              className="flex h-8 w-8 items-center justify-center rounded-control text-ink-muted hover:bg-canvas/60 hover:text-ink"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <AppLink href="/settings" data-testid="settings-link" aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-xs font-semibold text-white transition-transform active:scale-95">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </AppLink>
          </div>
        </header>

        {/* ── Desktop-only top bar ── */}
        <header className="ds-glass sticky top-0 z-20 hidden items-center justify-between px-8 py-3.5 lg:flex">
          <p className="font-display text-[15px] font-semibold tracking-tight text-ink capitalize">
            {getPageTitle(pathname)}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="open-palette-header-btn"
              onClick={() => setPaletteOpen(true)}
              className="flex items-center gap-2 rounded-control border border-border bg-canvas/40 px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-mint/40 hover:text-ink"
            >
              <Search className="h-3.5 w-3.5" />
              Search
              <Kbd keys={KEYS.palette} />
            </button>
            <ThemeToggle />
            <button
              onClick={openHelp}
              className="flex items-center gap-1.5 rounded-control px-2 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" /> <Kbd keys={KEYS.help} />
            </button>
            <AppLink href="/settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-xs font-semibold text-white transition-transform hover:scale-105">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </AppLink>
          </div>
        </header>

        {/* ── Page content ── */}
        <main
          id="main-content"
          className={
            pathname === "/chat"
              ? "flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-24 pt-3 lg:px-8 lg:pb-4 lg:pt-4"
              : "px-4 pb-28 pt-4 lg:px-8 lg:pb-10 lg:pt-7"
          }
        >
          {children}
        </main>
      </div>

      {/* ════════════════════════════════════════════════════════════
          MOBILE BOTTOM NAV — only visible below lg: (unchanged behavior)
         ════════════════════════════════════════════════════════════ */}
      <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-end justify-around ds-glass px-2 pb-2 pt-2 lg:hidden" aria-label="Mobile">
        {MOBILE_LEFT.map((n) => (
          <AppNavLink key={n.to} href={n.to} end={n.end} data-testid={`mnav-${n.label.toLowerCase()}`} className={mobileNavCls}>
            <n.icon className="h-6 w-6" /> {n.label}
          </AppNavLink>
        ))}

        {/* Center raised + button → New Bill */}
        <div className="flex flex-1 justify-center">
          <AppNavLink href="/bill" data-testid="new-bill-fab" aria-label="New Bill"
            className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-mint text-white shadow-lg ring-4 ring-mint/20 transition-transform active:scale-95 hover:bg-mint-dark">
            <Plus className="h-8 w-8" />
          </AppNavLink>
        </div>

        {MOBILE_RIGHT.map((n) => (
          <AppNavLink key={n.to} href={n.to} data-testid={`mnav-${n.label.toLowerCase()}`} className={mobileNavCls}>
            <n.icon className="h-6 w-6" /> {n.label}
          </AppNavLink>
        ))}
      </nav>

      <MobileFlowBar />

      <DraftCard />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} pageBindings={helpBindings} />
    </div>
  );
}

/* Map pathname → page title for the desktop top bar */
function getPageTitle(pathname) {
  const map = {
    "/": "Dashboard",
    "/inventory": "Stock Management",
    "/bill": "New Bill",
    "/slab": "Slab Estimate",
    "/customers": "Udhari & Customers",
    "/returns": "Returns",
    "/chat": "AI Saathi",
    "/bulk": "Add Stock",
    "/analytics": "Reports & Analytics",
    "/history": "Bill History",
    "/settings": "Settings",
  };
  return map[pathname] || "DukanSaathi";
}
