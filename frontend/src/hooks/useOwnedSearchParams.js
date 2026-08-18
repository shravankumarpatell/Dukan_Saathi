import { useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsPageActive } from "@/context/PageKeepAliveContext";

/**
 * Search params for the page that owns them.
 * Hidden keep-alive pages keep their last query instead of reading another route's `?q=` / `?focus=`.
 */
export function useOwnedSearchParams() {
  const [live, setLive] = useSearchParams();
  const active = useIsPageActive();
  const snapshot = useRef(live);

  if (active) snapshot.current = live;

  const setParams = useCallback(
    (next, opts) => {
      setLive(next, opts);
    },
    [setLive],
  );

  return [active ? live : snapshot.current, setParams];
}
