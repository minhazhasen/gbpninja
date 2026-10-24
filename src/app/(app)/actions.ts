"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProvider } from "@/lib/gbp";
import { assignUserWorkspace, tenantForInvite } from "@/lib/gbp/tenancy";
import { runInTenant } from "@/lib/gbp/tenant-context";
import { getSessionUser } from "@/lib/current-user";
import { channelAvailable } from "@/lib/connections";
import { googleAuthUrl, googleOAuthConfigured } from "@/lib/google/oauth";
import { metaAuthUrl, metaConfigured } from "@/lib/meta/oauth";
import { linkedinAuthUrl, linkedinConfigured } from "@/lib/linkedin/oauth";
import type { BusinessCategory, ConnectionOption, ReviewPatch, ReviewRequestStatus, SearchConsoleProperty, StarRating, Task } from "@/lib/gbp/types";
import { auditLocation } from "@/lib/audit";
import { isMapsUrl, resolveMapsLink, type MapsLinkInfo } from "@/lib/maps-link";
import { distanceKm as distance, lookupCoords, scrapeMapsLink, type ScrapedPlace } from "@/lib/maps-scrape";
import { refreshCompetitors } from "@/lib/competitor-refresh";
import {
  addLead,
  closeOffer,
  currentWorkspaceId,
  getLead,
  issuesForCurrentWorkspace,
  listOffers,
  logAction,
  reportIssue as fileIssue,
  trackOffer as trackOfferEvent,
  updateLead,
} from "@/lib/platform/store";
import { APP_NAME } from "@/components/brand";
import { LINK_TOKEN, SAMPLE_VARS, emailHtml, mergeTemplate, splitOnLink, templateOrder } from "@/lib/templates";
import { reviewLink } from "@/lib/reviews";
import { CHANNELS, CONNECT_LABEL, LOCKED, MOVABLE, validatePost, type Channel, type PostDraft, type WhenMode } from "@/lib/posts";
import {
  DAYS,
  DESCRIPTION_MAX,
  formatAddress,
  MAX_ADDITIONAL_PHONES,
  MAX_SECONDARY_CATEGORIES,
  MAX_SERVICE_AREAS,
  MORE_HOURS_TYPES,
  PHOTO_MIN_PX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  SERVICE_DESCRIPTION_MAX,
} from "@/lib/profile";

type ActionResult = { ok: true; id: string } | { ok: false; error: string };
const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong" });

const reviewPatchSchema = z
  .object({
    reply: z.string().trim().max(4096).nullable(),
    assignedTo: z.string().max(100).nullable(),
    hidden: z.boolean(),
    followUp: z.object({ type: z.enum(["called", "emailed", "resolved"]), note: z.string().max(2000).optional(), at: z.string().datetime() }).nullable(),
  })
  .partial();

/** Reply (posted to Google), assignee, hidden flag or follow-up on a review. */
export async function updateReview(locationId: string, reviewId: string, patch: ReviewPatch): Promise<ActionResult> {
  try {
    const p = reviewPatchSchema.parse(patch);
    if (p.reply === "") return { ok: false, error: "Write a reply" };
    await (await getProvider()).updateReview(z.string().min(1).parse(locationId), z.string().min(1).parse(reviewId), p);
    revalidatePath("/", "layout");
    return { ok: true, id: reviewId };
  } catch (e) {
    return fail(e);
  }
}

const requestSchema = z
  .object({
    locationId: z.string().min(1),
    name: z.string().trim().min(1, "Add the customer's name").max(200),
    email: z.string().trim().email("Enter a valid email").or(z.literal("")).nullish(),
    phone: z.string().trim().max(40).nullish(),
    method: z.enum(["email", "sms", "link"]),
    status: z.enum(["draft", "sent"]),
    /** Email sent through the connected Gmail (otherwise the device's mail app is opened). */
    viaGmail: z.boolean().optional(),
    subject: z.string().trim().max(300).optional(),
    body: z.string().trim().max(10_000).optional(),
  })
  .refine((r) => r.method !== "email" || !!r.email, { message: "Add an email address", path: ["email"] })
  .refine((r) => r.method !== "sms" || !!r.phone, { message: "Add a phone number", path: ["phone"] });

