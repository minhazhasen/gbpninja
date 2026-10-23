import type { KeywordMonth } from "../keywords";
import type { Channel, Post, PostDraft, PostStatus } from "../posts";

// Domain types for the Google Business Profile manager.
// Shapes loosely follow the Google APIs, flattened for UI use.

export type StarRating = 1 | 2 | 3 | 4 | 5;

export interface PostalAddress {
  /** CLDR region code, e.g. "US". */
  regionCode: string;
  /** Street address, then optional line 2 (suite, unit). */
  addressLines: string[];
  /** City. */
  locality: string;
  /** State / province, e.g. "TX". */
  administrativeArea: string;
  postalCode: string;
}

/** "always_open" = open 24 hours, 7 days. The last two can come from Google but aren't offered in our editor. */
/** Google media categories (`LocationAssociation.category`). Logo = PROFILE. */
export type PhotoCategory = "logo" | "cover" | "exterior" | "interior" | "product" | "at_work" | "team" | "food_and_drink" | "common_area" | "additional";
export interface Photo {
  id: string;
  /** https URL from Google, or a data: URL for demo uploads. */
  url: string;
  category: PhotoCategory;
  width?: number;
  height?: number;
  createdAt: string;
  /** Google media resource ("accounts/…/locations/…/media/…") when the photo is on Google. */
  googleName?: string | null;
  /** Added by a customer on Google: shown and counted, but only Google can remove it. */
  fromCustomer?: boolean;
  /** Views reported by Google (media `insights.viewCount`). Absent when Google doesn't report it: never estimated. */
  views?: number | null;
}
export type NewPhoto = Pick<Photo, "url" | "category" | "width" | "height">;

export type OpenStatus = "open" | "always_open" | "temporarily_closed" | "open_no_hours" | "permanently_closed";
export type SocialNetwork = "facebook" | "instagram" | "linkedin" | "pinterest" | "tiktok" | "x" | "youtube";
/** One opening period. A day can have several (e.g. split lunch break). */
export interface HoursPeriod {
  day: string;
  open: string;
  close: string;
}

export interface Location {
  id: string; // e.g. "locations/123"
  accountId: string; // e.g. "accounts/456"
  // ---- About
  title: string;
  primaryCategory: string;
  additionalCategories: string[];
  description?: string;
  /** YYYY-MM or YYYY-MM-DD */
  openingDate?: string;
  // ---- Contact
  phone?: string;
  /** Up to 2 extra numbers. */
  additionalPhones?: string[];
  /** Chat link (WhatsApp / SMS). */
  chatUri?: string;
  websiteUri?: string;
  /** Booking link (Business Information `appointment` link). */
  appointmentUri?: string;
  socialProfiles?: Partial<Record<SocialNetwork, string>>;
  // ---- Location
  /** Formatted one-line address, derived from `postalAddress` when present. */
  address: string;
  /** Structured address as Google stores it (Business Information `storefrontAddress`, a PostalAddress). */
  postalAddress?: PostalAddress;
  /** Service-area businesses can hide the address from customers. */
  hideAddress?: boolean;
  /** Places served, up to 20. */
  serviceArea?: string[];
  // ---- Hours
  openStatus?: OpenStatus;
  regularHours?: HoursPeriod[];
  /** Holiday / one-off hours. `closed` wins over open/close. */
  specialHours?: SpecialHours[];
  /** "More hours" by type, e.g. { type: "Delivery", periods: [...] }. `typeId` = Google's hoursTypeId when read from Google. */
  moreHours?: { type: string; typeId?: string; periods: HoursPeriod[] }[];
  // ---- Media, services, attributes
  /** Logo, cover and gallery photos (Google `media`). The counts below are derived from it. */
  photos?: Photo[];
  /** Gallery photos, excluding logo and cover. */
  photoCount: number;
  hasLogo: boolean;
  hasCoverPhoto: boolean;
  /** Services listed on the profile (Business Information `serviceItems`). */
  services: ServiceItem[];
  /** Products (Business Profile product editor; no public API — kept by us and synced manually). */
  products?: Product[];
  /** Attribute ids that are set (demo: see ATTRIBUTE_GROUPS; live: derived from `attributeValues`). */
  attributes: string[];
  /** Live: the attributes Google offers for this profile (depends on its category), with Google's labels and groups. */
  attributeCatalog?: AttributeDef[];
  /** Live: every attribute value on Google, by attribute id (bool: yes/no, enum: one value, repeated enum: values, url: link). */
  attributeValues?: Record<string, AttributeValue>;
  /** Live: parts of the profile Google's API doesn't provide. The app doesn't judge or guess them. */
  notInApi?: "products"[];
  verified: boolean;
  /** Google Maps place id — used for the "write a review" link. */
  placeId?: string;
}

