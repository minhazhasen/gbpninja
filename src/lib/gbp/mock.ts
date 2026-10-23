import { postStatusFromResults, type Channel, type ChannelResult, type Post, type PostStats } from "../posts";
import { MAX_COMPETITORS, addPoint } from "../competitors";
import { emptyDraft } from "../posts";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { format } from "date-fns";
import type { KeywordMonth } from "../keywords";
import { GOOGLE_CATEGORIES, searchCategoryList } from "./categories";
import type {
  Competitor,
  Connection,
  GbpProvider,
  Location,
  Photo,
  PhotoCategory,
  SearchConsoleConnection,
  SearchConsoleDevice,
  SearchConsoleMetrics,
  SearchConsoleProperty,
  Member,
  MetricPoint,
  ProfileSuggestions,
  Review,
  ReviewRequest,
  Task,
  TaskInput,
  TeamMember,
  EmailSender,
  MessageTemplate,
} from "./types";
import { STARTER_TEMPLATES } from "../templates";
import { needsFollowUpTask } from "../tasks";
import { auditLocation } from "../audit";
import { currentTenant } from "./tenant-context";
import { disconnectGoogle, googleAccount, googleOAuthConfigured } from "../google/oauth";
import { listGbpLocations } from "../google/business";
import { sendGmail } from "../google/gmail";
import { disconnectMeta, metaAccount, metaConfigured, metaPages } from "../meta/oauth";
import { deleteFromFacebook, publishToFacebook, publishToInstagram } from "../meta/publish";

// In-memory demo data so the app runs without Google API access.
// State resets on server restart. It lives on globalThis so dev-mode module
// re-evaluation (route compiles, HMR) doesn't wipe edits mid-session.

// ---- demo photos: a lettermark logo (SVG) plus stock photos from picsum.photos (stable per seed).
const logoSvg = (letter: string, bg: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" rx="72" fill="${bg}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="200" font-weight="700" fill="#fff">${letter}</text></svg>`)}`;
const demoPhotos = (key: string, spec: [PhotoCategory, number][]): Photo[] =>
  spec.flatMap(([category, n]) =>
    Array.from({ length: n }, (_, i) => ({
      id: `ph_${key}_${category}_${i}`,
      url: `https://picsum.photos/seed/${key}-${category}-${i}/${category === "cover" ? "1200/675" : "800/800"}`,
      category,
      width: category === "cover" ? 1200 : 800,
      height: category === "cover" ? 675 : 800,
      createdAt: new Date(Date.now() - (i + 1) * 9 * 86_400_000).toISOString(),
    })),
  );
const withLogo = (key: string, letter: string, bg: string, rest: Photo[]): Photo[] => [
  { id: `ph_${key}_logo`, url: logoSvg(letter, bg), category: "logo", width: 400, height: 400, createdAt: new Date(Date.now() - 400 * 86_400_000).toISOString() },
  ...rest,
];
/** Keep the derived counters in sync with the photo list. */
export function syncPhotoStats(l: Location) {
  const ps = l.photos ?? [];
  l.photoCount = ps.filter((p) => p.category !== "logo" && p.category !== "cover").length;
  l.hasLogo = ps.some((p) => p.category === "logo");
  l.hasCoverPhoto = ps.some((p) => p.category === "cover");
  return l;
}

const seedLocations: Location[] = [
  {
    id: "locations/1001",
    placeId: "ChIJdemoSunriseDental01",
    accountId: "accounts/demo",
    title: "Sunrise Dental Clinic",
    primaryCategory: "Dentist",
    additionalCategories: ["Cosmetic dentist"],
    address: "120 Main St, Austin, TX 78701",
    phone: "+1 512-555-0134",
    websiteUri: "https://example.com",
    description: "Family dentistry.",
    regularHours: [
      { day: "MONDAY", open: "09:00", close: "17:00" },
      { day: "TUESDAY", open: "09:00", close: "17:00" },
      { day: "WEDNESDAY", open: "09:00", close: "17:00" },
      { day: "THURSDAY", open: "09:00", close: "17:00" },
      { day: "FRIDAY", open: "09:00", close: "15:00" },
    ],
    photos: withLogo(
      "sunrise",
      "S",
      "#3D5BE0",
      demoPhotos("sunrise", [
        ["exterior", 1],
        ["interior", 1],
        ["team", 1],
        ["at_work", 1],
      ]),
    ),
    photoCount: 4,
    hasLogo: true,
    hasCoverPhoto: false,
    services: [
      { name: "Dental checkup", category: "Dentist", priceType: "from", price: 75, description: "Full exam with X-rays and a personalised care plan." },
      { name: "Teeth cleaning", category: "Dentist", priceType: "fixed", price: 120 },
    ],
    products: [
      {
        name: "Electric toothbrush",
        category: "Oral care",
        priceType: "fixed",
        price: 89,
        description: "Rechargeable sonic toothbrush with two brush heads.",
        button: "buy",
        buttonUrl: "https://example.com/shop",
      },
    ],
    appointmentUri: "https://example.com/book",
    openStatus: "open",
    socialProfiles: { facebook: "https://www.facebook.com/sunrisedental" },
    serviceArea: [],
    attributes: ["wheelchair_accessible_entrance"],
    verified: true,
  },
  {
    id: "locations/1002",
    placeId: "ChIJdemoGreenLeafCafe02",
    accountId: "accounts/demo",
    title: "Green Leaf Cafe",
    primaryCategory: "Cafe",
    additionalCategories: [],
    address: "45 Lake Rd, Austin, TX 78702",
    photos: [],
    photoCount: 0,
    hasLogo: false,
    hasCoverPhoto: false,
    services: [],
    attributes: [],
    verified: false,
  },
  {
    id: "locations/1003",
    placeId: "ChIJdemoPeakFitness0003",
    accountId: "accounts/demo",
    title: "Peak Fitness Studio",
    primaryCategory: "Gym",
    additionalCategories: ["Personal trainer", "Yoga studio"],
    address: "800 Congress Ave, Austin, TX 78701",
    phone: "+1 512-555-0199",
    websiteUri: "https://example.com/fitness",
    openingDate: "2016-03",
    openStatus: "open",
    chatUri: "https://wa.me/15125550199",
    socialProfiles: {
      instagram: "https://www.instagram.com/peakfitnessatx/",
      facebook: "https://www.facebook.com/peakfitnessatx",
      youtube: "https://www.youtube.com/@peakfitnessatx",
    },
    serviceArea: ["Austin, TX, USA", "Round Rock, TX, USA", "Cedar Park, TX, USA"],
    specialHours: [{ date: `${new Date().getFullYear()}-12-25`, closed: true }],
    moreHours: [
      {
        type: "Access",
        periods: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].map((day) => ({ day, open: "05:00", close: "23:00" })),
      },
    ],
    description:
      "Peak Fitness Studio is a community gym in downtown Austin offering strength training, small-group classes, yoga and one-on-one personal training. Our certified coaches build programs for every level, from first-timers to competitive athletes. Free intro session for new members.",
    regularHours: [
      { day: "MONDAY", open: "06:00", close: "21:00" },
      { day: "TUESDAY", open: "06:00", close: "21:00" },
      { day: "WEDNESDAY", open: "06:00", close: "21:00" },
      { day: "THURSDAY", open: "06:00", close: "21:00" },
      { day: "FRIDAY", open: "06:00", close: "20:00" },
      { day: "SATURDAY", open: "08:00", close: "14:00" },
    ],
    photos: withLogo(
      "peak",
      "P",
      "#2F9E70",
      demoPhotos("peak", [
        ["cover", 1],
        ["exterior", 3],
        ["interior", 6],
        ["at_work", 5],
        ["team", 2],
        ["product", 2],
      ]),
    ),
    photoCount: 18,
    hasLogo: true,
    hasCoverPhoto: true,
    services: [
      { name: "Personal training", category: "Personal trainer", priceType: "from", price: 60 },
      { name: "Group fitness classes", category: "Gym", priceType: "fixed", price: 18 },
      { name: "Yoga classes", category: "Yoga studio", priceType: "fixed", price: 20 },
      { name: "Strength training", category: "Gym" },
      { name: "Nutrition coaching", category: "Personal trainer", priceType: "from", price: 45 },
      { name: "Fitness assessment", category: "Gym", priceType: "free" },
    ],
    products: [
      { name: "Monthly membership", category: "Memberships", priceType: "fixed", price: 59, button: "buy", buttonUrl: "https://example.com/fitness/join" },
      { name: "10-class pass", category: "Class passes", priceType: "fixed", price: 150 },
      { name: "Personal training pack (5)", category: "Training", priceType: "range", price: 275, priceMax: 325 },
    ],
    attributes: ["wheelchair_accessible_entrance", "free_wifi", "restroom"],
    verified: true,
  },
];

const names = [
  "Alex Parker",
  "Maria Garcia",
  "John Davis",
  "Priya Shah",
  "Chen Li",
  "Sam Rivera",
  "Fatima Khan",
  "Leo Martin",
  "Olivia Brown",
  "Noah Wilson",
  "Emma Thomas",
  "Liam Moore",
  "Md Iqbal Bhuiyan",
  "Lewis Maina",
  "Mehedi Hasan",
  "Salim Hosen",
];

const team: TeamMember[] = [
  { id: "u1", name: "Minhaz Hosen" },
  { id: "u2", name: "Sarah Lee" },
  { id: "u3", name: "Tom Baker" },
];
const comments: Record<number, string[]> = {
  5: [
    "Excellent service, highly recommend! The team went above and beyond.",
    "Friendly staff and spotless place. Booking was quick and easy.",
    "Best in town. I've been coming here for two years and it's always great.",
  ],
  4: ["Good experience overall, just a bit of a wait on arrival.", "Very professional and clear about pricing."],
  3: ["It was okay. Parking is hard to find around here.", "Decent, but the place felt rushed on a Saturday."],
  2: ["Billing was confusing and nobody called me back."],
  1: ["Rude front desk and a long wait. Will not return."],
};

