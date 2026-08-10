import React, { useState, useEffect } from "react";
import { NavLink, Link } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import DraftCard from "@/components/DraftCard";
import { LayoutDashboard, Package, Undo2, Info, Bot, Plus } from "lucide-react";

const LEFT = [
  { to: "/", label: "Home", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Stock", icon: Package },
];

export default function Layout({ children }) {
  const { shop, user, isDemo, geminiReady } = useApp();

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-stone-100 shadow-sm md:border-x md:border-slate-200">
      {/* Sticky top header — shop name -> dashboard; avatar (top-right) -> settings */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-md">
        <Link to="/" data-testid="shop-name-header" className="truncate font-display text-xl font-extrabold tracking-tight text-indigo-900">
          {shop?.name || "DukanSaathi"}
        </Link>
        <div className="flex shrink-0 items-center gap-2">
          {isDemo && (
            <span data-testid="demo-badge" className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">
              <Info className="h-3 w-3" /> Demo
            </span>
          )}
          {!geminiReady && !isDemo && (
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">Local NLU</span>
          )}
          <Link to="/settings" data-testid="settings-link" aria-label="Settings" className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-900 text-sm font-bold text-white transition-transform active:scale-95">
            {(user?.name || "S").charAt(0).toUpperCase()}
          </Link>
        </div>
      </header>

      <main className="px-4 pb-28 pt-4">{children}</main>

      {/* Fixed bottom nav: Home · Stock · [+ New Bill] · Returns · Assistant(mic) */}
      <nav className="fixed bottom-0 left-1/2 z-40 flex w-full max-w-md -translate-x-1/2 items-end justify-around border-t border-slate-200 bg-white/95 px-2 pb-2 pt-2 backdrop-blur-md">
        {LEFT.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} data-testid={`mnav-${n.label.toLowerCase()}`}
            className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors ${isActive ? "text-indigo-900" : "text-slate-400"}`}>
            <n.icon className="h-6 w-6" /> {n.label}
          </NavLink>
        ))}

        {/* Center raised + button -> New Bill */}
        <div className="flex flex-1 justify-center">
          <NavLink to="/bill" data-testid="new-bill-fab" aria-label="New Bill"
            className="-mt-8 flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-white shadow-xl ring-4 ring-orange-600/30 transition-transform active:scale-95 hover:bg-orange-500">
            <Plus className="h-8 w-8" />
          </NavLink>
        </div>

        <NavLink to="/returns" data-testid="mnav-returns"
          className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors ${isActive ? "text-indigo-900" : "text-slate-400"}`}>
          <Undo2 className="h-6 w-6" /> Returns
        </NavLink>

        {/* AI chat assistant */}
        <NavLink to="/chat" data-testid="mnav-assistant"
          className={({ isActive }) => `flex flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1 text-[10px] font-semibold transition-colors ${isActive ? "text-indigo-900" : "text-slate-400"}`}>
          <Bot className="h-6 w-6" /> Assistant
        </NavLink>
      </nav>

      <DraftCard />
    </div>
  );
}
