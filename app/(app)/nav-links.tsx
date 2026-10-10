"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type NavItem = { href: string; label: string; icon: ReactNode };

/** Uma entrada do menu: ou um link direto, ou um grupo que abre um dropdown com sub-links. */
export type NavEntry =
  | ({ type: "link" } & NavItem)
  | { type: "group"; label: string; icon: ReactNode; items: NavItem[] };

function isActive(pathname: string | null, href: string): boolean {
  return pathname === href || !!pathname?.startsWith(`${href}/`);
}

function LinkItem({ item, variant }: { item: NavItem; variant: "row" | "compact" }) {
  const pathname = usePathname();
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className={
        variant === "row"
          ? `flex items-center gap-1.5 whitespace-nowrap shrink-0 text-sm rounded-md px-3 py-1.5 transition-colors ${
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`
          : `flex items-center gap-1 whitespace-nowrap shrink-0 text-xs rounded-md px-2 py-1 transition-colors ${
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`
      }
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

function GroupItem({
  label,
  icon,
  items,
  variant,
}: {
  label: string;
  icon: ReactNode;
  items: NavItem[];
  variant: "row" | "compact";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const algumAtivo = items.some((i) => isActive(pathname, i.href));

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  // Fecha o dropdown ao navegar pra um dos links internos (mudança de pathname).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const base =
    variant === "row"
      ? "flex items-center gap-1.5 whitespace-nowrap shrink-0 text-sm rounded-md px-3 py-1.5 transition-colors"
      : "flex items-center gap-1 whitespace-nowrap shrink-0 text-xs rounded-md px-2 py-1 transition-colors";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${base} ${
          algumAtivo ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        }`}
        aria-expanded={open}
      >
        {icon}
        {label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 min-w-[12rem] rounded-lg border border-slate-200 bg-white shadow-lg py-1 z-20">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 text-sm whitespace-nowrap ${
                  active ? "bg-slate-100 text-slate-900 font-medium" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function NavLinks({ items, variant = "row" }: { items: NavEntry[]; variant?: "row" | "compact" }) {
  return (
    <>
      {items.map((entry) =>
        entry.type === "group" ? (
          <GroupItem key={entry.label} label={entry.label} icon={entry.icon} items={entry.items} variant={variant} />
        ) : (
          <LinkItem key={entry.href} item={entry} variant={variant} />
        )
      )}
    </>
  );
}
