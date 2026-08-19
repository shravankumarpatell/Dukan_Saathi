import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageKeepAliveProvider } from "@/context/PageKeepAliveContext";
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
  { path: "/", Page: Dashboard },
  { path: "/inventory", Page: Inventory },
  { path: "/bill", Page: NewBill },
  { path: "/customers", Page: Customers },
  { path: "/returns", Page: Returns },
  { path: "/chat", Page: Chat },
  { path: "/bulk", Page: BulkUpload },
  { path: "/analytics", Page: Analytics },
  { path: "/history", Page: BillHistory },
  { path: "/settings", Page: Settings },
];

const KNOWN = new Set(PAGES.map((p) => p.path));

/**
 * Keep visited screens mounted so local state (chat, add-stock grid, bill cart)
 * survives in-app navigation. Hidden pages are inert and not displayed.
 */
export default function KeepAliveRoutes() {
  const { pathname } = useLocation();
  const [visited, setVisited] = useState(() => new Set(KNOWN.has(pathname) ? [pathname] : ["/"]));

  useEffect(() => {
    if (!KNOWN.has(pathname)) return;
    setVisited((prev) => {
      if (prev.has(pathname)) return prev;
      const next = new Set(prev);
      next.add(pathname);
      return next;
    });
  }, [pathname]);

  if (!KNOWN.has(pathname)) {
    return <Navigate to="/" replace />;
  }

  return (
    <>
      {PAGES.map(({ path, Page }) => {
        const active = pathname === path;
        if (!visited.has(path) && !active) return null;
        return (
          <PageKeepAliveProvider key={path} active={active}>
            <div hidden={!active} inert={active ? undefined : true} aria-hidden={!active}>
              <Page />
            </div>
          </PageKeepAliveProvider>
        );
      })}
    </>
  );
}
