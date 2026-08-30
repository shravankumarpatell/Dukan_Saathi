"use client";

import { useAppHistory } from "@/context/AppHistoryContext";

function sameOriginNav(event) {
  if (event.defaultPrevented) return false;
  if (event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const target = event.currentTarget.getAttribute("target");
  if (target && target !== "_self") return false;
  return true;
}

/** In-app link that updates the URL without remounting the Next.js page. */
export default function AppLink({ href, className, children, onClick, ...rest }) {
  const { navigate } = useAppHistory();
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (!sameOriginNav(event)) return;
        event.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
