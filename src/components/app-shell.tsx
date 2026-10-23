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
  CircleUserRound,
  ClipboardCheck,
  LayoutDashboard,
  ListTodo,
  ShieldCheck,
  LogOut,
  MapPin,
  Menu,
  MessageSquareText,
  Moon,
  PanelLeft,
  Plus,
  Settings,
  Swords,
  Sun,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { signOutAction } from "@/app/(app)/actions";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { BrandLogo, BrandMark } from "@/components/brand";
import type { Announcement } from "@/lib/platform/types";
import { cn, initials } from "@/lib/utils";

export interface ShellLocation {
  id: string;
  title: string;
  address: string;
  unreplied: number;
  issues: number;
  openTasks: number;
}

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  count?: (l: ShellLocation) => number;
  tone?: "warning" | "accent";
  /** Extra content on the right of the label (hidden when the sidebar is collapsed). */
  trailing?: React.ReactNode;
};

const sections: { label: string; items: NavItem[] }[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Marketing",
    items: [
      { href: "/performance", label: "Performance", icon: BarChart3 },
      { href: "/reviews", label: "Reviews", icon: MessageSquareText, count: (l) => l.unreplied, tone: "warning" },
      { href: "/calendar", label: "Content", icon: CalendarDays },
      { href: "/ranking", label: "Ranking", icon: TrendingUp },
      { href: "/competitors", label: "Competitors", icon: Swords },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/audit", label: "Profile audit", icon: ClipboardCheck, count: (l) => l.issues, tone: "accent" },
      { href: "/tasks", label: "Tasks", icon: ListTodo, count: (l) => l.openTasks, tone: "accent" },
    ],
  },
];

/** Account menu on the user card (bottom of the sidebar). `admin` = workspace admins only. */
const accountItems: { href: string; label: string; icon: React.ElementType; admin?: boolean }[] = [
  { href: "/profile", label: "My profile", icon: CircleUserRound },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/users", label: "Users", icon: Users, admin: true },
  { href: "/settings", label: "Settings", icon: Settings, admin: true },
];

const COLLAPSE_KEY = "gbp-sidebar-collapsed";

export function AppShell({
  locations,
  user,
  demo,
  platformAdmin = false,
  announcement,
  children,
}: {
  locations: ShellLocation[];
  user: { name: string; role: "admin" | "member"; avatarUrl: string | null };
  demo: boolean;
  /** Shows "Platform admin" in the account menu. */
  platformAdmin?: boolean;
  /** Live banner from Admin → Announcements. */
  announcement?: Announcement | null;
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
  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    document.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", esc);
    };
  }, [mobileOpen]);

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
          <div className={cn("flex h-11 items-center gap-2.5 px-1", mini && "justify-center px-0")}>
            {mini ? <BrandMark className="h-9 w-9" /> : <BrandLogo className="h-11" />}
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
              {!mini && <div className={cn("flex h-8 items-center px-2 text-xs font-medium text-muted-foreground", isMobile && "label-caps mt-1")}>{sec.label}</div>}
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
                          isMobile && "h-11 text-[15px]",
                          active && "bg-accent font-semibold text-accent-foreground hover:bg-accent hover:text-accent-foreground",
                          mini && "mx-auto w-10 justify-center px-0",
                        )}
                      >
                        <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent-foreground" : "text-muted-foreground")} />
                        {!mini && <span className="truncate">{item.label}</span>}
                        {!mini && item.trailing}
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
          <AccountMenu user={user} demo={demo} qs={qs} mini={mini} platformAdmin={platformAdmin} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 border-r bg-sidebar transition-[width] duration-200 md:block",
          collapsed ? "w-[4.25rem]" : "w-64",
        )}
      >
        {sidebar(false)}
      </aside>

      {/* Mobile drawer: always mounted so it can slide in and out */}
      <div className={cn("fixed inset-0 z-50 md:hidden", !mobileOpen && "pointer-events-none")} aria-hidden={!mobileOpen}>
        <div className={cn("absolute inset-0 bg-black/40 transition-opacity duration-200", mobileOpen ? "opacity-100" : "opacity-0")} onClick={() => setMobileOpen(false)} />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          inert={!mobileOpen}
          className={cn(
            "absolute inset-y-0 left-0 w-[19rem] max-w-[86vw] border-r bg-sidebar pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-elegant transition-transform duration-250 ease-[cubic-bezier(0.22,1,0.36,1)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          {sidebar(true)}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {announcement && <AnnouncementBanner announcement={announcement} />}
        <TopBar onMenu={() => setMobileOpen(true)} onToggle={toggleCollapsed} composeHref={`/calendar${qs}${qs ? "&" : "?"}compose=1`} demo={demo} />
        {/* Phones: room for the bottom tab bar */}
        <main key={pathname} className="animate-page-in flex-1 overflow-x-clip p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-4 lg:p-6">
          {children}
        </main>
      </div>

      <BottomNav pathname={pathname} qs={qs} current={current} menuOpen={mobileOpen} onMenu={() => setMobileOpen((o) => !o)} />
    </div>
  );
}

