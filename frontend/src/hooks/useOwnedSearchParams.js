import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { usePageKeepAlive } from "@/context/PageKeepAliveContext";

const EMPTY = new URLSearchParams();

/**
 * Search params owned by the visible page only.
 * Hidden keep-alive pages must not read or clear another route's query string.
 */
export function useOwnedSearchParams() {
  const { active } = usePageKeepAlive();
  const [params, setParams] = useSearchParams();
  const setOwned = useCallback(
    (next, opts) => {
      if (!active) return;
      setParams(next, opts);
    },
    [active, setParams],
  );
  return [active ? params : EMPTY, setOwned];
}
