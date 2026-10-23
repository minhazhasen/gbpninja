// Section-by-section Google Business Profile audit.
// Every check is worth points; "warn" earns half. The overall score is earned / max, 0–100.
import type { Location, Review } from "./gbp/types";
import { postForLocation, type Post } from "./posts";
import { DESCRIPTION_GOOD, cityOf, hasContactInText } from "./profile";

export type Severity = "high" | "medium" | "low";
export type CheckStatus = "pass" | "warn" | "fail";
export type SectionId = "about" | "contact" | "location" | "hours" | "more" | "services" | "products" | "photos" | "reviews" | "activity";

/** Tabs on the audit page (`?tab=`); every tab but overview edits one or more sections. */
/** Mirrors Google's Business information tabs (About, Contact, Location, Hours, More) plus services, products and photos. */
export const AUDIT_TABS = ["overview", "about", "contact", "location", "hours", "more", "services", "products", "photos"] as const;
export type AuditTab = (typeof AUDIT_TABS)[number];

export interface AuditCheck {
  id: string;
  section: SectionId;
  title: string;
  detail: string;
  status: CheckStatus;
  points: number;
  earned: number;
  severity: Severity;
  /** True when it can be fixed on the audit page (editor or suggestion). */
  fixable: boolean;
}

export interface AuditSection {
  id: SectionId;
  title: string;
  summary: string;
  checks: AuditCheck[];
  earned: number;
  max: number;
  /** 0–100 */
  score: number;
}

export interface AuditResult {
  /** 0–100 */
  score: number;
  sections: AuditSection[];
  /** Checks not fully passed, biggest point gain first. */
  issues: AuditCheck[];
  passed: AuditCheck[];
}

export const SECTION_META: Record<SectionId, { title: string; summary: string }> = {
  about: { title: "About", summary: "Name, categories, description and opening date" },
  contact: { title: "Contact", summary: "How customers reach you: phone, chat, website, booking and social" },
  location: { title: "Location", summary: "Where you are and the areas you serve" },
  hours: { title: "Hours", summary: "Opening status, regular, special and more hours" },
  more: { title: "More", summary: "Attributes like accessibility, parking and payments" },
  services: { title: "Services", summary: "Services help you appear for specific searches" },
  products: { title: "Products", summary: "Products show as a browsable catalogue on your profile" },
  photos: { title: "Photos", summary: "Profiles with photos get more requests for directions and clicks" },
  reviews: { title: "Reviews", summary: "Rating, response rate and freshness" },
  activity: { title: "Posts & activity", summary: "Regular posts keep the profile fresh" },
};

const sevFor = (points: number): Severity => (points >= 8 ? "high" : points >= 4 ? "medium" : "low");

