"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type NavItem = { href: string; label: string; icon: ReactNode };

export function NavLinks({ items, variant = "row" }: { items: NavItem[]; variant?: "row" | "compact" }) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              variant === "row"
                ? `flex items-center gap-1.5 whitespace-nowrap shrink-0 text-sm rounded-md px-3 py-1.5 transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`
                : `flex items-center gap-1.5 whitespace-nowrap shrink-0 text-xs rounded-md px-2.5 py-1.5 transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`
            }
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </>
  );
}
