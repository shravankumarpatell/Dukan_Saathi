import React from "react";
import { NavLink, Link, useLocation } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/context/ThemeContext";
import DraftCard from "@/components/DraftCard";
import {
  LayoutDashboard, Package, Undo2, Bot, Plus,
  ReceiptText, Users, Upload, BarChart3, Settings, LogOut,
  Sun, Moon, Monitor,
} from "lucide-react";
import { signOut as signOutUser } from "@/services/auth";

/* ─── Navigation items ─── */
const MOBILE_LEFT = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Stock", icon: Package },
];
const MOBILE_RIGHT = [
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/chat", label: "Assistant", icon: Bot },
];

const SIDEBAR_NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/bill", label: "New Bill", icon: Plus },
  { to: "/inventory", label: "Stock", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/history", label: "Bill History", icon: ReceiptText },
  { to: "/bulk", label: "Bulk Upload", icon: Upload },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/chat", label: "AI Assistant", icon: Bot },
];

const SIDEBAR_BOTTOM = [
  { to: "/settings", label: "Settings", icon: Settings },
];

/* Reusable nav-link class builder */
const mobileNavCls = ({ isActive }) =>
  `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors ${isActive ? "text-indigo-900 dark:text-[#F5F5F7]" : "text-slate-400 dark:text-[#6E6E73]"}`;

const sidebarNavCls = ({ isActive }) =>
  `ds-sidebar-link flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
    isActive
      ? "bg-indigo-900 text-white shadow-md dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]"
      : "text-slate-600 hover:bg-indigo-50 hover:text-indigo-900 dark:text-[#A1A1A6] dark:hover:bg-[#2C2C2E] dark:hover:text-[#F5F5F7]"
  }`;

/* ─── Theme Toggle Component ─── */
function ThemeToggle({ className = "" }) {
  const { theme, setTheme } = useTheme();
  const options = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div className={`flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-[#2C2C2E] dark:bg-[#2C2C2E] ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setTheme(o.value)}
          aria-label={`${o.label} theme`}
          title={o.label}
          className={`flex items-center justify-center rounded-lg p-1.5 transition-all ${
            theme === o.value
              ? "bg-white text-indigo-900 shadow-sm dark:bg-[#3A3A3C] dark:text-[#F5F5F7]"
              : "text-slate-400 hover:text-slate-600 dark:text-[#6E6E73] dark:hover:text-[#F5F5F7]"
          }`}
        >
          <o.icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

export default function Layout({ children }) {
  const { shop, user } = useApp();
  const location = useLocation();

  return (
    <div className="relative min-h-screen bg-stone-100 dark:bg-[#111113]">
      {/* ════════════════════════════════════════════════════════════
          DESKTOP SIDEBAR — only visible at lg: (≥1024px)
         ════════════════════════════════════════════════════════════ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex dark:border-[#2C2C2E] dark:bg-[#1C1C1E]">
        {/* Shop branding */}
        <div className="border-b border-slate-100 px-5 py-5 dark:border-[#2C2C2E]">
          <Link to="/" className="block">
            <h1 className="font-display text-xl font-extrabold tracking-tight text-indigo-900 truncate dark:text-[#F5F5F7]">
              {shop?.name || "DukanSaathi"}
            </h1>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-[#6E6E73]">Bolo, bill banao, stock sambhalo</p>
          </Link>
        </div>

        {/* Main nav links */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {SIDEBAR_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={sidebarNavCls}>
              <n.icon className="h-5 w-5 shrink-0" /> {n.label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom section — theme toggle, settings, user */}
        <div className="border-t border-slate-100 px-3 py-3 space-y-2 dark:border-[#2C2C2E]">
          <ThemeToggle className="w-full justify-center" />
          {SIDEBAR_BOTTOM.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={sidebarNavCls}>
              <n.icon className="h-5 w-5 shrink-0" /> {n.label}
            </NavLink>
          ))}
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800 dark:text-[#A1A1A6]">{user?.name || user?.email || "User"}</p>
              <p className="truncate text-xs text-slate-400 dark:text-[#6E6E73]">{user?.email || ""}</p>
            </div>
            <button onClick={signOutUser} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors dark:text-[#6E6E73] dark:hover:bg-[#FB7185]/10 dark:hover:text-[#FB7185]" aria-label="Sign out">
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
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md lg:hidden dark:border-[#2C2C2E] dark:bg-[#1C1C1E]/90">
          <Link to="/" data-testid="shop-name-header" className="truncate font-display text-xl font-extrabold tracking-tight text-indigo-900 dark:text-[#F5F5F7]">
            {shop?.name || "DukanSaathi"}
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Link to="/settings" data-testid="settings-link" aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white transition-transform active:scale-95 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]">
              {(user?.name || "S").charAt(0).toUpperCase()}
            </Link>
          </div>
        </header>

        {/* ── Desktop-only top bar ── */}
        <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur-md lg:flex dark:border-[#2C2C2E] dark:bg-[#1C1C1E]/90">
          <h2 className="font-display text-lg font-bold text-slate-800 capitalize dark:text-[#A1A1A6]">
            {getPageTitle(location.pathname)}
          </h2>
          <div className="flex items-center gap-3">
            <Link to="/settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white transition-transform hover:scale-105 dark:bg-[#818CF8] dark:text-[#F5F5F7] hover:dark:bg-[#6366F1]">
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
      <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-end justify-around border-t border-slate-200 bg-white/95 px-2 pb-2 pt-2 backdrop-blur-md lg:hidden dark:border-[#2C2C2E] dark:bg-[#1C1C1E]/95">
        {MOBILE_LEFT.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} data-testid={`mnav-${n.label.toLowerCase()}`} className={mobileNavCls}>
            <n.icon className="h-6 w-6" /> {n.label}
          </NavLink>
        ))}

        {/* Center raised + button → New Bill */}
        <div className="flex flex-1 justify-center">
          <NavLink to="/bill" data-testid="new-bill-fab" aria-label="New Bill"
            className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-white shadow-xl ring-4 ring-orange-600/30 transition-transform active:scale-95 hover:bg-orange-500 dark:bg-[#FB923C] dark:ring-[#FB923C]/25 dark:hover:bg-[#FB923C]">
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
    </div>
  );
}

/* Map pathname → page title for the desktop top bar */
function getPageTitle(pathname) {
  const map = {
    "/": "Dashboard",
    "/inventory": "Stock Management",
    "/bill": "New Bill",
    "/customers": "Customers & Udhari",
    "/returns": "Returns",
    "/chat": "AI Assistant",
    "/bulk": "Bulk Upload",
    "/analytics": "Reports & Analytics",
    "/history": "Bill History",
    "/settings": "Settings",
  };
  return map[pathname] || "DukanSaathi";
}