export interface SpecialHours {
  /** YYYY-MM-DD */
  date: string;
  closed: boolean;
  open?: string;
  close?: string;
}

export type ServicePriceType = "none" | "free" | "fixed" | "from";
/** A service as Google stores it (`serviceItems`): grouped under one of the business categories. */
export interface ServiceItem {
  name: string;
  /** One of the location's categories; defaults to the primary one. */
  category?: string;
  priceType?: ServicePriceType;
  /** In the account currency (USD in demo). */
  price?: number;
  description?: string;
  /** Live: Google's predefined service id (structured services keep it when saved back). */
  serviceTypeId?: string;
  /** Live: currency of the price on Google, e.g. "USD". */
  currencyCode?: string;
}

export type ProductPriceType = "none" | "fixed" | "range";
export type ProductButton = "none" | "order" | "buy" | "learn" | "offer" | "call";
export interface Product {
  name: string;
  category?: string;
  priceType?: ProductPriceType;
  price?: number;
  /** Upper bound when priceType is "range". */
  priceMax?: number;
  description?: string;
  /** data: URL until real file storage exists. */
  photo?: string;
  button?: ProductButton;
  buttonUrl?: string;
}

/** A nearby business competing for the same searches (same main category). */
export interface Competitor {
  id: string;
  /** Google place id, when known (links to Google Maps). */
  placeId?: string | null;
  name: string;
  address: string;
  /** Straight-line distance from this profile, km (unknown for ones added by link). */
  distanceKm: number | null;
  primaryCategory: string;
  additionalCategories: string[];
  /** Average star rating (1–5); null when there are no reviews. */
  rating: number | null;
  reviewCount: number;
  websiteUri?: string | null;
  /** "found" = picked automatically (nearby, same main category); "added" = added by the workspace from a Google Maps link. */
  source?: "found" | "added";
  /** The Google Maps link it was added from, and Google's numeric place id (cid) when the link had one. */
  mapsUrl?: string | null;
  cid?: string | null;
  /** When the details (rating, reviews…) were last typed in, for ones added by link. */
  updatedAt?: string | null;
  /** Daily check of its Google Maps link (ones added by link): last attempt, why it failed, and one point per day. */
  checkedAt?: string | null;
  checkError?: string | null;
  history?: CompetitorPoint[];
  /** Removed from the comparison by the workspace (kept so it can be restored). */
  hidden?: boolean;
}

/** One daily check of a competitor's Google profile. */
export interface CompetitorPoint {
  /** yyyy-MM-dd */
  date: string;
  rating: number | null;
  reviewCount: number;
}

/** What's saved when adding / editing a competitor: read from its Google Maps link (src/lib/maps-scrape.ts), then checked by the user. */
export type CompetitorInput = Pick<Competitor, "name" | "address" | "primaryCategory" | "additionalCategories" | "rating" | "reviewCount" | "websiteUri" | "mapsUrl" | "cid" | "distanceKm">;

export interface Review {
  id: string;
  locationId: string;
  reviewer: string;
  /** Google profile photo of the reviewer, when public. */
  reviewerPhoto?: string | null;
  rating: StarRating;
  comment?: string;
  createTime: string;
  reply?: { comment: string; updateTime: string };
  // Fields below are ours (not on Google): kept in our DB alongside the Google review id.
  /** Team member responsible for handling the review. */
  assignedTo?: string | null;
  /** Hidden from the dashboard (still public on Google). */
  hidden?: boolean;
  /** Off-Google follow-up for an unhappy customer. */
  followUp?: { type: FollowUpType; note?: string; at: string } | null;
}