function seededReviews(locationId: string, seed: number): Review[] {
  const pattern = [5, 5, 4, 5, 3, 5, 4, 2, 5, 4, 5, 1, 5, 5] as const;
  // Spread over ~14 months so "Reviews by month" has this year and last year.
  return Array.from({ length: 24 - seed * 5 }, (_, i) => {
    const rating = pattern[(i + seed * 5) % pattern.length];
    const daysAgo = i < 6 ? i * 4 + seed + 0.3 : 20 + i * 17 + seed * 3;
    const created = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
    const replied = i > 3 && i % 3 !== 1;
    return {
      id: `${locationId}/reviews/r${i}`,
      locationId,
      reviewer: names[(i * 3 + seed) % names.length],
      rating,
      comment: i % 5 === 3 ? undefined : comments[rating][i % comments[rating].length],
      createTime: created,
      reply: replied ? { comment: "Thank you for your feedback! We appreciate you taking the time.", updateTime: created } : undefined,
      assignedTo: rating <= 3 || i % 4 === 0 ? team[(i + seed) % team.length].id : null,
      followUp: rating <= 2 && i > 6 ? { type: "called" as const, note: "Called and offered a free follow-up visit.", at: created } : null,
      hidden: i === 9 && seed === 0,
    };
  });
}

function seedRequests(): ReviewRequest[] {
  const at = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  return [
    { id: "q1", locationId: "locations/1001", name: "Karen Wright", email: "karen@example.com", method: "email", status: "sent", createdAt: at(3), sentAt: at(3) },
    { id: "q2", locationId: "locations/1001", name: "David Kim", phone: "+1 512-555-0188", method: "sms", status: "clicked", createdAt: at(6), sentAt: at(6) },
    { id: "q3", locationId: "locations/1001", name: "Rosa Diaz", email: "rosa@example.com", method: "email", status: "completed", createdAt: at(12), sentAt: at(12), rating: 5 },
    { id: "q4", locationId: "locations/1001", name: "Ben Carter", email: "ben@example.com", method: "email", status: "draft", createdAt: at(1) },
    { id: "q5", locationId: "locations/1003", name: "Nina Patel", phone: "+1 512-555-0123", method: "sms", status: "declined", createdAt: at(20), sentAt: at(20) },
  ];
}

export interface MockState {
  /** Competitors the workspace added / removed, per location (added after the first release of this state, hence optional). */
  competitorEdits?: Record<string, { added: Competitor[]; hidden: string[] }>;
  /** Demo password hashes by member id ("salt:hash", scrypt). Never sent to the client. */
  passwords: Map<string, string>;
  locations: Location[];
  reviews: Map<string, Review[]>;
  requests: ReviewRequest[];
  posts: Post[];
  connections: Connection[];
  members: Member[];
  postSeq: number;
  /** Per-profile allowance (changes when a request is approved). */
  searchConsole: SearchConsoleConnection;
  emailSender: EmailSender;
  templates: MessageTemplate[];
  tasks: Task[];
  /** Review ids whose follow-up task was deleted, so it isn't created again. */
  dismissedReviewTasks: Set<string>;
}
// Bump the key when the state shape changes so a running dev server re-seeds.
const g = globalThis as unknown as { __gbpMockV21?: MockState };

const at = (day: number, hour: number) => {
  const d = new Date(Date.now() + day * 86_400_000);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

function seedPosts(): Post[] {
  const base = (id: string, patch: Partial<Post>): Post => {
    const draft = emptyDraft();
    return { ...draft, id, status: "draft", created_at: at(-20, 9), ...patch, google: { ...draft.google, ...patch.google } };
  };
  const published = (channels: Channel[], day: number) => Object.fromEntries(channels.map((c) => [c, { status: "published" as const, posted_at: at(day, 10), permalink: null }]));
  return [
    base("p1", {
      title: "New customer offer",
      label: "Fall promo",
      body: "10% off for new customers this month — mention this post when you book.",
      channels: ["google", "facebook"],
      hashtags: ["austin", "newcustomer"],
      google: {
        ...emptyDraft().google,
        type: "offer",
        offer: { title: "10% off your first visit", start: at(-12, 0).slice(0, 10), end: at(18, 0).slice(0, 10), coupon: "WELCOME10", url: "", terms: "" },
      },
      status: "published",
      scheduled_at: at(-12, 10),
      published_at: at(-12, 10),
      results: published(["google", "facebook"], -12),
      stats: { facebook: stats(2140, 1610, 54, 88, 9, 6) },
    }),
    base("p2", {
      title: "Meet the team",
      body: "Meet the team! A quick look behind the scenes at what we do every day.",
      channels: ["google", "facebook", "linkedin"],
      status: "published",
      scheduled_at: at(-6, 13),
      published_at: at(-6, 13),
      results: published(["google", "facebook", "linkedin"], -6),
      stats: { facebook: stats(980, 760, 21, 64, 12, 3), linkedin: stats(1240, 890, 37, 41, 5, 4) },
    }),
    base("p3", {
      title: "Holiday hours",
      body: "Holiday hours update: we close early on Friday.",
      channels: ["google", "instagram"],
      status: "partially_failed",
      scheduled_at: at(-2, 16),
      published_at: at(-2, 16),
      results: { google: { status: "published", posted_at: at(-2, 16) }, instagram: { status: "failed", error: "Instagram needs at least one image" } },
    }),
    base("p4", {
      title: "Weekend opening",
      body: "We're open this weekend — book your visit today!",
      channels: ["google", "facebook"],
      google: { ...emptyDraft().google, cta: { type: "BOOK", url: "https://example.com/book" } },
      status: "scheduled",
      scheduled_at: at(2, 10),
    }),
    base("p5", {
      title: "Community open day",
      label: "Events",
      body: "Free community open day with tours, demos and refreshments. Everyone welcome!",
      channels: ["google", "facebook", "instagram"],
      hashtags: ["community", "openday"],
      google: { ...emptyDraft().google, type: "event", event: { title: "Community open day", start: `${at(9, 0).slice(0, 10)}T10:00`, end: `${at(9, 0).slice(0, 10)}T14:00` } },
      status: "scheduled",
      scheduled_at: at(9, 13),
    }),
    base("p6", {
      title: "Referral program",
      body: "Refer a friend and you both get a free upgrade.",
      channels: ["google"],
      status: "draft",
      scheduled_at: at(16, 9),
    }),
    // Posted straight on the networks (not from the app): pulled in on sync and shown read-only.
    imported("google", -5, 11, "Free whitening consult", "Book a free whitening consult this week — limited spots available.", {
      google: { ...emptyDraft().google, cta: { type: "BOOK", url: "https://example.com/book" } },
    }),
    imported("facebook", -4, 18, "Behind the scenes", "A day in the life at the clinic. Thanks to our amazing team! 🦷", { stats: { facebook: stats(1820, 1340, 46, 132, 18, 9) } }),
    imported("instagram", -8, 12, "New treatment room", "Our brand-new treatment room is ready ✨ #newlook #austin", {
      stats: { instagram: { ...stats(3120, 2410, null, 214, 23, null), saves: 31 } },
    }),
    imported("linkedin", -10, 9, "We're hiring", "We're hiring a dental hygienist to join our Austin team. DM us or apply on our site.", { stats: { linkedin: stats(2650, 1980, 88, 57, 11, 14) } }),
    imported("x", -3, 15, "Saturday hours", "Open this Saturday 9–1. Walk-ins welcome!", { stats: { x: stats(940, null, 12, 18, 2, 4) } }),
  ];
}

/** Demo engagement: views, reach, clicks, likes, comments, shares. */
function stats(views: number, reach: number | null, clicks: number | null, likes: number, comments: number, shares: number | null): PostStats {
  return { views, reach, clicks, likes, comments, shares, fetched_at: new Date(Date.now() - 2 * 3_600_000).toISOString() };
}

/** A post made directly on a network that the sync pulled into the calendar. */
function imported(channel: Channel, day: number, hour: number, title: string, body: string, patch: Partial<Post> = {}): Post {
  const draft = emptyDraft();
  const when = at(day, hour);
  return {
    ...draft,
    id: `imp_${channel}_${-day}`,
    title,
    body,
    channels: [channel],
    status: "published",
    scheduled_at: when,
    published_at: when,
    created_at: when,
    results: { [channel]: { status: "published", posted_at: when, permalink: null, external_ids: [`demo-${channel}-${-day}`] } },
    imported: { channel, external_id: `demo-${channel}-${-day}` },
    ...patch,
    google: { ...draft.google, ...patch.google },
  };
}

/** Deterministic per calendar day, so every page shows the same numbers for the same date. */
function metrics(locationId: string, days: number): MetricPoint[] {
  const base = { "locations/1001": 220, "locations/1002": 90, "locations/1003": 310 }[locationId] ?? 120;
  const seed = locationId.length + Number(locationId.slice(-1));
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(today.getTime() - (days - 1 - i) * 86_400_000);
    const n = Math.floor(d.getTime() / 86_400_000); // day number since epoch
    const wave = Math.sin((n + seed) / 3) * 0.15 + Math.sin((n + seed) / 17) * 0.1;
    const weekend = [0, 6].includes(d.getDay()) ? -0.2 : 0;
    const growth = 1 - Math.min(540, Math.floor((today.getTime() - d.getTime()) / 86_400_000)) / 1800; // slowly growing over time
    const impressions = Math.max(0, Math.round(base * growth * (1 + weekend + wave)));
    const searchImpressions = Math.round(impressions * 0.62);
    const noise = (k: number) => 1 + Math.sin(n * k + seed) * 0.25;
    return {
      date: format(d, "yyyy-MM-dd"),
      impressions,
      searchImpressions,
      mapsImpressions: impressions - searchImpressions,
      calls: Math.round(impressions * 0.03 * noise(1.3)),
      websiteClicks: Math.round(impressions * 0.05 * noise(0.7)),
      directions: Math.round(impressions * 0.04 * noise(2.1)),
    };
  });
}

