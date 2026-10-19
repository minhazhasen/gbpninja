import type { GbpProvider, LocalPost, Location, MetricPoint, Review } from "./types";

// In-memory demo data so the app runs without Google API access.
// State resets on server restart. It lives on globalThis so dev-mode module
// re-evaluation (route compiles, HMR) doesn't wipe edits mid-session.

const seedLocations: Location[] = [
  {
    id: "locations/1001",
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
    photoCount: 4,
    hasLogo: true,
    hasCoverPhoto: false,
    serviceCount: 2,
    attributes: ["wheelchair_accessible_entrance"],
    verified: true,
  },
  {
    id: "locations/1002",
    accountId: "accounts/demo",
    title: "Green Leaf Cafe",
    primaryCategory: "Cafe",
    additionalCategories: [],
    address: "45 Lake Rd, Austin, TX 78702",
    photoCount: 0,
    hasLogo: false,
    hasCoverPhoto: false,
    serviceCount: 0,
    attributes: [],
    verified: false,
  },
  {
    id: "locations/1003",
    accountId: "accounts/demo",
    title: "Peak Fitness Studio",
    primaryCategory: "Gym",
    additionalCategories: ["Personal trainer", "Yoga studio"],
    address: "800 Congress Ave, Austin, TX 78701",
    phone: "+1 512-555-0199",
    websiteUri: "https://example.com/fitness",
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
    photoCount: 18,
    hasLogo: true,
    hasCoverPhoto: true,
    serviceCount: 6,
    attributes: ["wheelchair_accessible_entrance", "free_wifi", "restroom"],
    verified: true,
  },
];

const names = [
  "Alex Parker", "Maria Garcia", "John Davis", "Priya Shah", "Chen Li", "Sam Rivera", "Fatima Khan", "Leo Martin",
  "Olivia Brown", "Noah Wilson", "Emma Thomas", "Liam Moore",
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
  const pattern = [5, 5, 4, 5, 3, 5, 4, 2, 5, 4, 5, 1] as const;
  return Array.from({ length: 22 - seed * 4 }, (_, i) => {
    const rating = pattern[(i + seed * 5) % pattern.length];
    const created = new Date(Date.now() - (i * 3.5 + seed + 0.3) * 86_400_000).toISOString();
    return {
      id: `${locationId}/reviews/r${i}`,
      locationId,
      reviewer: names[(i + seed) % names.length],
      rating,
      comment: comments[rating][i % comments[rating].length],
      createTime: created,
      reply: i > 3 && i % 3 !== 1 ? { comment: "Thank you for your feedback! We appreciate you taking the time.", updateTime: created } : undefined,
    };
  });
}

interface MockState {
  locations: Location[];
  reviews: Map<string, Review[]>;
  posts: Map<string, LocalPost[]>;
  postSeq: number;
}
const g = globalThis as unknown as { __gbpMock?: MockState };

const postSeeds: { type: LocalPost["type"]; summary: string; day: number; status: LocalPost["status"] }[] = [
  { type: "OFFER", summary: "10% off for new customers this month — mention this post when you book.", day: -12, status: "PUBLISHED" },
  { type: "STANDARD", summary: "Meet the team! A quick look behind the scenes at what we do every day.", day: -6, status: "PUBLISHED" },
  { type: "STANDARD", summary: "Holiday hours update: we close early on Friday.", day: -2, status: "FAILED" },
  { type: "STANDARD", summary: "We're open this weekend — book your visit today!", day: 2, status: "SCHEDULED" },
  { type: "EVENT", summary: "Free community open day with tours, demos and refreshments.", day: 9, status: "SCHEDULED" },
  { type: "OFFER", summary: "Refer a friend and you both get a free upgrade.", day: 16, status: "DRAFT" },
];
const seedPosts = (locations: Location[]) => new Map<string, LocalPost[]>(
  locations.map((l) => [
    l.id,
    postSeeds.map((p, i) => {
      const d = new Date(Date.now() + p.day * 86_400_000);
      d.setHours(10 + (i % 3) * 3, 0, 0, 0);
      return { id: `${l.id}/posts/p${i}`, locationId: l.id, type: p.type, summary: p.summary, scheduledFor: d.toISOString(), status: p.status };
    }),
  ]),
);

function metrics(locationId: string, days: number): MetricPoint[] {
  const base = { "locations/1001": 220, "locations/1002": 90, "locations/1003": 310 }[locationId] ?? 120;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    const wave = Math.round(Math.sin(i / 3) * base * 0.15);
    const weekend = [0, 6].includes(d.getDay()) ? -0.2 : 0;
    const impressions = Math.max(0, Math.round(base * (1 + weekend) + wave + i));
    const searchImpressions = Math.round(impressions * 0.62);
    return {
      date: d.toISOString().slice(0, 10),
      impressions,
      searchImpressions,
      mapsImpressions: impressions - searchImpressions,
      calls: Math.round(impressions * 0.03),
      websiteClicks: Math.round(impressions * 0.05),
      directions: Math.round(impressions * 0.04),
    };
  });
}

const state: MockState = (g.__gbpMock ??= {
  locations: seedLocations,
  reviews: new Map(seedLocations.map((l, i) => [l.id, seededReviews(l.id, i)])),
  posts: seedPosts(seedLocations),
  postSeq: 100,
});
const { locations, reviews, posts } = state;

export const mockProvider: GbpProvider = {
  async listLocations() {
    return locations;
  },
  async getLocation(id) {
    return locations.find((l) => l.id === id) ?? null;
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
  async replyToReview(locationId, reviewId, comment) {
    const review = reviews.get(locationId)?.find((r) => r.id === reviewId);
    if (!review) throw new Error(`Review not found: ${reviewId}`);
    review.reply = { comment, updateTime: new Date().toISOString() };
    return review;
  },
  async getMetrics(locationId, days) {
    return metrics(locationId, days);
  },
  async listPosts(locationId) {
    return posts.get(locationId) ?? [];
  },
  async createPost(input) {
    const post: LocalPost = { ...input, id: `${input.locationId}/posts/p${state.postSeq++}`, status: input.status ?? "SCHEDULED" };
    posts.set(input.locationId, [...(posts.get(input.locationId) ?? []), post]);
    return post;
  },
};