export type FollowUpType = "called" | "emailed" | "resolved";

export interface TeamMember {
  id: string;
  name: string;
}

export type ReviewRequestStatus = "draft" | "sent" | "clicked" | "completed" | "declined";
export type ReviewRequestMethod = "email" | "sms" | "link";

/** "Please review us" request sent to a customer, with the location's Google review link. */
export interface ReviewRequest {
  id: string;
  locationId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  method: ReviewRequestMethod;
  status: ReviewRequestStatus;
  createdAt: string;
  sentAt?: string | null;
  rating?: number | null;
}

export type ReviewPatch = Partial<Pick<Review, "assignedTo" | "hidden" | "followUp">> & { reply?: string | null };

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

/** Everything the UI needs from a data source. Mock and Google implement this. */
export interface GbpProvider {
  listLocations(): Promise<Location[]>;
  getLocation(locationId: string): Promise<Location | null>;
  updateLocation(locationId: string, patch: Partial<Location>): Promise<Location>;
  /** Upload photos. A new logo or cover replaces the current one. */
  addPhotos(locationId: string, photos: NewPhoto[]): Promise<Photo[]>;
  updatePhoto(locationId: string, photoId: string, patch: { category: PhotoCategory }): Promise<Photo>;
  deletePhoto(locationId: string, photoId: string): Promise<void>;
  /** Ideas to complete the profile: secondary categories, services (from the website and the local market), attributes. */
  getProfileSuggestions(locationId: string): Promise<ProfileSuggestions>;
  /** Typeahead over Google's business categories (Business Information `categories.list`). */
  searchCategories(query: string, limit?: number): Promise<BusinessCategory[]>;
  /** This profile's competitors: nearby businesses with the same main category plus ones the workspace added; removed ones have `hidden`. */
  listCompetitors(locationId: string): Promise<Competitor[]>;
  /** Add a competitor from its Google Maps link + typed details; the same business (cid or name + address) is updated and restored instead. */
  addCompetitor(locationId: string, input: CompetitorInput): Promise<Competitor>;
  /** Save a daily check of an added competitor: new rating + review count (one history point per day), or why it failed. */
  recordCompetitorCheck(locationId: string, competitorId: string, result: { rating: number | null; reviewCount: number } | { error: string }): Promise<void>;
  /** Edit an added competitor's details (e.g. new rating / review count). */
  updateCompetitor(locationId: string, competitorId: string, input: CompetitorInput): Promise<Competitor>;
  /** Delete a competitor the workspace added (found ones are hidden instead, see setCompetitorHidden). */
  deleteCompetitor(locationId: string, competitorId: string): Promise<void>;
  /** Remove from the comparison (it goes to the hidden list) or bring it back. */
  setCompetitorHidden(locationId: string, competitorId: string, hidden: boolean): Promise<void>;
  listReviews(locationId: string): Promise<Review[]>;
  /** Reply (null removes it — posted to Google) plus our own fields (assignee, hidden, follow-up). */
  updateReview(locationId: string, reviewId: string, patch: ReviewPatch): Promise<Review>;
  /** Active workspace users (for assigning reviews). */
  listTeamMembers(): Promise<TeamMember[]>;
  /** Everyone in the workspace, including pending invites. */
  listMembers(): Promise<Member[]>;
  /** The signed-in user. */
  getCurrentMember(): Promise<Member>;
  inviteMember(input: { email: string; name?: string | null; role: MemberRole; locationIds: string[] }): Promise<Member>;
  updateMember(id: string, patch: Partial<Pick<Member, "role" | "locationIds" | "name" | "avatarUrl">>): Promise<Member>;
  /** Set or change a member's password. `current` is required once they have one. Throws on a wrong current password. */
  changePassword(id: string, current: string | null, next: string): Promise<Member>;
  /** Email a one-time password reset link to the member. */
  sendPasswordReset(id: string): Promise<void>;
  removeMember(id: string): Promise<void>;
  /** New invite token + timestamp. */
  resendInvite(id: string): Promise<Member>;
  acceptInvite(token: string): Promise<Member>;
  findInvite(token: string): Promise<Member | null>;
  listReviewRequests(): Promise<ReviewRequest[]>;
  createReviewRequest(input: Omit<ReviewRequest, "id" | "createdAt" | "sentAt" | "rating">): Promise<ReviewRequest>;
  updateReviewRequest(id: string, patch: Partial<Pick<ReviewRequest, "status" | "rating">>): Promise<ReviewRequest>;
  /** Daily metrics for the last `days` days (ending today). Google keeps about 18 months. */
  getMetrics(locationId: string, days: number): Promise<MetricPoint[]>;
  /** Monthly search keywords that showed the profile (newest month first). */
  getSearchKeywords(locationId: string): Promise<KeywordMonth[]>;
  /** Channels this workspace can publish to right now (connected and not expired). */
  getConnectedChannels(): Promise<Channel[]>;
  /** Live mode: Google data that couldn't be loaded, per location (pages show these instead of failing). */
  getSyncIssues?(locationIds: string[]): Promise<SyncIssue[]>;
  /** One row per channel for Settings → Accounts. */
  listConnections(): Promise<Connection[]>;
  /** Start connecting (after the OAuth sign-in; `account` = the signed-in email). Usually ends in `needs_selection`. */
  connectChannel(channel: Channel, account?: string | null): Promise<Connection>;
  /** What can be picked after sign-in: Google locations, Facebook Pages, Instagram accounts, LinkedIn authors. */
  listConnectionOptions(channel: Channel): Promise<ConnectionOption[]>;
  selectConnectionTargets(channel: Channel, ids: string[]): Promise<Connection>;
  disconnectChannel(channel: Channel): Promise<void>;
  /** Pull fresh data from every connected account. */
  /** One account, or every connected account when `channel` is omitted. */
  syncConnections(channel?: Channel): Promise<void>;
  getSearchConsole(): Promise<SearchConsoleConnection>;
  /** After Google sign-in with the Search Console (webmasters.readonly) scope. */
  connectSearchConsole(email?: string | null): Promise<SearchConsoleConnection>;
  listSearchConsoleProperties(): Promise<SearchConsoleProperty[]>;
  /** Map locations to properties (null = none). */
  setSearchConsoleSites(sites: Record<string, string | null>): Promise<SearchConsoleConnection>;
  disconnectSearchConsole(): Promise<void>;
  /** Search Analytics for the location's property; null when not connected or no property is picked. */
  getSearchConsoleReport(locationId: string, range: { from: string; to: string; compare: boolean }): Promise<SearchConsoleReport | null>;
  /** One query's detail (dimensions date / page / device, filtered to the query); null when not connected or no property. */
  getSearchConsoleQuery(locationId: string, query: string, range: { from: string; to: string; compare: boolean }): Promise<SearchConsoleQueryDetail | null>;
  getEmailSender(): Promise<EmailSender>;
  /** After Google sign-in with the gmail.send scope (`email` = the signed-in Gmail address). */
  connectGmail(email?: string | null): Promise<EmailSender>;
  updateEmailSender(patch: Partial<Pick<EmailSender, "fromName">>): Promise<EmailSender>;
  disconnectGmail(): Promise<void>;
  /** Send one email through the connected Gmail account. Throws when not connected or over the daily limit. */
  /** `body` is the plain-text part; `html`, when given, is sent as the HTML alternative. */
  sendEmail(message: { to: string; subject: string; body: string; html?: string; fromName?: string | null }): Promise<void>;
  listTemplates(): Promise<MessageTemplate[]>;
  /** Create (id null) or update. Setting isDefault clears it on the other templates of that kind. */
  saveTemplate(id: string | null, input: TemplateInput): Promise<MessageTemplate>;
  deleteTemplate(id: string): Promise<void>;
  /** Every task and subtask in the workspace; review follow-up tasks are created for unhappy reviews as needed. */
  listTasks(): Promise<Task[]>;
  createTask(input: TaskInput): Promise<Task>;
  /** Moving a review follow-up to Done marks the review's follow-up as resolved. */
  updateTask(id: string, patch: TaskPatch): Promise<Task>;
  /** Deletes the task and its subtasks. A deleted review follow-up isn't created again. */
  deleteTask(id: string): Promise<void>;
  /** Every post in the workspace (Google posts can target several locations). */
  listPosts(): Promise<Post[]>;
  savePost(id: string | null, draft: PostDraft, status: Extract<PostStatus, "draft" | "scheduled">): Promise<Post>;
  reschedulePost(id: string, scheduledAt: string): Promise<Post>;
  /** Publishes to every selected channel now; per-channel outcome lands in `results`. */
  publishPost(id: string): Promise<Post>;
  deletePost(id: string): Promise<void>;
}