const KEYWORDS: Record<string, string[]> = {
  "locations/1001": ["dentist near me", "sunrise dental", "teeth whitening austin", "emergency dentist", "dental clinic austin", "cosmetic dentist", "dentist open saturday", "invisalign austin"],
  "locations/1002": ["cafe near me", "green leaf cafe", "coffee shop austin", "vegan breakfast", "brunch lake rd", "wifi cafe austin"],
  "locations/1003": ["gym near me", "peak fitness", "personal trainer austin", "yoga studio downtown", "24 hour gym", "crossfit austin", "gym day pass"],
};

/** Six months of keyword data; some keywords appear or drop out, small counts are hidden as "<15" like Google does. */
function searchKeywords(locationId: string): KeywordMonth[] {
  const words = KEYWORDS[locationId] ?? [];
  const now = new Date();
  return Array.from({ length: 6 }, (_, m) => {
    const month = format(new Date(now.getFullYear(), now.getMonth() - 1 - m, 1), "yyyy-MM");
    const keywords = words
      .map((keyword, i) => {
        if ((i + m) % 7 === 6) return null; // not in this month
        const raw = Math.round(((words.length - i) * 38 + Math.sin(i * 3 + m) * 30) * (1 - m * 0.05));
        return raw < 15 || i >= words.length - 2 ? { keyword, impressions: null, threshold: 15 } : { keyword, impressions: raw, threshold: null };
      })
      .filter((k): k is NonNullable<typeof k> => !!k);
    return { month, keywords, locationId };
  });
}

// Suggestion catalogue per primary category (demo stand-in for Google categories + a website crawl + nearby competitors).
const CATALOG: Record<string, { categories: [string, string][]; website: string[]; market: [string, number][]; products: string[]; attributes: string[] }> = {
  Dentist: {
    categories: [
      ["Cosmetic dentist", "Top secondary category for dentists near you"],
      ["Emergency dental service", "You mention same-day emergencies on your website"],
      ["Pediatric dentist", "Used by 5 of 8 nearby dental clinics"],
      ["Teeth whitening service", "Searched 210×/month in your area"],
      ["Dental implants periodontist", "Listed by 3 competitors that rank above you"],
      ["Orthodontist", "You offer Invisalign on your website"],
    ],
    website: ["Teeth whitening", "Dental implants", "Invisalign", "Root canal treatment", "Emergency dental care", "Dental crowns"],
    market: [
      ["Pediatric dentistry", 6],
      ["Dental fillings", 7],
      ["Wisdom tooth extraction", 5],
      ["Veneers", 4],
      ["Gum disease treatment", 3],
    ],
    products: ["Teeth whitening kit", "Night guard", "Electric toothbrush", "Invisalign package"],
    attributes: ["appointment_required", "online_appointments", "accepts_new_patients", "free_parking_lot", "accepts_credit_cards", "restroom", "lgbtq_friendly"],
  },
  Cafe: {
    categories: [
      ["Coffee shop", "Most common secondary category for cafes nearby"],
      ["Breakfast restaurant", "Your menu page lists breakfast"],
      ["Brunch restaurant", '"brunch lake rd" brings people to your profile'],
      ["Vegan restaurant", "You mention vegan options on your website"],
      ["Bakery", "Used by 4 of 9 nearby cafes"],
      ["Tea house", "Listed by 2 competitors that rank above you"],
    ],
    website: ["Espresso drinks", "Vegan breakfast", "Weekend brunch", "Fresh pastries", "Catering", "Free Wi‑Fi workspace"],
    market: [
      ["Takeout", 9],
      ["Delivery", 7],
      ["Cold brew", 6],
      ["Gluten-free options", 5],
      ["Outdoor seating", 4],
    ],
    products: ["House blend coffee beans", "Croissant", "Breakfast burrito", "Gift card"],
    attributes: ["free_wifi", "outdoor_seating", "dine_in", "takeout", "delivery", "vegetarian_options", "accepts_credit_cards", "restroom"],
  },
  Gym: {
    categories: [
      ["Fitness center", "Most common secondary category for gyms nearby"],
      ["Pilates studio", "Used by 3 of 7 nearby gyms"],
      ["Boxing gym", "You list boxing classes on your website"],
      ["Health club", "Listed by 2 competitors that rank above you"],
    ],
    website: ["Boxing classes", "HIIT classes", "Day pass", "Open gym"],
    market: [
      ["Pilates classes", 5],
      ["Spin classes", 4],
      ["Sauna", 3],
      ["Kids fitness", 2],
    ],
    products: ["Day pass", "Monthly membership", "Gift card"],
    attributes: ["free_wifi", "restroom", "free_parking_lot", "showers", "lockers", "women_owned"],
  },
};

function suggestionsFor(loc: Location): ProfileSuggestions {
  const c = CATALOG[loc.primaryCategory];
  if (!c) return { categories: [], websiteServices: [], marketServices: [], products: [], attributes: [] };
  const has = (list: string[], name: string) => list.some((x) => x.toLowerCase() === name.toLowerCase());
  const site = loc.websiteUri ? new URL(loc.websiteUri).hostname : null;
  return {
    categories: c.categories
      .filter(([n]) => n !== loc.primaryCategory && !has(loc.additionalCategories, n))
      // Without a website we can't claim we read it.
      .map(([name, reason]) => ({ name, reason: !site && /website|menu page/i.test(reason) ? `Common for ${loc.primaryCategory.toLowerCase()}s near you` : reason })),
    websiteServices: site
      ? c.website
          .filter(
            (n) =>
              !has(
                loc.services.map((s) => s.name),
                n,
              ),
          )
          .map((name) => ({ name, reason: `Found on ${site}` }))
      : [],
    marketServices: c.market
      .filter(
        ([n]) =>
          !has(
            loc.services.map((s) => s.name),
            n,
          ),
      )
      .map(([name, k]) => ({ name, reason: `Offered by ${k} nearby ${loc.primaryCategory.toLowerCase()}s` })),
    products: c.products
      .filter(
        (n) =>
          !has(
            (loc.products ?? []).map((p) => p.name),
            n,
          ),
      )
      .map((name) => ({ name, reason: `Popular with ${loc.primaryCategory.toLowerCase()}s near you` })),
    attributes: c.attributes.filter((a) => !loc.attributes.includes(a)).map((name) => ({ name, reason: "Common for your category" })),
    websiteSource: site,
    competitorCount: Math.max(...c.market.map(([, k]) => k), 0) + 2,
  };
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const DEMO_PAGES: { id: string; name: string; ig?: string }[] = [
  { id: "fb-sunrise", name: "Sunrise Dental Clinic", ig: "sunrisedentalatx" },
  { id: "fb-peak", name: "Peak Fitness Studio", ig: "peakfitnessatx" },
  { id: "fb-greenleaf", name: "Green Leaf Cafe" },
];
const DEMO_LINKEDIN = [
  { id: "li-person", name: "Demo User", sub: "Your profile" },
  { id: "li-sunrise", name: "Sunrise Dental Group", sub: "Company Page" },
];

function seedConnections(): Connection[] {
  return [
    {
      channel: "google",
      status: "connected",
      account: "owner@example.com",
      targets: seedLocations.map((l) => ({ id: l.id, name: l.title })),
      connectedAt: minsAgo(60 * 24 * 40),
      lastSyncAt: minsAgo(5),
    },
    { channel: "facebook", status: "connected", account: "Demo User", targets: [{ id: "fb-sunrise", name: "Sunrise Dental Clinic" }], connectedAt: minsAgo(60 * 24 * 12), lastSyncAt: minsAgo(18) },
    { channel: "instagram", status: "not_connected", targets: [] },
    {
      channel: "linkedin",
      status: "connected",
      account: "Demo User",
      targets: [{ id: "li-sunrise", name: "Sunrise Dental Group" }],
      connectedAt: minsAgo(60 * 24 * 51),
      lastSyncAt: minsAgo(60 * 3),
      expiresAt: new Date(Date.now() + 9 * 86_400_000).toISOString(),
    },
    { channel: "x", status: "not_connected", targets: [] },
  ];
}

const isLive = (c: Connection) => c.status === "connected" && (!c.expiresAt || new Date(c.expiresAt).getTime() > Date.now());

const token = () => Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(16).padStart(2, "0")).join("");

/** u0 is the signed-in demo user; u1–u3 match the review assignees above. */
function seedMembers(): Member[] {
  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  return [
    // Signs in with Google and has also set a password (demo: any current password is accepted until it's changed here).
    { id: "u0", name: "Demo User", email: "you@example.com", role: "admin", status: "active", locationIds: [], joinedAt: daysAgo(120), lastActiveAt: daysAgo(0), passwordChangedAt: daysAgo(64) },
    { id: "u1", name: "Minhaz Hosen", email: "minhaz@example.com", role: "admin", status: "active", locationIds: [], joinedAt: daysAgo(90), lastActiveAt: minsAgo(45) },
    { id: "u2", name: "Sarah Lee", email: "sarah@example.com", role: "member", status: "active", locationIds: ["locations/1001"], joinedAt: daysAgo(40), lastActiveAt: daysAgo(1) },
    { id: "u3", name: "Tom Baker", email: "tom@example.com", role: "member", status: "active", locationIds: [], joinedAt: daysAgo(25), lastActiveAt: daysAgo(6) },
    { id: "u4", name: "", email: "jamie@example.com", role: "member", status: "invited", locationIds: ["locations/1003"], invitedAt: daysAgo(2), invitedBy: "Demo User", inviteToken: token() },
  ];
}

