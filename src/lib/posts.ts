// Multi-channel post model, ported from TasksBook CRM (src/lib/marketing.ts).
// Isomorphic: used by the composer (client), server actions and the data providers.
import { addDays, format } from "date-fns";

// ---------------------------------------------------------------- channels
export type Channel = "google" | "facebook" | "instagram" | "linkedin" | "x";
export const CHANNELS: Channel[] = ["google", "facebook", "instagram", "linkedin", "x"];
export const CHANNEL_LABEL: Record<Channel, string> = { google: "Google", facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn", x: "X" };
/** Max characters per channel. */
export const CHANNEL_LIMIT: Record<Channel, number> = { google: 1500, facebook: 63206, instagram: 2200, linkedin: 3000, x: 280 };
export const CONNECT_LABEL: Record<Channel, string> = { google: "Google Business Profile", facebook: "Facebook Page", instagram: "Instagram Business", linkedin: "LinkedIn Page", x: "X (Twitter)" };

// ---------------------------------------------------------------- posts
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "partially_failed";
export type GooglePostType = "update" | "offer" | "event";
export type CtaType = "none" | "BOOK" | "ORDER" | "SHOP" | "LEARN_MORE" | "SIGN_UP" | "CALL";

export const GOOGLE_TYPE_LABEL: Record<GooglePostType, string> = { update: "What's new", event: "Event", offer: "Offer" };

export const CTA_LABEL: Record<CtaType, string> = {
  none: "None",
  BOOK: "Book",
  ORDER: "Order online",
  SHOP: "Buy",
  LEARN_MORE: "Learn more",
  SIGN_UP: "Sign up",
  CALL: "Call now",
};

export const POST_STATUS: Record<PostStatus, { label: string; dot: string; tone: string }> = {
  draft: { label: "Draft", dot: "bg-muted-foreground", tone: "bg-muted text-muted-foreground" },
  scheduled: { label: "Scheduled", dot: "bg-info", tone: "bg-info/10 text-info" },
  publishing: { label: "Publishing", dot: "bg-warning", tone: "bg-warning/10 text-warning" },
  published: { label: "Published", dot: "bg-success", tone: "bg-success/10 text-success" },
  failed: { label: "Failed", dot: "bg-destructive", tone: "bg-destructive/10 text-destructive" },
  partially_failed: { label: "Partly failed", dot: "bg-destructive", tone: "bg-destructive/10 text-destructive" },
};

/** Drafts and scheduled posts can be edited and dragged on the calendar. */
export const MOVABLE: PostStatus[] = ["draft", "scheduled"];
export const LOCKED: PostStatus[] = ["published", "partially_failed", "publishing"];

export interface PostMedia {
  /** https URL, or a data: URL while there is no file storage (demo mode). */
  url: string;
  type: "image" | "video";
  name?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  size?: number | null;
  mime?: string | null;
}

export interface ChannelResult {
  status: "pending" | "published" | "failed";
  posted_at?: string | null;
  permalink?: string | null;
  error?: string | null;
  /** The network's ids for what was posted (Google: one local post per location, "accounts/…/localPosts/…"). */
  external_ids?: string[] | null;
}

/** Engagement a network reports for one post. Missing = the network doesn't report it. */
export interface PostStats {
  views?: number | null;
  reach?: number | null;
  clicks?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  fetched_at: string;
}
export const POST_STAT_LABEL: Record<Exclude<keyof PostStats, "fetched_at">, string> = {
  views: "Views",
  reach: "Reach",
  clicks: "Clicks",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  saves: "Saves",
};

/** Google event / offer times are the business's wall clock (`yyyy-MM-ddTHH:mm` / `yyyy-MM-dd`). */
export interface GoogleEvent {
  title: string;
  start: string;
  end: string;
}
export interface GoogleOffer {
  title: string;
  start: string;
  end: string;
  coupon: string;
  url: string;
  terms: string;
}
export interface GoogleOptions {
  type: GooglePostType;
  /** Own text when `custom_text` is on. */
  text: string;
  event: GoogleEvent;
  offer: GoogleOffer;
  cta: { type: CtaType; url: string };
  /** Location ids to post to; empty = every location. */
  locations: string[];
}
export interface FacebookOptions {
  text: string;
  link: string;
  first_comment: string;
}
export interface InstagramOptions {
  text: string;
  first_comment: string;
}
export interface LinkedInOptions {
  text: string;
}
export interface XOptions {
  text: string;
}

/** What the composer edits. */
export interface PostDraft {
  /** Internal name (never posted). */
  title: string;
  body: string;
  channels: Channel[];
  media: PostMedia[];
  /** Separate text per channel (falls back to `body` when a channel's text is empty). */
  custom_text: boolean;
  google: GoogleOptions;
  facebook: FacebookOptions;
  instagram: InstagramOptions;
  linkedin: LinkedInOptions;
  x: XOptions;
  /** Without '#'; appended to Facebook / Instagram / LinkedIn / X text. */
  hashtags: string[];
  note: string;
  /** Campaign label. */
  label: string;
  /** ISO (UTC). Null for an undated draft. */
  scheduled_at: string | null;
}

export interface Post extends PostDraft {
  id: string;
  status: PostStatus;
  results?: Partial<Record<Channel, ChannelResult>> | null;
  /** Posted outside this app and pulled in from the network (read-only here). */
  imported?: { channel: Channel; external_id: string } | null;
  /** Per-channel engagement, refreshed when the network is synced. Google doesn't report per-post stats. */
  stats?: Partial<Record<Channel, PostStats>> | null;
  published_at?: string | null;
  created_at: string;
  updated_at?: string;
}

const emptyEvent = (): GoogleEvent => ({ title: "", start: "", end: "" });
const emptyOffer = (): GoogleOffer => ({ title: "", start: "", end: "", coupon: "", url: "", terms: "" });

export const emptyDraft = (): PostDraft => ({
  title: "",
  body: "",
  channels: ["google"],
  media: [],
  custom_text: false,
  google: { type: "update", text: "", event: emptyEvent(), offer: emptyOffer(), cta: { type: "none", url: "" }, locations: [] },
  facebook: { text: "", link: "", first_comment: "" },
  instagram: { text: "", first_comment: "" },
  linkedin: { text: "" },
  x: { text: "" },
  hashtags: [],
  note: "",
  label: "",
  scheduled_at: null,
});

/** Stored post → composer draft (deep copy). */
export function postToDraft(p: Post): PostDraft {
  const e = emptyDraft();
  return {
    title: p.title ?? "",
    body: p.body ?? "",
    channels: [...(p.channels ?? [])],
    media: (p.media ?? []).map((m) => ({ ...m })),
    custom_text: !!p.custom_text,
    google: {
      ...e.google,
      ...p.google,
      event: { ...e.google.event, ...p.google?.event },
      offer: { ...e.google.offer, ...p.google?.offer },
      cta: { ...e.google.cta, ...p.google?.cta },
      locations: [...(p.google?.locations ?? [])],
    },
    facebook: { ...e.facebook, ...p.facebook },
    instagram: { ...e.instagram, ...p.instagram },
    linkedin: { ...e.linkedin, ...p.linkedin },
    x: { ...e.x, ...p.x },
    hashtags: [...(p.hashtags ?? [])],
    note: p.note ?? "",
    label: p.label ?? "",
    scheduled_at: p.scheduled_at ?? null,
  };
}

/** Does a post go to this location's Google profile (or, for non-Google posts, show in its calendar)? */
export const postForLocation = (p: Pick<Post, "google">, locationId: string) => !p.google.locations.length || p.google.locations.includes(locationId);

// ---------------------------------------------------------------- per-channel text
export const normalizeHashtag = (raw: string) => raw.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
export const hashtagsIn = (text: string) => text.match(/#[\p{L}\p{N}_]+/gu) ?? [];

/** Text actually posted on a channel: own text (when customised) or the main text, + hashtags (not on Google). */
export function channelText(d: Pick<PostDraft, "body" | "custom_text" | "google" | "facebook" | "instagram" | "linkedin" | "hashtags"> & { x?: XOptions }, ch: Channel): string {
  const own = d.custom_text ? (d[ch]?.text ?? "").trim() : "";
  const base = own || (d.body ?? "").trim();
  if (ch === "google") return base;
  const present = new Set(hashtagsIn(base).map((t) => t.toLowerCase()));
  const tags = (d.hashtags ?? [])
    .map(normalizeHashtag)
    .filter(Boolean)
    .map((t) => `#${t}`)
    .filter((t) => !present.has(t.toLowerCase()) && (present.add(t.toLowerCase()), true));
  if (!tags.length) return base;
  return base ? `${base}\n\n${tags.join(" ")}` : tags.join(" ");
}

/** Google rejects posts with phone numbers in the text. */
export function containsPhone(text: string): boolean {
  for (const m of text.matchAll(/\+?\(?\d[\d\s().-]{5,}\d/g)) {
    const raw = m[0].trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) continue; // a date
    const digits = raw.replace(/\D/g, "").length;
    if (digits >= 7 && digits <= 15) return true;
  }
  return false;
}

const DIRECT_VIDEO = /\.(mp4|mov|m4v)(\?|#|$)/i;
export const isDirectVideo = (url: string) => DIRECT_VIDEO.test(url);
const isHttpUrl = (u?: string | null) => !!u && /^https?:\/\/\S+$/i.test(u.trim());
const isMediaUrl = (u?: string | null) => isHttpUrl(u) || /^data:image\/(png|jpe?g|webp);base64,/i.test(u ?? "");
const GOOGLE_TITLE_MAX = 58;

export type PostField =
  | "channels"
  | "body"
  | "google.text"
  | "facebook.text"
  | "instagram.text"
  | "linkedin.text"
  | "x.text"
  | "media"
  | "hashtags"
  | "google.event.title"
  | "google.event.start"
  | "google.event.end"
  | "google.offer.title"
  | "google.offer.start"
  | "google.offer.end"
  | "google.offer.url"
  | "google.cta.url"
  | "google.locations"
  | "facebook.link"
  | "facebook.first_comment"
  | "instagram.first_comment"
  | "scheduled_at"
  | "connection";

export interface PostIssue {
  channel?: Channel;
  field?: PostField;
  level: "error" | "warning";
  message: string;
}

export type WhenMode = "now" | "schedule" | "draft";

/**
 * Everything wrong with a post for the chosen action.
 * `connected` = channels that can publish now. Drafts are only held to "has a channel".
 */
export function validatePost(post: PostDraft, opts: { connected?: Channel[]; when?: WhenMode; now?: Date; locationIds?: string[] } = {}): PostIssue[] {
  const when = opts.when ?? "draft";
  const out: PostIssue[] = [];
  const add = (i: PostIssue) => out.push(i);
  const textField = (ch: Channel): PostField => (post.custom_text && (post[ch]?.text ?? "").trim() ? `${ch}.text` : "body") as PostField;
  const images = post.media.filter((m) => m.type === "image");

  if (!post.channels.length) add({ field: "channels", level: "error", message: "Pick at least one channel" });
  if (post.media.some((m) => !isMediaUrl(m.url))) add({ field: "media", level: "error", message: "A media link is not a valid URL" });
  if (post.media.length > 10) add({ field: "media", level: "error", message: "Up to 10 media items" });

  const texts = Object.fromEntries(post.channels.map((c) => [c, channelText(post, c)])) as Partial<Record<Channel, string>>;
  const noText = post.channels.length ? post.channels.every((c) => !texts[c]) : !(post.body ?? "").trim();
  if (noText && !post.media.length && !(post.facebook.link ?? "").trim()) add({ field: "body", level: "error", message: "Write the post text" });

  for (const ch of post.channels) {
    const len = [...(texts[ch] ?? "")].length;
    if (len > CHANNEL_LIMIT[ch]) add({ channel: ch, field: textField(ch), level: "error", message: `${CHANNEL_LABEL[ch]} allows ${CHANNEL_LIMIT[ch].toLocaleString()} characters (${len.toLocaleString()} now)` });
  }

  // ---- Google
  if (post.channels.includes("google")) {
    const g = post.google;
    const text = texts.google ?? "";
    if (g.type === "update" && !text && out.every((i) => i.message !== "Write the post text"))
      add({ channel: "google", field: textField("google"), level: "error", message: 'Google "What\'s new" posts need text' });
    if (containsPhone(text)) add({ channel: "google", field: textField("google"), level: "warning", message: "Google rejects phone numbers in the text — use the Call now button" });
    if (g.type === "event") {
      const e = g.event;
      if (!e.title.trim()) add({ channel: "google", field: "google.event.title", level: "error", message: "Add the event title" });
      else if (e.title.trim().length > GOOGLE_TITLE_MAX) add({ channel: "google", field: "google.event.title", level: "error", message: `Event title: max ${GOOGLE_TITLE_MAX} characters` });
      if (!e.start) add({ channel: "google", field: "google.event.start", level: "error", message: "Add when the event starts" });
      if (!e.end) add({ channel: "google", field: "google.event.end", level: "error", message: "Add when the event ends" });
      else if (e.start && e.end <= e.start) add({ channel: "google", field: "google.event.end", level: "error", message: "Event ends before it starts" });
    }
    if (g.type === "offer") {
      const o = g.offer;
      if (!o.title.trim()) add({ channel: "google", field: "google.offer.title", level: "error", message: "Add the offer title" });
      else if (o.title.trim().length > GOOGLE_TITLE_MAX) add({ channel: "google", field: "google.offer.title", level: "error", message: `Offer title: max ${GOOGLE_TITLE_MAX} characters` });
      if (!o.start) add({ channel: "google", field: "google.offer.start", level: "error", message: "Add the offer start date" });
      if (!o.end) add({ channel: "google", field: "google.offer.end", level: "error", message: "Add the offer end date" });
      else if (o.start && o.end < o.start) add({ channel: "google", field: "google.offer.end", level: "error", message: "Offer ends before it starts" });
      if (o.url.trim() && !isHttpUrl(o.url)) add({ channel: "google", field: "google.offer.url", level: "error", message: "Offer link must start with https://" });
    } else if (g.cta.type !== "none" && g.cta.type !== "CALL" && !isHttpUrl(g.cta.url)) {
      add({ channel: "google", field: "google.cta.url", level: "error", message: "Add the button link (https://…)" });
    }
    if (post.media.some((m) => m.type === "video")) add({ channel: "google", field: "media", level: "warning", message: "Google posts photos only — videos are skipped" });
    const first = images[0];
    if (first) {
      if (first.width && first.height && (first.width < 250 || first.height < 250)) add({ channel: "google", field: "media", level: "warning", message: "Google needs images at least 250×250 px" });
      if (first.size && first.size > 5 * 1024 * 1024) add({ channel: "google", field: "media", level: "warning", message: "Google accepts images up to 5 MB" });
      const kind = (first.mime || first.name || "").toLowerCase();
      if (/webp|gif|heic/.test(kind)) add({ channel: "google", field: "media", level: "warning", message: "Google accepts JPG or PNG images" });
    }
    if (images.length > 1) add({ channel: "google", field: "media", level: "warning", message: "Google shows the first image only" });
    const picked = g.locations ?? [];
    if (picked.length && opts.locationIds && !picked.some((k) => opts.locationIds?.includes(k)))
      add({ channel: "google", field: "google.locations", level: "error", message: "The picked locations no longer exist — pick a location" });
  }

  // ---- Facebook
  if (post.channels.includes("facebook")) {
    const link = post.facebook.link.trim();
    if (link && !isHttpUrl(link)) add({ channel: "facebook", field: "facebook.link", level: "error", message: "Facebook link must start with https://" });
    if ([...post.facebook.first_comment].length > 8000) add({ channel: "facebook", field: "facebook.first_comment", level: "error", message: "First comment: max 8,000 characters" });
  }

  // ---- Instagram
  if (post.channels.includes("instagram")) {
    if (!post.media.length) add({ channel: "instagram", field: "media", level: "error", message: "Instagram needs at least one image" });
    else if (post.media.some((m) => m.type === "video" && !isDirectVideo(m.url))) add({ channel: "instagram", field: "media", level: "error", message: "Instagram needs a direct video file link (.mp4)" });
    const tags = hashtagsIn(texts.instagram ?? "").length;
    if (tags > 30) add({ channel: "instagram", field: post.hashtags.length ? "hashtags" : textField("instagram"), level: "error", message: `Instagram allows 30 hashtags (${tags} now)` });
    const commentTags = hashtagsIn(post.instagram.first_comment).length;
    if (commentTags > 30) add({ channel: "instagram", field: "instagram.first_comment", level: "error", message: `Instagram allows 30 hashtags per comment (${commentTags} now)` });
    if ([...post.instagram.first_comment].length > 2200) add({ channel: "instagram", field: "instagram.first_comment", level: "error", message: "First comment: max 2,200 characters" });
    if (images.some((m) => m.width && m.height && (m.width / m.height < 0.8 - 0.005 || m.width / m.height > 1.91 + 0.005)))
      add({ channel: "instagram", field: "media", level: "warning", message: "Instagram crops images outside 4:5 – 1.91:1" });
  }

  // ---- LinkedIn
  if (post.channels.includes("linkedin") && post.media.some((m) => m.type === "video"))
    add({ channel: "linkedin", field: "media", level: "warning", message: "LinkedIn gets video links as a link in the text" });

  // ---- X
  if (post.channels.includes("x")) {
    if (post.media.filter((m) => m.type === "image").length > 4) add({ channel: "x", field: "media", level: "warning", message: "X shows the first 4 images only" });
    if (post.media.some((m) => m.type === "video")) add({ channel: "x", field: "media", level: "warning", message: "X gets video links as a link in the text" });
  }

  if (when === "schedule") {
    if (!post.scheduled_at) add({ field: "scheduled_at", level: "error", message: "Pick a date and time" });
    else if (new Date(post.scheduled_at).getTime() < (opts.now ?? new Date()).getTime() - 60_000) add({ field: "scheduled_at", level: "error", message: "Pick a time in the future" });
  }
  if (opts.connected) {
    for (const c of post.channels.filter((x) => !opts.connected?.includes(x)))
      add({ channel: c, field: "connection", level: when === "now" ? "error" : "warning", message: `Connect ${CHANNEL_LABEL[c]} to publish` });
  }
  // Drafts can be saved half-finished.
  if (when === "draft") return out.filter((i) => i.field === "channels" || i.level === "warning");
  return out;
}

/** Issues per field (for inline messages). Errors before warnings. */
export function issuesByField(issues: PostIssue[]): Partial<Record<PostField, PostIssue[]>> {
  const out: Partial<Record<PostField, PostIssue[]>> = {};
  for (const i of issues) {
    if (!i.field) continue;
    (out[i.field] ??= []).push(i);
  }
  for (const k of Object.keys(out) as PostField[]) out[k]?.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
  return out;
}

/** Footer button label for the chosen "When". */
export function primaryActionLabel(mode: WhenMode, scheduledAt: string | null): string {
  if (mode === "now") return "Publish now";
  if (mode === "draft") return "Save draft";
  return scheduledAt ? `Schedule · ${format(new Date(scheduledAt), "EEE d MMM, h:mm a")}` : "Schedule";
}

/** Schedule shortcuts (local time). */
export function quickPickTime(kind: "tomorrow" | "next_monday", now = new Date()): Date {
  const d = new Date(now);
  d.setHours(9, 0, 0, 0);
  if (kind === "tomorrow") return addDays(d, 1);
  return addDays(d, (8 - d.getDay()) % 7 || 7); // always the coming Monday
}

/** Overall status from the per-channel results. */
export function postStatusFromResults(channels: Channel[], results: Partial<Record<Channel, ChannelResult>> | null | undefined): PostStatus {
  const rs = channels.map((c) => results?.[c]?.status ?? "pending");
  if (!rs.length) return "draft";
  if (rs.some((s) => s === "pending")) return "publishing";
  const ok = rs.filter((s) => s === "published").length;
  return ok === rs.length ? "published" : ok === 0 ? "failed" : "partially_failed";
}

export const failedChannels = (p: Pick<Post, "channels" | "results">) => p.channels.filter((c) => p.results?.[c]?.status === "failed");

/** When a post sits on the calendar: published time, else scheduled time, else created. */
export const postDate = (p: Pick<Post, "published_at" | "scheduled_at" | "created_at">) => p.published_at || p.scheduled_at || p.created_at;

/** Local `yyyy-MM-ddTHH:mm` ⇄ ISO. */
export const localToIso = (local: string | null | undefined) => (local ? new Date(local).toISOString() : null);
export const isoToLocal = (iso: string | null | undefined) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");

/** Media actually sent per channel. */
export function channelMedia(media: PostMedia[], ch: Channel): PostMedia[] {
  if (ch === "google") return media.filter((m) => m.type === "image").slice(0, 1);
  if (ch === "instagram") return media.filter((m) => m.type === "image" || isDirectVideo(m.url)).slice(0, 10);
  if (ch === "linkedin") return media.filter((m) => m.type === "image").slice(0, 10);
  if (ch === "x") return media.filter((m) => m.type === "image").slice(0, 4);
  const first = media[0];
  if (first?.type === "video") return [first];
  return media.filter((m) => m.type === "image").slice(0, 10);
}

// ---------------------------------------------------------------- preview text
const localDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v);
  return m ? { d: new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0), timed: m[4] != null } : null;
};

