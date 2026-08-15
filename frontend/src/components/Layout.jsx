import React, { useCallback, useState } from "react";
import { NavLink, Link, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import DraftCard from "@/components/DraftCard";
import CommandPalette from "@/components/CommandPalette";
import ShortcutHelp from "@/components/ShortcutHelp";
import Kbd from "@/components/Kbd";
import { useGlobalHotkeys } from "@/hooks/useHotkeys";
import { useHotkeyContext } from "@/context/HotkeyContext";
import { NAV_ITEMS, NAV_BOTTOM, KEYS } from "@/lib/keymap";
import { LayoutDashboard, Package, Undo2, Bot, Plus, LogOut, Keyboard } from "lucide-react";
import { signOut as signOutUser } from "@/services/auth";

/* ─── Mobile nav (a deliberately shorter list than the sidebar) ─── */
const MOBILE_LEFT = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Stock", icon: Package },
];
const MOBILE_RIGHT = [
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/chat", label: "Assistant", icon: Bot },
];

const mobileNavCls = ({ isActive }) =>
  `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors ${isActive ? "text-indigo-900" : "text-slate-400"}`;

const sidebarNavCls = ({ isActive }) =>
  `ds-sidebar-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
    isActive
      ? "bg-indigo-900 text-white shadow-md"
      : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-900"
  }`;

