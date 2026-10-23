"use client";

// Live preview of the profile as it appears in Google Maps on a phone. Reflects saved data plus unsaved editor drafts.
import { useState } from "react";
import {
  Accessibility,
  ArrowLeft,
  Bookmark,
  CalendarCheck,
  Check,
  ChevronDown,
  Clock,
  Globe,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Navigation,
  Package,
  Phone,
  Plus,
  Search,
  Share2,
} from "lucide-react";
import { Card, Stars } from "@/components/ui";
import type { AuditTab } from "@/lib/audit";
import type { Location } from "@/lib/gbp/types";
import { DAYS, SOCIAL_NETWORKS, attributeGroup, attributeLabel, cityOf, formatOpeningDate, productPrice, servicePrice, type Day } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useNow } from "./shared";

export type PreviewView = "overview" | "services" | "products" | "about";

const DAY_NAME: Record<Day, string> = { MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday" };

const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
};
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayOf = (d: Date): Day => DAYS[(d.getDay() + 6) % 7];

/** "Open · Closes 5 PM", "Closed · Opens 9 AM Mon" — the line Google shows under the title. */
function openStatus(l: Location, now: Date | null): { open: boolean; label?: string; text: string } | null {
  if (l.openStatus === "temporarily_closed") return { open: false, label: "Temporarily closed", text: "" };
  if (l.openStatus === "permanently_closed") return { open: false, label: "Permanently closed", text: "" };
  if (l.openStatus === "always_open") return { open: true, label: "Open 24 hours", text: "" };
  if (l.openStatus === "open_no_hours" || !l.regularHours?.length || !now) return null;
  const periodsOn = (d: Date) => {
    const special = l.specialHours?.find((h) => h.date === ymd(d));
    if (special) return special.closed ? [] : [{ open: special.open!, close: special.close! }];
    return (l.regularHours ?? []).filter((h) => h.day === dayOf(d)).sort((a, b) => a.open.localeCompare(b.open));
  };
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = periodsOn(now);
  const current = today.find((p) => hm >= p.open && hm < p.close);
  if (current) return { open: true, text: `Closes ${fmtTime(current.close)}` };
  const later = today.find((p) => hm < p.open);
  if (later) return { open: false, text: `Opens ${fmtTime(later.open)}` };
  for (let i = 1; i <= 7; i++) {
    const d = new Date(now.getTime() + i * 86_400_000);
    const first = periodsOn(d)[0];
    if (first) return { open: false, text: `Opens ${fmtTime(first.open)} ${i === 1 ? "tomorrow" : DAY_NAME[dayOf(d)].slice(0, 3)}` };
  }
  return { open: false, text: "Closed" };
}

function AddChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-xs font-medium text-primary hover:bg-accent">
      <Plus className="h-3 w-3" />
      {children}
    </button>
  );
}

function InfoRow({ icon: Icon, children, onClick }: { icon: React.ElementType; children: React.ReactNode; onClick?: () => void }) {
  const body = (
    <>
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary" />
      <div className="min-w-0 flex-1">{children}</div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-4 px-4 py-3 text-left text-[13px] hover:bg-muted/40">
      {body}
    </button>
  ) : (
    <div className="flex items-start gap-4 px-4 py-3 text-[13px]">{body}</div>
  );
}

