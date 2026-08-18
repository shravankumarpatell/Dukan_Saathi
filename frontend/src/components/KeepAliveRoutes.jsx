import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageKeepAliveContext } from "@/context/PageKeepAliveContext";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import NewBill from "@/pages/NewBill";
import Customers from "@/pages/Customers";
import Returns from "@/pages/Returns";
import Chat from "@/pages/Chat";
import BulkUpload from "@/pages/BulkUpload";
import Analytics from "@/pages/Analytics";
import BillHistory from "@/pages/BillHistory";
import Settings from "@/pages/Settings";

const PAGES = [
  { path: "/", Component: Dashboard },
  { path: "/inventory", Component: Inventory },
  { path: "/bill", Component: NewBill },
  { path: "/customers", Component: Customers },
  { path: "/returns", Component: Returns },
  { path: "/chat", Component: Chat },
  { path: "/bulk", Component: BulkUpload },
  { path: "/analytics", Component: Analytics },
  { path: "/history", Component: BillHistory },
  { path: "/settings", Component: Settings },
];

function KeepAlivePane({ active, children }) {
  const paneRef = useRef(null);
  const savedFocusRef = useRef(null);
  const savedWindowScrollRef = useRef(0);
  const savedScrollsRef = useRef([]);

  useEffect(() => {
    if (!active) return undefined;
    const pane = paneRef.current;
    if (!pane) return undefined;

    const onFocusIn = (e) => {
      if (e.target && pane.contains(e.target)) savedFocusRef.current = e.target;
    };
    const onScroll = (e) => {
      const el = e.target;
      if (!(el instanceof Element) || !pane.contains(el)) return;
      const list = savedScrollsRef.current.filter((s) => s.el !== el);
      list.push({ el, top: el.scrollTop, left: el.scrollLeft });
      savedScrollsRef.current = list;
    };
    const onWinScroll = () => { savedWindowScrollRef.current = window.scrollY; };

    pane.addEventListener("focusin", onFocusIn);
    pane.addEventListener("scroll", onScroll, true);
    window.addEventListener("scroll", onWinScroll, { passive: true });
    onWinScroll();
    return () => {
      pane.removeEventListener("focusin", onFocusIn);
      pane.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("scroll", onWinScroll);
    };
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    window.scrollTo(0, savedWindowScrollRef.current);
    for (const { el, top, left } of savedScrollsRef.current) {
      if (el && document.contains(el)) {
        el.scrollTop = top;
        el.scrollLeft = left;
      }
    }
    const el = savedFocusRef.current;
    if (el && document.contains(el) && typeof el.focus === "function") {
      try { el.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
    requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  }, [active]);

  return (
    <PageKeepAliveContext.Provider value={active}>
      <div
        ref={paneRef}
        className={active ? undefined : "invisible pointer-events-none absolute inset-x-0 top-0"}
        aria-hidden={!active}
        {...(!active ? { inert: "" } : {})}
      >
        {children}
      </div>
    </PageKeepAliveContext.Provider>
  );
}

export default function KeepAliveRoutes() {
  const location = useLocation();
  const pathname = location.pathname;
  const known = PAGES.some((p) => p.path === pathname);
  const [visited, setVisited] = useState(() => new Set([known ? pathname : "/"]));

  useEffect(() => {
    if (!known) return;
    setVisited((prev) => {
      if (prev.has(pathname)) return prev;
      const next = new Set(prev);
      next.add(pathname);
      return next;
    });
  }, [pathname, known]);

  if (!known) return <Navigate to="/" replace />;

  return (
    <div className="relative">
      {PAGES.map(({ path, Component }) => {
        const active = pathname === path;
        if (!active && !visited.has(path)) return null;
        return (
          <KeepAlivePane key={path} active={active}>
            <Component />
          </KeepAlivePane>
        );
      })}
    </div>
  );
}