export interface Suggestion {
  name: string;
  /** Why we suggest it, shown under the chip. */
  reason: string;
}

/** A Google business category, e.g. { id: "categories/gcid:dentist", displayName: "Dentist" }. */
export interface BusinessCategory {
  id: string;
  displayName: string;
}

export interface ProfileSuggestions {
  categories: Suggestion[];
  /** Services mentioned on the business website. */
  websiteServices: Suggestion[];
  /** Services common among nearby competitors in the same category. */
  marketServices: Suggestion[];
  /** Products common for the category. */
  products: Suggestion[];
  /** Attribute ids (see ATTRIBUTE_GROUPS). */
  attributes: Suggestion[];
  /** Where website services were read from, if known. */
  websiteSource?: string | null;
  /** How many competitors the market suggestions are based on. */
  competitorCount?: number;
}

export type ConnectionStatus = "connected" | "not_connected" | "needs_selection" | "error";

export interface Connection {
  channel: Channel;
  status: ConnectionStatus;
  /** Signed-in account (email or handle). */
  account?: string | null;
  /** Picked locations / Page / author. */
  targets: { id: string; name: string }[];
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  /** Some tokens expire (LinkedIn: 60 days). */
  expiresAt?: string | null;
  error?: string | null;
}

/** Google Search Console: free ranking data (average position per search) for a profile's website. */
export interface SearchConsoleProperty {
  /** "sc-domain:example.com" (domain property) or "https://example.com/" (URL-prefix property). */
  siteUrl: string;
  permission: "siteOwner" | "siteFullUser" | "siteRestrictedUser";
}
export interface SearchConsoleConnection {
  status: "connected" | "not_connected";
  /** Google account that granted access. */
  account?: string | null;
  connectedAt?: string | null;
  /** Which Search Console property belongs to each location. */
  sites: Record<string, string>;
}
export interface SearchConsoleMetrics {
  clicks: number;
  impressions: number;
  /** 0–1 */
  ctr: number;
  /** Average position, 1 = top. */
  position: number;
}
export interface SearchConsoleQueryRow extends SearchConsoleMetrics {
  query: string;
  /** Same query in the previous period (compare on), if it had impressions. */
  prev?: SearchConsoleMetrics | null;
}
export interface SearchConsoleReport {
  siteUrl: string;
  /** yyyy-MM-dd, inclusive. Search Console data lags ~2 days. */
  from: string;
  to: string;
  totals: SearchConsoleMetrics;
  prevTotals: SearchConsoleMetrics | null;
  daily: ({ date: string } & SearchConsoleMetrics)[];
  queries: SearchConsoleQueryRow[];
}
export type SearchConsoleDevice = "MOBILE" | "DESKTOP" | "TABLET";
/** One search query: day by day, which pages of the site showed for it, and on which devices. */
export interface SearchConsoleQueryDetail {
  siteUrl: string;
  query: string;
  from: string;
  to: string;
  totals: SearchConsoleMetrics;
  prevTotals: SearchConsoleMetrics | null;
  /** Every day of the range; days without impressions have zeros. */
  daily: ({ date: string } & SearchConsoleMetrics)[];
  pages: ({ page: string; prev?: SearchConsoleMetrics | null } & SearchConsoleMetrics)[];
  devices: ({ device: SearchConsoleDevice } & SearchConsoleMetrics)[];
}

