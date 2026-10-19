"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageSquareText,
  Moon,
  PanelLeft,
  Plus,
  Settings,
  Store,
  Sun,
  X,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";

export interface ShellLocation {
  id: string;
  title: string;
  address: string;
  unreplied: number;
  issues: number;
}

type NavItem = { href: string; label: string; icon: React.ElementType; count?: (l: ShellLocation) => number; tone?: "warning" | "accent" };

const sections: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Marketing",
    items: [
      { href: "/performance", label: "Performance", icon: BarChart3 },
      { href: "/reviews", label: "Reviews", icon: MessageSquareText, count: (l) => l.unreplied, tone: "warning" },
      { href: "/calendar", label: "Content", icon: CalendarDays },
      { href: "/audit", label: "Profile audit", icon: ClipboardCheck, count: (l) => l.issues, tone: "accent" },
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/locations", label: "Locations", icon: MapPin },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

const COLLAPSE_KEY = "gbp-sidebar-collapsed";

export function AppShell({
  locations,
  user,
  demo,
  children,
}: {
  locations: ShellLocation[];
  user: { name: string; email?: string };
  demo: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const current = locations.find((l) => l.id === params.get("location")) ?? locations[0];
  const qs = current ? `?location=${encodeURIComponent(current.id)}` : "";

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname, params]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const sidebar = (isMobile: boolean) => {
    const mini = collapsed && !isMobile;
    return (
      <div className="flex h-full flex-col">
        <div className={cn("flex flex-col gap-3 px-3 pb-2 pt-4", mini && "px-2")}>
          <div className={cn("flex h-8 items-center gap-2.5 px-1", mini && "justify-center px-0")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="h-[18px] w-[18px]" />
            </div>
            {!mini && <span className="truncate text-base font-semibold tracking-tight text-foreground">GBP Manager</span>}
            {isMobile && (
              <button onClick={() => setMobileOpen(false)} className="ml-auto rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          {!mini && current && <LocationSwitcher locations={locations} current={current} />}
        </div>

        <nav className="flex-1 overflow-y-auto px-1">
          {sections.map((sec) => (
            <div key={sec.label} className="px-2 py-1">
              {!mini && <div className="flex h-8 items-center px-2 text-xs font-medium text-muted-foreground">{sec.label}</div>}
              {mini && <div className="mx-auto my-2 h-px w-6 bg-border" />}
              <ul className="flex flex-col gap-0.5">
                {sec.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const count = current && item.count ? item.count(current) : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={`${item.href}${qs}`}
                        title={mini ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground",
                          active && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                          mini && "mx-auto w-10 justify-center px-0",
                        )}
                      >
                        <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent-foreground" : "text-muted-foreground")} />
                        {!mini && <span className="truncate">{item.label}</span>}
                        {count > 0 &&
                          (mini ? (
                            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-warning" />
                          ) : (
                            <span
                              className={cn(
                                "ml-auto rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                                item.tone === "warning" ? "bg-warning/10 text-warning" : "bg-accent text-accent-foreground",
                              )}
                            >
                              {count}
                            </span>
                          ))}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn("border-t p-3", mini && "px-2")}>
          <Link
            href={`/settings${qs}`}
            className={cn("flex h-12 items-center gap-3 rounded-[10px] px-2 hover:bg-muted", mini && "justify-center px-0")}
            title={mini ? user.name : undefined}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
              {initials(user.name)}
            </span>
            {!mini && (
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-semibold text-foreground">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">{user.email ?? (demo ? "Demo workspace" : "Signed in")}</span>
              </span>
            )}
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 border-r bg-sidebar transition-[width] duration-200 md:block",
          collapsed ? "w-[4.25rem]" : "w-64",
        )}
      >
        {sidebar(false)}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r bg-sidebar shadow-elegant">{sidebar(true)}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setMobileOpen(true)} onToggle={toggleCollapsed} composeHref={`/calendar${qs}${qs ? "&" : "?"}compose=1`} demo={demo} />
        <main key={pathname} className="animate-page-in flex-1 overflow-x-clip p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

function TopBar({ onMenu, onToggle, composeHref, demo }: { onMenu: () => void; onToggle: () => void; composeHref: string; demo: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };
  const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background px-4 sm:gap-3 lg:px-6">
      <button onClick={onMenu} className={cn(iconBtn, "-ml-2 md:hidden")} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <button onClick={onToggle} className={cn(iconBtn, "-ml-2 hidden md:inline-flex")} aria-label="Toggle sidebar">
        <PanelLeft className="h-[18px] w-[18px]" />
      </button>
      <Link href={composeHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">New post</span>
      </Link>
      <div className="flex-1" />
      {demo && (
        <span className="hidden rounded-full bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning sm:inline" title="Set GBP_DATA_SOURCE=google to use live profiles">
          Demo data
        </span>
      )}
      <button onClick={toggleTheme} className={iconBtn} aria-label="Toggle theme">
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
    </header>
  );
}

function LocationSwitcher({ locations, current }: { locations: ShellLocation[]; current: ShellLocation }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-xl border bg-card p-2.5 text-left transition-colors hover:border-input"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Building2 className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">{current.title}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {locations.length} location{locations.length === 1 ? "" : "s"}
          </span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <ul role="listbox" className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border bg-popover p-1 shadow-elegant">
          <li className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Switch location</li>
          {locations.map((l) => (
            <li key={l.id}>
              <button
                role="option"
                aria-selected={l.id === current.id}
                onClick={() => {
                  setOpen(false);
                  router.push(`${pathname}?location=${encodeURIComponent(l.id)}`);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{l.address}</span>
                </span>
                {l.id === current.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
