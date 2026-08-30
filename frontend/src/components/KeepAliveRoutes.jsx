"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "@/context/AppHistoryContext";
import { useNavigate } from "@/hooks/useNavigate";
import { PageKeepAliveProvider } from "@/context/PageKeepAliveContext";
import Dashboard from "@/screens/Dashboard";
import Inventory from "@/screens/Inventory";
import NewBill from "@/screens/NewBill";
import Customers from "@/screens/Customers";
import Returns from "@/screens/Returns";
import Chat from "@/screens/Chat";
import BulkUpload from "@/screens/BulkUpload";
import BillHistory from "@/screens/BillHistory";
import Settings from "@/screens/Settings";

const Analytics = dynamic(() => import("@/screens/Analytics"), { ssr: false });

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
  const pathname = usePathname() || "/";
  const navigate = useNavigate();
  const [visited, setVisited] = useState(() => new Set(KNOWN.has(pathname) ? [pathname] : ["/"]));

  useEffect(() => {
    if (!KNOWN.has(pathname)) {
      navigate("/", { replace: true });
      return;
    }
    setVisited((prev) => {
      if (prev.has(pathname)) return prev;
      const next = new Set(prev);
      next.add(pathname);
      return next;
    });
  }, [pathname, navigate]);

  if (!KNOWN.has(pathname)) return null;

  return (
    <>
      {PAGES.map(({ path, Page }) => {
        const active = pathname === path;
        if (!visited.has(path) && !active) return null;
        return (
          <PageKeepAliveProvider key={path} active={active}>
            <div
              hidden={!active}
              inert={active ? undefined : true}
              aria-hidden={!active}
              className={
                // Only when active: `flex` would override HTML `hidden` (display:none)
                // and leak Chat onto every other route after visiting /chat.
                path === "/chat" && active ? "flex h-full min-h-0 flex-col" : undefined
              }
            >
              <Page />
            </div>
          </PageKeepAliveProvider>
        );
      })}
    </>
  );
}