/** A part of a profile's Google data that couldn't be loaded (e.g. insights for an unverified profile). */
export interface SyncIssue {
  locationId: string;
  title: string;
  area: "insights" | "keywords" | "reviews" | "photos" | "posts" | "attributes";
  message: string;
}

export interface ConnectionOption {
  id: string;
  name: string;
  sub?: string | null;
  /** Why it can't be picked, e.g. "No Instagram account linked". */
  disabled?: string | null;
}

/** admin: everything incl. Settings and Users. member: day-to-day work, optionally limited to some locations. */
export type MemberRole = "admin" | "member";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
  status: "active" | "invited";
  /** Locations this person can work on; [] = all locations. Admins always see all. */
  locationIds: string[];
  invitedAt?: string | null;
  invitedBy?: string | null;
  joinedAt?: string | null;
  lastActiveAt?: string | null;
  /** Secret part of the invite link (only while invited). */
  inviteToken?: string | null;
  /** Photo the person uploaded (data: URL until file storage exists). Wins over the Google photo. */
  avatarUrl?: string | null;
  /** Profile photo from their Google account, refreshed on each Google sign-in. */
  googleAvatarUrl?: string | null;
  /** When they last set a password (email + password sign-in); null = Google sign-in only. */
  passwordChangedAt?: string | null;
}

