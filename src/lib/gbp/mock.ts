import type { GbpProvider, LocalPost, Location, MetricPoint, Review } from "./types";

// In-memory demo data so the app runs without Google API access.
// State resets on server restart.

const locations: Location[] = [
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
];

const names = ["Alex P.", "Maria G.", "John D.", "Priya S.", "Chen L.", "Sam R.", "Fatima K.", "Leo M."];
const comments: Record<number, string[]> = {
  5: ["Excellent service, highly recommend!", "Friendly staff and spotless office."],
  4: ["Good experience overall, a bit of a wait.", "Very professional."],
  3: ["It was okay. Parking is hard to find."],
  2: ["Billing was confusing and nobody called back."],
  1: ["Rude front desk. Will not return."],
};

function seededReviews(locationId: string, seed: number): Review[] {
  return Array.from({ length: 8 }, (_, i) => {
    const rating = ([5, 5, 4, 3, 5, 2, 4, 1] as const)[(i + seed) % 8];
    const created = new Date(Date.now() - (i * 4 + seed) * 86_400_000).toISOString();
    return {
      id: `${locationId}/reviews/r${i}`,
      locationId,
      reviewer: names[(i + seed) % names.length],
      rating,
      comment: comments[rating][i % comments[rating].length],
      createTime: created,
      reply: i % 3 === 0 ? { comment: "Thank you for your feedback!", updateTime: created } : undefined,
    };
  });
}

const reviews = new Map<string, Review[]>(locations.map((l, i) => [l.id, seededReviews(l.id, i)]));
const posts = new Map<string, LocalPost[]>(
  locations.map((l) => [
    l.id,
    [
      {
        id: `${l.id}/posts/p1`,
        locationId: l.id,
        type: "STANDARD",
        summary: "We're open this weekend — book your visit today!",
        scheduledFor: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        status: "SCHEDULED",
      },
      {
        id: `${l.id}/posts/p0`,
        locationId: l.id,
        type: "OFFER",
        summary: "10% off for new customers this month.",
        scheduledFor: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        status: "PUBLISHED",
      },
    ],
  ]),
);

function metrics(locationId: string, days: number): MetricPoint[] {
  const base = locationId.endsWith("1") ? 220 : 90;
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(Date.now() - (days - 1 - i) * 86_400_000);
    const wave = Math.round(Math.sin(i / 3) * base * 0.15);
    const weekend = [0, 6].includes(d.getDay()) ? -0.2 : 0;
    const impressions = Math.max(0, Math.round(base * (1 + weekend) + wave + i));
    return {
      date: d.toISOString().slice(0, 10),
      impressions,
      calls: Math.round(impressions * 0.03),
      websiteClicks: Math.round(impressions * 0.05),
      directions: Math.round(impressions * 0.04),
    };
  });
}

let postSeq = 100;

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
    const post: LocalPost = { ...input, id: `${input.locationId}/posts/p${postSeq++}`, status: "SCHEDULED" };
    posts.set(input.locationId, [...(posts.get(input.locationId) ?? []), post]);
    return post;
  },
};