// ---- competitors (demo): nearby businesses in the same main category. Live: Places API Text Search (see google.ts).
type CompetitorSeed = [name: string, address: string, km: number, primary: string, additional: string[], rating: number | null, reviews: number, site?: string];
const COMPETITOR_SEEDS: Record<string, CompetitorSeed[]> = {
  "locations/1001": [
    ["Austin Family Dentistry", "210 W 6th St, Austin, TX 78701", 0.6, "Dentist", ["Cosmetic dentist", "Pediatric dentist", "Dental implants periodontist"], 4.8, 412, "austinfamilydentistry.example"],
    ["Bright Smiles Downtown", "98 Congress Ave, Austin, TX 78701", 0.9, "Dentist", ["Cosmetic dentist", "Teeth whitening service"], 4.6, 268, "brightsmiles.example"],
    ["Capital City Dental Care", "500 E 7th St, Austin, TX 78701", 1.2, "Dentist", ["Emergency dental service", "Dental implants periodontist"], 4.7, 189],
    ["Lone Star Orthodontics", "1201 Red River St, Austin, TX 78701", 1.8, "Orthodontist", ["Dentist"], 4.9, 356, "lonestarortho.example"],
    ["Eastside Dental Studio", "1800 E 6th St, Austin, TX 78702", 2.3, "Dentist", ["Cosmetic dentist", "Dental implants periodontist", "Emergency dental service"], 4.5, 97],
    ["Zilker Dental Group", "2200 S Lamar Blvd, Austin, TX 78704", 3.1, "Dentist", ["Pediatric dentist"], 4.4, 143],
    ["Riverside Smile Center", "1600 E Riverside Dr, Austin, TX 78741", 3.6, "Cosmetic dentist", ["Dentist", "Teeth whitening service"], 4.2, 58],
    ["Mueller Dental", "1900 Aldrich St, Austin, TX 78723", 6.4, "Dentist", [], null, 0],
  ],
  "locations/1002": [
    ["Lakeshore Coffee Co.", "60 Lake Rd, Austin, TX 78702", 0.3, "Coffee shop", ["Cafe", "Breakfast restaurant"], 4.7, 534, "lakeshorecoffee.example"],
    ["The Green Bean", "1100 E Cesar Chavez St, Austin, TX 78702", 0.8, "Cafe", ["Vegan restaurant", "Tea house"], 4.6, 312],
    ["Sunday Brunch House", "1401 E 7th St, Austin, TX 78702", 1.1, "Brunch restaurant", ["Cafe", "Breakfast restaurant"], 4.5, 821, "sundaybrunch.example"],
    ["Bean & Leaf", "2001 E MLK Jr Blvd, Austin, TX 78702", 1.9, "Cafe", ["Tea house", "Bakery"], 4.3, 176],
    ["Rosewood Cafe", "1200 Rosewood Ave, Austin, TX 78702", 2.2, "Cafe", [], 4.1, 64],
    ["Barton Springs Roasters", "1500 Barton Springs Rd, Austin, TX 78704", 3.4, "Coffee roasters", ["Coffee shop", "Cafe"], 4.8, 990, "bartonroasters.example"],
  ],
  "locations/1003": [
    ["Iron Republic Gym", "700 Lavaca St, Austin, TX 78701", 0.5, "Gym", ["Personal trainer", "Health club"], 4.8, 645, "ironrepublic.example"],
    ["Downtown Yoga Loft", "301 Congress Ave, Austin, TX 78701", 0.7, "Yoga studio", ["Pilates studio"], 4.9, 402],
    ["Core Strength Austin", "1000 E 5th St, Austin, TX 78702", 1.6, "Gym", ["Fitness center", "Health club"], 4.6, 288, "corestrength.example"],
    ["24/7 Fit Club", "2400 S Congress Ave, Austin, TX 78704", 2.9, "Fitness center", ["Gym"], 3.9, 731],
    ["Pulse Boxing & Fitness", "1515 S Lamar Blvd, Austin, TX 78704", 3.3, "Boxing gym", ["Gym", "Personal trainer"], 4.7, 210],
    ["Hill Country CrossFit", "3200 N Lamar Blvd, Austin, TX 78705", 4.8, "Gym", ["Fitness center"], 4.5, 156],
  ],
};

/** Demo: a year of steady review growth ending at today's count (busier businesses gain more), so the growth chart has data. */
function demoReviewHistory(name: string, reviewCount: number, rating: number | null) {
  const days = 365;
  const perDay = (reviewCount / 900) * (0.6 + rand(`${name}|pace`) * 0.9);
  const out = [];
  for (let d = days; d >= 0; d--) {
    const date = format(new Date(Date.now() - d * 86_400_000), "yyyy-MM-dd");
    // Small day-to-day wobble, never going backwards.
    const count = Math.max(0, Math.round(reviewCount - perDay * d - rand(`${name}|${date}`) * perDay * 2));
    out.push({ date, rating, reviewCount: Math.min(reviewCount, count) });
  }
  for (let i = 1; i < out.length; i++) out[i].reviewCount = Math.max(out[i].reviewCount, out[i - 1].reviewCount);
  out[out.length - 1].reviewCount = reviewCount;
  return out;
}

const toCompetitor = ([name, address, distanceKm, primaryCategory, additionalCategories, rating, reviewCount, site]: CompetitorSeed, id: string): Competitor => ({
  id,
  placeId: null,
  name,
  address,
  distanceKm,
  primaryCategory,
  additionalCategories,
  rating,
  reviewCount,
  websiteUri: site ? `https://${site}/` : null,
  source: "found",
  history: demoReviewHistory(name, reviewCount, rating),
});
/** Same business: same Google cid, or same name + address. */
const sameBusiness = (a: Pick<Competitor, "cid" | "name" | "address">, b: Pick<Competitor, "cid" | "name" | "address">) =>
  (!!a.cid && a.cid === b.cid) || (a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.address.trim().toLowerCase() === b.address.trim().toLowerCase());

// ---- Google Search Console (demo): properties the signed-in account can see, and generated Search Analytics.
const SC_PROPERTIES: SearchConsoleProperty[] = [
  { siteUrl: "sc-domain:example.com", permission: "siteOwner" },
  { siteUrl: "https://example.com/", permission: "siteOwner" },
  { siteUrl: "https://greenleafcafe.example/", permission: "siteFullUser" },
  { siteUrl: "https://example.com/fitness/", permission: "siteFullUser" },
];
const SC_EXTRA: Record<string, string[]> = {
  "locations/1001": ["sunrise dental clinic", "dentist open saturday austin", "teeth cleaning cost austin", "invisalign austin", "dental implants austin"],
  "locations/1002": ["green leaf cafe", "green leaf cafe menu", "cafe near lake rd", "best brunch austin", "vegan cafe austin", "coffee near me open now"],
  "locations/1003": ["peak fitness studio", "peak fitness austin hours", "gym day pass austin", "yoga downtown austin", "personal trainer near me"],
};
const hash = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
const rand = (seed: string) => (hash(seed) % 10_000) / 10_000;
/** One query on one day: deterministic, branded searches rank high, broad ones lower and drifting. */
function scDay(locationId: string, query: string, date: string, i: number) {
  const base = rand(`${locationId}|${query}`);
  const branded = /cafe|dental|fitness|green leaf|sunrise|peak/.test(query) && !/near|best|open|cost/.test(query);
  const day = Math.floor(new Date(`${date}T00:00:00`).getTime() / 86_400_000);
  const wiggle = Math.sin(day / 6 + base * 10) * (branded ? 0.3 : 2.2) + (rand(`${query}|${date}`) - 0.5) * (branded ? 0.4 : 2);
  const position = Math.max(1, (branded ? 1.2 + base * 1.5 : 4 + base * 18) + wiggle - (day % 365) * 0.004);
  const impressions = Math.round(Math.max(0, (branded ? 6 : 30) * (1.3 - base) * (1 + Math.sin(day / 3.5) * 0.25) - i * 0.6));
  const ctrRate = Math.max(0.005, (branded ? 0.45 : 0.18) / Math.max(1, position * 0.8));
  const clicks = Math.round(impressions * ctrRate * (0.7 + rand(`${date}|${query}|c`) * 0.6));
  return { impressions, clicks, position };
}
const scDays = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = new Date(`${a}T00:00:00`); d <= new Date(`${b}T00:00:00`); d.setDate(d.getDate() + 1)) out.push(format(d, "yyyy-MM-dd"));
  return out;
};
/** The same number of days right before `from` (empty when compare is off). */
const scPrevDays = (from: string, length: number, compare: boolean) =>
  compare
    ? scDays(format(new Date(new Date(`${from}T00:00:00`).getTime() - length * 86_400_000), "yyyy-MM-dd"), format(new Date(new Date(`${from}T00:00:00`).getTime() - 86_400_000), "yyyy-MM-dd"))
    : [];
