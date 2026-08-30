"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "@/context/AppHistoryContext";
import { useNavigate } from "@/hooks/useNavigate";
import { usePageKeepAlive } from "@/context/PageKeepAliveContext";

const EMPTY = new URLSearchParams();

function toQueryString(next, current) {
  if (next instanceof URLSearchParams) return next.toString();
  if (typeof next === "function") {
    const result = next(new URLSearchParams(current.toString()));
    if (result instanceof URLSearchParams) return result.toString();
    next = result;
  }
  const sp = new URLSearchParams();
  if (next && typeof next === "object") {
    Object.entries(next).forEach(([k, v]) => {
      if (v == null || v === "") return;
      sp.set(k, String(v));
    });
  }
  return sp.toString();
}

/**
 * Search params owned by the visible page only.
 * Hidden keep-alive pages must not read or clear another route's query string.
 */
export function useOwnedSearchParams() {
  const { active } = usePageKeepAlive();
  const searchParams = useSearchParams();
  const navigate = useNavigate();
  const pathname = usePathname();
  const setOwned = useCallback(
    (next, opts) => {
      if (!active) return;
      const qs = toQueryString(next, searchParams);
      const url = qs ? `${pathname}?${qs}` : pathname;
      navigate(url, { replace: !!opts?.replace });
    },
    [active, searchParams, pathname, navigate],
  );
  return [active ? searchParams : EMPTY, setOwned];
}