/** Workspace tasks (ours, not Google's). Review follow-ups are created automatically for unhappy reviews. */
export type TaskStage = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export interface Task {
  id: string;
  title: string;
  description?: string | null;
  stage: TaskStage;
  priority: TaskPriority;
  /** Member id. */
  assigneeId?: string | null;
  /** yyyy-MM-dd */
  dueDate?: string | null;
  /** null = workspace-wide (shows on every location). */
  locationId?: string | null;
  /** Set on subtasks. */
  parentId?: string | null;
  /** Position within its stage column (lower = higher up). */
  order: number;
  /** Where an automatic task came from. */
  source?:
    | { type: "review"; reviewId: string; reviewer: string; rating: StarRating; excerpt?: string | null }
    /** From the profile audit's optimization checklist; done automatically once the check passes. */
    | { type: "audit"; checkId: string; section: string }
    | null;
  createdAt: string;
  createdBy?: string | null;
  completedAt?: string | null;
}
export type TaskInput = Pick<Task, "title" | "stage" | "priority"> & Partial<Pick<Task, "description" | "assigneeId" | "dueDate" | "locationId" | "parentId" | "order" | "source">>;
export type TaskPatch = Partial<Pick<Task, "title" | "description" | "stage" | "priority" | "assigneeId" | "dueDate" | "locationId" | "order">>;

/** Gmail account the workspace sends review-request emails from (Gmail API, gmail.send scope). */
export interface EmailSender {
  status: "connected" | "not_connected";
  /** Gmail / Google Workspace address mail is sent from. */
  email?: string | null;
  /** Shown as the sender name, e.g. "Sunrise Dental Clinic". Blank = the location's name. */
  fromName?: string | null;
  /** Replies go here instead of the Gmail address. */
  connectedAt?: string | null;
  sentToday: number;
  /** Gmail's daily sending limit for the account (500 personal, 2,000 Google Workspace). */
  dailyLimit: number;
}

/** Reusable messages: review-request email / text, and public review replies. */
export type TemplateKind = "request_email" | "request_sms" | "reply";
export interface MessageTemplate {
  id: string;
  kind: TemplateKind;
  name: string;
  /** Email only. */
  subject?: string | null;
  body: string;
  /** The one picked first for its kind. */
  isDefault?: boolean;
  /** Replies: suggested for these star ratings. */
  ratings?: StarRating[];
  updatedAt: string;
}
export type TemplateInput = Pick<MessageTemplate, "kind" | "name" | "body"> & Partial<Pick<MessageTemplate, "subject" | "isDefault" | "ratings">>;

export type AttributeType = "bool" | "enum" | "repeated_enum" | "url";
export interface AttributeDef {
  /** Google's attribute id without the "attributes/" prefix, e.g. "has_wheelchair_accessible_entrance". */
  id: string;
  label: string;
  group: string;
  type: AttributeType;
  options?: { value: string; label: string }[];
}
export type AttributeValue = boolean | string | string[];