const scAgg = (rows: { impressions: number; clicks: number; position: number }[]): SearchConsoleMetrics => {
  const impressions = Math.round(rows.reduce((a, r) => a + r.impressions, 0));
  const clicks = Math.round(rows.reduce((a, r) => a + r.clicks, 0));
  // Google weights average position by impressions.
  const position = impressions ? rows.reduce((a, r) => a + r.position * r.impressions, 0) / rows.reduce((a, r) => a + r.impressions, 0) : 0;
  return { impressions, clicks, ctr: impressions ? clicks / impressions : 0, position: Math.round(position * 10) / 10 };
};
const scQueries = (locationId: string) => [...new Set([...(KEYWORDS[locationId] ?? []), ...(SC_EXTRA[locationId] ?? [])])];
/** Pages of each demo site; a query's impressions split over the home page and a couple of these. */
const SC_PAGES: Record<string, string[]> = {
  "locations/1001": ["services/", "services/teeth-cleaning/", "services/invisalign/", "services/dental-implants/", "about/", "contact/", "blog/how-often-teeth-cleaning/"],
  "locations/1002": ["menu/", "brunch/", "about/", "contact/", "blog/best-vegan-breakfast-austin/", "catering/"],
  "locations/1003": ["classes/", "classes/yoga/", "personal-training/", "pricing/", "about/", "contact/"],
};
const SC_DEVICES: { device: SearchConsoleDevice; share: number; shift: number }[] = [
  { device: "MOBILE", share: 0.64, shift: -0.3 },
  { device: "DESKTOP", share: 0.31, shift: 0.7 },
  { device: "TABLET", share: 0.05, shift: 1.4 },
];
/** Split day rows into a share of impressions/clicks, ranking `shift` places lower (fractions; scAgg rounds the totals). */
const scShare = (rows: { impressions: number; clicks: number; position: number }[], share: number, shift: number) =>
  rows.map((r) => ({ impressions: r.impressions * share, clicks: r.clicks * share * (shift > 0 ? 0.8 : 1.1), position: Math.max(1, r.position + shift) })).filter((r) => r.impressions > 0);

// ---- tasks: a few team tasks; review follow-ups are added by syncReviewTasks() on every list.
function seedTasks(): Task[] {
  const day = (d: number) => format(new Date(Date.now() + d * 86_400_000), "yyyy-MM-dd");
  const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const t = (id: string, p: Omit<Task, "id" | "createdAt" | "order"> & { order?: number }, createdDaysAgo = 3): Task => ({ id, order: 0, createdAt: ago(createdDaysAgo), createdBy: "u0", ...p });
  return [
    t(
      "t1",
      {
        title: "Plan November offer posts",
        description: "Three posts for the holiday season: launch, reminder and last-chance.",
        stage: "in_progress",
        priority: "high",
        assigneeId: "u1",
        dueDate: day(3),
        locationId: "locations/1001",
        order: 1,
      },
      6,
    ),
    t("t1a", { title: "Write post copy", stage: "done", priority: "medium", assigneeId: "u1", parentId: "t1", locationId: "locations/1001", completedAt: ago(1) }),
    t("t1b", { title: "Pick photos for each post", stage: "todo", priority: "medium", assigneeId: "u2", dueDate: day(2), parentId: "t1", locationId: "locations/1001" }),
    t("t1c", { title: "Schedule in Content", stage: "todo", priority: "medium", assigneeId: "u1", dueDate: day(3), parentId: "t1", locationId: "locations/1001" }),
    t(
      "t2",
      {
        title: "Update holiday hours on all profiles",
        description: "Thanksgiving and Christmas special hours for every location.",
        stage: "todo",
        priority: "urgent",
        assigneeId: "u0",
        dueDate: day(1),
        locationId: null,
        order: 1,
      },
      2,
    ),
    t("t3", { title: "Upload new interior photos", stage: "todo", priority: "medium", assigneeId: "u2", dueDate: day(9), locationId: "locations/1002", order: 2 }, 4),
    t("t4", { title: "Ask last week's customers for reviews", stage: "in_review", priority: "medium", assigneeId: "u3", dueDate: day(-1), locationId: "locations/1002", order: 1 }, 8),
    t("t5", { title: "Add the new brunch menu as products", stage: "todo", priority: "low", assigneeId: null, dueDate: null, locationId: "locations/1002", order: 3 }, 1),
    t("t6", { title: "Fix duplicate listing report", stage: "done", priority: "high", assigneeId: "u0", dueDate: day(-4), locationId: null, order: 1, completedAt: ago(3) }, 12),
    t("t7", { title: "Refresh class schedule in the description", stage: "todo", priority: "medium", assigneeId: "u3", dueDate: day(5), locationId: "locations/1003", order: 2 }, 2),
  ];
}

/** Live mode: real Google data (src/lib/gbp/live.ts) and no demo content; the workspace state is saved to SQLite. */
export const liveMode = () => process.env.GBP_DATA_SOURCE === "google";

/** A new workspace: nothing but the starter message templates. */
export function emptyState(): MockState {
  return {
    locations: [],
    reviews: new Map(),
    requests: [],
    posts: [],
    connections: [],
    members: [],
    passwords: new Map(),
    postSeq: 100,
    searchConsole: { status: "not_connected", sites: {} },
    tasks: [],
    dismissedReviewTasks: new Set(),
    emailSender: { status: "not_connected", sentToday: 0, dailyLimit: 500 },
    templates: STARTER_TEMPLATES.map((t, i) => ({ ...t, id: `tpl${i + 1}`, updatedAt: new Date().toISOString() })),
    competitorEdits: {},
  };
}

/** The demo workspace (sample data). Each signed-in demo user gets their own deep copy (see tenancy.ts). */
export function seedState(): MockState {
  return structuredClone<MockState>({
    locations: seedLocations,
    reviews: new Map(seedLocations.map((l, i) => [l.id, seededReviews(l.id, i)])),
    requests: seedRequests(),
    posts: seedPosts(),
    // Demo: a mix of states so Settings shows every case.
    connections: seedConnections(),
    members: seedMembers(),
    passwords: new Map(),
    postSeq: 100,
    searchConsole: { status: "not_connected", sites: {} },
    tasks: seedTasks(),
    dismissedReviewTasks: new Set(),
    // Demo: Gmail starts disconnected so Settings → Email shows the connect flow.
    emailSender: { status: "not_connected", sentToday: 0, dailyLimit: 500 },
    templates: STARTER_TEMPLATES.map((t, i) => ({ ...t, id: `tpl${i + 1}`, updatedAt: new Date(Date.now() - (i + 2) * 86_400_000).toISOString() })),
  } as MockState);
}

// Without a signed-in workspace (open demo, local tools) the demo uses one shared sample workspace. Live mode never does:
// there every call must run inside a workspace (gbp/index.ts), so one customer's data can't reach another.
const base: MockState | null = liveMode() ? null : (g.__gbpMockV21 ??= seedState());
function current(): MockState {
  const t = currentTenant();
  if (t) return t.state as MockState;
  if (base) return base;
  throw new Error("No workspace for this request");
}

/** An object that forwards every access to `pick()` at the time of use (methods bound to it, so Map/Array methods work). */
function view<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get: (_, k) => {
      const t = pick();
      const v = Reflect.get(t, k, t);
      return typeof v === "function" ? v.bind(t) : v;
    },
    set: (_, k, v) => Reflect.set(pick(), k, v),
    has: (_, k) => Reflect.has(pick(), k),
    deleteProperty: (_, k) => Reflect.deleteProperty(pick(), k),
    ownKeys: () => Reflect.ownKeys(pick()),
    getOwnPropertyDescriptor: (_, k) => {
      const d = Reflect.getOwnPropertyDescriptor(pick(), k);
      if (d) d.configurable = true;
      return d;
    },
  });
}

/** The current workspace's data. live.ts refreshes the Google parts in place; gbp/index.ts saves it after every call. */
const state: MockState = view(current);
export const workspace = state;
const locations = view(() => current().locations);
const reviews = view(() => current().reviews);

/** One follow-up task (with the usual steps as subtasks) per unhappy review that doesn't have one yet. */
function syncReviewTasks() {
  const day = (iso: string, plus: number) => format(new Date(new Date(iso).getTime() + plus * 86_400_000), "yyyy-MM-dd");
  for (const [locationId, list] of reviews) {
    for (const r of list) {
      const id = `task-review-${r.id}`;
      // Demo: only recent reviews, so year-old seed reviews don't flood the list with overdue follow-ups.
      if (Date.now() - new Date(r.createTime).getTime() > 60 * 86_400_000) continue;
      if (!needsFollowUpTask(r) || state.dismissedReviewTasks.has(r.id) || state.tasks.some((t) => t.id === id)) continue;
      const started = !!r.followUp || !!r.reply;
      const base = { locationId, createdAt: r.createTime, createdBy: null, assigneeId: r.assignedTo ?? null };
      state.tasks.push({
        ...base,
        id,
        title: `Follow up with ${r.reviewer}`,
        description: `${r.rating}-star review on Google. Reply publicly, then reach out to make it right.`,
        stage: started ? "in_progress" : "todo",
        priority: r.rating === 1 ? "urgent" : r.rating === 2 ? "high" : "medium",
        dueDate: day(r.createTime, 2),
        order: -new Date(r.createTime).getTime() / 1e12,
        source: { type: "review", reviewId: r.id, reviewer: r.reviewer, rating: r.rating, excerpt: r.comment?.slice(0, 160) ?? null },
      });
      const steps: [string, boolean][] = [
        ["Reply on Google", !!r.reply],
        ["Contact the customer", !!r.followUp],
        ["Log what was agreed", false],
      ];
      steps.forEach(([title, done], i) =>
        state.tasks.push({ ...base, id: `${id}-s${i}`, parentId: id, title, stage: done ? "done" : "todo", priority: "medium", order: i, completedAt: done ? r.createTime : null }),
      );
    }
  }
}

