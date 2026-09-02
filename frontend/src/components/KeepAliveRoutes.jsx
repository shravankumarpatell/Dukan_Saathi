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
import ErrorBoundary from "@/components/ErrorBoundary";
import ErrorState from "@/components/ErrorState";

// If the analytics chunk fails to download (flaky network / new deploy), show
// a retry instead of a blank page. Retry re-requests the chunk.
const Analytics = dynamic(() => import("@/screens/Analytics"), {
  ssr: false,
  loading: ({ error, retry }) =>
    error ? (
      <ErrorState error={error} title="Analytics load nahi hua" onRetry={retry} />
    ) : (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-border border-t-mint" />
      </div>
    ),
});

const PAGES = [
  { path: "/", Page: Dashboard, label: "Dashboard" },
  { path: "/inventory", Page: Inventory, label: "Stock" },
  { path: "/bill", Page: NewBill, label: "Bill" },
  { path: "/customers", Page: Customers, label: "Customers" },
  { path: "/returns", Page: Returns, label: "Returns" },
  { path: "/chat", Page: Chat, label: "AI Saathi" },
  { path: "/bulk", Page: BulkUpload, label: "Add Stock" },
  { path: "/analytics", Page: Analytics, label: "Analytics" },
  { path: "/history", Page: BillHistory, label: "Bill History" },
  { path: "/settings", Page: Settings, label: "Settings" },
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
      {PAGES.map(({ path, Page, label }) => {
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
              {/* One crashed screen must not take the sidebar / other screens down. */}
              <ErrorBoundary name={label}>
                <Page />
              </ErrorBoundary>
            </div>
          </PageKeepAliveProvider>
        );
      })}
    </>
  );
}
