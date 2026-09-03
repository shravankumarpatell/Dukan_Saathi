"use client";

import { useEffect, useState } from "react";

/**
 * Reactive CSS media query. SSR-safe: returns `false` on the server and during
 * the first client render, then syncs with `window.matchMedia`.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    if (mq.addEventListener) mq.addEventListener("change", update);
    else mq.addListener(update);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", update);
      else mq.removeListener(update);
    };
  }, [query]);

  return matches;
}

/** Tailwind `lg` breakpoint and below — where we swap grids for stacked cards. */
export function useIsMobile() {
  return useMediaQuery("(max-width: 1023px)");
}
