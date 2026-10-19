"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, ClipboardCheck, LayoutDashboard, MessageSquareText } from "lucide-react";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/performance", label: "Performance", icon: BarChart3 },
  { href: "/reviews", label: "Reviews", icon: MessageSquareText },
  { href: "/calendar", label: "Content calendar", icon: CalendarDays },
  { href: "/audit", label: "Profile audit", icon: ClipboardCheck },
];

export function Sidebar() {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString() ? `?${params}` : "";
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={`${href}${qs}`}
            className={`flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm ${
              active ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-border/50"
            }`}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
