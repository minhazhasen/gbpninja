// Live provider (GBP_DATA_SOURCE=google): the workspace provider (mock.ts, which starts empty in live mode) with the Google
// parts replaced by the real APIs, and the whole workspace state saved to SQLite after every call (persist.ts).
//
// Google data, for the locations picked in Settings → Accounts (connection target ids "accounts/{a}/locations/{l}"):
//   Locations  GET/PATCH mybusinessbusinessinformation.googleapis.com/v1/locations/{l}  (cached 15 min, merged in place)
//   Reviews    GET mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews, PUT/DELETE …/reviews/{id}/reply (cached 10 min)
//   Insights   businessprofileperformance.googleapis.com/v1/locations/{l}:fetchMultiDailyMetricsTimeSeries (cached 6 h)
//   Keywords   …/locations/{l}/searchkeywords/impressions/monthly, one call per month (cached 12 h)
//   Posts      GET/POST mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/localPosts (Google channel; others need their apps).
//              Posts made outside the app are imported into the calendar (cached 30 min). Google has no per-post stats any more.
//   Photos     GET mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/media (+ /media/customers), PATCH/DELETE …/media/{id} (cached 30 min)
// Fields Google's API doesn't carry (products, attributes, social links, our review notes) stay in the workspace.
// Until the Cloud project's GBP API access is approved, Google answers quota 0 — surfaced as a readable error (gbpErrorMessage).
import { format, subDays, subMonths } from "date-fns";
import { getSessionUser } from "@/lib/current-user";
import { gbpErrorMessage } from "@/lib/google/business";
import { GoogleApiError, disconnectGoogle, googleAccount, googleFetch } from "@/lib/google/oauth";
import type { KeywordMonth } from "@/lib/keywords";
import { channelMedia, emptyDraft, postStatusFromResults, type Channel, type CtaType, type Post } from "@/lib/posts";
import { publicMediaUrl } from "@/lib/public-media";
import { mockProvider, publishLinkedin, publishMeta, syncPhotoStats, workspace } from "./mock";
import { resolveTenant, saveTenant } from "./tenancy";
import { currentTenant, runInTenant } from "./tenant-context";
import type {
  AttributeDef,
  AttributeValue,
  GbpProvider,
  HoursPeriod,
  Location,
  Member,
  MetricPoint,
  OpenStatus,
  Photo,
  PhotoCategory,
  Review,
  SearchConsoleDevice,
  SearchConsoleMetrics,
  SearchConsoleProperty,
  ServiceItem,
  SocialNetwork,
  StarRating,
  SyncIssue,
} from "./types";

const BI = "https://mybusinessbusinessinformation.googleapis.com/v1";
const V4 = "https://mybusiness.googleapis.com/v4";
const PERF = "https://businessprofileperformance.googleapis.com/v1";
const READ_MASK = "name,title,phoneNumbers,categories,storefrontAddress,websiteUri,regularHours,specialHours,moreHours,serviceArea,openInfo,metadata,profile,serviceItems";

// ---------------------------------------------------------------- cache bookkeeping (kept in the workspace document)
interface GoogleCache {
  /** Last failure per `${locationId}|${area}`; cleared when that area loads again. */
  issues?: Record<string, string>;
  locationsAt?: string;
  reviewsAt?: Record<string, string>;
  photosAt?: Record<string, string>;
  attributesAt?: Record<string, string>;
  /** Google's attribute list per profile (changes rarely): cached a day. */
  attributeMeta?: Record<string, { at: string; defs: AttributeDef[] }>;
  postsAt?: Record<string, string>;
  metrics?: Record<string, { at: string; days: number; points: MetricPoint[] }>;
  keywords?: Record<string, { at: string; months: KeywordMonth[] }>;
}
const cache = () => ((workspace as unknown as { google?: GoogleCache }).google ??= {});
const fresh = (at: string | undefined, minutes: number) => !!at && Date.now() - new Date(at).getTime() < minutes * 60_000;
const now = () => new Date().toISOString();

/** Run a Google call; turn API errors into the plain-words message (quota 0, API disabled…). */
async function g<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    return await googleFetch<T>("gbp", url, init);
  } catch (e) {
    throw new Error(gbpErrorMessage(e));
  }
}

/** Picked locations: "accounts/a/locations/l" → { accountId, id }. */
function picked() {
  const c = workspace.connections.find((x) => x.channel === "google");
  if (!c || c.status !== "connected") return [];
  return c.targets.flatMap((t) => {
    const m = t.id.match(/^(accounts\/[^/]+)\/(locations\/[^/]+)$/);
    return m ? [{ accountId: m[1], id: m[2] }] : [];
  });
}
const accountOf = (locationId: string) => workspace.locations.find((l) => l.id === locationId)?.accountId ?? picked().find((p) => p.id === locationId)?.accountId;

// ---------------------------------------------------------------- mapping Google → ours
type GTime = { hours?: number; minutes?: number };
type GDate = { year?: number; month?: number; day?: number };
const hhmm = (t?: GTime) => `${String(t?.hours ?? 0).padStart(2, "0")}:${String(t?.minutes ?? 0).padStart(2, "0")}`;
const gtime = (s: string): GTime => {
  const [h, m] = s.split(":").map(Number);
  return { hours: h, minutes: m };
};
const ymd = (d?: GDate) =>
  d?.year
    ? [d.year, d.month, d.day]
        .filter(Boolean)
        .map((n, i) => (i ? String(n).padStart(2, "0") : n))
        .join("-")
    : undefined;
const pretty = (id: string) =>
  id
    .replace(/^.*:/, "")
    .replace(/_/g, " ")
    .replace(/^./, (c) => c.toUpperCase());

interface GLocation {
  name: string;
  title?: string;
  phoneNumbers?: { primaryPhone?: string; additionalPhones?: string[] };
  categories?: { primaryCategory?: { name: string; displayName?: string }; additionalCategories?: { name: string; displayName?: string }[] };
  storefrontAddress?: { regionCode?: string; postalCode?: string; administrativeArea?: string; locality?: string; addressLines?: string[] };
  websiteUri?: string;
  regularHours?: { periods?: { openDay: string; openTime?: GTime; closeDay?: string; closeTime?: GTime }[] };
  specialHours?: { specialHourPeriods?: { startDate: GDate; openTime?: GTime; closeTime?: GTime; closed?: boolean }[] };
  moreHours?: { hoursTypeId: string; periods?: { openDay: string; openTime?: GTime; closeDay?: string; closeTime?: GTime }[] }[];
  serviceArea?: { places?: { placeInfos?: { placeName: string }[] } };
  openInfo?: { status?: string; openingDate?: GDate };
  metadata?: { placeId?: string; hasVoiceOfMerchant?: boolean };
  profile?: { description?: string };
  serviceItems?: {
    structuredServiceItem?: { serviceTypeId: string; description?: string };
    freeFormServiceItem?: { category?: string; label?: { displayName?: string; description?: string } };
    price?: { units?: string; nanos?: number; currencyCode?: string };
  }[];
}

const OPEN: Record<string, OpenStatus> = { OPEN: "open", CLOSED_TEMPORARILY: "temporarily_closed", CLOSED_PERMANENTLY: "permanently_closed" };

