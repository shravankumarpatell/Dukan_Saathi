"use client";

import AppLink from "@/components/AppLink";
import { usePathname } from "@/context/AppHistoryContext";

function isNavActive(pathname, href, end) {
  const path = href.split("?")[0] || "/";
  if (end || path === "/") return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
}

/** NavLink stand-in: `className` / `children` may be functions of `{ isActive }`. */
export default function AppNavLink({ href, end, className, children, ...rest }) {
  const pathname = usePathname();
  const active = isNavActive(pathname, href, end);
  const cls = typeof className === "function" ? className({ isActive: active }) : className;
  return (
    <AppLink href={href} className={cls} {...rest}>
      {typeof children === "function" ? children({ isActive: active }) : children}
    </AppLink>
  );
}