const conn = (channel: Channel) => {
  let c = state.connections.find((x) => x.channel === channel);
  if (!c) {
    c = { channel, status: "not_connected", targets: [] };
    state.connections.push(c);
  }
  return c;
};

/** Publish to the connected Facebook Page / Instagram account (meta/publish.ts) → that channel's result. */
export async function publishMeta(post: Post, channel: "facebook" | "instagram"): Promise<ChannelResult> {
  const target = state.connections.find((x) => x.channel === channel)?.targets[0]?.id;
  if (!target) return { status: "failed", error: `Choose a ${channel === "facebook" ? "Facebook Page" : "Instagram account"} in Settings → Accounts` };
  try {
    const r = channel === "facebook" ? await publishToFacebook(post, target) : await publishToInstagram(post, target);
    return { status: "published", posted_at: new Date().toISOString(), permalink: r.permalink, external_ids: [r.id] };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : `${channel} didn't accept the post` };
  }
}

const findPost = (id: string) => {
  const post = state.posts.find((p) => p.id === id);
  if (!post) throw new Error(`Post not found: ${id}`);
  return post;
};

export const mockProvider: GbpProvider = {
  async listLocations() {
    // Only the locations picked under Settings → Google (demo keeps showing all when Google is disconnected).
    const g = conn("google");
    return g.status === "connected" && g.targets.length ? locations.filter((l) => g.targets.some((t) => t.id === l.id)) : locations;
  },
  async getLocation(id) {
    return locations.find((l) => l.id === id) ?? null;
  },
  async searchCategories(query, limit = 12) {
    return searchCategoryList(GOOGLE_CATEGORIES, query, limit);
  },
  async listCompetitors(id) {
    const edits = (state.competitorEdits ??= {})[id] ?? { added: [], hidden: [] };
    const found = (COMPETITOR_SEEDS[id] ?? []).map((seed, i) => toCompetitor(seed, `${id}/competitors/${i + 1}`));
    return [...found, ...edits.added].map((c) => ({ ...c, hidden: edits.hidden.includes(c.id) }));
  },
  async addCompetitor(id, input) {
    const edits = ((state.competitorEdits ??= {})[id] ??= { added: [], hidden: [] });
    const existing = (await mockProvider.listCompetitors(id)).find((c) => sameBusiness(c, input));
    if (existing) {
      // Already in the list (maybe removed): bring it back, with the new details if it was added by link.
      edits.hidden = edits.hidden.filter((h) => h !== existing.id);
      return existing.source === "added" ? mockProvider.updateCompetitor(id, existing.id, input) : { ...existing, hidden: false };
    }
    const added = edits.added.length;
    if (added >= MAX_COMPETITORS) throw new Error(`You can track up to ${MAX_COMPETITORS} competitors per business. Remove one to add another.`);
    const now = new Date().toISOString();
    // Added from a link: its numbers were just read, so they're the first daily point.
    const c: Competitor = {
      id: `${id}/competitors/added-${state.postSeq++}`,
      placeId: null,
      ...input,
      source: "added",
      updatedAt: now,
      checkedAt: input.mapsUrl ? now : null,
      history: input.mapsUrl ? addPoint([], { date: now.slice(0, 10), rating: input.rating, reviewCount: input.reviewCount }) : [],
    };
    edits.added.push(c);
    return c;
  },
  async updateCompetitor(id, competitorId, input) {
    const c = (state.competitorEdits ??= {})[id]?.added.find((x) => x.id === competitorId);
    if (!c) throw new Error("Only competitors you added can be edited");
    const now = new Date().toISOString();
    Object.assign(c, input, { updatedAt: now });
    // New numbers (typed or refreshed from Google) are today's point.
    c.history = addPoint(c.history, { date: now.slice(0, 10), rating: input.rating, reviewCount: input.reviewCount });
    return { ...c };
  },
  async recordCompetitorCheck(id, competitorId, result) {
    const c = (state.competitorEdits ??= {})[id]?.added.find((x) => x.id === competitorId);
    if (!c) return;
    const now = new Date().toISOString();
    c.checkedAt = now;
    if ("error" in result) {
      c.checkError = result.error;
      return;
    }
    c.checkError = null;
    c.rating = result.rating;
    c.reviewCount = result.reviewCount;
    c.history = addPoint(c.history, { date: now.slice(0, 10), rating: result.rating, reviewCount: result.reviewCount });
  },
  async deleteCompetitor(id, competitorId) {
    const edits = (state.competitorEdits ??= {})[id];
    if (!edits) return;
    edits.added = edits.added.filter((c) => c.id !== competitorId);
    edits.hidden = edits.hidden.filter((h) => h !== competitorId);
  },
  async setCompetitorHidden(id, competitorId, hidden) {
    const edits = ((state.competitorEdits ??= {})[id] ??= { added: [], hidden: [] });
    edits.hidden = edits.hidden.filter((h) => h !== competitorId);
    if (hidden) edits.hidden.push(competitorId);
  },
  async getProfileSuggestions(id) {
    const loc = locations.find((l) => l.id === id);
    if (!loc) throw new Error(`Location not found: ${id}`);
    return suggestionsFor(loc);
  },
  async addPhotos(id, photos) {
    const loc = locations.find((l) => l.id === id);
    if (!loc) throw new Error(`Location not found: ${id}`);
    const added = photos.map((p) => ({ ...p, id: `ph_${Math.random().toString(36).slice(2, 10)}`, createdAt: new Date().toISOString() }));
    // Logo and cover are single slots: the newest one wins.
    const single = new Set(added.filter((p) => p.category === "logo" || p.category === "cover").map((p) => p.category));
    loc.photos = [...(loc.photos ?? []).filter((p) => !single.has(p.category)), ...added];
    syncPhotoStats(loc);
    return added;
  },
  async updatePhoto(id, photoId, patch) {
    const loc = locations.find((l) => l.id === id);
    const photo = loc?.photos?.find((p) => p.id === photoId);
    if (!loc || !photo) throw new Error(`Photo not found: ${photoId}`);
    if (patch.category === "logo" || patch.category === "cover") loc.photos = loc.photos!.filter((p) => p.id === photoId || p.category !== patch.category);
    photo.category = patch.category;
    syncPhotoStats(loc);
    return photo;
  },
  async deletePhoto(id, photoId) {
    const loc = locations.find((l) => l.id === id);
    if (!loc) throw new Error(`Location not found: ${id}`);
    loc.photos = (loc.photos ?? []).filter((p) => p.id !== photoId);
    syncPhotoStats(loc);
  },
  async updateLocation(id, patch) {
    const loc = locations.find((l) => l.id === id);
    if (!loc) throw new Error(`Location not found: ${id}`);
    Object.assign(loc, patch);
    return loc;
  },
  async listReviews(locationId) {
    return reviews.get(locationId) ?? [];
  },
  async updateReview(locationId, reviewId, patch) {
    const review = reviews.get(locationId)?.find((r) => r.id === reviewId);
    if (!review) throw new Error(`Review not found: ${reviewId}`);
    const { reply, ...rest } = patch;
    if (reply !== undefined) review.reply = reply ? { comment: reply, updateTime: new Date().toISOString() } : undefined;
    Object.assign(review, rest);
    return review;
  },
  async listTeamMembers() {
    return state.members.filter((m) => m.status === "active").map((m) => ({ id: m.id, name: m.name }));
  },
  async listMembers() {
    return state.members;
  },
  async getCurrentMember() {
    return state.members.find((m) => m.id === "u0") ?? state.members[0];
  },
  async inviteMember({ email, name, role, locationIds }) {
    const e = email.trim().toLowerCase();
    if (state.members.some((m) => m.email.toLowerCase() === e)) throw new Error(`${email} is already in this workspace`);
    const me = await mockProvider.getCurrentMember();
    const m: Member = {
      id: `u${state.postSeq++}`,
      name: name?.trim() ?? "",
      email: e,
      role,
      status: "invited",
      locationIds: role === "admin" ? [] : locationIds,
      invitedAt: new Date().toISOString(),
      invitedBy: me.name,
      inviteToken: token(),
    };
    state.members.push(m);
    return m;
  },
  async updateMember(id, patch) {
    const m = state.members.find((x) => x.id === id);
    if (!m) throw new Error("User not found");
    Object.assign(m, patch);
    if (m.role === "admin") m.locationIds = [];
    return m;
  },
  async changePassword(id, current, next) {
    const m = state.members.find((x) => x.id === id);
    if (!m) throw new Error("User not found");
    const stored = state.passwords.get(id);
    if (stored) {
      const [salt, hash] = stored.split(":");
      if (!current || !timingSafeEqual(Buffer.from(hash, "hex"), scryptSync(current, salt, 32))) throw new Error("Current password is incorrect");
    } else if (m.passwordChangedAt && !current) throw new Error("Enter your current password");
    const salt = randomBytes(16).toString("hex");
    state.passwords.set(id, `${salt}:${scryptSync(next, salt, 32).toString("hex")}`);
    m.passwordChangedAt = new Date().toISOString();
    return m;
  },
  async sendPasswordReset(id) {
    // Demo: no email service yet; live sends a one-time link to the member's email.
    if (!state.members.some((x) => x.id === id)) throw new Error("User not found");
  },
  async removeMember(id) {
    state.members = state.members.filter((m) => m.id !== id);
  },
  async resendInvite(id) {
    const m = state.members.find((x) => x.id === id);
    if (!m || m.status !== "invited") throw new Error("Invite not found");
    Object.assign(m, { inviteToken: token(), invitedAt: new Date().toISOString() });
    return m;
  },
  async findInvite(t) {
    return state.members.find((m) => m.status === "invited" && m.inviteToken === t) ?? null;
  },
  async acceptInvite(t) {
    const m = state.members.find((x) => x.status === "invited" && x.inviteToken === t);
    if (!m) throw new Error("This invite link is no longer valid");
    Object.assign(m, { status: "active", inviteToken: null, joinedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), name: m.name || m.email.split("@")[0] });
    return m;
  },
  async listReviewRequests() {
    return state.requests;
  },
  async createReviewRequest(input) {
    const req: ReviewRequest = { ...input, id: `q${state.postSeq++}`, createdAt: new Date().toISOString(), sentAt: input.status === "sent" ? new Date().toISOString() : null };
    state.requests.unshift(req);
    return req;
  },
  async updateReviewRequest(id, patch) {
    const req = state.requests.find((r) => r.id === id);
    if (!req) throw new Error(`Request not found: ${id}`);
    if (patch.status === "sent" && !req.sentAt) req.sentAt = new Date().toISOString();
    Object.assign(req, patch);
    return req;
  },
  async getMetrics(locationId, days) {
    return metrics(locationId, days);
  },
  async getSearchConsole() {
    return state.searchConsole;
  },
  async connectSearchConsole() {
    // Demo: pretend Google sign-in granted Search Console access, and pick the property matching each location's website.
    const sites: Record<string, string> = {};
    for (const l of state.locations) {
      const host = l.websiteUri ? new URL(l.websiteUri).hostname.replace(/^www\./, "") : null;
      const match =
        host &&
        (SC_PROPERTIES.find((p) => l.websiteUri && p.siteUrl === new URL(l.websiteUri).origin + new URL(l.websiteUri).pathname.replace(/\/?$/, "/")) ??
          SC_PROPERTIES.find((p) => p.siteUrl === `sc-domain:${host}`));
      if (match) sites[l.id] = match.siteUrl;
    }
    if (!sites["locations/1002"]) sites["locations/1002"] = "https://greenleafcafe.example/";
    state.searchConsole = { status: "connected", account: "owner@example.com", connectedAt: new Date().toISOString(), sites };
    return state.searchConsole;
  },
  async listSearchConsoleProperties() {
    if (state.searchConsole.status !== "connected") throw new Error("Connect Google Search Console first");
    return SC_PROPERTIES;
  },
  async setSearchConsoleSites(sites) {
    if (state.searchConsole.status !== "connected") throw new Error("Connect Google Search Console first");
    const next = { ...state.searchConsole.sites };
    for (const [locationId, siteUrl] of Object.entries(sites)) {
      if (siteUrl && !SC_PROPERTIES.some((p) => p.siteUrl === siteUrl)) throw new Error(`No access to ${siteUrl}`);
      if (siteUrl) next[locationId] = siteUrl;
      else delete next[locationId];
    }
    state.searchConsole = { ...state.searchConsole, sites: next };
    return state.searchConsole;
  },
  async disconnectSearchConsole() {
    state.searchConsole = { status: "not_connected", sites: {} };
  },
  async getSearchConsoleReport(locationId, { from, to, compare }) {
    const siteUrl = state.searchConsole.status === "connected" ? state.searchConsole.sites[locationId] : undefined;
    if (!siteUrl) return null;
    const queries = scQueries(locationId);
    const agg = scAgg;
    const span = scDays(from, to);
    const prevSpan = scPrevDays(from, span.length, compare);
    const per = (q: string, i: number, ds: string[]) => ds.map((d) => scDay(locationId, q, d, i)).filter((r) => r.impressions > 0);
    const rows = queries
      .map((query, i) => {
        const cur = per(query, i, span);
        const prev = per(query, i, prevSpan);
        return cur.length ? [{ query, ...agg(cur), prev: compare && prev.length ? agg(prev) : null }] : [];
      })
      .flat()
      .sort((a, b) => b.impressions - a.impressions);
    const daily = span.map((date) => ({ date, ...agg(queries.map((q, i) => scDay(locationId, q, date, i)).filter((r) => r.impressions > 0)) }));
    const all = (ds: string[]) => agg(queries.flatMap((q, i) => per(q, i, ds)));
    return { siteUrl, from, to, totals: all(span), prevTotals: compare && prevSpan.length ? all(prevSpan) : null, daily, queries: rows };
  },
  async getSearchConsoleQuery(locationId, query, { from, to, compare }) {
    const siteUrl = state.searchConsole.status === "connected" ? state.searchConsole.sites[locationId] : undefined;
    if (!siteUrl) return null;
    const i = scQueries(locationId).indexOf(query);
    const span = scDays(from, to);
    const prevSpan = scPrevDays(from, span.length, compare);
    // Unknown queries never showed the site: all zeros, like Search Console.
    const day = (date: string) => (i < 0 ? { impressions: 0, clicks: 0, position: 0 } : scDay(locationId, query, date, i));
    const rows = (ds: string[]) => ds.map(day).filter((r) => r.impressions > 0);
    const cur = rows(span);
    const prev = rows(prevSpan);
    const base = siteUrl.startsWith("sc-domain:") ? `https://${siteUrl.slice(10)}/` : siteUrl;
    // Home page plus 1–2 inner pages picked per query; branded searches land almost only on the home page.
    const branded = /cafe|dental|fitness|green leaf|sunrise|peak/.test(query) && !/near|best|open|cost/.test(query);
    const inner = (SC_PAGES[locationId] ?? []).filter((_, k) => rand(`${query}|page|${k}`) > 0.62).slice(0, 2);
    const pageShares = [
      { path: "", share: branded ? 0.86 : 0.55, shift: 0 },
      ...inner.map((path, k) => ({ path, share: (branded ? 0.14 : 0.45) / (inner.length || 1), shift: 2 + k * 3 + rand(`${query}|${path}`) * 4 })),
    ];
    return {
      siteUrl,
      query,
      from,
      to,
      totals: scAgg(cur),
      prevTotals: compare && prev.length ? scAgg(prev) : null,
      daily: span.map((date) => ({ date, ...scAgg(rows([date])) })),
      pages: (inner.length ? pageShares : pageShares.slice(0, 1).map((p) => ({ ...p, share: 1 })))
        .map((p) => ({ page: base + p.path, ...scAgg(scShare(cur, p.share, p.shift)), prev: compare && prev.length ? scAgg(scShare(prev, p.share, p.shift)) : null }))
        .filter((p) => p.impressions > 0)
        .sort((a, b) => b.impressions - a.impressions),
      devices: SC_DEVICES.map((d) => ({ device: d.device, ...scAgg(scShare(cur, d.share, d.shift)) })).filter((d) => d.impressions > 0),
    };
  },
  async getSearchKeywords(locationId) {
    return searchKeywords(locationId);
  },
  async getConnectedChannels() {
    return state.connections.filter(isLive).map((c) => c.channel);
  },
  async listConnections() {
    // Real Google OAuth (GOOGLE_CLIENT_ID set): the Google row follows the stored token, the rest stays simulated.
    if (googleOAuthConfigured()) {
      const g = conn("google");
      const account = await googleAccount("gbp");
      if (!account) Object.assign(g, { status: "not_connected", account: null, targets: [], connectedAt: null, lastSyncAt: null, error: null });
      else if (g.account !== account.email) Object.assign(g, { status: "needs_selection", account: account.email, targets: [], connectedAt: account.connectedAt, error: null });
    }
    // Real Meta app (META_APP_ID … set): the Facebook / Instagram rows follow the stored Facebook connection.
    if (metaConfigured()) {
      const account = await metaAccount();
      for (const ch of ["facebook", "instagram"] as const) {
        const c = conn(ch);
        if (!account) Object.assign(c, { status: "not_connected", account: null, targets: [], connectedAt: null, lastSyncAt: null, expiresAt: null, error: null });
        else if (c.account !== account.name && c.status !== "not_connected") Object.assign(c, { status: "needs_selection", account: account.name, targets: [], error: null });
      }
    }
    return state.connections;
  },
  async connectChannel(channel, account) {
    const c = conn(channel);
    // A real sign-in (Google, or Facebook for a Page / Instagram) passes the account: next, pick what to manage.
    if ((channel === "google" || channel === "facebook" || channel === "instagram") && account) {
      Object.assign(c, { account, status: "needs_selection", targets: [], connectedAt: new Date().toISOString(), lastSyncAt: null, expiresAt: null, error: null });
      return c;
    }
    // Demo stand-in for the OAuth round trip. X posts as the signed-in account, so there's nothing to pick.
    Object.assign(c, {
      account: channel === "google" ? "owner@example.com" : channel === "x" ? "@sunrisedental" : "Demo User",
      status: channel === "x" ? "connected" : "needs_selection",
      targets: channel === "x" ? [{ id: "x-sunrise", name: "@sunrisedental" }] : c.targets,
      connectedAt: new Date().toISOString(),
      lastSyncAt: channel === "x" ? new Date().toISOString() : c.lastSyncAt,
      expiresAt: channel === "linkedin" ? new Date(Date.now() + 60 * 86_400_000).toISOString() : null,
      error: null,
    });
    return c;
  },
  async listConnectionOptions(channel) {
    // Real Google account connected: its actual Business Profile locations.
    if (channel === "google" && (await googleAccount("gbp"))) return listGbpLocations();
    if (channel === "google") return seedLocations.map((l) => ({ id: l.id, name: l.title, sub: `${l.address} · owner@example.com` }));
    // Real Facebook connection: its Pages, and the Instagram business accounts linked to them.
    if ((channel === "facebook" || channel === "instagram") && (await metaAccount())) {
      const pages = await metaPages(true);
      if (channel === "facebook")
        return pages.map((p) => ({ id: p.id, name: p.name, sub: [p.category, p.instagram ? `Instagram @${p.instagram.username} linked` : null].filter(Boolean).join(" · ") || "Facebook Page" }));
      return pages.map((p) => ({
        id: p.instagram?.id ?? `no-ig-${p.id}`,
        name: p.instagram ? `@${p.instagram.username}` : p.name,
        sub: `Via Facebook Page ${p.name}`,
        disabled: p.instagram ? null : "No Instagram business account linked to this Page",
      }));
    }
    if (channel === "facebook") return DEMO_PAGES.map((p) => ({ id: p.id, name: p.name, sub: p.ig ? `Instagram @${p.ig} linked` : "Facebook Page" }));
    if (channel === "instagram")
      return DEMO_PAGES.map((p) => ({ id: p.id, name: p.ig ? `@${p.ig}` : p.name, sub: `Via Facebook Page ${p.name}`, disabled: p.ig ? null : "No Instagram business account linked" }));
    if (channel === "linkedin") return DEMO_LINKEDIN;
    return [];
  },
  async selectConnectionTargets(channel, ids) {
    const options = await mockProvider.listConnectionOptions(channel);
    const picked = options.filter((o) => ids.includes(o.id) && !o.disabled);
    if (!picked.length) throw new Error("Pick at least one");
    if (channel !== "google" && picked.length > 1) throw new Error("Pick one account");
    const c = conn(channel);
    Object.assign(c, { status: "connected", targets: picked.map((o) => ({ id: o.id, name: o.name })), lastSyncAt: new Date().toISOString(), error: null });
    return c;
  },
  async disconnectChannel(channel) {
    if (channel === "google" && googleOAuthConfigured()) await disconnectGoogle("gbp");
    // Facebook and Instagram share one Facebook connection: revoke it when neither is left.
    if ((channel === "facebook" || channel === "instagram") && (await metaAccount())) {
      const other = conn(channel === "facebook" ? "instagram" : "facebook");
      if (channel === "facebook" || other.status === "not_connected") await disconnectMeta();
    }
    Object.assign(conn(channel), { status: "not_connected", account: null, targets: [], connectedAt: null, lastSyncAt: null, expiresAt: null, error: null });
    // Instagram publishes through the Facebook Page.
    if (channel === "facebook") Object.assign(conn("instagram"), { status: "not_connected", account: null, targets: [], connectedAt: null, lastSyncAt: null });
  },
  async syncConnections(channel) {
    const now = new Date().toISOString();
    for (const c of state.connections) if (isLive(c) && (!channel || c.channel === channel)) c.lastSyncAt = now;
  },
  async getEmailSender() {
    // Real Gmail (GOOGLE_CLIENT_ID set): connected = a stored Gmail token. Name and today's count stay in memory.
    if (googleOAuthConfigured()) {
      const account = await googleAccount("gmail");
      state.emailSender = account
        ? { ...state.emailSender, status: "connected", email: account.email, connectedAt: account.connectedAt }
        : { status: "not_connected", sentToday: state.emailSender.sentToday, dailyLimit: state.emailSender.dailyLimit, fromName: state.emailSender.fromName };
    }
    return state.emailSender;
  },
  async connectGmail(email) {
    // Demo stand-in for Google sign-in with the gmail.send scope (real sign-ins pass the Gmail address).
    state.emailSender = { ...state.emailSender, status: "connected", email: email ?? "owner@example.com", connectedAt: new Date().toISOString() };
    return state.emailSender;
  },
  async updateEmailSender(patch) {
    Object.assign(state.emailSender, patch);
    return state.emailSender;
  },
  async disconnectGmail() {
    if (googleOAuthConfigured()) await disconnectGoogle("gmail");
    state.emailSender = { status: "not_connected", sentToday: state.emailSender.sentToday, dailyLimit: state.emailSender.dailyLimit, fromName: state.emailSender.fromName };
  },
  async sendEmail(message) {
    const s = await mockProvider.getEmailSender();
    if (s.status !== "connected") throw new Error("Connect Gmail in Settings → Email to send emails");
    if (s.sentToday >= s.dailyLimit) throw new Error(`Gmail's daily limit of ${s.dailyLimit} emails is reached. Try again tomorrow.`);
    // Real Gmail sends for real; the simulated one (no OAuth client) sends nothing and just counts it like Gmail would.
    if (googleOAuthConfigured() && s.email)
      await sendGmail({ from: s.email, fromName: message.fromName ?? s.fromName, to: message.to, subject: message.subject, body: message.body, html: message.html });
    s.sentToday += 1;
  },
  async listTemplates() {
    return state.templates;
  },
  async saveTemplate(id, input) {
    const now = new Date().toISOString();
    let t = id ? state.templates.find((x) => x.id === id) : undefined;
    if (id && !t) throw new Error("Template not found");
    if (t) Object.assign(t, input, { updatedAt: now });
    else {
      t = { ...input, id: `tpl${state.postSeq++}`, updatedAt: now };
      state.templates.push(t);
    }
    const kind = t.kind;
    // One default per kind: the first of a kind becomes default; a new default replaces the old one.
    if (t.isDefault) for (const x of state.templates) if (x.kind === kind && x.id !== t.id) x.isDefault = false;
    if (!state.templates.some((x) => x.kind === kind && x.isDefault)) t.isDefault = true;
    return t;
  },
  async deleteTemplate(id) {
    const t = state.templates.find((x) => x.id === id);
    state.templates = state.templates.filter((x) => x.id !== id);
    if (t?.isDefault) {
      const next = state.templates.find((x) => x.kind === t.kind);
      if (next) next.isDefault = true;
    }
  },
  async listTasks() {
    syncReviewTasks();
    // Audit tasks finish themselves once their check passes.
    const issues = new Map<string, Set<string>>();
    for (const t of state.tasks) {
      if (t.source?.type !== "audit" || t.stage === "done" || !t.locationId) continue;
      if (!issues.has(t.locationId)) {
        const loc = locations.find((l) => l.id === t.locationId);
        issues.set(t.locationId, new Set(loc ? auditLocation(loc, reviews.get(loc.id) ?? [], state.posts).issues.map((c) => c.id) : []));
      }
      if (!issues.get(t.locationId)!.has(t.source.checkId)) Object.assign(t, { stage: "done", completedAt: new Date().toISOString() });
    }
    return state.tasks;
  },
  async createTask(input: TaskInput) {
    const siblings = state.tasks.filter((t) => (t.parentId ?? null) === (input.parentId ?? null) && t.stage === input.stage);
    const task: Task = {
      id: `t${state.postSeq++}`,
      createdAt: new Date().toISOString(),
      createdBy: (await mockProvider.getCurrentMember()).id,
      ...input,
      // New tasks go to the bottom of their column unless placed.
      order: input.order ?? Math.max(0, ...siblings.map((t) => t.order)) + 1,
      completedAt: input.stage === "done" ? new Date().toISOString() : null,
    };
    state.tasks.push(task);
    return task;
  },
  async updateTask(id, patch) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) throw new Error("Task not found");
    if (patch.stage && patch.stage !== task.stage) task.completedAt = patch.stage === "done" ? new Date().toISOString() : null;
    Object.assign(task, patch);
    // Finishing a review follow-up resolves it on the review too.
    const src = task.source;
    if (task.stage === "done" && src?.type === "review") {
      const review = [...reviews.values()].flat().find((r) => r.id === src.reviewId);
      if (review && review.followUp?.type !== "resolved") review.followUp = { type: "resolved", note: review.followUp?.note ?? "Closed from Tasks.", at: new Date().toISOString() };
    }
    return task;
  },
  async deleteTask(id) {
    const task = state.tasks.find((t) => t.id === id);
    if (task?.source?.type === "review") state.dismissedReviewTasks.add(task.source.reviewId);
    state.tasks = state.tasks.filter((t) => t.id !== id && t.parentId !== id);
  },
  async listPosts() {
    return state.posts;
  },
  async savePost(id, draft, status) {
    const now = new Date().toISOString();
    if (id) {
      const post = findPost(id);
      Object.assign(post, draft, { status, updated_at: now });
      return post;
    }
    const post: Post = { ...draft, id: `p${state.postSeq++}`, status, created_at: now };
    state.posts.push(post);
    return post;
  },
  async reschedulePost(id, scheduledAt) {
    const post = findPost(id);
    post.scheduled_at = scheduledAt;
    post.updated_at = new Date().toISOString();
    return post;
  },
  async publishPost(id) {
    const post = findPost(id);
    const now = new Date().toISOString();
    const results: Post["results"] = {};
    for (const c of post.channels) {
      if (post.results?.[c]?.status === "published") results[c] = post.results[c];
      else if (!state.connections.some((x) => x.channel === c && isLive(x))) results[c] = { status: "failed", error: `${c} is not connected` };
      // Real Facebook / Instagram connection: publish for real (demo channels are only simulated).
      else if ((c === "facebook" || c === "instagram") && (await metaAccount())) results[c] = await publishMeta(post, c);
      else results[c] = { status: "published", posted_at: now };
    }
    post.results = results;
    post.status = postStatusFromResults(post.channels, post.results);
    post.published_at = now;
    post.scheduled_at ??= now;
    return post;
  },
  async deletePost(id) {
    // Published to the real Facebook Page: delete it there first (a refusal keeps the post here, so it can be retried).
    const post = state.posts.find((p) => p.id === id);
    const fb = post?.results?.facebook;
    if (fb?.status === "published" && fb.external_ids?.length && (await metaAccount())) {
      const pageId = state.connections.find((x) => x.channel === "facebook")?.targets[0]?.id;
      for (const ext of fb.external_ids) await deleteFromFacebook(ext, pageId);
    }
    state.posts = state.posts.filter((p) => p.id !== id);
  },
};