function toLocation(gl: GLocation, accountId: string, prev?: Location): Location {
  const a = gl.storefrontAddress;
  const address = a ? [a.addressLines?.join(", "), a.locality, [a.administrativeArea, a.postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";
  const services: ServiceItem[] = (gl.serviceItems ?? []).flatMap((s) => {
    const price = s.price?.units ? Number(s.price.units) + (s.price.nanos ?? 0) / 1e9 : undefined;
    const currencyCode = s.price?.currencyCode;
    if (s.freeFormServiceItem?.label?.displayName)
      return [{ name: s.freeFormServiceItem.label.displayName, description: s.freeFormServiceItem.label.description, price, currencyCode, priceType: price != null ? ("fixed" as const) : undefined }];
    if (s.structuredServiceItem)
      return [
        {
          name: pretty(s.structuredServiceItem.serviceTypeId),
          description: s.structuredServiceItem.description,
          price,
          currencyCode,
          serviceTypeId: s.structuredServiceItem.serviceTypeId,
          priceType: price != null ? ("fixed" as const) : undefined,
        },
      ];
    return [];
  });
  const regularHours: HoursPeriod[] = (gl.regularHours?.periods ?? []).map((p) => ({ day: p.openDay, open: hhmm(p.openTime), close: hhmm(p.closeTime) }));
  return {
    // Kept from the last sync (attributes, links and photos come from their own Google calls), Google's fields on top.
    products: prev?.products,
    notInApi: ["products"],
    attributes: prev?.attributes ?? [],
    attributeCatalog: prev?.attributeCatalog,
    attributeValues: prev?.attributeValues,
    photos: prev?.photos,
    photoCount: prev?.photoCount ?? 0,
    hasLogo: prev?.hasLogo ?? false,
    hasCoverPhoto: prev?.hasCoverPhoto ?? false,
    socialProfiles: prev?.socialProfiles,
    chatUri: prev?.chatUri,
    appointmentUri: prev?.appointmentUri,
    moreHours: (gl.moreHours ?? []).map((h) => ({
      type: pretty(h.hoursTypeId.toLowerCase()),
      typeId: h.hoursTypeId,
      periods: (h.periods ?? []).map((p) => ({ day: p.openDay, open: hhmm(p.openTime), close: hhmm(p.closeTime) })),
    })),
    id: gl.name,
    accountId,
    title: gl.title ?? "",
    primaryCategory: gl.categories?.primaryCategory?.displayName ?? "",
    additionalCategories: (gl.categories?.additionalCategories ?? []).map((c) => c.displayName ?? pretty(c.name)),
    description: gl.profile?.description,
    openingDate: ymd(gl.openInfo?.openingDate),
    phone: gl.phoneNumbers?.primaryPhone,
    additionalPhones: gl.phoneNumbers?.additionalPhones,
    websiteUri: gl.websiteUri,
    address,
    postalAddress: a
      ? { regionCode: a.regionCode ?? "", addressLines: a.addressLines ?? [], locality: a.locality ?? "", administrativeArea: a.administrativeArea ?? "", postalCode: a.postalCode ?? "" }
      : undefined,
    hideAddress: !a,
    serviceArea: gl.serviceArea?.places?.placeInfos?.map((p) => p.placeName),
    openStatus: gl.openInfo?.status ? (OPEN[gl.openInfo.status] ?? "open") : "open",
    regularHours,
    specialHours: (gl.specialHours?.specialHourPeriods ?? []).flatMap((p) => {
      const date = ymd(p.startDate);
      return date ? [{ date, closed: !!p.closed, open: p.openTime ? hhmm(p.openTime) : undefined, close: p.closeTime ? hhmm(p.closeTime) : undefined }] : [];
    }),
    services,
    verified: !!gl.metadata?.hasVoiceOfMerchant,
    placeId: gl.metadata?.placeId,
  };
}

const STARS: Record<string, StarRating> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
interface GReview {
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating?: string;
  comment?: string;
  createTime: string;
  reviewReply?: { comment: string; updateTime: string };
}

// ---------------------------------------------------------------- refresh
/** Re-read the picked locations from Google (in place, so mock.ts keeps its references). */
async function refreshLocations(force = false) {
  const c = cache();
  const targets = picked();
  if (!targets.length) {
    workspace.locations.splice(0, workspace.locations.length);
    return;
  }
  if (!force && fresh(c.locationsAt, 15) && targets.every((t) => workspace.locations.some((l) => l.id === t.id))) return;
  const next: Location[] = [];
  for (const t of targets) {
    const gl = await g<GLocation>(`${BI}/${t.id}?readMask=${READ_MASK}`);
    next.push(
      toLocation(
        gl,
        t.accountId,
        workspace.locations.find((l) => l.id === t.id),
      ),
    );
  }
  workspace.locations.splice(0, workspace.locations.length, ...next);
  c.locationsAt = now();
}

async function refreshReviews(locationId: string, force = false) {
  const c = cache();
  c.reviewsAt ??= {};
  if (!force && fresh(c.reviewsAt[locationId], 10) && workspace.reviews.has(locationId)) return;
  const accountId = accountOf(locationId);
  if (!accountId) return;
  const prev = new Map((workspace.reviews.get(locationId) ?? []).map((r) => [r.id, r]));
  const out: Review[] = [];
  let page = "";
  // Every review, newest first (Google pages 50 at a time). 100 pages = 5,000 reviews is only a safety stop.
  for (let i = 0; i < 100; i++) {
    const r = await g<{ reviews?: GReview[]; nextPageToken?: string }>(`${V4}/${accountId}/${locationId}/reviews?pageSize=50&orderBy=updateTime%20desc${page && `&pageToken=${page}`}`);
    for (const gr of r.reviews ?? []) {
      const old = prev.get(gr.reviewId);
      out.push({
        id: gr.reviewId,
        locationId,
        reviewer: gr.reviewer?.isAnonymous ? "A Google user" : (gr.reviewer?.displayName ?? "A Google user"),
        reviewerPhoto: gr.reviewer?.profilePhotoUrl ?? null,
        rating: STARS[gr.starRating ?? ""] ?? 5,
        comment: gr.comment,
        createTime: gr.createTime,
        reply: gr.reviewReply ? { comment: gr.reviewReply.comment, updateTime: gr.reviewReply.updateTime } : undefined,
        // Ours, kept across refreshes.
        assignedTo: old?.assignedTo ?? null,
        hidden: old?.hidden,
        followUp: old?.followUp ?? null,
      });
    }
    page = r.nextPageToken ?? "";
    if (!page) break;
  }
  workspace.reviews.set(locationId, out);
  c.reviewsAt[locationId] = now();
}

// ---------------------------------------------------------------- attributes (Business Information)
// Values: GET {BI}/locations/{l}/attributes. What can be set for this profile (labels, groups, options): GET {BI}/attributes?parent=…
// Social links and the booking link are URL attributes on Google, so they come from here too.
interface GAttr {
  name: string;
  valueType?: string;
  values?: unknown[];
  repeatedEnumValue?: { setValues?: string[]; unsetValues?: string[] };
  uriValues?: { uri: string }[];
}
interface GAttrMeta {
  parent: string;
  valueType?: string;
  displayName?: string;
  groupDisplayName?: string;
  deprecated?: boolean;
  valueMetadata?: { value: unknown; displayName?: string }[];
}
const SOCIAL_ATTR: Record<SocialNetwork, string> = {
  facebook: "url_facebook",
  instagram: "url_instagram",
  linkedin: "url_linkedin",
  pinterest: "url_pinterest",
  tiktok: "url_tiktok",
  x: "url_twitter",
  youtube: "url_youtube",
};
const APPOINTMENT_ATTR = "url_appointment";
/** Chat links Google offers (by region): WhatsApp, then text messaging. */
const CHAT_ATTRS = ["url_whatsapp", "url_text_messaging"];
/** Shown in Contact (social / booking / chat), not in the attributes list. */
const LINK_ATTRS = new Set([...Object.values(SOCIAL_ATTR), APPOINTMENT_ATTR, ...CHAT_ATTRS]);
/** Currency for a new price when the profile has no priced service yet. */
const CURRENCY: Record<string, string> = {
  US: "USD",
  CA: "CAD",
  GB: "GBP",
  AU: "AUD",
  NZ: "NZD",
  IE: "EUR",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  QA: "QAR",
  AE: "AED",
  SA: "SAR",
  IN: "INR",
  BD: "BDT",
  PK: "PKR",
  SG: "SGD",
  MY: "MYR",
};
const ATTR_TYPE: Record<string, AttributeDef["type"]> = { BOOL: "bool", ENUM: "enum", REPEATED_ENUM: "repeated_enum", URL: "url" };
const attrId = (name: string) => name.replace(/^.*attributes\//, "");
const isSet = (v: AttributeValue | undefined) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? !!v : v !== undefined);

async function attributeDefs(loc: Location): Promise<AttributeDef[]> {
  const c = (cache().attributeMeta ??= {});
  if (fresh(c[loc.id]?.at, 1440)) return c[loc.id].defs;
  const metas: GAttrMeta[] = [];
  let page = "";
  for (let i = 0; i < 5; i++) {
    const r = await g<{ attributeMetadata?: GAttrMeta[]; nextPageToken?: string }>(
      // With `parent`, Google rejects languageCode / regionCode / categoryName ("invalid argument").
      `${BI}/attributes?parent=${loc.id}&pageSize=200${page && `&pageToken=${page}`}`,
    );
    metas.push(...(r.attributeMetadata ?? []));
    page = r.nextPageToken ?? "";
    if (!page) break;
  }
  const defs = metas.flatMap((m): AttributeDef[] => {
    const type = ATTR_TYPE[m.valueType ?? ""];
    if (!type || m.deprecated) return [];
    const id = attrId(m.parent);
    return [
      {
        id,
        label: m.displayName || pretty(id),
        group: m.groupDisplayName || "Other",
        type,
        options: m.valueMetadata?.length ? m.valueMetadata.map((v) => ({ value: String(v.value), label: v.displayName || String(v.value) })) : undefined,
      },
    ];
  });
  c[loc.id] = { at: now(), defs };
  return defs;
}

/** This profile's attributes, social links and booking link exactly as Google has them. */
async function refreshAttributes(loc: Location, force = false) {
  const c = cache();
  c.attributesAt ??= {};
  if (!force && fresh(c.attributesAt[loc.id], 30)) return;
  const defs = await attributeDefs(loc);
  const r = await g<{ attributes?: GAttr[] }>(`${BI}/${loc.id}/attributes`);
  const values: Record<string, AttributeValue> = {};
  for (const a of r.attributes ?? []) {
    const id = attrId(a.name);
    const type = ATTR_TYPE[a.valueType ?? ""] ?? defs.find((d) => d.id === id)?.type;
    if (type === "bool" && typeof a.values?.[0] === "boolean") values[id] = a.values[0];
    else if (type === "enum" && a.values?.[0] != null) values[id] = String(a.values[0]);
    else if (type === "repeated_enum") values[id] = a.repeatedEnumValue?.setValues ?? [];
    else if (type === "url" && a.uriValues?.[0]?.uri) values[id] = a.uriValues[0].uri;
  }
  applyAttributes(loc, defs, values);
  c.attributesAt[loc.id] = now();
}

function applyAttributes(loc: Location, defs: AttributeDef[], values: Record<string, AttributeValue>) {
  loc.attributeCatalog = defs.filter((d) => !LINK_ATTRS.has(d.id));
  loc.attributeValues = values;
  // "Set" = answered on Google (a "No" counts: the customer gets an answer).
  loc.attributes = Object.keys(values).filter((id) => !LINK_ATTRS.has(id) && isSet(values[id]));
  const social: Location["socialProfiles"] = {};
  for (const [net, id] of Object.entries(SOCIAL_ATTR) as [SocialNetwork, string][]) if (typeof values[id] === "string") social[net] = values[id] as string;
  loc.socialProfiles = social;
  loc.appointmentUri = typeof values[APPOINTMENT_ATTR] === "string" ? (values[APPOINTMENT_ATTR] as string) : undefined;
  const chat = CHAT_ATTRS.map((id) => values[id]).find((v) => typeof v === "string");
  loc.chatUri = typeof chat === "string" ? chat : undefined;
}

/** Write changed attribute values to Google (PATCH with an attributeMask; a masked attribute left out is cleared). */
async function pushAttributes(loc: Location, next: Record<string, AttributeValue | undefined>) {
  const prev = loc.attributeValues ?? {};
  const defs = await attributeDefs(loc);
  const changed = [...new Set([...Object.keys(next)])].filter((id) => JSON.stringify(prev[id]) !== JSON.stringify(next[id]));
  if (!changed.length) return;
  const attributes = changed.flatMap((id): GAttr[] => {
    const v = next[id];
    const type = defs.find((d) => d.id === id)?.type;
    if (!type) throw new Error(`Google doesn't offer “${pretty(id)}” for this profile`);
    if (!isSet(v)) return [];
    const name = `attributes/${id}`;
    if (type === "bool") return [{ name, valueType: "BOOL", values: [v] }];
    if (type === "enum") return [{ name, valueType: "ENUM", values: [v] }];
    if (type === "repeated_enum") return [{ name, valueType: "REPEATED_ENUM", repeatedEnumValue: { setValues: v as string[] } }];
    return [{ name, valueType: "URL", uriValues: [{ uri: String(v) }] }];
  });
  await g(`${BI}/${loc.id}/attributes?attributeMask=${changed.map((id) => `attributes/${id}`).join(",")}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `${loc.id}/attributes`, attributes }),
  });
  const merged: Record<string, AttributeValue> = { ...prev };
  for (const id of changed) {
    const v = next[id];
    if (isSet(v)) merged[id] = v as AttributeValue;
    else delete merged[id];
  }
  applyAttributes(loc, defs, merged);
}

// ---------------------------------------------------------------- photos (v4 media)
interface GMedia {
  name: string;
  mediaFormat?: "PHOTO" | "VIDEO";
  locationAssociation?: { category?: string };
  googleUrl?: string;
  thumbnailUrl?: string;
  createTime?: string;
  dimensions?: { widthPixels?: number; heightPixels?: number };
  insights?: { viewCount?: string };
}
/** Google media categories → ours (PROFILE is the profile photo Google shows next to the name, i.e. the logo slot). */
const MEDIA_CATEGORY: Record<string, PhotoCategory> = {
  COVER: "cover",
  PROFILE: "logo",
  LOGO: "logo",
  EXTERIOR: "exterior",
  INTERIOR: "interior",
  PRODUCT: "product",
  AT_WORK: "at_work",
  TEAMS: "team",
  FOOD_AND_DRINK: "food_and_drink",
  MENU: "food_and_drink",
  COMMON_AREA: "common_area",
  ROOMS: "common_area",
};
const GOOGLE_CATEGORY: Record<PhotoCategory, string> = {
  cover: "COVER",
  logo: "LOGO",
  exterior: "EXTERIOR",
  interior: "INTERIOR",
  product: "PRODUCT",
  at_work: "AT_WORK",
  team: "TEAMS",
  food_and_drink: "FOOD_AND_DRINK",
  common_area: "COMMON_AREA",
  additional: "ADDITIONAL",
};

const toPhoto = (m: GMedia, fromCustomer: boolean): Photo | null => {
  const url = m.googleUrl ?? m.thumbnailUrl;
  if (m.mediaFormat === "VIDEO" || !url) return null;
  return {
    id: m.name.split("/").pop() ?? m.name,
    googleName: m.name,
    url,
    // Customer photos have no category of ours; Google files them separately.
    category: fromCustomer ? "additional" : (MEDIA_CATEGORY[m.locationAssociation?.category ?? ""] ?? "additional"),
    width: m.dimensions?.widthPixels,
    height: m.dimensions?.heightPixels,
    createdAt: m.createTime ?? now(),
    fromCustomer,
    views: m.insights?.viewCount != null ? Number(m.insights.viewCount) : null,
  };
};

/** The owner's photos and customers' photos from Google; photos uploaded here but not on Google yet (data: URLs) are kept. */
async function refreshPhotos(locationId: string, force = false) {
  const c = cache();
  c.photosAt ??= {};
  if (!force && fresh(c.photosAt[locationId], 30)) return;
  const accountId = accountOf(locationId);
  const loc = workspace.locations.find((l) => l.id === locationId);
  if (!accountId || !loc) return;
  const owner: Photo[] = [];
  let page = "";
  for (let i = 0; i < 4; i++) {
    const r = await g<{ mediaItems?: GMedia[]; nextPageToken?: string }>(`${V4}/${accountId}/${locationId}/media?pageSize=100${page && `&pageToken=${page}`}`);
    for (const m of r.mediaItems ?? []) {
      const p = toPhoto(m, false);
      if (p) owner.push(p);
    }
    page = r.nextPageToken ?? "";
    if (!page) break;
  }
  // Customer photos are a bonus: a failure there shouldn't hide the owner's photos.
  let customers: Photo[] = [];
  try {
    const r = await g<{ mediaItems?: GMedia[] }>(`${V4}/${accountId}/${locationId}/media/customers?pageSize=100`);
    customers = (r.mediaItems ?? []).flatMap((m) => toPhoto(m, true) ?? []);
  } catch {
    customers = (loc.photos ?? []).filter((p) => p.fromCustomer);
  }
  const localOnly = (loc.photos ?? []).filter((p) => !p.googleName);
  // Logo / cover are single slots on Google: keep the newest of each.
  const newest = (cat: PhotoCategory) => owner.filter((p) => p.category === cat).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const slots = new Set([newest("logo")?.id, newest("cover")?.id]);
  loc.photos = [...owner.filter((p) => (p.category !== "logo" && p.category !== "cover") || slots.has(p.id)), ...customers, ...localOnly];
  syncPhotoStats(loc);
  c.photosAt[locationId] = now();
}

// ---------------------------------------------------------------- posts made on Google (v4 localPosts)
interface GLocalPost {
  name: string;
  summary?: string;
  topicType?: "STANDARD" | "EVENT" | "OFFER" | "ALERT";
  state?: "LIVE" | "REJECTED" | "PROCESSING";
  createTime: string;
  updateTime?: string;
  searchUrl?: string;
  callToAction?: { actionType?: string; url?: string };
  media?: { googleUrl?: string; sourceUrl?: string; mediaFormat?: string }[];
  event?: { title?: string; schedule?: { startDate?: GDate; endDate?: GDate } };
  offer?: { couponCode?: string; redeemOnlineUrl?: string; termsConditions?: string };
}
const CTAS = new Set(["BOOK", "ORDER", "SHOP", "LEARN_MORE", "SIGN_UP", "CALL"]);

/** Google posts not made in this app → read-only "imported" posts in the calendar (updated in place on later syncs). */
async function importGooglePosts(locationId: string, force = false) {
  const c = cache();
  c.postsAt ??= {};
  if (!force && fresh(c.postsAt[locationId], 30)) return;
  const accountId = accountOf(locationId);
  if (!accountId) return;
  // Posts published from the app carry Google's ids; don't import those again.
  const ours = new Set(workspace.posts.flatMap((p) => (p.imported ? [] : (p.results?.google?.external_ids ?? []))));
  let page = "";
  for (let i = 0; i < 3; i++) {
    const r = await g<{ localPosts?: GLocalPost[]; nextPageToken?: string }>(`${V4}/${accountId}/${locationId}/localPosts?pageSize=100${page && `&pageToken=${page}`}`);
    for (const lp of r.localPosts ?? []) {
      if (ours.has(lp.name)) continue;
      const id = `gpost_${lp.name.split("/").pop()}`;
      const text = lp.summary ?? "";
      const draft = emptyDraft();
      const type = lp.topicType === "EVENT" ? "event" : lp.topicType === "OFFER" ? "offer" : "update";
      const start = ymd(lp.event?.schedule?.startDate) ?? "";
      const end = ymd(lp.event?.schedule?.endDate) ?? "";
      const cta = lp.callToAction?.actionType && CTAS.has(lp.callToAction.actionType) ? (lp.callToAction.actionType as CtaType) : "none";
      const failed = lp.state === "REJECTED";
      const post: Post = {
        ...draft,
        id,
        title: lp.event?.title || text.split("\n")[0].slice(0, 60) || "Google post",
        body: text,
        channels: ["google"],
        media: (lp.media ?? []).flatMap((m) => {
          const url = m.googleUrl ?? m.sourceUrl;
          return url ? [{ url, type: m.mediaFormat === "VIDEO" ? ("video" as const) : ("image" as const) }] : [];
        }),
        google: {
          ...draft.google,
          type,
          text,
          locations: [locationId],
          cta: { type: cta, url: lp.callToAction?.url ?? "" },
          event: type === "event" ? { title: lp.event?.title ?? "", start, end } : draft.google.event,
          offer:
            type === "offer"
              ? { title: lp.event?.title ?? "", start, end, coupon: lp.offer?.couponCode ?? "", url: lp.offer?.redeemOnlineUrl ?? "", terms: lp.offer?.termsConditions ?? "" }
              : draft.google.offer,
        },
        status: failed ? "failed" : "published",
        scheduled_at: lp.createTime,
        published_at: lp.createTime,
        created_at: lp.createTime,
        updated_at: lp.updateTime,
        results: {
          google: failed
            ? { status: "failed", error: "Google rejected this post", external_ids: [lp.name] }
            : { status: "published", posted_at: lp.createTime, permalink: lp.searchUrl ?? null, external_ids: [lp.name] },
        },
        imported: { channel: "google", external_id: lp.name },
      };
      const at = workspace.posts.findIndex((p) => p.id === id);
      if (at >= 0) workspace.posts[at] = { ...post, label: workspace.posts[at].label, note: workspace.posts[at].note };
      else workspace.posts.push(post);
    }
    page = r.nextPageToken ?? "";
    if (!page) break;
  }
  c.postsAt[locationId] = now();
}

const METRICS = {
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "search",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "search",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "maps",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "maps",
  CALL_CLICKS: "calls",
  WEBSITE_CLICKS: "website",
  BUSINESS_DIRECTION_REQUESTS: "directions",
} as const;

async function fetchMetrics(locationId: string, days: number): Promise<MetricPoint[]> {
  const end = new Date();
  const start = subDays(end, days - 1);
  const p = new URLSearchParams();
  for (const m of Object.keys(METRICS)) p.append("dailyMetrics", m);
  p.set("dailyRange.start_date.year", String(start.getFullYear()));
  p.set("dailyRange.start_date.month", String(start.getMonth() + 1));
  p.set("dailyRange.start_date.day", String(start.getDate()));
  p.set("dailyRange.end_date.year", String(end.getFullYear()));
  p.set("dailyRange.end_date.month", String(end.getMonth() + 1));
  p.set("dailyRange.end_date.day", String(end.getDate()));
  type Series = { dailyMetric: keyof typeof METRICS; timeSeries?: { datedValues?: { date: GDate; value?: string }[] } };
  const r = await g<{ multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: Series[] }[] }>(`${PERF}/${locationId}:fetchMultiDailyMetricsTimeSeries?${p}`);
  const byDay = new Map<string, MetricPoint>();
  for (let d = 0; d < days; d++) {
    const date = format(subDays(end, days - 1 - d), "yyyy-MM-dd");
    byDay.set(date, { date, impressions: 0, searchImpressions: 0, mapsImpressions: 0, calls: 0, websiteClicks: 0, directions: 0 });
  }
  for (const group of r.multiDailyMetricTimeSeries ?? [])
    for (const s of group.dailyMetricTimeSeries ?? [])
      for (const v of s.timeSeries?.datedValues ?? []) {
        const pt = byDay.get(ymd(v.date) ?? "");
        if (!pt) continue;
        const n = Number(v.value ?? 0);
        const kind = METRICS[s.dailyMetric];
        if (kind === "search") pt.searchImpressions += n;
        else if (kind === "maps") pt.mapsImpressions += n;
        else if (kind === "calls") pt.calls += n;
        else if (kind === "website") pt.websiteClicks += n;
        else pt.directions += n;
        pt.impressions = pt.searchImpressions + pt.mapsImpressions;
      }
  return [...byDay.values()];
}

const emptyMetrics = (days: number): MetricPoint[] =>
  Array.from({ length: days }, (_, i) => ({
    date: format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd"),
    impressions: 0,
    searchImpressions: 0,
    mapsImpressions: 0,
    calls: 0,
    websiteClicks: 0,
    directions: 0,
  }));

async function fetchKeywords(locationId: string): Promise<KeywordMonth[]> {
  const months: KeywordMonth[] = [];
  // Last 6 full months, newest first (Google publishes a month's keywords a few days after it ends).
  for (let i = 1; i <= 6; i++) {
    const m = subMonths(new Date(), i);
    const q = `monthlyRange.start_month.year=${m.getFullYear()}&monthlyRange.start_month.month=${m.getMonth() + 1}&monthlyRange.end_month.year=${m.getFullYear()}&monthlyRange.end_month.month=${m.getMonth() + 1}&pageSize=100`;
    const r = await g<{ searchKeywordsCounts?: { searchKeyword: string; insightsValue?: { value?: string; threshold?: string } }[] }>(`${PERF}/${locationId}/searchkeywords/impressions/monthly?${q}`);
    months.push({
      month: format(m, "yyyy-MM"),
      locationId,
      keywords: (r.searchKeywordsCounts ?? []).map((k) => ({
        keyword: k.searchKeyword,
        impressions: k.insightsValue?.value != null ? Number(k.insightsValue.value) : null,
        threshold: k.insightsValue?.threshold != null ? Number(k.insightsValue.threshold) : null,
      })),
    });
  }
  return months;
}

/** Category resource name for a display name (Business Information categories.list). */
async function categoryId(displayName: string, regionCode: string) {
  const r = await g<{ categories?: { name: string; displayName: string }[] }>(
    `${BI}/categories?regionCode=${regionCode || "US"}&languageCode=en&view=BASIC&filter=${encodeURIComponent(`displayName="${displayName}"`)}&pageSize=10`,
  );
  const hit = r.categories?.find((c) => c.displayName.toLowerCase() === displayName.toLowerCase()) ?? r.categories?.[0];
  if (!hit) throw new Error(`Google has no category called “${displayName}”`);
  return hit.name;
}

// ---------------------------------------------------------------- the signed-in person
/**
 * The signed-in user's member record in their own workspace (tenancy.ts puts every signed-in person in exactly one: the one
 * they were invited to, or a new one they own). Accepting an invite happens here, on their first sign-in.
 */
export async function liveMember(): Promise<Member | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const tenant = currentTenant() ?? (await resolveTenant());
  if (!tenant) return null;
  return runInTenant(tenant, () => {
    const email = user.email.toLowerCase();
    const m = workspace.members.find((x) => x.email.toLowerCase() === email);
    if (!m) return null;
    const at = now();
    if (m.status === "invited") Object.assign(m, { status: "active", joinedAt: at, inviteToken: null, name: m.name || user.name || email.split("@")[0] });
    Object.assign(m, { lastActiveAt: at, googleAvatarUrl: user.picture ?? m.googleAvatarUrl ?? null });
    saveTenant(tenant);
    return m;
  });
}

/** Load one area of one profile; on failure remember why (shown on the page) and fall back instead of breaking the page. */
async function guard<T>(locationId: string, area: SyncIssue["area"], load: () => Promise<T>, fallback: T): Promise<T> {
  const issues = (cache().issues ??= {});
  try {
    const out = await load();
    delete issues[`${locationId}|${area}`];
    return out;
  } catch (e) {
    const loc = workspace.locations.find((l) => l.id === locationId);
    const msg = e instanceof Error ? e.message : String(e);
    // Google gives no insights / keywords for unverified profiles (403 PERMISSION_DENIED).
    issues[`${locationId}|${area}`] =
      loc && !loc.verified && (area === "insights" || area === "keywords")
        ? `Google doesn't share ${area === "insights" ? "performance data" : "search keywords"} for unverified profiles. Verify this profile in Google Business Profile.`
        : msg;
    return fallback;
  }
}

// ---------------------------------------------------------------- Search Console (webmasters/v3)
const SC = "https://www.googleapis.com/webmasters/v3";
type ScRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function sc<T>(url: string, init?: RequestInit): Promise<T> {
  try {
    return await googleFetch<T>("searchconsole", url, init);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) throw new Error("The Google Search Console API isn't turned on for this app's Google Cloud project yet.");
    if (/insufficient|scope/i.test(msg)) throw new Error("Google didn't grant Search Console access. Connect Search Console again and allow it.");
    throw new Error(msg);
  }
}

/** Properties the connected account can see (verified ones only). */
async function scProperties(): Promise<SearchConsoleProperty[]> {
  const r = await sc<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(`${SC}/sites`);
  return (r.siteEntry ?? [])
    .filter((s) => s.permissionLevel !== "siteUnverifiedUser")
    .map((s) => ({ siteUrl: s.siteUrl, permission: (["siteOwner", "siteFullUser"].includes(s.permissionLevel) ? s.permissionLevel : "siteRestrictedUser") as SearchConsoleProperty["permission"] }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

async function scQuery(siteUrl: string, body: Record<string, unknown>): Promise<ScRow[]> {
  const r = await sc<{ rows?: ScRow[] }>(`${SC}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataState: "final", ...body }),
  });
  return r.rows ?? [];
}

const metricsOf = (r: ScRow): SearchConsoleMetrics => ({ clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: Math.round(r.position * 10) / 10 });
const zeroMetrics = (): SearchConsoleMetrics => ({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
/** The same number of days right before `from`. */
function previousRange(from: string, to: string) {
  const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
  const end = new Date(new Date(`${from}T00:00:00Z`).getTime() - 86_400_000);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
/** Every day of the range (Search Console leaves out days without impressions). */
function fillDays(from: string, to: string, rows: ScRow[]) {
  const byDay = new Map(rows.map((r) => [r.keys![0], metricsOf(r)]));
  const out: ({ date: string } & SearchConsoleMetrics)[] = [];
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const date = d.toISOString().slice(0, 10);
    out.push({ date, ...(byDay.get(date) ?? zeroMetrics()) });
  }
  return out;
}

// ---------------------------------------------------------------- provider
/** Location fields saved on Google (everything else in a patch is kept in the workspace only). */
const GOOGLE_FIELDS = [
  "title",
  "description",
  "websiteUri",
  "phone",
  "additionalPhones",
  "regularHours",
  "moreHours",
  "openingDate",
  "openStatus",
  "primaryCategory",
  "additionalCategories",
  "postalAddress",
  "address",
  "specialHours",
  "services",
  "chatUri",
  // Attributes on Google (see pushAttributes).
  "attributes",
  "attributeValues",
  "socialProfiles",
  "appointmentUri",
] as const;
/** Google's hoursTypeId for a label we didn't read from Google ("Happy hours" → "HAPPY_HOURS"). */
const hoursTypeId = (label: string) =>
  label
    .toUpperCase()
    .replace(/[^A-Z]+/g, "_")
    .replace(/^_|_$/g, "");
const live: Partial<GbpProvider> = {
  async listLocations() {
    if (!(await googleAccount("gbp"))) return [];
    await refreshLocations();
    for (const l of workspace.locations) {
      await guard(l.id, "attributes", () => refreshAttributes(l), undefined);
      await guard(l.id, "photos", () => refreshPhotos(l.id), undefined);
    }
    return workspace.locations;
  },
  async getLocation(id) {
    if (!workspace.locations.some((l) => l.id === id)) await live.listLocations!();
    return workspace.locations.find((l) => l.id === id) ?? null;
  },
  async updateLocation(id, patch) {
    const loc = workspace.locations.find((l) => l.id === id);
    if (!loc) throw new Error(`Location not found: ${id}`);
    // Push what Google's API carries; the rest (products, attributes, photos, social links…) is ours.
    const body: Record<string, unknown> = {};
    const mask: string[] = [];
    if (patch.title !== undefined) {
      body.title = patch.title;
      mask.push("title");
    }
    if (patch.description !== undefined) {
      body.profile = { description: patch.description ?? "" };
      mask.push("profile.description");
    }
    if (patch.websiteUri !== undefined) {
      body.websiteUri = patch.websiteUri || "";
      mask.push("websiteUri");
    }
    if (patch.phone !== undefined || patch.additionalPhones !== undefined) {
      body.phoneNumbers = { primaryPhone: patch.phone ?? loc.phone ?? "", additionalPhones: patch.additionalPhones ?? loc.additionalPhones ?? [] };
      mask.push("phoneNumbers");
    }
    if (patch.regularHours !== undefined) {
      body.regularHours = { periods: (patch.regularHours ?? []).map((p) => ({ openDay: p.day, openTime: gtime(p.open), closeDay: p.day, closeTime: gtime(p.close) })) };
      mask.push("regularHours");
    }
    // Google only accepts service areas as Google places (place ids) — not editable here yet.
    if (
      (patch.serviceArea !== undefined && JSON.stringify(patch.serviceArea ?? []) !== JSON.stringify(loc.serviceArea ?? [])) ||
      (patch.hideAddress !== undefined && patch.hideAddress !== !!loc.hideAddress)
    )
      throw new Error("Change the service area in Google Business Profile — Google needs places picked from its own list.");
    if (patch.postalAddress !== undefined && patch.postalAddress) {
      const a = patch.postalAddress;
      body.storefrontAddress = { regionCode: a.regionCode, addressLines: a.addressLines.filter(Boolean), locality: a.locality, administrativeArea: a.administrativeArea, postalCode: a.postalCode };
      mask.push("storefrontAddress");
    }
    if (patch.specialHours !== undefined) {
      const ymdParts = (d: string) => {
        const [year, month, day] = d.split("-").map(Number);
        return { year, month, day };
      };
      body.specialHours = {
        specialHourPeriods: (patch.specialHours ?? []).map((h) => ({
          startDate: ymdParts(h.date),
          endDate: ymdParts(h.date),
          ...(h.closed ? { closed: true } : { openTime: gtime(h.open ?? "09:00"), closeTime: gtime(h.close ?? "17:00") }),
        })),
      };
      mask.push("specialHours");
    }
    if (patch.services !== undefined) {
      const region = loc.postalAddress?.regionCode ?? "US";
      const known = (patch.services ?? []).find((s) => s.currencyCode)?.currencyCode ?? loc.services.find((s) => s.currencyCode)?.currencyCode ?? CURRENCY[region];
      const ids = new Map<string, string>();
      const catId = async (name: string) => ids.get(name) ?? ids.set(name, await categoryId(name, region)).get(name)!;
      body.serviceItems = await Promise.all(
        (patch.services ?? []).map(async (s) => {
          if (s.price != null && !(s.currencyCode ?? known)) throw new Error("Add one price in Google Business Profile first so the app knows your currency.");
          const price = s.price != null ? { currencyCode: s.currencyCode ?? known, units: String(Math.trunc(s.price)), nanos: Math.round((s.price - Math.trunc(s.price)) * 1e9) } : undefined;
          return s.serviceTypeId
            ? { structuredServiceItem: { serviceTypeId: s.serviceTypeId, description: s.description || undefined }, ...(price ? { price } : {}) }
            : {
                freeFormServiceItem: { category: await catId(s.category || loc.primaryCategory), label: { displayName: s.name, description: s.description || undefined, languageCode: "en" } },
                ...(price ? { price } : {}),
              };
        }),
      );
      mask.push("serviceItems");
    }
    if (patch.moreHours !== undefined) {
      body.moreHours = (patch.moreHours ?? []).map((h) => ({
        hoursTypeId: h.typeId ?? hoursTypeId(h.type),
        periods: h.periods.map((p) => ({ openDay: p.day, openTime: gtime(p.open), closeDay: p.day, closeTime: gtime(p.close) })),
      }));
      mask.push("moreHours");
    }
    if (patch.openingDate !== undefined || patch.openStatus !== undefined) {
      const [y, mo, d] = (patch.openingDate ?? loc.openingDate ?? "").split("-").map(Number);
      const status = patch.openStatus ?? loc.openStatus ?? "open";
      body.openInfo = {
        status: status === "temporarily_closed" ? "CLOSED_TEMPORARILY" : status === "permanently_closed" ? "CLOSED_PERMANENTLY" : "OPEN",
        ...(y ? { openingDate: { year: y, month: mo || undefined, day: d || undefined } } : {}),
      };
      mask.push("openInfo");
    }
    if (patch.primaryCategory !== undefined || patch.additionalCategories !== undefined) {
      const region = loc.postalAddress?.regionCode ?? "US";
      const primary = patch.primaryCategory ?? loc.primaryCategory;
      const extra = patch.additionalCategories ?? loc.additionalCategories;
      body.categories = {
        primaryCategory: { name: await categoryId(primary, region) },
        additionalCategories: await Promise.all(extra.map(async (c) => ({ name: await categoryId(c, region) }))),
      };
      mask.push("categories");
    }
    if (mask.length) {
      await g<GLocation>(`${BI}/${id}?updateMask=${mask.join(",")}&validateOnly=false`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Read the whole profile back: the PATCH reply may only carry the changed fields.
      const gl = await g<GLocation>(`${BI}/${id}?readMask=${READ_MASK}`);
      Object.assign(loc, toLocation(gl, loc.accountId, loc));
      cache().locationsAt = now();
    }
    // Attributes, social links and the booking link are attributes on Google.
    if (patch.attributeValues !== undefined || patch.socialProfiles !== undefined || patch.appointmentUri !== undefined || patch.chatUri !== undefined) {
      const next: Record<string, AttributeValue | undefined> = {};
      if (patch.attributeValues) {
        const keys = new Set([...Object.keys(loc.attributeValues ?? {}).filter((k) => !LINK_ATTRS.has(k)), ...Object.keys(patch.attributeValues)]);
        for (const k of keys) next[k] = patch.attributeValues[k];
      }
      if (patch.socialProfiles !== undefined) for (const [net, id] of Object.entries(SOCIAL_ATTR) as [SocialNetwork, string][]) next[id] = patch.socialProfiles?.[net] || undefined;
      if (patch.appointmentUri !== undefined) next[APPOINTMENT_ATTR] = patch.appointmentUri || undefined;
      if (patch.chatUri !== undefined) {
        const chat = (await attributeDefs(loc)).find((d) => CHAT_ATTRS.includes(d.id));
        if (!chat) throw new Error("Google doesn't offer a chat link for this profile.");
        next[chat.id] = patch.chatUri || undefined;
      }
      await pushAttributes(loc, next);
    }
    // Local-only fields (everything Google's API doesn't carry).
    const rest: Partial<Location> = { ...patch };
    for (const k of GOOGLE_FIELDS) delete rest[k];
    Object.assign(loc, rest);
    return loc;
  },
  async updatePhoto(id, photoId, patch) {
    const photo = workspace.locations.find((l) => l.id === id)?.photos?.find((p) => p.id === photoId);
    if (photo?.fromCustomer) throw new Error("This photo was added by a customer. Only Google can change it.");
    if (photo?.googleName)
      await g(`${V4}/${photo.googleName}?updateMask=locationAssociation`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationAssociation: { category: GOOGLE_CATEGORY[patch.category] } }),
      });
    return mockProvider.updatePhoto(id, photoId, patch);
  },
  async deletePhoto(id, photoId) {
    const photo = workspace.locations.find((l) => l.id === id)?.photos?.find((p) => p.id === photoId);
    if (photo?.fromCustomer) throw new Error("This photo was added by a customer. Report it on Google Maps if it shouldn't be there.");
    if (photo?.googleName) await g(`${V4}/${photo.googleName}`, { method: "DELETE" });
    return mockProvider.deletePhoto(id, photoId);
  },
  async listPosts() {
    if (await googleAccount("gbp")) for (const l of workspace.locations) await guard(l.id, "posts", () => importGooglePosts(l.id), undefined);
    return workspace.posts;
  },
  async listReviews(locationId) {
    if (!(await googleAccount("gbp"))) return [];
    await guard(locationId, "reviews", () => refreshReviews(locationId), undefined);
    return workspace.reviews.get(locationId) ?? [];
  },
  async updateReview(locationId, reviewId, patch) {
    if (patch.reply !== undefined) {
      const accountId = accountOf(locationId);
      const url = `${V4}/${accountId}/${locationId}/reviews/${reviewId}/reply`;
      if (patch.reply) await g(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment: patch.reply }) });
      else await g(url, { method: "DELETE" });
    }
    return mockProvider.updateReview(locationId, reviewId, patch);
  },
  async getMetrics(locationId, days) {
    const c = (cache().metrics ??= {});
    const hit = c[locationId];
    if (hit && hit.days >= days && fresh(hit.at, 360)) return hit.points.slice(-days);
    const points = await guard(locationId, "insights", () => fetchMetrics(locationId, Math.max(days, 28)), null);
    // Failed: zeros for the range (the page shows the issue), not cached so the next visit retries.
    if (!points) return emptyMetrics(days);
    c[locationId] = { at: now(), days: Math.max(days, 28), points };
    return points.slice(-days);
  },
  async getSearchKeywords(locationId) {
    const c = (cache().keywords ??= {});
    if (fresh(c[locationId]?.at, 720)) return c[locationId].months;
    const months = await guard(locationId, "keywords", () => fetchKeywords(locationId), null);
    if (!months) return [];
    c[locationId] = { at: now(), months };
    return months;
  },
  async getSyncIssues(locationIds) {
    const issues = cache().issues ?? {};
    return Object.entries(issues).flatMap(([k, message]) => {
      const [locationId, area] = k.split("|") as [string, SyncIssue["area"]];
      const loc = workspace.locations.find((l) => l.id === locationId);
      return loc && locationIds.includes(locationId) ? [{ locationId, title: loc.title, area, message }] : [];
    });
  },
  async getProfileSuggestions(id) {
    // Suggestions come from the demo catalogue only; nothing invented for a real profile.
    const loc = workspace.locations.find((l) => l.id === id);
    if (!loc) throw new Error(`Location not found: ${id}`);
    return { categories: [], websiteServices: [], marketServices: [], products: [], attributes: [], websiteSource: null };
  },
  async getCurrentMember() {
    const m = await liveMember();
    if (!m) throw new Error("You don't have access to this workspace");
    return m;
  },
  async selectConnectionTargets(channel, ids) {
    const c = await mockProvider.selectConnectionTargets(channel, ids);
    if (channel === "google") await refreshLocations(true);
    return c;
  },
  async disconnectChannel(channel) {
    await mockProvider.disconnectChannel(channel);
    if (channel === "google") {
      workspace.locations.splice(0, workspace.locations.length);
      workspace.reviews.clear();
      (workspace as unknown as { google?: GoogleCache }).google = {};
    }
  },
  async syncConnections(channel) {
    await mockProvider.syncConnections(channel);
    if (!channel || channel === "google") {
      (workspace as unknown as { google?: GoogleCache }).google = {};
      if (await googleAccount("gbp")) await refreshLocations(true);
    }
  },
  // ---- Search Console (its own Google permission: webmasters.readonly). Location → property choices live in the workspace.
  async getSearchConsole() {
    const account = await googleAccount("searchconsole");
    const sc = workspace.searchConsole;
    if (!account) return { status: "not_connected", sites: sc?.sites ?? {} };
    return { status: "connected", account: account.email, connectedAt: sc?.connectedAt ?? account.connectedAt, sites: sc?.sites ?? {} };
  },
  async connectSearchConsole(email) {
    const props = await scProperties();
    // Match each location's website to a property the account can see (URL-prefix first, then the domain property).
    const sites: Record<string, string> = { ...(workspace.searchConsole?.sites ?? {}) };
    for (const l of workspace.locations) {
      if (sites[l.id] || !l.websiteUri) continue;
      try {
        const u = new URL(l.websiteUri);
        const host = u.hostname.replace(/^www\./, "");
        const match =
          props.find((p) => p.siteUrl === `${u.origin}${u.pathname.replace(/\/?$/, "/")}`) ?? props.find((p) => p.siteUrl === `${u.origin}/`) ?? props.find((p) => p.siteUrl === `sc-domain:${host}`);
        if (match) sites[l.id] = match.siteUrl;
      } catch {
        // Not a valid URL: leave it for the picker.
      }
    }
    const by = await getSessionUser().catch(() => null);
    workspace.searchConsole = { status: "connected", account: email ?? (await googleAccount("searchconsole"))?.email ?? null, connectedAt: now(), connectedBy: by ? by.name || by.email : null, sites };
    return live.getSearchConsole!();
  },
  async listSearchConsoleProperties() {
    return scProperties();
  },
  async setSearchConsoleSites(sites) {
    const props = new Set((await scProperties()).map((p) => p.siteUrl));
    const next = { ...(workspace.searchConsole?.sites ?? {}) };
    for (const [locationId, siteUrl] of Object.entries(sites)) {
      if (siteUrl && !props.has(siteUrl)) throw new Error(`Your Google account has no access to ${siteUrl} in Search Console`);
      if (siteUrl) next[locationId] = siteUrl;
      else delete next[locationId];
    }
    workspace.searchConsole = { ...(workspace.searchConsole ?? { status: "connected" }), sites: next };
    return live.getSearchConsole!();
  },
  async disconnectSearchConsole() {
    await disconnectGoogle("searchconsole");
    workspace.searchConsole = { status: "not_connected", sites: workspace.searchConsole?.sites ?? {} };
  },
  async getSearchConsoleReport(locationId, { from, to, compare }) {
    const siteUrl = workspace.searchConsole?.sites?.[locationId];
    if (!siteUrl || !(await googleAccount("searchconsole"))) return null;
    const prev = previousRange(from, to);
    const [queries, prevQueries, daily, totals, prevTotals] = await Promise.all([
      scQuery(siteUrl, { startDate: from, endDate: to, dimensions: ["query"], rowLimit: 1000 }),
      compare ? scQuery(siteUrl, { startDate: prev.from, endDate: prev.to, dimensions: ["query"], rowLimit: 1000 }) : Promise.resolve([]),
      scQuery(siteUrl, { startDate: from, endDate: to, dimensions: ["date"] }),
      scQuery(siteUrl, { startDate: from, endDate: to }),
      compare ? scQuery(siteUrl, { startDate: prev.from, endDate: prev.to }) : Promise.resolve([]),
    ]);
    const before = new Map(prevQueries.map((r) => [r.keys![0], metricsOf(r)]));
    return {
      siteUrl,
      from,
      to,
      totals: totals[0] ? metricsOf(totals[0]) : zeroMetrics(),
      prevTotals: compare ? (prevTotals[0] ? metricsOf(prevTotals[0]) : zeroMetrics()) : null,
      daily: fillDays(from, to, daily),
      queries: queries.map((r) => ({ query: r.keys![0], ...metricsOf(r), prev: compare ? (before.get(r.keys![0]) ?? null) : undefined })),
    };
  },
  async getSearchConsoleQuery(locationId, query, { from, to, compare }) {
    const siteUrl = workspace.searchConsole?.sites?.[locationId];
    if (!siteUrl || !(await googleAccount("searchconsole"))) return null;
    const filter = [{ filters: [{ dimension: "query", operator: "equals", expression: query }] }];
    const prev = previousRange(from, to);
    const [totals, prevTotals, daily, pages, prevPages, devices] = await Promise.all([
      scQuery(siteUrl, { startDate: from, endDate: to, dimensionFilterGroups: filter }),
      compare ? scQuery(siteUrl, { startDate: prev.from, endDate: prev.to, dimensionFilterGroups: filter }) : Promise.resolve([]),
      scQuery(siteUrl, { startDate: from, endDate: to, dimensions: ["date"], dimensionFilterGroups: filter }),
      scQuery(siteUrl, { startDate: from, endDate: to, dimensions: ["page"], dimensionFilterGroups: filter, rowLimit: 50 }),
      compare ? scQuery(siteUrl, { startDate: prev.from, endDate: prev.to, dimensions: ["page"], dimensionFilterGroups: filter, rowLimit: 50 }) : Promise.resolve([]),
      scQuery(siteUrl, { startDate: from, endDate: to, dimensions: ["device"], dimensionFilterGroups: filter }),
    ]);
    const beforePage = new Map(prevPages.map((r) => [r.keys![0], metricsOf(r)]));
    return {
      siteUrl,
      query,
      from,
      to,
      totals: totals[0] ? metricsOf(totals[0]) : zeroMetrics(),
      prevTotals: compare ? (prevTotals[0] ? metricsOf(prevTotals[0]) : zeroMetrics()) : null,
      daily: fillDays(from, to, daily),
      pages: pages.map((r) => ({ page: r.keys![0], ...metricsOf(r), prev: compare ? (beforePage.get(r.keys![0]) ?? null) : undefined })),
      devices: devices.flatMap((r) => (["MOBILE", "DESKTOP", "TABLET"].includes(r.keys![0]) ? [{ device: r.keys![0] as SearchConsoleDevice, ...metricsOf(r) }] : [])),
    };
  },
  async deletePost(id) {
    // Live on Google (published from here, or imported from Google): delete the local post(s) there too. Already gone = fine.
    const post = workspace.posts.find((p) => p.id === id);
    const names = [...(post?.results?.google?.status === "published" ? (post.results.google.external_ids ?? []) : []), ...(post?.imported?.channel === "google" ? [post.imported.external_id] : [])];
    for (const name of new Set(names.filter((n) => /^accounts\/[^/]+\/locations\/[^/]+\/localPosts\/[^/]+$/.test(n)))) {
      try {
        await googleFetch("gbp", `${V4}/${name}`, { method: "DELETE" });
      } catch (e) {
        if (!(e instanceof GoogleApiError && e.code === 404)) throw new Error(`Google didn't delete the post: ${gbpErrorMessage(e)}`);
      }
    }
    return mockProvider.deletePost(id);
  },
  async publishPost(id) {
    const post = workspace.posts.find((p) => p.id === id);
    if (!post) throw new Error(`Post not found: ${id}`);
    const at = now();
    const results: Post["results"] = { ...(post.results ?? {}) };
    for (const ch of post.channels as Channel[]) {
      if (results[ch]?.status === "published") continue;
      if (ch === "facebook" || ch === "instagram") {
        const live = workspace.connections.some((c) => c.channel === ch && c.status === "connected");
        results[ch] = live ? await publishMeta(post, ch) : { status: "failed", error: `Connect ${ch === "facebook" ? "a Facebook Page" : "Instagram"} in Settings → Accounts` };
        continue;
      }
      if (ch === "linkedin") {
        const live = workspace.connections.some((c) => c.channel === "linkedin" && c.status === "connected");
        results.linkedin = live ? await publishLinkedin(post) : { status: "failed", error: "Connect LinkedIn in Settings → Accounts" };
        continue;
      }
      try {
        const created = await publishToGoogle(post);
        results.google = { status: "published", posted_at: at, permalink: created[0]?.searchUrl ?? null, external_ids: created.map((x) => x.name) };
      } catch (e) {
        results.google = { status: "failed", error: e instanceof Error ? e.message : "Google didn't accept the post" };
      }
    }
    post.results = results;
    post.status = postStatusFromResults(post.channels, results);
    post.published_at = at;
    post.scheduled_at ??= at;
    return post;
  },
};

/** One local post per selected location (all picked locations when the post targets none). */
async function publishToGoogle(post: Post) {
  const o = post.google;
  const targets = (o.locations.length ? o.locations : workspace.locations.map((l) => l.id)).map((id) => ({ id, accountId: accountOf(id) })).filter((t) => t.accountId);
  if (!targets.length) throw new Error("No Google location selected");
  const text = (post.custom_text && o.text) || post.body;
  // Google fetches the image from a public link: uploads (data: URLs) are saved and served by the app (public-media.ts).
  // No silent text-only post: if there's an image but no public link (localhost), the Google publish fails with the reason.
  const image = channelMedia(post.media, "google")[0];
  const photo = image ? { url: await publicMediaUrl(image.url, "Google") } : null;
  const when = (s: string) => {
    const [d, t] = s.split("T");
    const [year, month, day] = d.split("-").map(Number);
    return { date: { year, month, day }, time: t ? gtime(t) : undefined };
  };
  const body: Record<string, unknown> = {
    languageCode: "en",
    summary: text,
    topicType: o.type === "event" ? "EVENT" : o.type === "offer" ? "OFFER" : "STANDARD",
    ...(o.cta.type !== "none" ? { callToAction: { actionType: o.cta.type, ...(o.cta.type !== "CALL" ? { url: o.cta.url } : {}) } } : {}),
    ...(photo ? { media: [{ mediaFormat: "PHOTO", sourceUrl: photo.url }] } : {}),
  };
  if (o.type === "event") {
    const s = when(o.event.start),
      e = when(o.event.end);
    body.event = { title: o.event.title, schedule: { startDate: s.date, startTime: s.time, endDate: e.date, endTime: e.time } };
  }
  if (o.type === "offer") {
    const s = when(o.offer.start),
      e = when(o.offer.end);
    body.event = { title: o.offer.title, schedule: { startDate: s.date, endDate: e.date } };
    body.offer = { couponCode: o.offer.coupon || undefined, redeemOnlineUrl: o.offer.url || undefined, termsConditions: o.offer.terms || undefined };
  }
  const created: { name: string; searchUrl?: string }[] = [];
  for (const t of targets)
    created.push(
      await g<{ name: string; searchUrl?: string }>(`${V4}/${t.accountId}/${t.id}/localPosts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    );
  return created;
}

/** Live provider: Google-backed methods replaced. getProvider() binds it to the caller's workspace and saves that workspace. */
export function createLiveProvider(): GbpProvider {
  return { ...mockProvider, ...live } as GbpProvider;
}