/** "Fri, Oct 23, 10:00 AM – 2:00 PM" (same day) · "Fri, Oct 23 – Sat, Oct 24" (dates only). */
export function formatEventRange(start: string, end?: string | null): string {
  const a = localDate(start);
  if (!a) return "";
  const b = end ? localDate(end) : null;
  const day = (x: Date) => format(x, "EEE, MMM d");
  const full = (x: { d: Date; timed: boolean }) => (x.timed ? `${day(x.d)}, ${format(x.d, "h:mm a")}` : day(x.d));
  if (!b) return full(a);
  if (format(a.d, "yyyy-MM-dd") === format(b.d, "yyyy-MM-dd")) return a.timed && b.timed ? `${full(a)} – ${format(b.d, "h:mm a")}` : full(a);
  return `${full(a)} – ${full(b)}`;
}

/** "Valid Nov 1 – Nov 30". */
export function formatOfferRange(start: string, end?: string | null): string {
  const a = localDate(start);
  if (!a) return "";
  const b = end ? localDate(end) : null;
  return b ? `Valid ${format(a.d, "MMM d")} – ${format(b.d, "MMM d")}` : `Valid from ${format(a.d, "MMM d")}`;
}

/** Cut long text like the platforms do: first N lines / chars, then an inline "… more". */
export function truncateForPreview(text: string, maxChars: number, maxLines: number): string | null {
  const lines = text.split("\n");
  let cut = lines.length > maxLines ? lines.slice(0, maxLines).join("\n") : text;
  if ([...cut].length > maxChars) cut = [...cut].slice(0, maxChars).join("").replace(/\s+\S*$/, "");
  return cut.length < text.length ? cut.trimEnd() : null;
}