export function ProfilePreview({
  location: l,
  rating,
  view,
  onView,
  onGo,
  dirty,
}: {
  location: Location;
  rating: { avg: number | null; count: number };
  view: PreviewView;
  onView: (v: PreviewView) => void;
  onGo: (t: AuditTab) => void;
  dirty: boolean;
}) {
  const now = useNow();
  const [hoursOpen, setHoursOpen] = useState(false);
  const status = openStatus(l, now);
  const products = l.products ?? [];
  const city = cityOf(l.address);
  const desc = (l.description ?? "").trim();
  const today = now ? dayOf(now) : null;
  const upcomingSpecial = now ? (l.specialHours ?? []).filter((h) => h.date >= ymd(now)).sort((a, b) => a.date.localeCompare(b.date))[0] : undefined;
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");

  const actions = [
    { label: "Directions", icon: Navigation, ok: !!l.address, primary: true },
    { label: "Call", icon: Phone, ok: !!l.phone },
    { label: "Website", icon: Globe, ok: !!l.websiteUri },
    { label: "Book", icon: CalendarCheck, ok: !!l.appointmentUri },
    { label: "Chat", icon: MessageCircle, ok: !!l.chatUri },
    { label: "Save", icon: Bookmark, ok: true },
    { label: "Share", icon: Share2, ok: true },
  ].filter((a) => a.ok);

  const serviceGroups = [l.primaryCategory, ...l.additionalCategories]
    .map((cat) => ({ cat, items: l.services.filter((s) => (s.category || l.primaryCategory) === cat) }))
    .filter((g) => g.items.length);
  const orphan = l.services.filter((s) => s.category && ![l.primaryCategory, ...l.additionalCategories].includes(s.category));
  if (orphan.length) serviceGroups.push({ cat: "Other", items: orphan });

  const photos = l.photos ?? [];
  const logo = photos.find((p) => p.category === "logo");
  const gallery = photos.filter((p) => p.category !== "logo" && p.category !== "cover");
  // Google leads with the cover photo; without one it falls back to the first gallery photo.
  const hero = photos.find((p) => p.category === "cover") ?? gallery[0];
  const thumbs = gallery.filter((p) => p !== hero);
  const socials = SOCIAL_NETWORKS.filter((n) => l.socialProfiles?.[n.id]);
  // Live: Google's own groups and labels; like Google, only what the business has ("No" answers aren't listed).
  const defs = new Map((l.attributeCatalog ?? []).map((d) => [d.id, d]));
  const labelOf = (a: string) => {
    const d = defs.get(a);
    if (!d) return attributeLabel(a);
    const v = l.attributeValues?.[a];
    if (d.type === "enum") return `${d.label}: ${d.options?.find((o) => o.value === v)?.label ?? String(v)}`;
    if (d.type === "repeated_enum") return `${d.label}: ${((v as string[]) ?? []).map((x) => d.options?.find((o) => o.value === x)?.label ?? x).join(", ")}`;
    return d.label;
  };
  const shownAttrs = l.attributes.filter((a) => !defs.size || l.attributeValues?.[a] !== false);
  const attrGroups = Object.entries(
    shownAttrs.reduce<Record<string, string[]>>((m, a) => {
      (m[defs.get(a)?.group ?? attributeGroup(a)] ??= []).push(a);
      return m;
    }, {}),
  );

  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">Live preview</h2>
          <p className="text-xs text-muted-foreground">Google Maps on a phone</p>
        </div>
        {dirty ? (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">Unsaved changes</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" /> In sync
          </span>
        )}
      </div>

      <div className="bg-muted/50 px-4 py-5">
        {/* Phone */}
        <IPhoneFrame>
          <div className="flex h-full flex-col">
            {/* search bar */}
            <div className="relative shrink-0">
              <div className="grid h-36 grid-cols-[2fr_1fr] gap-0.5 bg-border">
                <button type="button" onClick={() => onGo("photos")} className="relative flex items-center justify-center overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {hero ? <img referrerPolicy="no-referrer" src={hero.url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="rounded-full bg-card px-2.5 py-1 text-[11px] font-medium text-primary shadow-sm">+ Add cover photo</span>}
                </button>
                <span className="grid grid-rows-2 gap-0.5">
                  <span className="relative flex items-center justify-center overflow-hidden bg-muted/80">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumbs[0] ? <img referrerPolicy="no-referrer" src={thumbs[0].url} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground/60" />}
                  </span>
                  <span className="relative flex items-center justify-center overflow-hidden bg-muted/80 text-[11px] font-medium text-muted-foreground">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {thumbs[1] && <img referrerPolicy="no-referrer" src={thumbs[1].url} alt="" className="absolute inset-0 h-full w-full object-cover brightness-50" />}
                    <span className={cn("relative", thumbs[1] && "text-white")}>{l.photoCount ? `${l.photoCount} photos` : "No photos"}</span>
                  </span>
                </span>
              </div>
              <div className="absolute inset-x-2.5 top-2.5 flex h-9 items-center gap-2.5 rounded-full bg-card px-3 shadow-md">
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[13px]">{l.title}</span>
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>

            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
              <div className="px-4 pb-2 pt-3">
                <p className="flex items-start gap-2 text-[19px] leading-tight">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logo && <img referrerPolicy="no-referrer" src={logo.url} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-md object-cover" />}
                  <span>{l.title}</span>
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-1 text-[13px] text-muted-foreground">
                  {rating.avg != null ? (
                    <>
                      <span className="text-foreground">{rating.avg.toFixed(1)}</span>
                      <Stars rating={Math.round(rating.avg)} size="h-3 w-3" />
                      <span>({rating.count})</span>
                    </>
                  ) : (
                    <span>No reviews</span>
                  )}
                </p>
                <p className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                  {l.primaryCategory}
                  {(l.attributes.includes("wheelchair_accessible_entrance") || l.attributeValues?.has_wheelchair_accessible_entrance === true) && (
                    <>
                      <span>·</span>
                      <Accessibility className="h-3.5 w-3.5" aria-label="Wheelchair accessible" />
                    </>
                  )}
                </p>
                {status ? (
                  <p className="mt-0.5 text-[13px]">
                    <span className={status.open ? "text-success" : "text-destructive"}>{status.label ?? (status.open ? "Open" : "Closed")}</span>
                    {status.text && <span className="text-muted-foreground"> · {status.text}</span>}
                  </p>
                ) : (
                  !l.regularHours?.length && l.openStatus !== "always_open" && (
                    <div className="mt-1.5">
                      <AddChip onClick={() => onGo("hours")}>Add hours</AddChip>
                    </div>
                  )
                )}
              </div>

              {/* tabs */}
              <div className="sticky top-0 z-10 flex border-b bg-card px-2">
                {(["overview", "services", "products", "about"] as PreviewView[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onView(v)}
                    className={cn("flex-1 border-b-2 py-2.5 text-[13px] capitalize transition-colors", view === v ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground")}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {view === "overview" && (
                <>
                  <div className="no-scrollbar flex gap-3 overflow-x-auto border-b px-4 py-3">
                    {actions.map((a) => (
                      <span key={a.label} className="flex w-14 shrink-0 flex-col items-center gap-1 text-[11px] text-primary">
                        <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", a.primary ? "bg-primary text-primary-foreground" : "bg-accent")}>
                          <a.icon className="h-[18px] w-[18px]" />
                        </span>
                        {a.label}
                      </span>
                    ))}
                  </div>
                  <div className="divide-y">
                    <InfoRow icon={MapPin}>
                      {l.hideAddress ? (
                        l.serviceArea?.length ? (
                          <span>Serves {l.serviceArea.slice(0, 2).map((a) => a.split(",")[0]).join(", ")}{l.serviceArea.length > 2 ? ` and ${l.serviceArea.length - 2} more` : ""}</span>
                        ) : (
                          <AddChip onClick={() => onGo("location")}>Add service area</AddChip>
                        )
                      ) : (
                        l.address || <AddChip onClick={() => onGo("location")}>Add address</AddChip>
                      )}
                      {!l.hideAddress && !!l.serviceArea?.length && <span className="block text-[12px] text-muted-foreground">Also serves {l.serviceArea.length} area{l.serviceArea.length === 1 ? "" : "s"}</span>}
                    </InfoRow>
                    {l.regularHours?.length || l.openStatus === "always_open" ? (
                      <div>
                        <InfoRow icon={Clock} onClick={() => setHoursOpen((v) => !v)}>
                          <span className="flex items-center gap-1">
                            {status ? (
                              <>
                                <span className={status.open ? "text-success" : "text-destructive"}>{status.label ?? (status.open ? "Open" : "Closed")}</span>
                                {status.text && <span className="text-muted-foreground">· {status.text}</span>}
                              </>
                            ) : (
                              <span>Hours</span>
                            )}
                            <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", hoursOpen && "rotate-180")} />
                          </span>
                          {upcomingSpecial && (
                            <span className="mt-0.5 block text-[12px] text-muted-foreground">
                              {new Date(`${upcomingSpecial.date}T00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}:{" "}
                              {upcomingSpecial.closed ? "Closed" : `${fmtTime(upcomingSpecial.open!)}–${fmtTime(upcomingSpecial.close!)}`} (holiday hours)
                            </span>
                          )}
                        </InfoRow>
                        {hoursOpen && (
                          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 px-4 pb-3 pl-[52px] text-[13px]">
                            {DAYS.map((d) => {
                              const ps = l.openStatus === "always_open" ? [{ day: d, open: "00:00", close: "24:00" }] : (l.regularHours ?? []).filter((x) => x.day === d).sort((a, b) => a.open.localeCompare(b.open));
                              return (
                                <div key={d} className={cn("contents", d === today && "font-semibold")}>
                                  <dt>{DAY_NAME[d]}</dt>
                                  <dd className={cn(!ps.length && "text-muted-foreground")}>
                                    {ps.length
                                      ? ps.map((h) => (
                                          <span key={h.open} className="block">
                                            {h.close === "24:00" ? "Open 24 hours" : `${fmtTime(h.open)}–${fmtTime(h.close)}`}
                                          </span>
                                        ))
                                      : "Closed"}
                                  </dd>
                                </div>
                              );
                            })}
                          </dl>
                        )}
                      </div>
                    ) : (
                      <InfoRow icon={Clock}>
                        <AddChip onClick={() => onGo("hours")}>Add hours</AddChip>
                      </InfoRow>
                    )}
                    <InfoRow icon={Globe}>{l.websiteUri ? <span className="break-all">{host(l.websiteUri)}</span> : <AddChip onClick={() => onGo("contact")}>Add website</AddChip>}</InfoRow>
                    <InfoRow icon={Phone}>
                      {l.phone ? (
                        <>
                          {l.phone}
                          {(l.additionalPhones ?? []).map((p) => (
                            <span key={p} className="block text-muted-foreground">
                              {p}
                            </span>
                          ))}
                        </>
                      ) : (
                        <AddChip onClick={() => onGo("contact")}>Add phone</AddChip>
                      )}
                    </InfoRow>
                    {l.appointmentUri && (
                      <InfoRow icon={CalendarCheck}>
                        <span className="text-muted-foreground">Appointments: </span>
                        <span className="break-all">{host(l.appointmentUri)}</span>
                      </InfoRow>
                    )}
                  </div>
                  <div className="border-t px-4 py-3">
                    <p className="mb-1 text-[13px] font-semibold">From the business</p>
                    {desc ? <p className="line-clamp-4 text-[13px] text-muted-foreground">{desc}</p> : <AddChip onClick={() => onGo("about")}>Add description</AddChip>}
                  </div>
                </>
              )}

              {view === "services" && (
                <div className="pb-4">
                  {serviceGroups.length ? (
                    serviceGroups.map((g) => (
                      <div key={g.cat}>
                        <p className="bg-muted/50 px-4 py-2 text-[12px] font-semibold text-muted-foreground">{g.cat}</p>
                        <ul className="divide-y">
                          {g.items.map((s) => (
                            <li key={s.name} className="px-4 py-2.5">
                              <p className="flex items-baseline justify-between gap-3 text-[13px]">
                                <span>{s.name}</span>
                                <span className="shrink-0 text-muted-foreground">{servicePrice(s)}</span>
                              </p>
                              {s.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{s.description}</p>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center">
                      <AddChip onClick={() => onGo("services")}>Add services</AddChip>
                    </div>
                  )}
                </div>
              )}

              {view === "products" && (
                <div className="p-3">
                  {products.length ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      {products.map((p) => (
                        <div key={p.name} className="overflow-hidden rounded-xl border">
                          <div className="flex aspect-square items-center justify-center bg-muted">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {p.photo ? <img referrerPolicy="no-referrer" src={p.photo} alt="" className="h-full w-full object-cover" /> : <Package className="h-6 w-6 text-muted-foreground/60" />}
                          </div>
                          <div className="px-2 py-1.5">
                            <p className="line-clamp-2 text-[12px] leading-snug">{p.name}</p>
                            <p className="text-[12px] text-muted-foreground">{productPrice(p) || p.category || " "}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center">
                      <AddChip onClick={() => onGo("products")}>Add products</AddChip>
                    </div>
                  )}
                </div>
              )}

              {view === "about" && (
                <div className="divide-y pb-4">
                  <div className="px-4 py-3">
                    <p className="mb-1 text-[13px] font-semibold">From the business</p>
                    {desc ? <p className="whitespace-pre-line text-[13px] text-muted-foreground">{desc}</p> : <AddChip onClick={() => onGo("about")}>Add description</AddChip>}
                    {l.openingDate && <p className="mt-2 text-[12px] text-muted-foreground">Opened {formatOpeningDate(l.openingDate)}</p>}
                  </div>
                  {socials.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="mb-1.5 text-[13px] font-semibold">Profiles</p>
                      <div className="flex flex-wrap gap-1.5">
                        {socials.map((n) => (
                          <span key={n.id} className="rounded-full border px-2.5 py-0.5 text-[12px]">
                            {n.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {attrGroups.length ? (
                    attrGroups.map(([group, ids]) => (
                      <div key={group} className="px-4 py-3">
                        <p className="mb-1.5 text-[13px] font-semibold">{group}</p>
                        <ul className="space-y-1">
                          {ids.map((a) => (
                            <li key={a} className="flex items-center gap-2 text-[13px]">
                              <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                              {labelOf(a)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-3">
                      <AddChip onClick={() => onGo("more")}>Add attributes</AddChip>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </IPhoneFrame>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          {city ? `As seen by people searching near ${city}. ` : ""}Google may show slightly different layouts.
        </p>
      </div>
    </Card>
  );
}

/**
 * iPhone 14 Pro Max: 430 × 932 pt screen (drawn at ~0.74×), Dynamic Island, status bar, side buttons and home indicator.
 * The frame uses the foreground token, so it reads as Space Black in light mode and Silver in dark mode.
 */
function IPhoneFrame({ children }: { children: React.ReactNode }) {
  const button = "absolute w-[3px] rounded-sm bg-foreground/70";
  return (
    <div className="relative mx-auto w-full max-w-[330px] px-[3px]">
      {/* side buttons: action + volume (left), side button (right) */}
      <span className={cn(button, "-left-0 top-[18%] h-[4.5%]")} />
      <span className={cn(button, "-left-0 top-[26%] h-[8.5%]")} />
      <span className={cn(button, "-left-0 top-[36.5%] h-[8.5%]")} />
      <span className={cn(button, "-right-0 top-[29%] h-[12.5%]")} />
      <div className="rounded-[54px] bg-foreground/90 p-[10px] shadow-xl ring-1 ring-foreground/20">
        <div className="relative aspect-[430/932] overflow-hidden rounded-[44px] bg-card">
          <div className="flex h-full flex-col">
            <StatusBar />
            <div className="min-h-0 flex-1">{children}</div>
            {/* home indicator area */}
            <div className="flex h-[22px] shrink-0 items-center justify-center bg-card">
              <span className="h-[4px] w-[34%] rounded-full bg-foreground/85" />
            </div>
          </div>
          {/* Dynamic Island */}
          <span className="absolute left-1/2 top-[9px] h-[27px] w-[29%] -translate-x-1/2 rounded-full bg-black" aria-hidden />
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="flex h-[44px] shrink-0 items-center justify-between bg-card px-[26px] pt-[2px] text-foreground" aria-hidden>
      <span className="w-[54px] text-center text-[13px] font-semibold tracking-tight">9:41</span>
      <span className="flex w-[54px] items-center justify-end gap-[5px]">
        {/* cellular */}
        <svg viewBox="0 0 18 12" className="h-[10px] w-auto fill-current">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        {/* wi-fi */}
        <svg viewBox="0 0 16 12" className="h-[10px] w-auto fill-current">
          <path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.2 10.2 0 0 0 8 .4 10.2 10.2 0 0 0 .8 3.3L2 4.6a8.4 8.4 0 0 1 6-2.4Zm0 3.5c1.4 0 2.6.5 3.6 1.4l1.2-1.3A7 7 0 0 0 8 3.9a7 7 0 0 0-4.8 1.9l1.2 1.3c1-.9 2.2-1.4 3.6-1.4Zm0 3.5c-.6 0-1.1.2-1.5.6L8 11.6l1.5-1.8c-.4-.4-.9-.6-1.5-.6Z" />
        </svg>
        {/* battery */}
        <svg viewBox="0 0 27 13" className="h-[11px] w-auto">
          <rect x="0.5" y="0.5" width="23" height="12" rx="3.5" className="fill-none stroke-current opacity-40" />
          <rect x="2" y="2" width="18" height="9" rx="2" className="fill-current" />
          <path d="M25 4.5v4a2 2 0 0 0 0-4Z" className="fill-current opacity-40" />
        </svg>
      </span>
    </div>
  );
}
