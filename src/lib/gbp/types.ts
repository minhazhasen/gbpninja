// Domain types for the Google Business Profile manager.
// Shapes loosely follow the Google APIs, flattened for UI use.

export type StarRating = 1 | 2 | 3 | 4 | 5;

export interface Location {
  id: string; // e.g. "locations/123"
  accountId: string; // e.g. "accounts/456"
  title: string;
  primaryCategory: string;
  additionalCategories: string[];
  address: string;
  phone?: string;
  websiteUri?: string;
  description?: string;
  regularHours?: { day: string; open: string; close: string }[];
  photoCount: number;
  hasLogo: boolean;
  hasCoverPhoto: boolean;
  serviceCount: number;
  attributes: string[];
  openingDate?: string;
  verified: boolean;
}

export interface Review {
  id: string;
  locationId: string;
  reviewer: string;
  rating: StarRating;
  comment?: string;
  createTime: string;
  reply?: { comment: string; updateTime: string };
}

export type DailyMetric =
  | "BUSINESS_IMPRESSIONS_DESKTOP_MAPS"
  | "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH"
  | "BUSINESS_IMPRESSIONS_MOBILE_MAPS"
  | "BUSINESS_IMPRESSIONS_MOBILE_SEARCH"
  | "CALL_CLICKS"
  | "WEBSITE_CLICKS"
  | "BUSINESS_DIRECTION_REQUESTS";

export interface MetricPoint {
  date: string; // YYYY-MM-DD
  impressions: number; // searchImpressions + mapsImpressions
  searchImpressions: number;
  mapsImpressions: number;
  calls: number;
  websiteClicks: number;
  directions: number;
}

export type PostType = "STANDARD" | "EVENT" | "OFFER";
export type PostStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";

export interface LocalPost {
  id: string;
  locationId: string;
  type: PostType;
  summary: string;
  callToAction?: { actionType: string; url?: string };
  mediaUrl?: string;
  scheduledFor: string; // ISO datetime
  status: PostStatus;
}

/** Everything the UI needs from a data source. Mock and Google implement this. */
export interface GbpProvider {
  listLocations(): Promise<Location[]>;
  getLocation(locationId: string): Promise<Location | null>;
  updateLocation(locationId: string, patch: Partial<Location>): Promise<Location>;
  listReviews(locationId: string): Promise<Review[]>;
  replyToReview(locationId: string, reviewId: string, comment: string): Promise<Review>;
  getMetrics(locationId: string, days: number): Promise<MetricPoint[]>;
  listPosts(locationId: string): Promise<LocalPost[]>;
  createPost(post: Omit<LocalPost, "id" | "status"> & { status?: "DRAFT" | "SCHEDULED" }): Promise<LocalPost>;
}