/** Instagram-style handle from a business name. */
export const handleFromName = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9._ ]/g, "")
    .trim()
    .replace(/\s+/g, "") || "yourbusiness";

// ---------------------------------------------------------------- calendar grids
/** Monday-first week containing `anchor`. */
export const weekDays = (anchor: Date) => {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - ((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
};

/** Monday-first 6-week grid for the month containing `anchor`. */
export const monthGrid = (anchor: Date) => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};

/** Totals across channels for lists: views (or reach) and engagements (likes + comments + shares + saves + clicks). Null without stats. */
export function postEngagement(p: Pick<Post, "stats">) {
  const all = Object.values(p.stats ?? {}).filter(Boolean) as PostStats[];
  if (!all.length) return null;
  const sum = (f: (s: PostStats) => number | null | undefined) => all.reduce((a, s) => a + (f(s) ?? 0), 0);
  return {
    views: sum((s) => s.views ?? s.reach),
    engagements: sum((s) => (s.likes ?? 0) + (s.comments ?? 0) + (s.shares ?? 0) + (s.saves ?? 0) + (s.clicks ?? 0)),
  };
}

/** Networks whose API reports per-post stats. Google doesn't (its post views are only in its own dashboard). */
export const STATS_CHANNELS: Channel[] = ["facebook", "instagram", "linkedin", "x"];
/** Published channels of a post that can show stats. */
export const postStatChannels = (p: Pick<Post, "channels" | "results">) =>
  CHANNELS.filter((c) => STATS_CHANNELS.includes(c) && p.channels.includes(c) && p.results?.[c]?.status === "published");
