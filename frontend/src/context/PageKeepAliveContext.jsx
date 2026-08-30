import React, { createContext, useContext } from "react";

const PageKeepAliveContext = createContext({ active: true });

export function PageKeepAliveProvider({ active, children }) {
  return (
    <PageKeepAliveContext.Provider value={{ active }}>
      {children}
    </PageKeepAliveContext.Provider>
  );
}

/** True when this page is the visible route. Defaults to true outside keep-alive. */
export function usePageKeepAlive() {
  return useContext(PageKeepAliveContext);
}

/** Dialogs portaled to document.body must not stay open on a hidden page. */
export function useVisibleOpen(open) {
  const { active } = usePageKeepAlive();
  return !!(open && active);
}