/** Phones: the main pages one tap away, "More" opens the full menu. */
const bottomItems: { href: string; label: string; icon: React.ElementType; count?: (l: ShellLocation) => number }[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/reviews", label: "Reviews", icon: MessageSquareText, count: (l) => l.unreplied },
  { href: "/calendar", label: "Content", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: ListTodo, count: (l) => l.openTasks },
];

function BottomNav({ pathname, qs, current, menuOpen, onMenu }: { pathname: string; qs: string; current?: ShellLocation; menuOpen: boolean; onMenu: () => void }) {
  const inBar = bottomItems.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  const tab = (active: boolean, Icon: React.ElementType, label: string, count = 0) => (
    <>
      <span className={cn("relative flex h-8 w-14 items-center justify-center rounded-full transition-colors", active && "bg-accent")}>
        <Icon className={cn("h-[22px] w-[22px]", active ? "text-accent-foreground" : "text-muted-foreground")} strokeWidth={active ? 2.2 : 1.8} />
        {count > 0 && (
          <span className="absolute -top-1 right-1.5 min-w-[18px] rounded-full border-2 border-card bg-primary px-1 text-center text-[10px] font-bold leading-[14px] text-primary-foreground tabular-nums">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </span>
      <span className={cn("text-[11px] leading-none", active ? "font-semibold text-foreground" : "text-muted-foreground")}>{label}</span>
    </>
  );
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-card/85 md:hidden">
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {bottomItems.map((item) => {
          const active = !menuOpen && (pathname === item.href || pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link href={`${item.href}${qs}`} aria-current={active ? "page" : undefined} className="flex h-full flex-col items-center justify-center gap-1">
                {tab(active, item.icon, item.label, current && item.count ? item.count(current) : 0)}
              </Link>
            </li>
          );
        })}
        <li>
          <button type="button" onClick={onMenu} aria-expanded={menuOpen} className="flex h-full w-full flex-col items-center justify-center gap-1">
            {tab(menuOpen || !inBar, Menu, "More")}
          </button>
        </li>
      </ul>
    </nav>
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

/** User card at the bottom of the sidebar; opens the account menu (profile, locations, users, settings, sign out) above it. */
function AccountMenu({ user, demo, qs, mini, platformAdmin }: { user: { name: string; role: "admin" | "member"; avatarUrl: string | null }; demo: boolean; qs: string; mini: boolean; platformAdmin: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const items = accountItems.filter((i) => !i.admin || user.role === "admin");
  const onAccountPage = items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));

  useEffect(() => setOpen(false), [pathname]);
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

  const signOut = async () => {
    setOpen(false);
    const res = await signOutAction();
    if (res && !res.ok) toast.message(res.error);
  };

  return (
    <div ref={ref} className="relative">
      {open && (
        <div
          role="menu"
          aria-label="Account"
          className={cn(
            "absolute z-50 rounded-xl border bg-popover p-1 shadow-elegant",
            mini ? "bottom-0 left-full ml-3 w-56" : "bottom-full left-0 right-0 mb-2",
          )}
        >
          {mini && (
            <div className="border-b px-2.5 pb-2 pt-1.5">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.role === "admin" ? "Admin" : "Member"}</p>
            </div>
          )}
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={`${item.href}${qs}`}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
                  active && "bg-accent font-semibold text-accent-foreground hover:bg-accent",
                )}
              >
                <item.icon className={cn("size-[18px] shrink-0", active ? "text-accent-foreground" : "text-muted-foreground")} />
                {item.label}
              </Link>
            );
          })}
          {platformAdmin && (
            <>
              <div className="my-1 h-px bg-border" />
              <Link href="/admin" role="menuitem" className="flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted">
                <ShieldCheck className="size-[18px] shrink-0 text-muted-foreground" />
                Platform admin
              </Link>
            </>
          )}
          <div className="my-1 h-px bg-border" />
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
            title={demo ? "Demo workspace: there's no sign-in to end" : undefined}
          >
            <LogOut className="size-[18px] shrink-0 text-muted-foreground" />
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={mini ? user.name : undefined}
        className={cn(
          "flex h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left transition-colors hover:bg-muted",
          (open || onAccountPage) && "bg-muted",
          mini && "justify-center px-0",
        )}
      >
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URLs / Google photo URLs
          <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials(user.name)}</span>
        )}
        {!mini && (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-sm font-semibold text-foreground">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.role === "admin" ? "Admin" : "Member"}
                {demo ? " · demo workspace" : ""}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </>
        )}
      </button>
    </div>
  );
}