export function auditLocation(location: Location, reviews: Review[], posts: Post[] = []): AuditResult {
  const checks: AuditCheck[] = [];
  const add = (section: SectionId, id: string, title: string, points: number, status: CheckStatus, detail: string, fixable = true) =>
    checks.push({ id, section, title, detail, status, points, earned: status === "pass" ? points : status === "warn" ? points / 2 : 0, severity: sevFor(points), fixable });
  const tri = (ok: boolean, partial: boolean): CheckStatus => (ok ? "pass" : partial ? "warn" : "fail");
  const l = location;

  // ---- about
  add("about", "verified", "Profile is verified", 10, l.verified ? "pass" : "fail", l.verified ? "Verified with Google." : "Unverified profiles may not appear in Search or Maps. Verify in Google Business Profile.", false);
  add("about", "primary-category", "Primary category set", 5, l.primaryCategory ? "pass" : "fail", l.primaryCategory || "Pick the category that best describes your business.");
  const sec = l.additionalCategories.length;
  add("about", "secondary-categories", "Secondary categories", 10, tri(sec >= 3, sec >= 1), sec >= 3 ? `${sec} secondary categories.` : `${sec} secondary ${sec === 1 ? "category" : "categories"} — add ${3 - sec} more that match what you offer.`);
  const desc = (l.description ?? "").trim();
  const city = cityOf(l.address).toLowerCase();
  add("about", "description-length", "Description length", 8, tri(desc.length >= DESCRIPTION_GOOD, desc.length >= 100), `${desc.length} of ${DESCRIPTION_GOOD}+ characters recommended (max 750).`);
  const mentions = !!desc && desc.toLowerCase().includes(l.primaryCategory.toLowerCase().split(" ")[0]) && (!city || desc.toLowerCase().includes(city));
  add("about", "description-keywords", "Description mentions what you do and where", 2, desc ? (mentions ? "pass" : "warn") : "fail", mentions ? "Mentions your category and city." : `Mention "${l.primaryCategory.toLowerCase()}"${city ? ` and "${cityOf(l.address)}"` : ""} naturally.`);
  add("about", "description-policy", "Description has no links or phone numbers", 2, desc && hasContactInText(desc) ? "fail" : "pass", desc && hasContactInText(desc) ? "Google may reject descriptions with URLs or phone numbers." : "Follows Google's content rules.");
  add("about", "opening-date", "Opening date", 1, l.openingDate ? "pass" : "warn", l.openingDate ? "Shows how long you've been in business." : "Add when you opened. Long-running businesses earn trust.");

  // ---- contact
  add("contact", "phone", "Phone number", 5, l.phone ? "pass" : "fail", l.phone ? l.phone : "Add a primary phone so customers can call from Search and Maps.");
  add("contact", "website", "Website", 5, l.websiteUri ? "pass" : "fail", l.websiteUri ? l.websiteUri : "Add your website. It unlocks the Website button and service suggestions.");
  const social = Object.values(l.socialProfiles ?? {}).filter(Boolean).length;
  add("contact", "social-profiles", "Social profiles", 3, tri(social >= 2, social >= 1), social ? `${social} social profile${social === 1 ? "" : "s"} linked.` : "Link your Facebook, Instagram or other profiles.");
  add("contact", "booking", "Booking or chat link", 2, l.appointmentUri || l.chatUri ? "pass" : "warn", l.appointmentUri || l.chatUri ? "Customers can book or message you from the profile." : "Add a booking or chat link to get a Book or Chat button.");

  // ---- location
  add("location", "address", "Business address", 3, l.address ? "pass" : "fail", l.address || "Add the business address.");
  const areas = l.serviceArea?.length ?? 0;
  add("location", "service-area", "Service area", 2, areas || !l.hideAddress ? "pass" : "fail", areas ? `Serves ${areas} area${areas === 1 ? "" : "s"}.` : l.hideAddress ? "Your address is hidden, so add the areas you serve." : "Storefront: a service area is optional.");

  // ---- hours
  const status = l.openStatus ?? "open";
  const always = status === "always_open";
  add("hours", "hours-status", "Shown as open", 5, status === "open" || always ? "pass" : status === "open_no_hours" ? "warn" : "fail", always ? "Always open (24 hours)." : status === "open" ? "Open with main hours." : status === "open_no_hours" ? "Open with no main hours. Customers can't see when you're open." : "Your profile shows the business as closed.");
  const days = always ? 7 : new Set(l.regularHours?.map((h) => h.day)).size;
  add("hours", "hours-set", "Regular hours", 7, days ? "pass" : "fail", always ? "Open 24 hours, 7 days a week." : days ? `Open ${days} day${days === 1 ? "" : "s"} a week.` : "Add opening hours. Profiles without hours look closed.");
  const weekend = always || !!l.regularHours?.some((h) => h.day === "SATURDAY" || h.day === "SUNDAY");
  add("hours", "hours-weekend", "Weekend hours decided", 3, days ? (weekend ? "pass" : "warn") : "fail", weekend ? "Weekend hours listed." : "No weekend hours. If you're closed, that's fine; if not, add them.");
  const today = new Date().toISOString().slice(0, 10);
  const upcomingSpecial = l.specialHours?.some((h) => h.date >= today);
  add("hours", "special-hours", "Upcoming holiday hours", 2, upcomingSpecial ? "pass" : "warn", upcomingSpecial ? "Holiday hours are set." : "Add special hours for upcoming holidays so you don't look open when you're not.");

  // ---- more (attributes)
  const attrs = l.attributes.length;
  add("more", "attributes-count", "Attributes filled in", 6, tri(attrs >= 5, attrs >= 1), `${attrs} attribute${attrs === 1 ? "" : "s"} set — aim for 5 or more.`);

  // ---- services
  const svc = l.services.length;
  add("services", "services-count", "Services listed", 8, tri(svc >= 5, svc >= 1), svc >= 5 ? `${svc} services listed.` : `${svc} service${svc === 1 ? "" : "s"} — list at least 5 so you show up for specific searches.`);
  const detailed = l.services.filter((x) => x.description || (x.priceType && x.priceType !== "none")).length;
  add("services", "services-details", "Services have prices or descriptions", 4, svc ? tri(detailed === svc, detailed >= svc / 2) : "fail", svc ? `${detailed} of ${svc} services have a price or description.` : "Add services first.");

  // ---- products (not judged when Google's API doesn't share them: no guessing)
  const prods = l.products ?? [];
  if (!l.notInApi?.includes("products")) {
  add("products", "products-count", "Products listed", 5, tri(prods.length >= 3, prods.length >= 1), prods.length >= 3 ? `${prods.length} products listed.` : `${prods.length} product${prods.length === 1 ? "" : "s"} — add at least 3 with prices so they show as a catalogue.`);
  const withPhoto = prods.filter((p) => p.photo).length;
  add("products", "products-photos", "Products have photos", 2, prods.length ? tri(withPhoto === prods.length, withPhoto > 0) : "fail", prods.length ? `${withPhoto} of ${prods.length} products have a photo.` : "Add products first.");
  }

  // ---- photos (managed in Google; shown here as guidance)
  add("photos", "photos-count", "At least 10 photos", 6, tri(l.photoCount >= 10, l.photoCount >= 3), `${l.photoCount} photo${l.photoCount === 1 ? "" : "s"} uploaded.`, false);
  add("photos", "photos-logo", "Logo", 2, l.hasLogo ? "pass" : "fail", l.hasLogo ? "Logo uploaded." : "Upload a square logo.", false);
  add("photos", "photos-cover", "Cover photo", 2, l.hasCoverPhoto ? "pass" : "fail", l.hasCoverPhoto ? "Cover photo set." : "Set a cover photo — it's the first image people see.", false);

  // ---- reviews
  const visible = reviews.filter((r) => !r.hidden);
  const avg = visible.length ? visible.reduce((s, r) => s + r.rating, 0) / visible.length : null;
  const replyRate = visible.length ? visible.filter((r) => r.reply).length / visible.length : null;
  const latest = visible.reduce<number>((m, r) => Math.max(m, new Date(r.createTime).getTime()), 0);
  const fresh = latest > Date.now() - 30 * 86_400_000;
  add("reviews", "reviews-rating", "Average rating 4.0+", 4, avg == null ? "warn" : tri(avg >= 4, avg >= 3.5), avg == null ? "No reviews yet." : `Average ${avg.toFixed(1)} from ${visible.length} reviews.`, false);
  add("reviews", "reviews-replies", "Reply to 80%+ of reviews", 4, replyRate == null ? "pass" : tri(replyRate >= 0.8, replyRate >= 0.5), replyRate == null ? "Nothing to reply to." : `${Math.round(replyRate * 100)}% replied.`, false);
  add("reviews", "reviews-fresh", "New review in the last 30 days", 2, fresh ? "pass" : "fail", fresh ? "Recent reviews keep the profile trusted." : "Ask recent customers for a review.", false);

  // ---- activity
  const mine = posts.filter((p) => postForLocation(p, l.id));
  const lastPost = mine.filter((p) => p.published_at).reduce<number>((m, p) => Math.max(m, new Date(p.published_at as string).getTime()), 0);
  const recent = lastPost > Date.now() - 7 * 86_400_000;
  const upcoming = mine.some((p) => p.status === "scheduled" && p.scheduled_at && new Date(p.scheduled_at).getTime() > Date.now());
  add("activity", "posts-recent", "Posted in the last 7 days", 3, recent ? "pass" : lastPost > Date.now() - 30 * 86_400_000 ? "warn" : "fail", recent ? "Fresh post on your profile." : "Post an update, offer or event this week.", false);
  add("activity", "posts-scheduled", "Next post scheduled", 2, upcoming ? "pass" : "fail", upcoming ? "Something is queued up." : "Schedule your next post so the profile never goes quiet.", false);

  // ---- roll up
  const sections: AuditSection[] = (Object.keys(SECTION_META) as SectionId[]).map((id) => {
    const cs = checks.filter((c) => c.section === id);
    const earned = cs.reduce((s, c) => s + c.earned, 0);
    const max = cs.reduce((s, c) => s + c.points, 0);
    return { id, ...SECTION_META[id], checks: cs, earned, max, score: max ? Math.round((earned / max) * 100) : 100 };
  });
  const total = checks.reduce((s, c) => s + c.points, 0);
  const earned = checks.reduce((s, c) => s + c.earned, 0);
  const issues = checks.filter((c) => c.status !== "pass").sort((a, b) => b.points - b.earned - (a.points - a.earned));
  return { score: Math.round((earned / total) * 100), sections, issues, passed: checks.filter((c) => c.status === "pass") };
}

/** Points the overall score gains if a check is fixed (at least 1 for anything unfinished). */
export const pointsGain = (c: AuditCheck, totalPoints: number) => (c.points === c.earned ? 0 : Math.max(1, Math.round(((c.points - c.earned) / totalPoints) * 100)));