export default function Layout({ children }) {
  const { shop, user } = useApp();
  const location = useLocation();
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
    { keys: KEYS.palette, label: "Command palette", handler: () => setPaletteOpen(true), allowInInput: true },
    { keys: KEYS.help, label: "Shortcut help", handler: openHelp },

    { keys: KEYS.gotoDashboard, label: "Dashboard", handler: () => navigate("/") },
    { keys: KEYS.gotoBill, label: "New bill", handler: () => navigate("/bill") },
    { keys: KEYS.gotoStock, label: "Stock", handler: () => navigate("/inventory") },
    { keys: KEYS.gotoHistory, label: "Bill history", handler: () => navigate("/history") },
    { keys: KEYS.gotoReturns, label: "Returns", handler: () => navigate("/returns") },
    { keys: KEYS.gotoBulk, label: "Add stock", handler: () => navigate("/bulk") },
    { keys: KEYS.gotoCustomers, label: "Udhari & Customers", handler: () => navigate("/customers") },
    { keys: KEYS.gotoChat, label: "AI assistant", handler: () => navigate("/chat") },
    { keys: KEYS.gotoAnalytics, label: "Analytics", handler: () => navigate("/analytics") },

    { keys: KEYS.gotoExpense, label: "Add expense", handler: () => navigate("/?focus=expense") },
    { keys: KEYS.sqftCalc, label: "Sq-ft calculator", handler: () => navigate("/?focus=sqft") },
    { keys: KEYS.gotoUdhari, label: "Record udhari payment", handler: () => navigate("/customers?tab=udhari&focus=payment") },
    { keys: KEYS.gotoSettings, label: "Settings", handler: () => navigate("/settings") },
  ]);

  return (
    <div className="relative min-h-screen bg-stone-100">
      {/* ════════════════════════════════════════════════════════════
          DESKTOP SIDEBAR — only visible at lg: (≥1024px)
         ════════════════════════════════════════════════════════════ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {/* Shop branding */}
        <div className="border-b border-slate-100 px-5 py-5">
          <Link to="/" className="block">
            <h1 className="font-display text-xl font-extrabold tracking-tight text-indigo-900 truncate">
              {shop?.name || "DukanSaathi"}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400">Bolo, bill banao, stock sambhalo</p>
          </Link>
        </div>

        {/* Gateway launcher */}
        <div className="px-3 pt-3">
          <button
            data-testid="open-palette-btn"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-800"
          >
            <span className="flex-1 text-left">Jaayein kahin bhi…</span>
            <Kbd keys={KEYS.palette} />
          </button>
        </div>

        {/* Main nav links — each shows its own key, Tally style */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {NAV_ITEMS.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={sidebarNavCls}>
              {({ isActive }) => (
                <>
                  <n.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{n.label}</span>
                  <Kbd keys={n.keys} tone={isActive ? "dark" : "default"} />
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section — settings, help, user */}
        <div className="border-t border-slate-100 px-3 py-3 space-y-2">
          {NAV_BOTTOM.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={sidebarNavCls}>
              {({ isActive }) => (
                <>
                  <n.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{n.label}</span>
                  <Kbd keys={n.keys} tone={isActive ? "dark" : "default"} />
                </>
              )}
            </NavLink>
          ))}
          <button
            data-testid="open-help-btn"
            onClick={openHelp}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-900"
          >
            <Keyboard className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left">Shortcuts</span>
            <Kbd keys={KEYS.help} />
          </button>
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800">{user?.name || user?.email || "User"}</p>
              <p className="truncate text-xs text-slate-400">{user?.email || ""}</p>
            </div>
            <button onClick={signOutUser} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ════════════════════════════════════════════════════════════
          MAIN CONTENT AREA
         ════════════════════════════════════════════════════════════ */}
      <div className="mx-auto max-w-md lg:max-w-none lg:ml-64">
        {/* ── Mobile-only sticky header ── */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md lg:hidden">
          <Link to="/" data-testid="shop-name-header" className="truncate font-display text-xl font-extrabold tracking-tight text-indigo-900">
            {shop?.name || "DukanSaathi"}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/settings" data-testid="settings-link" aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white transition-transform active:scale-95">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>

        {/* ── Desktop-only top bar ── */}
        <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur-md lg:flex">
          <h2 className="font-display text-lg font-bold text-slate-800 capitalize">
            {getPageTitle(location.pathname)}
          </h2>
          <div className="flex items-center gap-3">
            <button
              onClick={openHelp}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 transition-colors hover:text-indigo-800"
              aria-label="Keyboard shortcuts"
            >
              <Keyboard className="h-4 w-4" /> <Kbd keys={KEYS.help} />
            </button>
            <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white transition-transform hover:scale-105">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="px-4 pb-28 pt-4 lg:px-6 lg:pb-8 lg:pt-6">
          {children}
        </main>
      </div>

      {/* ════════════════════════════════════════════════════════════
          MOBILE BOTTOM NAV — only visible below lg: (unchanged behavior)
         ════════════════════════════════════════════════════════════ */}
      <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-end justify-around border-t border-slate-200 bg-white/95 px-2 pb-2 pt-2 backdrop-blur-md lg:hidden">
        {MOBILE_LEFT.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} data-testid={`mnav-${n.label.toLowerCase()}`} className={mobileNavCls}>
            <n.icon className="h-6 w-6" /> {n.label}
          </NavLink>
        ))}

        {/* Center raised + button → New Bill */}
        <div className="flex flex-1 justify-center">
          <NavLink to="/bill" data-testid="new-bill-fab" aria-label="New Bill"
            className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-white shadow-xl ring-4 ring-orange-600/30 transition-transform active:scale-95 hover:bg-orange-500">
            <Plus className="h-8 w-8" />
          </NavLink>
        </div>

        {MOBILE_RIGHT.map((n) => (
          <NavLink key={n.to} to={n.to} data-testid={`mnav-${n.label.toLowerCase()}`} className={mobileNavCls}>
            <n.icon className="h-6 w-6" /> {n.label}
          </NavLink>
        ))}
      </nav>

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
    "/customers": "Udhari & Customers",
    "/returns": "Returns",
    "/chat": "AI Assistant",
    "/bulk": "Add Stock",
    "/analytics": "Reports & Analytics",
    "/history": "Bill History",
    "/settings": "Settings",
  };
  return map[pathname] || "DukanSaathi";
}