export async function createReviewRequest(input: z.input<typeof requestSchema>): Promise<ActionResult> {
  try {
    const r = requestSchema.safeParse(input);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check the form" };
    const { viaGmail, subject, body, ...request } = r.data;
    const provider = await getProvider();
    if (viaGmail && request.status === "sent" && request.method === "email") {
      if (!subject || !body) return { ok: false, error: "Add a subject and a message" };
      const sender = await provider.getEmailSender();
      const location = await provider.getLocation(request.locationId);
      // The body keeps {{link}}: a button in the HTML part, the plain URL in the text part.
      const link = reviewLink(location?.placeId);
      await provider.sendEmail({ to: request.email!, subject, body: splitOnLink(body).join(link ?? ""), html: emailHtml(body, link), fromName: sender.fromName || location?.title });
    }
    const saved = await provider.createReviewRequest({ ...request, email: request.email || null, phone: request.phone || null });
    revalidatePath("/reviews");
    revalidatePath("/settings");
    return { ok: true, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateReviewRequest(id: string, status: ReviewRequestStatus, rating?: number | null): Promise<ActionResult> {
  try {
    const st = z.enum(["draft", "sent", "clicked", "completed", "declined"]).parse(status);
    const rt = z.number().int().min(1).max(5).nullish().parse(rating);
    await (await getProvider()).updateReviewRequest(id, { status: st, ...(rt !== undefined ? { rating: rt } : {}) });
    revalidatePath("/reviews");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

const str = (max: number) => z.string().max(max);
const channel = z.enum(["google", "facebook", "instagram", "linkedin"]);
const draftSchema = z.object({
  title: str(200),
  body: str(70_000),
  channels: z.array(channel).max(5),
  media: z
    .array(
      z.object({
        // data: URLs hold uploaded images until real file storage exists (~2 MB each after resizing).
        url: str(3_000_000).refine((u) => /^https?:\/\/\S+$/i.test(u) || /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(u), "Invalid media URL"),
        type: z.enum(["image", "video"]),
        name: str(300).nullish(),
        alt: str(1000).nullish(),
        width: z.number().nullish(),
        height: z.number().nullish(),
        size: z.number().nullish(),
        mime: str(100).nullish(),
      }),
    )
    .max(10),
  custom_text: z.boolean(),
  google: z.object({
    type: z.enum(["update", "event", "offer"]),
    text: str(1500),
    event: z.object({ title: str(200), start: str(20), end: str(20) }),
    offer: z.object({ title: str(200), start: str(20), end: str(20), coupon: str(58), url: str(2000), terms: str(5000) }),
    cta: z.object({ type: z.enum(["none", "BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"]), url: str(2000) }),
    locations: z.array(str(200)).max(500),
  }),
  facebook: z.object({ text: str(70_000), link: str(2000), first_comment: str(8000) }),
  instagram: z.object({ text: str(2200), first_comment: str(2200) }),
  linkedin: z.object({ text: str(3000) }),
  hashtags: z.array(str(100)).max(60),
  note: str(2000),
  label: str(60),
  scheduled_at: z.string().datetime().nullable(),
});

/** Create or update a post. `mode` mirrors the composer's "When" choice. */
export async function savePost(id: string | null, raw: PostDraft, mode: WhenMode): Promise<ActionResult> {
  try {
    const draft = draftSchema.parse(raw) as PostDraft;
    const provider = await getProvider();
    const [connected, locations] = await Promise.all([provider.getConnectedChannels(), provider.listLocations()]);
    const toSave = mode === "now" ? { ...draft, scheduled_at: new Date().toISOString() } : draft;
    const blocking = validatePost(toSave, { connected, when: mode, locationIds: locations.map((l) => l.id) }).find((i) => i.level === "error");
    if (blocking) return { ok: false, error: blocking.message };
    if (id) {
      const existing = (await provider.listPosts()).find((p) => p.id === id);
      if (existing && LOCKED.includes(existing.status)) return { ok: false, error: "Published posts can't be edited" };
    }
    const saved = await provider.savePost(id, toSave, mode === "draft" ? "draft" : "scheduled");
    if (mode === "now") await provider.publishPost(saved.id);
    revalidatePath("/", "layout");
    return { ok: true, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

/** Drag-and-drop on the calendar. Keeps scheduled posts out of the past. */
export async function reschedulePost(id: string, scheduledAt: string): Promise<ActionResult> {
  try {
    const at = z.string().datetime().parse(scheduledAt);
    const provider = await getProvider();
    const post = (await provider.listPosts()).find((p) => p.id === id);
    if (!post) return { ok: false, error: "Post not found" };
    if (!MOVABLE.includes(post.status)) return { ok: false, error: "Only drafts and scheduled posts can be moved" };
    if (post.status === "scheduled" && new Date(at).getTime() < Date.now() - 60_000) return { ok: false, error: "Scheduled posts can't move into the past" };
    await provider.reschedulePost(id, at);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Publish now, or retry the channels that failed. */
export async function publishPost(id: string): Promise<ActionResult> {
  try {
    const provider = await getProvider();
    await provider.publishPost(id);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePost(id: string): Promise<ActionResult> {
  try {
    await (await getProvider()).deletePost(id);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a full date");
const url = (what: string) => z.string().trim().url(`Enter a full ${what} (https://…)`).or(z.literal(""));
const periods = z
  .array(z.object({ day: z.enum(DAYS), open: hhmm, close: hhmm }))
  .max(28)
  .refine((hs) => hs.every((h) => h.close > h.open), "Closing time must be after opening time")
  .refine(
    (hs) =>
      DAYS.every((d) => {
        const ps = hs.filter((h) => h.day === d).sort((a, b) => a.open.localeCompare(b.open));
        return ps.every((p, i) => i === 0 || p.open >= ps[i - 1].close);
      }),
    "Opening periods on the same day can't overlap",
  );
const profileSchema = z
  .object({
    // About
    title: z.string().trim().min(1, "Enter the business name").max(100),
    primaryCategory: z.string().trim().min(1, "Pick a primary category").max(100),
    additionalCategories: z.array(z.string().trim().min(1).max(100)).max(MAX_SECONDARY_CATEGORIES, `Google allows up to ${MAX_SECONDARY_CATEGORIES} secondary categories`),
    description: z.string().trim().max(DESCRIPTION_MAX, `Descriptions are limited to ${DESCRIPTION_MAX} characters`),
    openingDate: z
      .string()
      .regex(/^\d{4}-\d{2}(-\d{2})?$/, "Add a year and month")
      .refine((d) => {
        const [y, m, day] = d.split("-").map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        return y >= 1800 && y <= new Date().getFullYear() + 1 && m >= 1 && m <= 12 && (!day || day <= daysInMonth);
      }, "Enter a real opening date (up to a year ahead)")
      .or(z.literal("")),
    // Contact
    phone: z.string().trim().max(40),
    additionalPhones: z.array(z.string().trim().min(1).max(40)).max(MAX_ADDITIONAL_PHONES, `Google allows ${MAX_ADDITIONAL_PHONES} additional numbers`),
    chatUri: url("chat link"),
    websiteUri: url("website address"),
    appointmentUri: url("booking link"),
    socialProfiles: z.partialRecord(z.enum(["facebook", "instagram", "linkedin", "pinterest", "tiktok", "x", "youtube"]), url("profile link")),
    // Live: Google attribute values by attribute id (the provider checks them against the profile's attribute list).
    attributeValues: z.record(z.string().regex(/^[a-z0-9_]{1,100}$/), z.union([z.boolean(), z.string().max(2000), z.array(z.string().max(200)).max(50)])),
    // Location
    address: z.string().trim().min(1, "Enter the address").max(250),
    postalAddress: z
      .object({
        regionCode: z.string().regex(/^[A-Z]{2}$/, "Pick a country"),
        addressLines: z
          .array(z.string().trim().max(120))
          .min(1)
          .max(2)
          .refine((ls) => !!ls[0], "Enter the street address"),
        locality: z.string().trim().min(1, "Enter the city").max(80),
        administrativeArea: z.string().trim().max(80),
        postalCode: z.string().trim().max(20),
      })
      .refine((a) => a.regionCode !== "US" || (/^[A-Z]{2}$/.test(a.administrativeArea) && /^\d{5}(-\d{4})?$/.test(a.postalCode)), "Enter a US state and a 5-digit ZIP code"),
    hideAddress: z.boolean(),
    serviceArea: z.array(z.string().trim().min(1).max(100)).max(MAX_SERVICE_AREAS, `Google allows up to ${MAX_SERVICE_AREAS} service areas`),
    // Hours
    openStatus: z.enum(["open", "always_open", "temporarily_closed", "open_no_hours", "permanently_closed"]),
    regularHours: periods,
    specialHours: z
      .array(z.object({ date: ymd, closed: z.boolean(), open: hhmm.optional(), close: hhmm.optional() }))
      .max(50)
      .refine((hs) => hs.every((h) => h.closed || (h.open && h.close && h.close > h.open)), "Special hours need a closing time after opening time")
      .refine((hs) => new Set(hs.map((h) => h.date)).size === hs.length, "Each date can appear once"),
    moreHours: z.array(z.object({ type: z.enum(MORE_HOURS_TYPES), periods })).max(MORE_HOURS_TYPES.length),
    // Services, products, attributes
    services: z
      .array(
        z.object({
          name: z.string().trim().min(1, "Name the service").max(120),
          category: z.string().trim().max(100).optional(),
          priceType: z.enum(["none", "free", "fixed", "from"]).optional(),
          price: z.number().min(0).max(1_000_000).optional(),
          description: z.string().trim().max(SERVICE_DESCRIPTION_MAX, `Service descriptions are limited to ${SERVICE_DESCRIPTION_MAX} characters`).optional(),
        }),
      )
      .max(100),
    products: z
      .array(
        z
          .object({
            name: z.string().trim().min(1, "Name the product").max(PRODUCT_NAME_MAX, `Product names are limited to ${PRODUCT_NAME_MAX} characters`),
            category: z.string().trim().max(PRODUCT_NAME_MAX).optional(),
            priceType: z.enum(["none", "fixed", "range"]).optional(),
            price: z.number().min(0).max(1_000_000).optional(),
            priceMax: z.number().min(0).max(1_000_000).optional(),
            description: z.string().trim().max(PRODUCT_DESCRIPTION_MAX, `Product descriptions are limited to ${PRODUCT_DESCRIPTION_MAX} characters`).optional(),
            photo: z.string().startsWith("data:image/").max(3_000_000, "Photo is too large").optional(),
            button: z.enum(["none", "order", "buy", "learn", "offer", "call"]).optional(),
            buttonUrl: z.string().trim().url("Enter a full button link (https://…)").or(z.literal("")).optional(),
          })
          .refine((p) => p.priceType !== "range" || p.priceMax == null || p.price == null || p.priceMax >= p.price, "Maximum price must be at least the minimum"),
      )
      .max(100),
    attributes: z
      .array(
        z
          .string()
          .regex(/^[a-z0-9_]+$/)
          .max(60),
      )
      .max(80),
  })
  .partial();

/** Category typeahead for the audit page's category editor. */
export async function searchCategories(query: string): Promise<{ ok: true; categories: BusinessCategory[] } | { ok: false; error: string }> {
  try {
    const q = z.string().trim().min(1).max(60).parse(query);
    return { ok: true, categories: await (await getProvider()).searchCategories(q, 12) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Edit profile fields from the audit page. Lists replace the whole list. */
export async function updateProfile(locationId: string, patch: z.input<typeof profileSchema>): Promise<ActionResult> {
  try {
    const r = profileSchema.safeParse(patch);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check the values" };
    const provider = await getProvider();
    const id = z.string().min(1).parse(locationId);
    const data = { ...r.data } as Record<string, unknown>;
    // Empty strings clear optional fields.
    for (const k of ["phone", "chatUri", "websiteUri", "appointmentUri", "openingDate", "description"]) if (data[k] === "") data[k] = undefined;
    // Google only accepts categories from its own list.
    for (const name of [r.data.primaryCategory, ...(r.data.additionalCategories ?? [])].filter(Boolean) as string[]) {
      const hits = await provider.searchCategories(name, 50);
      if (!hits.some((c) => c.displayName.toLowerCase() === name.toLowerCase())) return { ok: false, error: `"${name}" isn't a Google business category` };
    }
    if (r.data.additionalCategories) {
      const loc = await provider.getLocation(id);
      const seen = new Set<string>();
      data.additionalCategories = r.data.additionalCategories.filter((c) => {
        const k = c.toLowerCase();
        if (seen.has(k) || k === (r.data.primaryCategory ?? loc?.primaryCategory ?? "").toLowerCase()) return false;
        seen.add(k);
        return true;
      });
    }
    if (r.data.postalAddress) {
      const pa = { ...r.data.postalAddress, addressLines: r.data.postalAddress.addressLines.filter(Boolean) };
      data.postalAddress = pa;
      data.address = formatAddress(pa);
    }
    if (r.data.socialProfiles) data.socialProfiles = Object.fromEntries(Object.entries(r.data.socialProfiles).filter(([, v]) => v));
    if (r.data.serviceArea) data.serviceArea = [...new Map(r.data.serviceArea.map((a) => [a.toLowerCase(), a])).values()];
    if (r.data.services) {
      const seen = new Set<string>();
      data.services = r.data.services.filter((x) => !seen.has(x.name.toLowerCase()) && (seen.add(x.name.toLowerCase()), true));
    }
    await provider.updateLocation(id, data);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- photos
const photoCategory = z.enum(["logo", "cover", "exterior", "interior", "product", "at_work", "team", "food_and_drink", "common_area", "additional"]);
const newPhotoSchema = z.object({
  // Data URLs are resized client-side; ~5 MB of image is ~7 MB of base64.
  url: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Upload a JPG or PNG image")
    .max(7_000_000, "Photos must be under 5 MB"),
  category: photoCategory,
  width: z.number().int().min(PHOTO_MIN_PX, `Photos must be at least ${PHOTO_MIN_PX} × ${PHOTO_MIN_PX} px`),
  height: z.number().int().min(PHOTO_MIN_PX, `Photos must be at least ${PHOTO_MIN_PX} × ${PHOTO_MIN_PX} px`),
});

export async function uploadPhotos(locationId: string, photos: z.input<typeof newPhotoSchema>[]): Promise<ActionResult> {
  try {
    const r = z.array(newPhotoSchema).min(1).max(20, "Upload up to 20 photos at a time").safeParse(photos);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check the photos" };
    const id = z.string().min(1).parse(locationId);
    await (await getProvider()).addPhotos(id, r.data);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function updatePhoto(locationId: string, photoId: string, category: string): Promise<ActionResult> {
  try {
    const id = z.string().min(1).parse(locationId);
    await (await getProvider()).updatePhoto(id, z.string().min(1).parse(photoId), { category: photoCategory.parse(category) });
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePhoto(locationId: string, photoId: string): Promise<ActionResult> {
  try {
    const id = z.string().min(1).parse(locationId);
    await (await getProvider()).deletePhoto(id, z.string().min(1).parse(photoId));
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- Google Search Console (Settings → Data sources)
/** Demo simulates the Google sign-in; live mode needs the Google OAuth app (plus the webmasters.readonly scope). */
export async function connectSearchConsole(): Promise<ActionResult & { redirect?: string }> {
  try {
    // Real Google OAuth client: Google's consent page for read-only Search Console access, back to Settings with the website picker open.
    if (googleOAuthConfigured()) return { ok: true, id: "search_console", redirect: await googleAuthUrl("searchconsole", "/settings?pick=searchconsole#search-console") };
    if (!channelAvailable("google")) return { ok: false, error: "Google sign-in isn't set up for this app yet" };
    await (await getProvider()).connectSearchConsole();
    revalidatePath("/", "layout");
    return { ok: true, id: "search_console" };
  } catch (e) {
    return fail(e);
  }
}

/** Properties the connected Google account can see, plus the current location → property choices. */
export async function listSearchConsoleProperties(): Promise<{ ok: true; properties: SearchConsoleProperty[]; sites: Record<string, string> } | { ok: false; error: string }> {
  try {
    const provider = await getProvider();
    const [properties, connection] = await Promise.all([provider.listSearchConsoleProperties(), provider.getSearchConsole()]);
    return { ok: true, properties, sites: connection.sites };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Which Search Console property belongs to each location (null clears it). */
export async function saveSearchConsoleSites(sites: Record<string, string | null>): Promise<ActionResult> {
  try {
    const r = z.record(z.string().min(1), z.string().min(1).max(300).nullable()).safeParse(sites);
    if (!r.success) return { ok: false, error: "Check the selected properties" };
    await (await getProvider()).setSearchConsoleSites(r.data);
    revalidatePath("/", "layout");
    return { ok: true, id: "search_console" };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectSearchConsole(): Promise<ActionResult> {
  try {
    await (await getProvider()).disconnectSearchConsole();
    revalidatePath("/", "layout");
    return { ok: true, id: "search_console" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- connections (Settings)
const channelSchema = z.enum(["google", "facebook", "instagram", "linkedin"]);

/** Demo mode simulates the OAuth round trip; live mode needs an OAuth app per network (see Settings). */
export async function connectChannel(channel: Channel): Promise<ActionResult & { needsSelection?: boolean; redirect?: string }> {
  try {
    const ch = channelSchema.parse(channel);
    // Real Google OAuth client configured: send the browser to Google's consent page (back at "/" → Settings).
    if (ch === "google" && googleOAuthConfigured()) return { ok: true, id: ch, redirect: await googleAuthUrl("gbp", "/settings?tab=accounts") };
    // Real Meta app configured: Facebook's sign-in (Facebook Login for Business), back at /api/oauth/meta/callback → Settings.
    if ((ch === "facebook" || ch === "instagram") && metaConfigured()) return { ok: true, id: ch, redirect: await metaAuthUrl(ch, "/settings?tab=accounts") };
    if (ch === "linkedin" && linkedinConfigured()) return { ok: true, id: ch, redirect: await linkedinAuthUrl("/settings?tab=accounts") };
    if (!channelAvailable(ch)) return { ok: false, error: `${CONNECT_LABEL[ch]} isn't set up for this app yet` };
    const c = await (await getProvider()).connectChannel(ch);
    revalidatePath("/", "layout");
    return { ok: true, id: ch, needsSelection: c.status === "needs_selection" };
  } catch (e) {
    return fail(e);
  }
}

export async function listConnectionOptions(channel: Channel): Promise<{ ok: true; options: ConnectionOption[] } | { ok: false; error: string }> {
  try {
    return { ok: true, options: await (await getProvider()).listConnectionOptions(channelSchema.parse(channel)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not load" };
  }
}

export async function selectConnectionTargets(channel: Channel, ids: string[]): Promise<ActionResult> {
  try {
    const ch = channelSchema.parse(channel);
    const picked = z.array(z.string().min(1).max(200)).min(1, "Pick at least one").max(500).parse(ids);
    await (await getProvider()).selectConnectionTargets(ch, picked);
    revalidatePath("/", "layout");
    return { ok: true, id: ch };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectChannel(channel: Channel): Promise<ActionResult> {
  try {
    const ch = channelSchema.parse(channel);
    await (await getProvider()).disconnectChannel(ch);
    revalidatePath("/", "layout");
    return { ok: true, id: ch };
  } catch (e) {
    return fail(e);
  }
}

export async function syncConnections(channel?: Channel): Promise<ActionResult> {
  try {
    if (channel !== undefined && !CHANNELS.includes(channel)) return { ok: false, error: "Unknown account" };
    await (await getProvider()).syncConnections(channel);
    revalidatePath("/", "layout");
    return { ok: true, id: "sync" };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- users (workspace members)
const roleSchema = z.enum(["admin", "member"]);

/** Only admins manage users. Returns the provider and current member, or an error result. */
async function asAdmin() {
  const provider = await getProvider();
  const me = await provider.getCurrentMember();
  if (me.role !== "admin") throw new Error("Only admins can manage users");
  return { provider, me };
}

/** Location access for a member: [] means all locations. Throws when a limited member would get none. */
async function locationAccess(allLocations: boolean | undefined, ids: string[] | undefined) {
  if (allLocations) return [];
  const all = (await (await getProvider()).listLocations()).map((l) => l.id);
  const picked = z
    .array(z.string().min(1).max(200))
    .max(500)
    .parse(ids ?? [])
    .filter((id) => all.includes(id));
  if (!picked.length) throw new Error("Pick at least one location, or give access to all");
  return picked.length === all.length ? [] : picked; // every location picked = all
}

/** The app's address for links in emails: APP_URL, else the address this request came in on. */
async function siteOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3001";
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

type InviteSend = { email: string; token: string; emailed: boolean; error?: string };

/** Emails each invite through the workspace's connected Gmail. Without Gmail (or when a send fails) the link is shared by hand. */
async function emailInvites(provider: Awaited<ReturnType<typeof getProvider>>, inviter: { name: string; email: string }, invites: { email: string; token: string }[]): Promise<InviteSend[]> {
  const sender = await provider.getEmailSender();
  if (sender.status !== "connected") return invites.map((i) => ({ ...i, emailed: false }));
  const locations = await provider.listLocations().catch(() => []);
  const workspace = locations.length === 1 ? locations[0].title : locations.length ? `${locations[0].title} and ${locations.length - 1} more` : "their workspace";
  const who = inviter.name || inviter.email;
  const origin = await siteOrigin();
  const out: InviteSend[] = [];
  for (const i of invites) {
    const link = `${origin}/invite/${i.token}`;
    const text = (l: string) =>
      `Hi,\n\n${who} invited you to join ${workspace} on ${APP_NAME}, where the team manages its Google Business Profiles: reviews, posts, performance and the profile audit.\n\n${l}\n\nSign in with this email address (${i.email}) to accept. The link works once.`;
    try {
      await provider.sendEmail({
        to: i.email,
        subject: `${who} invited you to ${APP_NAME}`,
        body: text(`Join the workspace: ${link}`),
        html: emailHtml(text(LINK_TOKEN), link, "Join workspace"),
        fromName: `${who} via ${APP_NAME}`,
      });
      out.push({ ...i, emailed: true });
    } catch (e) {
      out.push({ ...i, emailed: false, error: e instanceof Error ? e.message : "Couldn't send the email" });
    }
  }
  return out;
}

export async function inviteMember(input: {
  emails: string;
  name?: string;
  role: "admin" | "member";
  locationIds: string[];
  allLocations: boolean;
}): Promise<ActionResult & { links?: InviteSend[] }> {
  try {
    const { provider, me } = await asAdmin();
    const emails = [
      ...new Set(
        input.emails
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    if (!emails.length) return { ok: false, error: "Add at least one email address" };
    if (emails.length > 20) return { ok: false, error: "Invite up to 20 people at a time" };
    const bad = emails.find((e) => !z.string().email().safeParse(e).success);
    if (bad) return { ok: false, error: `"${bad}" isn't a valid email address` };
    const role = roleSchema.parse(input.role);
    const locationIds = role === "admin" ? [] : await locationAccess(input.allLocations, input.locationIds);
    const name = emails.length === 1 ? z.string().trim().max(120).optional().parse(input.name) : undefined;
    const links: { email: string; token: string }[] = [];
    for (const email of emails) {
      const m = await provider.inviteMember({ email, name, role, locationIds });
      links.push({ email, token: m.inviteToken ?? "" });
    }
    const sent = await emailInvites(provider, me, links);
    revalidatePath("/users");
    return { ok: true, id: links[0].email, links: sent };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMemberAccess(id: string, patch: { role?: "admin" | "member"; locationIds?: string[]; allLocations?: boolean; name?: string }): Promise<ActionResult> {
  try {
    const { provider, me } = await asAdmin();
    const members = await provider.listMembers();
    const target = members.find((m) => m.id === id);
    if (!target) return { ok: false, error: "User not found" };
    const role = patch.role ? roleSchema.parse(patch.role) : target.role;
    const admins = members.filter((m) => m.role === "admin" && m.status === "active");
    if (target.role === "admin" && role !== "admin" && target.status === "active" && admins.length <= 1) return { ok: false, error: "Keep at least one admin in the workspace" };
    if (target.id === me.id && role !== "admin") return { ok: false, error: "You can't remove your own admin access — ask another admin" };
    const next: { role: "admin" | "member"; locationIds?: string[]; name?: string } = { role };
    if (role === "member" && (patch.locationIds || patch.allLocations !== undefined)) next.locationIds = await locationAccess(patch.allLocations, patch.locationIds);
    if (patch.name !== undefined) next.name = z.string().trim().max(120).parse(patch.name);
    await provider.updateMember(id, next);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMember(id: string): Promise<ActionResult> {
  try {
    const { provider, me } = await asAdmin();
    if (id === me.id) return { ok: false, error: "You can't remove yourself" };
    const members = await provider.listMembers();
    const target = members.find((m) => m.id === id);
    if (!target) return { ok: false, error: "User not found" };
    if (target.role === "admin" && target.status === "active" && members.filter((m) => m.role === "admin" && m.status === "active").length <= 1)
      return { ok: false, error: "Keep at least one admin in the workspace" };
    await provider.removeMember(id);
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function resendInvite(id: string): Promise<ActionResult & { token?: string; emailed?: boolean; emailError?: string }> {
  try {
    const { provider, me } = await asAdmin();
    const m = await provider.resendInvite(z.string().min(1).parse(id));
    const [sent] = m.inviteToken ? await emailInvites(provider, me, [{ email: m.email, token: m.inviteToken }]) : [];
    revalidatePath("/users");
    return { ok: true, id, token: m.inviteToken ?? undefined, emailed: !!sent?.emailed, emailError: sent?.error };
  } catch (e) {
    return fail(e);
  }
}

/** From the invite link. Demo: no sign-in step; live: requires signing in with the invited email. */
export async function acceptInvite(token: string): Promise<ActionResult> {
  try {
    const t = z
      .string()
      .regex(/^[a-f0-9]{16,64}$/)
      .parse(token);
    const tenant = tenantForInvite(t);
    if (!tenant) return { ok: false, error: "This invite link is no longer valid" };
    const m = await runInTenant(tenant, async () => {
      const provider = await getProvider();
      const invite = await provider.findInvite(t);
      // With sign-in on, only the invited email can join (their workspace switches to this one).
      const user = await getSessionUser();
      if (user && invite && user.email.toLowerCase() !== invite.email.toLowerCase()) throw new Error(`Sign in as ${invite.email} to accept this invite`);
      const accepted = await provider.acceptInvite(t);
      if (user) assignUserWorkspace(user.email, tenant.id);
      return accepted;
    });
    revalidatePath("/", "layout");
    return { ok: true, id: m.id };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- my profile / session
export async function updateMyProfile(input: { name: string }): Promise<ActionResult> {
  try {
    const provider = await getProvider();
    const me = await provider.getCurrentMember();
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Enter your name" };
    if (name.length > 120) return { ok: false, error: "Keep your name under 120 characters" };
    await provider.updateMember(me.id, { name });
    revalidatePath("/", "layout");
    return { ok: true, id: me.id };
  } catch (e) {
    return fail(e);
  }
}

/** Profile photo: a resized data: URL from the browser, or null to go back to the Google photo / initials. */
export async function updateMyAvatar(url: string | null): Promise<ActionResult> {
  try {
    const avatarUrl = z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/, "Upload a JPG, PNG or WebP image")
      .max(700_000, "Photo is too large")
      .nullable()
      .parse(url);
    const provider = await getProvider();
    const me = await provider.getCurrentMember();
    await provider.updateMember(me.id, { avatarUrl });
    revalidatePath("/", "layout");
    return { ok: true, id: me.id };
  } catch (e) {
    return fail(e);
  }
}

/** Set a password (Google-only accounts) or change it (current password required). */
export async function changeMyPassword(input: { current?: string; next: string; confirm: string }): Promise<ActionResult> {
  try {
    const next = input.next ?? "";
    if (next.length < 8) return { ok: false, error: "Use at least 8 characters" };
    if (next.length > 128) return { ok: false, error: "Use 128 characters or fewer" };
    if (!/[a-z]/i.test(next) || !/\d/.test(next)) return { ok: false, error: "Use letters and at least one number" };
    if (next !== input.confirm) return { ok: false, error: "The new passwords don't match" };
    if (input.current && input.current === next) return { ok: false, error: "Choose a password you haven't used here" };
    const provider = await getProvider();
    const me = await provider.getCurrentMember();
    await provider.changePassword(me.id, input.current || null, next);
    revalidatePath("/profile");
    return { ok: true, id: me.id };
  } catch (e) {
    return fail(e);
  }
}

export async function sendMyPasswordReset(): Promise<ActionResult & { email?: string }> {
  try {
    const provider = await getProvider();
    const me = await provider.getCurrentMember();
    await provider.sendPasswordReset(me.id);
    return { ok: true, id: me.id, email: me.email };
  } catch (e) {
    return fail(e);
  }
}

/** Ends the Auth.js session. Demo mode has no sign-in, so there is nothing to end. */
export async function signOutAction(): Promise<ActionResult | void> {
  // Firebase sign-in: drop the session cookie; the login page also signs Firebase out in the browser.
  const { SESSION_COOKIE, authEnabled } = await import("@/lib/session");
  if (authEnabled()) {
    (await cookies()).delete(SESSION_COOKIE);
    redirect("/login");
  }
  if (process.env.GBP_DATA_SOURCE !== "google") return { ok: false, error: "Demo workspace: there's no sign-in to end." };
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/" });
}

// ---------------------------------------------------------------- tasks
const taskFields = {
  title: z.string().trim().min(1, "Give the task a title").max(200, "Keep the title under 200 characters"),
  description: z.string().trim().max(5000).nullable(),
  stage: z.enum(["todo", "in_progress", "in_review", "done"]),
  priority: z.enum(["urgent", "high", "medium", "low"]),
  assigneeId: z.string().max(100).nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid due date")
    .nullable(),
  locationId: z.string().max(200).nullable(),
  order: z.number().finite(),
};
const taskPatchSchema = z.object(taskFields).partial();

/** Assignee must be an active member and the location must exist (null = none / all locations). */
async function checkTaskRefs(patch: { assigneeId?: string | null; locationId?: string | null }) {
  const provider = await getProvider();
  if (patch.assigneeId) {
    const members = await provider.listMembers();
    if (!members.some((m) => m.id === patch.assigneeId && m.status === "active")) throw new Error("Pick someone in this workspace");
  }
  if (patch.locationId) {
    const locations = await provider.listLocations();
    if (!locations.some((l) => l.id === patch.locationId)) throw new Error("Unknown location");
  }
  return provider;
}
const firstIssue = (e: unknown) => (e instanceof z.ZodError ? (e.issues[0]?.message ?? "Invalid task") : null);

export async function createTask(input: {
  title: string;
  description?: string | null;
  stage: string;
  priority: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  locationId?: string | null;
  parentId?: string | null;
  subtasks?: { title: string; assigneeId?: string | null; dueDate?: string | null }[];
  /** "Add as task" from the audit checklist: the check must currently be failing for that location. */
  auditCheckId?: string;
}): Promise<ActionResult> {
  try {
    const data = z
      .object({
        ...taskFields,
        order: taskFields.order.optional(),
        parentId: z.string().max(200).nullable().optional(),
        subtasks: z
          .array(z.object({ title: taskFields.title, assigneeId: taskFields.assigneeId.optional(), dueDate: taskFields.dueDate.optional() }))
          .max(50)
          .optional(),
      })
      .parse({ description: null, assigneeId: null, dueDate: null, locationId: null, ...input });
    const provider = await checkTaskRefs(data);
    for (const s of data.subtasks ?? []) await checkTaskRefs(s);
    let locationId = data.locationId;
    if (data.parentId) {
      const parent = (await provider.listTasks()).find((t) => t.id === data.parentId && !t.parentId);
      if (!parent) return { ok: false, error: "Parent task not found" };
      locationId = parent.locationId ?? null; // subtasks live where their task lives
    }
    const { subtasks, ...task } = data;
    let source: Task["source"] = null;
    if (input.auditCheckId) {
      const location = locationId ? await provider.getLocation(locationId) : null;
      if (!location) return { ok: false, error: "Pick the location to fix" };
      const [reviews, posts, tasks] = await Promise.all([provider.listReviews(location.id), provider.listPosts(), provider.listTasks()]);
      const check = auditLocation(location, reviews, posts).issues.find((c) => c.id === input.auditCheckId);
      if (!check) return { ok: false, error: "This item is already done" };
      const existing = tasks.find((t) => t.source?.type === "audit" && t.source.checkId === check.id && t.locationId === location.id && t.stage !== "done");
      if (existing) return { ok: false, error: "There's already an open task for this item" };
      source = { type: "audit", checkId: check.id, section: check.section };
    }
    const created = await provider.createTask({ ...task, locationId, source });
    for (const [i, s] of (subtasks ?? []).entries())
      await provider.createTask({ title: s.title, assigneeId: s.assigneeId ?? null, dueDate: s.dueDate ?? null, stage: "todo", priority: "medium", parentId: created.id, locationId, order: i });
    revalidatePath("/", "layout");
    return { ok: true, id: created.id };
  } catch (e) {
    return { ok: false, error: firstIssue(e) ?? (e instanceof Error ? e.message : "Something went wrong") };
  }
}

export async function updateTask(id: string, patch: Record<string, unknown>): Promise<ActionResult> {
  try {
    const data = taskPatchSchema.parse(patch);
    const provider = await checkTaskRefs(data);
    const task = (await provider.listTasks()).find((t) => t.id === z.string().min(1).parse(id));
    if (!task) return { ok: false, error: "Task not found" };
    // Subtasks follow their parent's location.
    if (task.parentId) delete data.locationId;
    await provider.updateTask(task.id, data);
    if (data.locationId !== undefined) for (const s of (await provider.listTasks()).filter((t) => t.parentId === task.id)) await provider.updateTask(s.id, { locationId: data.locationId });
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: firstIssue(e) ?? (e instanceof Error ? e.message : "Something went wrong") };
  }
}

export async function deleteTask(id: string): Promise<ActionResult> {
  try {
    await (await getProvider()).deleteTask(z.string().min(1).parse(id));
    revalidatePath("/", "layout");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- email (Gmail) + message templates — workspace admins
export async function connectGmail(): Promise<ActionResult & { redirect?: string }> {
  try {
    const { provider } = await asAdmin();
    if (googleOAuthConfigured()) return { ok: true, id: "gmail", redirect: await googleAuthUrl("gmail", "/settings?tab=email") };
    if (!channelAvailable("google")) return { ok: false, error: "Google sign-in isn't set up yet" };
    await provider.connectGmail();
    revalidatePath("/settings");
    return { ok: true, id: "gmail" };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectGmail(): Promise<ActionResult> {
  try {
    const { provider } = await asAdmin();
    await provider.disconnectGmail();
    revalidatePath("/settings");
    return { ok: true, id: "gmail" };
  } catch (e) {
    return fail(e);
  }
}

export async function updateEmailSender(input: { fromName?: string }): Promise<ActionResult> {
  try {
    const { provider } = await asAdmin();
    const r = z
      .object({
        fromName: z.string().trim().max(80, "Keep the sender name under 80 characters"),
      })
      .safeParse({ fromName: input.fromName ?? "" });
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check the form" };
    await provider.updateEmailSender({ fromName: r.data.fromName || null });
    revalidatePath("/settings");
    return { ok: true, id: "gmail" };
  } catch (e) {
    return fail(e);
  }
}

/** Sends the default request email (sample data) to the connected Gmail address itself. */
export async function sendTestEmail(): Promise<ActionResult & { to?: string }> {
  try {
    const { provider } = await asAdmin();
    const sender = await provider.getEmailSender();
    if (sender.status !== "connected" || !sender.email) return { ok: false, error: "Connect Gmail first" };
    const tpl = (await provider.listTemplates()).filter((t) => t.kind === "request_email").sort(templateOrder)[0];
    const subject = mergeTemplate(tpl?.subject ?? "Test email", SAMPLE_VARS);
    const body = mergeTemplate(tpl?.body ?? "This is a test.", { ...SAMPLE_VARS, link: LINK_TOKEN });
    await provider.sendEmail({ to: sender.email, subject: `[Test] ${subject}`, body: splitOnLink(body).join(SAMPLE_VARS.link!), html: emailHtml(body, SAMPLE_VARS.link!), fromName: sender.fromName });
    revalidatePath("/settings");
    return { ok: true, id: "test", to: sender.email };
  } catch (e) {
    return fail(e);
  }
}

const templateSchema = z.object({
  kind: z.enum(["request_email", "request_sms", "reply"]),
  name: z.string().trim().min(1, "Name the template").max(80, "Keep the name under 80 characters"),
  subject: z.string().trim().max(200, "Keep the subject under 200 characters").nullish(),
  body: z.string().trim().min(1, "Write the message").max(5000, "Keep the message under 5,000 characters"),
  isDefault: z.boolean().optional(),
  ratings: z.array(z.number().int().min(1).max(5)).max(5).optional(),
});

export async function saveTemplate(id: string | null, input: z.input<typeof templateSchema>): Promise<ActionResult> {
  try {
    const { provider } = await asAdmin();
    const r = templateSchema
      .refine((t) => t.kind !== "request_email" || !!t.subject, { message: "Add a subject line", path: ["subject"] })
      .refine((t) => t.kind === "reply" || /\{\{\s*link\s*\}\}/i.test(t.body), { message: "Include {{link}} so customers can find the review page", path: ["body"] })
      .refine((t) => t.kind !== "request_sms" || t.body.length <= 480, { message: "Keep texts under 480 characters (3 SMS)", path: ["body"] })
      .safeParse(input);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check the template" };
    const { ratings, ...t } = r.data;
    const saved = await provider.saveTemplate(id, {
      ...t,
      subject: t.kind === "request_email" ? t.subject : null,
      ratings: t.kind === "reply" ? ([...new Set(ratings ?? [])].sort() as StarRating[]) : undefined,
    });
    revalidatePath("/settings");
    revalidatePath("/reviews");
    return { ok: true, id: saved.id };
  } catch (e) {
    return fail(e);
  }
}

export async function setDefaultTemplate(id: string): Promise<ActionResult> {
  try {
    const { provider } = await asAdmin();
    const t = (await provider.listTemplates()).find((x) => x.id === id);
    if (!t) return { ok: false, error: "Template not found" };
    await provider.saveTemplate(id, { ...t, isDefault: true });
    revalidatePath("/settings");
    revalidatePath("/reviews");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  try {
    const { provider } = await asAdmin();
    await provider.deleteTemplate(z.string().min(1).parse(id));
    revalidatePath("/settings");
    revalidatePath("/reviews");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Offer card shown / button clicked (Dashboard) — counted for Admin → Offers. */
export async function trackOffer(offerId: string, event: "view" | "click"): Promise<void> {
  const e = z.enum(["view", "click"]).safeParse(event);
  if (e.success && typeof offerId === "string") trackOfferEvent(offerId.slice(0, 200), e.data);
}

/** The workspace closed the offer card (✕): hidden for the whole workspace for the offer's snooze days. */
export async function dismissOffer(offerId: string): Promise<void> {
  if (typeof offerId !== "string" || !offerId) return;
  // TODO: the signed-in member's workspace once multi-workspace sign-in lands.
  closeOffer(await currentWorkspaceId(), offerId.slice(0, 200));
  revalidatePath("/dashboard");
  revalidatePath("/admin", "layout");
}

/** Book a meeting about an offer (Dashboard offer card) → a lead in Admin → Offers. */
export async function bookOffer(offerId: string, locationId: string, input: { name: string; email: string; phone: string; meetingAt: string; timeZone: string; note: string }): Promise<ActionResult> {
  try {
    const offer = (await listOffers()).find((o) => o.id === z.string().min(1).parse(offerId) && o.active);
    if (!offer) return { ok: false, error: "This offer has ended" };
    const b = z
      .object({
        name: z.string().trim().min(1, "Add your name").max(100),
        email: z.string().trim().email("Enter a valid email"),
        phone: z.string().trim().max(40),
        meetingAt: z.string().datetime({ message: "Pick a date and time" }),
        timeZone: z.string().trim().max(60),
        note: z.string().trim().max(1000),
      })
      .parse(input);
    const at = new Date(b.meetingAt);
    if (at.getTime() < Date.now() + 30 * 60_000) return { ok: false, error: "Pick a time at least 30 minutes from now" };
    if (at.getTime() > Date.now() + 90 * 86_400_000) return { ok: false, error: "Pick a date within the next 90 days" };
    const provider = await getProvider();
    const location = await provider.getLocation(z.string().min(1).parse(locationId));
    if (!location) return { ok: false, error: "Location not found" };
    const lead = await addLead({
      offerId: offer.id,
      offerTitle: offer.title,
      profileId: location.id,
      profileTitle: location.title,
      name: b.name,
      email: b.email,
      phone: b.phone || null,
      note: b.note || null,
      meetingAt: at.toISOString(),
      timeZone: b.timeZone || null,
    });
    logAction(b.email, "Booked a meeting", `${location.title} · ${offer.title}`);
    // Not /dashboard: the booking dialog shows its confirmation first and refreshes the page when it closes.
    revalidatePath("/admin", "layout");
    return { ok: true, id: lead.id };
  } catch (e) {
    return e instanceof z.ZodError ? { ok: false, error: e.issues[0]?.message ?? "Check the form" } : fail(e);
  }
}

/** The client asks to cancel their meeting (they can't cancel it themselves); the platform team accepts or declines. */
export async function requestMeetingCancel(leadId: string, reason = ""): Promise<ActionResult> {
  try {
    const lead = await getLead(z.string().min(1).parse(leadId));
    // TODO: check the lead belongs to the signed-in member's workspace once multi-workspace sign-in lands.
    if (!lead || lead.workspaceId !== (await currentWorkspaceId())) return { ok: false, error: "Meeting not found" };
    if (lead.status !== "booked") return { ok: false, error: "This meeting can't be cancelled any more" };
    const why = z.string().trim().max(500).parse(reason);
    // One open request at a time: asking to cancel replaces a pending time change.
    updateLead(lead.id, { cancelRequest: { reason: why || null, requestedAt: new Date().toISOString() }, cancelAnswer: null, changeRequest: null });
    logAction(lead.email, "Asked to cancel meeting", `${lead.profileTitle} · ${lead.offerTitle}${why ? ` — "${why}"` : ""}`);
    revalidatePath("/admin", "layout");
    return { ok: true, id: lead.id };
  } catch (e) {
    return fail(e);
  }
}

/** The client closed the meeting reminder on their Dashboard. */
export async function closeMeetingReminder(leadId: string): Promise<void> {
  const lead = await getLead(String(leadId).slice(0, 200));
  if (!lead || lead.workspaceId !== (await currentWorkspaceId())) return;
  updateLead(lead.id, { reminderClosedAt: new Date().toISOString() });
}

/** The client asks to move their meeting to another free slot; it stays at the booked time until the platform team accepts. */
export async function requestMeetingTime(leadId: string, input: { meetingAt: string; note: string }): Promise<ActionResult> {
  try {
    const lead = await getLead(z.string().min(1).parse(leadId));
    if (!lead || lead.workspaceId !== (await currentWorkspaceId())) return { ok: false, error: "Meeting not found" };
    if (lead.status !== "booked") return { ok: false, error: "This meeting can't be changed any more" };
    const r = z.object({ meetingAt: z.string().datetime({ message: "Pick a date and time" }), note: z.string().trim().max(500) }).parse(input);
    const at = new Date(r.meetingAt);
    if (at.getTime() < Date.now() + 30 * 60_000) return { ok: false, error: "Pick a time at least 30 minutes from now" };
    if (at.getTime() > Date.now() + 90 * 86_400_000) return { ok: false, error: "Pick a date within the next 90 days" };
    if (at.toISOString() === lead.meetingAt) return { ok: false, error: "That's your current time. Pick another one." };
    if (lead.cancelRequest) return { ok: false, error: "You've asked to cancel this meeting. Withdraw that first." };
    updateLead(lead.id, { changeRequest: { at: at.toISOString(), note: r.note || null, requestedAt: new Date().toISOString() }, changeAnswer: null });
    logAction(lead.email, "Asked to move meeting", `${lead.profileTitle} · ${lead.offerTitle}`);
    revalidatePath("/admin", "layout");
    return { ok: true, id: lead.id };
  } catch (e) {
    return e instanceof z.ZodError ? { ok: false, error: e.issues[0]?.message ?? "Check the form" } : fail(e);
  }
}

/** The client withdraws their pending request (time change or cancel). */
export async function withdrawMeetingRequest(leadId: string): Promise<ActionResult> {
  try {
    const lead = await getLead(z.string().min(1).parse(leadId));
    if (!lead || lead.workspaceId !== (await currentWorkspaceId())) return { ok: false, error: "Meeting not found" };
    updateLead(lead.id, { changeRequest: null, cancelRequest: null });
    revalidatePath("/dashboard");
    revalidatePath("/admin", "layout");
    return { ok: true, id: lead.id };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- competitors

/** Read a pasted Google Maps link: the business's public details (name, address, categories, rating, reviews, website) and its
 *  distance from this profile. `place` is null when Google gives nothing usable — the form then stays manual (name from the link). */
export async function readMapsLink(locationId: string, link: string): Promise<{ ok: true; info: MapsLinkInfo; place: ScrapedPlace | null; distanceKm: number | null } | { ok: false; error: string }> {
  const url = z.string().trim().max(2000).safeParse(link);
  if (!url.success || !isMapsUrl(url.data)) return { ok: false, error: "Paste a link from Google Maps (Share → Copy link)" };
  const [info, place, location] = await Promise.all([resolveMapsLink(url.data), scrapeMapsLink(url.data), (await getProvider()).getLocation(z.string().min(1).parse(locationId))]);
  let distanceKm: number | null = null;
  if (place?.lat != null && place.lng != null && location) {
    const here = await lookupCoords(`${location.title}, ${location.address}`);
    if (here) distanceKm = Math.round(distance(here, { lat: place.lat, lng: place.lng }) * 10) / 10;
  }
  return { ok: true, info: place ? { ...info, url: place.mapsUrl || info.url } : info, place, distanceKm };
}

const competitorSchema = z.object({
  name: z.string().trim().min(1, "Add the business name").max(120),
  address: z.string().trim().max(200),
  primaryCategory: z.string().trim().min(1, "Add the main category").max(100),
  additionalCategories: z.array(z.string().trim().min(1).max(100)).max(20),
  rating: z.number().min(1, "Rating is 1 to 5").max(5, "Rating is 1 to 5").nullable(),
  reviewCount: z.number().int().min(0).max(1_000_000),
  websiteUri: z
    .string()
    .trim()
    .url("Enter a full website link (https://…)")
    .nullable()
    .or(z.literal("").transform(() => null)),
  mapsUrl: z.string().trim().max(2000).nullable(),
  cid: z.string().trim().max(40).nullable(),
  distanceKm: z.number().min(0).max(40_000).nullable(),
});

export async function addCompetitor(locationId: string, input: z.input<typeof competitorSchema>): Promise<ActionResult> {
  try {
    const r = competitorSchema.safeParse(input);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check the details" };
    const c = await (await getProvider()).addCompetitor(z.string().min(1).parse(locationId), r.data);
    revalidatePath("/competitors");
    revalidatePath("/audit");
    return { ok: true, id: c.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateCompetitor(locationId: string, competitorId: string, input: z.input<typeof competitorSchema>): Promise<ActionResult> {
  try {
    const r = competitorSchema.safeParse(input);
    if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Check the details" };
    const c = await (await getProvider()).updateCompetitor(z.string().min(1).parse(locationId), z.string().min(1).parse(competitorId), r.data);
    revalidatePath("/competitors");
    revalidatePath("/audit");
    return { ok: true, id: c.id };
  } catch (e) {
    return fail(e);
  }
}

/** Remove a competitor from the comparison (hidden = true) or bring it back. */
export async function setCompetitorHidden(locationId: string, competitorId: string, hidden: boolean): Promise<ActionResult> {
  try {
    const id = z.string().min(1).parse(competitorId);
    await (await getProvider()).setCompetitorHidden(z.string().min(1).parse(locationId), id, z.boolean().parse(hidden));
    revalidatePath("/competitors");
    revalidatePath("/audit");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Delete a competitor you added (found ones are removed with setCompetitorHidden). */
export async function deleteCompetitor(locationId: string, competitorId: string): Promise<ActionResult> {
  try {
    const id = z.string().min(1).parse(competitorId);
    await (await getProvider()).deleteCompetitor(z.string().min(1).parse(locationId), id);
    revalidatePath("/competitors");
    revalidatePath("/audit");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** "Check now": re-read this business's added competitors from Google right away (one at a time, so it can take a little while). */
export async function checkCompetitorsNow(locationId: string): Promise<{ ok: true; checked: number; updated: number; failed: number } | { ok: false; error: string }> {
  try {
    const r = await refreshCompetitors({ locationId: z.string().min(1).parse(locationId), force: true });
    if (r.skipped === "running") return { ok: false, error: "A check is already running. Try again in a minute." };
    if (r.skipped === "backing_off") return { ok: false, error: "Google isn't answering right now. Checks resume automatically in a few hours." };
    revalidatePath("/competitors");
    return { ok: true, checked: r.checked, updated: r.updated, failed: r.failed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong" };
  }
}

// ---------------------------------------------------------------- report an issue (account menu) → Admin → Issues

/** File a problem or idea for the platform team, from any page. */
export async function reportIssue(input: { category: string; subject: string; description: string; page?: string | null }): Promise<ActionResult> {
  try {
    const d = z
      .object({
        category: z.enum(["bug", "data", "connection", "account", "idea", "other"]),
        subject: z.string().trim().min(3, "Add a short summary").max(120, "Keep the summary under 120 characters"),
        description: z.string().trim().min(10, "Tell us a bit more (what you did and what happened)").max(4000),
        page: z.string().max(500).nullable().optional(),
      })
      .parse(input);
    const me = await (await getProvider()).getCurrentMember();
    const issue = await fileIssue({ ...d, page: d.page ?? null, reporterName: me.name, reporterEmail: me.email });
    logAction(me.email || me.name, "Reported an issue", `${issue.workspaceName} · ${issue.subject}`);
    revalidatePath("/admin", "layout");
    return { ok: true, id: issue.id };
  } catch (e) {
    return { ok: false, error: firstIssue(e) ?? (e instanceof Error ? e.message : "Something went wrong") };
  }
}

/** This workspace's reports with their status and the team's answer (for the Report an issue dialog). */
export async function myIssues() {
  try {
    return await issuesForCurrentWorkspace();
  } catch {
    return [];
  }
}
