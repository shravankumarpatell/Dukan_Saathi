import React from "react";
import { NavLink, Link } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import VoiceAssistant from "@/components/VoiceAssistant";
import DraftCard from "@/components/DraftCard";
import BillPreviewModal from "@/components/BillPreviewModal";
import {
  LayoutDashboard, Package, Users, Undo2, BarChart3, LogOut, Settings, Info, ReceiptText, Mic,
} from "lucide-react";

// Desktop sidebar (full nav). "New Bill" lives on the dashboard; Bulk Upload lives inside Stock.
const SIDEBAR = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Stock", icon: Package },
  { to: "/customers", label: "Udhari", icon: Users },
  { to: "/analytics", label: "Reports", icon: BarChart3 },
  { to: "/returns", label: "Returns", icon: Undo2 },
  { to: "/history", label: "Bill History", icon: ReceiptText },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Mobile bottom bar: Stock, Returns, [MIC], Reports, Settings.
const MOBILE_LEFT = [
  { to: "/inventory", label: "Stock", icon: Package },
  { to: "/returns", label: "Returns", icon: Undo2 },
];
const MOBILE_RIGHT = [
  { to: "/analytics", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }) {
  const { shop, user, logout, isDemo, geminiReady } = useApp();

  return (
    <div className="min-h-screen bg-stone-100 pb-24 md:pb-0 md:pl-60">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-100 px-5 py-4">
          <h1 className="font-display text-xl font-extrabold tracking-tight text-indigo-900">DukanSaathi</h1>
          <p className="text-xs text-slate-500">Bolo, bill banao, stock sambhalo</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {SIDEBAR.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
              className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${isActive ? "bg-indigo-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <n.icon className="h-4 w-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <button data-testid="logout-btn" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Top header — shop name is the brand + tap-to-dashboard */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link to="/" data-testid="shop-name-header" className="font-display text-xl font-extrabold tracking-tight text-indigo-900">
          {shop?.name || "DukanSaathi"}
        </Link>
        <div className="flex items-center gap-2">
          {isDemo && (
            <span data-testid="demo-badge" className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">
              <Info className="h-3 w-3" /> Demo Mode
            </span>
          )}
          {!geminiReady && !isDemo && (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Local NLU</span>
          )}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white">
            {(user?.name || "S").charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>

      {/* Bottom nav (mobile) with center AI mic */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white px-2 py-2 md:hidden">
        {MOBILE_LEFT.map((n) => (
          <NavLink key={n.to} to={n.to} data-testid={`mnav-${n.label.toLowerCase()}`}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold ${isActive ? "text-indigo-900" : "text-slate-400"}`}>
            <n.icon className="h-5 w-5" /> {n.label}
          </NavLink>
        ))}
        <div className="flex flex-1 justify-center">
          <button
            data-testid="mobile-voice-mic"
            onClick={() => window.dispatchEvent(new CustomEvent("ds:voice-toggle"))}
            className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-white shadow-xl ring-4 ring-orange-600/30 transition-transform active:scale-95"
            aria-label="AI voice assistant"
          >
            <Mic className="h-7 w-7" />
          </button>
        </div>
        {MOBILE_RIGHT.map((n) => (
          <NavLink key={n.to} to={n.to} data-testid={`mnav-${n.label.toLowerCase()}`}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold ${isActive ? "text-indigo-900" : "text-slate-400"}`}>
            <n.icon className="h-5 w-5" /> {n.label}
          </NavLink>
        ))}
      </nav>

      <VoiceAssistant />
      <DraftCard />
      <BillPreviewModal />
    </div>
  );
}
