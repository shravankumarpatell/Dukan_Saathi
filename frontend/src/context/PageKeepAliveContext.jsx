import { createContext, useContext } from "react";

/** True when this page is the visible route. Default true for screens outside keep-alive (login, onboarding). */
export const PageKeepAliveContext = createContext(true);

export function useIsPageActive() {
  return useContext(PageKeepAliveContext);
}
