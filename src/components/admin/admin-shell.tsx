"use client";

// Platform admin panel shell: its own sidebar (same look as the app shell), top bar and phone drawer.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, ArrowLeft, Building2, Gauge, Megaphone, Menu, Moon, PlugZap, ShieldCheck, Sun, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: {
  label: string;
  items: {
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: "leads";
  }[];
}[] = [
  { label: "", items: [{ href: "/admin", label: "Overview", icon: Gauge }] },
  {
    label: "Customers",
    items: [
      { href: "/admin/workspaces", label: "Workspaces", icon: Building2 },
      { href: "/admin/offers", label: "Offers", icon: Tag, badge: "leads" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/admin/integrations", label: "Integrations", icon: PlugZap },
      { href: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { href: "/admin/activity", label: "Activity", icon: Activity },
    ],
  },
];

export function AdminShell({ admin, newLeads, children }: { admin: string; newLeads: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const sidebar = (mobile: boolean) => (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">Admin</span>
          <span className="block truncate text-xs text-muted-foreground">GBPNinja</span>
        </span>
        {mobile && (
          <button onClick={() => setOpen(false)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((sec) => (
          <div key={sec.label} className="py-1">
            {sec.label && <div className="flex h-8 items-center px-2 text-xs font-medium text-muted-foreground">{sec.label}</div>}
            <ul className="flex flex-col gap-0.5">
              {sec.items.map((item) => {
                const active = item.href === "/admin" ? pathname === "/admin" : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const count = item.badge === "leads" ? newLeads : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                        active && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                      )}
                    >
                      <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent-foreground" : "text-muted-foreground")} />
                      <span className="truncate">{item.label}</span>
                      {count > 0 && <span className="ml-auto rounded-full bg-warning/10 px-1.5 text-[11px] font-semibold tabular-nums text-warning">{count}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t p-3">
        <Link
          href="/dashboard"
          className="flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-[18px] text-muted-foreground" /> Back to app
        </Link>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 z-30 hidden h-screen w-60 shrink-0 border-r bg-sidebar md:block">{sidebar(false)}</aside>

      <div className={cn("fixed inset-0 z-50 md:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
        <div className={cn("absolute inset-0 bg-black/40 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
          inert={!open}
          className={cn(
            "absolute inset-y-0 left-0 w-[18rem] max-w-[86vw] border-r bg-sidebar pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-elegant transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebar(true)}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4 lg:px-6">
          <button onClick={() => setOpen(true)} className="-ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted md:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background md:hidden">
            <ShieldCheck className="h-3.5 w-3.5" /> Admin
          </span>
          <div className="flex-1" />
          <span className="hidden max-w-56 truncate text-xs text-muted-foreground sm:inline" title={`Signed in as ${admin}`}>
            {admin}
          </span>
          <ThemeToggle />
        </header>
        <main key={pathname} className="animate-page-in flex-1 overflow-x-clip p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  return (
    <button
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
        try {
          localStorage.setItem("theme", next ? "dark" : "light");
        } catch {}
      }}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
