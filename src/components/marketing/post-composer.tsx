"use client";
/* eslint-disable @next/next/no-img-element -- media thumbnails are user data:/remote URLs */

// Multi-channel post composer, ported from TasksBook CRM (src/components/marketing/PostComposer.tsx).

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Copy, ExternalLink, ImagePlus, Link2, Loader2, MapPin, MoreHorizontal, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { buttonClass, inputClass } from "@/components/ui";
import { Modal, Segmented, Switch, useConfirm } from "@/components/ui-client";
import { DateField, DateTimeField } from "@/components/date-time-field";
import { PostPerformance } from "@/components/marketing/post-performance";
import { ChannelIcon } from "@/components/marketing/channel-icon";
import { FacebookPreview, GooglePreview, InstagramPreview, LinkedInPreview, type PreviewAccount } from "@/components/marketing/post-previews";
import { deletePost, publishPost, savePost } from "@/app/(app)/actions";
import {
  CHANNELS,
  CHANNEL_LABEL,
  CHANNEL_LIMIT,
  CTA_LABEL,
  GOOGLE_TYPE_LABEL,
  LOCKED,
  POST_STATUS,
  channelText,
  emptyDraft,
  failedChannels,
  handleFromName,
  hashtagsIn,
  isoToLocal,
  issuesByField,
  localToIso,
  normalizeHashtag,
  postToDraft,
  primaryActionLabel,
  quickPickTime,
  validatePost,
  type Channel,
  type CtaType,
  type GooglePostType,
  type Post,
  type PostDraft,
  type PostField,
  type PostIssue,
  type PostMedia,
  type WhenMode,
  postStatChannels,
} from "@/lib/posts";
import { cn } from "@/lib/utils";

const MAX_MEDIA = 10;
const MAX_UPLOAD_MB = 10;
const MAX_EDGE = 1600; // images are resized client-side before upload
const BUSY_LABEL: Record<string, string> = { now: "Publishing…", schedule: "Scheduling…", draft: "Saving…", retry: "Retrying…", dup: "Duplicating…", delete: "Deleting…", unschedule: "Saving…" };

export interface ComposerLocation {
  id: string;
  title: string;
}

/** Resize an image file to fit MAX_EDGE and return it as a JPEG/PNG data URL with its dimensions. */
async function readImage(file: File): Promise<{ url: string; width: number; height: number; size: number; mime: string }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const url = canvas.toDataURL(mime, 0.86);
  return { url, width, height, size: Math.round((url.length * 3) / 4), mime };
}

const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
};

function Section({ title, icon, children, className }: { title: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-3 border-t py-5 first:border-t-0 first:pt-0", className)}>
      <h3 className="label-caps flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Label({ htmlFor, children, className }: { htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn("block text-sm font-medium", className)}>
      {children}
    </label>
  );
}

function Counter({ value, max, suffix }: { value: number; max: number; suffix?: string }) {
  return (
    <span className={cn("tabular-nums", value > max && "font-semibold text-destructive")}>
      {value.toLocaleString()}/{max.toLocaleString()}
      {suffix}
    </span>
  );
}

export function PostComposer({
  open,
  onOpenChange,
  post,
  defaultDate,
  connected,
  locations,
  currentLocationId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Existing post, or null for a new one. */
  post: Post | null;
  /** Pre-filled schedule for a new post (calendar day click). */
  defaultDate?: Date | null;
  connected: Channel[];
  locations: ComposerLocation[];
  currentLocationId: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { confirm, dialog } = useConfirm();
  const locIds = useMemo(() => locations.map((l) => l.id), [locations]);

  const [draft, setDraft] = useState<PostDraft>(emptyDraft);
  const [mode, setMode] = useState<WhenMode>("now");
  const [when, setWhen] = useState("");
  const [snapshot, setSnapshot] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [preview, setPreview] = useState<Channel>("google");
  const [fbDevice, setFbDevice] = useState<"mobile" | "desktop">("mobile");
  const [igAspect, setIgAspect] = useState<"1:1" | "4:5">("1:1");
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [locOpen, setLocOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const d = post ? postToDraft(post) : { ...emptyDraft(), google: { ...emptyDraft().google, locations: locations.length > 1 ? [currentLocationId] : [] } };
    const base =
      post?.scheduled_at ??
      (defaultDate
        ? (() => {
            const x = new Date(defaultDate);
            x.setHours(10, 0, 0, 0);
            return x.toISOString();
          })()
        : null);
    const m: WhenMode = post ? (post.status === "scheduled" ? "schedule" : post.status === "draft" ? "draft" : "now") : defaultDate ? "schedule" : "now";
    const w = isoToLocal(base);
    setDraft(d);
    setMode(m);
    setWhen(w);
    setSnapshot(JSON.stringify({ d, m, w }));
    setAttempted(false);
    setVideoUrl("");
    setTagInput("");
    setPane("edit");
    setLocOpen(false);
    setMenuOpen(false);
    setPreview(d.channels[0] ?? "google");
  }, [open, post, defaultDate, locations.length, currentLocationId]);

  const locked = !!post && LOCKED.includes(post.status);
  const dirty = !locked && snapshot !== "" && JSON.stringify({ d: draft, m: mode, w: when }) !== snapshot;
  const set = (patch: Partial<PostDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setG = (patch: Partial<PostDraft["google"]>) => setDraft((d) => ({ ...d, google: { ...d.google, ...patch } }));
  const setFb = (patch: Partial<PostDraft["facebook"]>) => setDraft((d) => ({ ...d, facebook: { ...d.facebook, ...patch } }));
  const setIg = (patch: Partial<PostDraft["instagram"]>) => setDraft((d) => ({ ...d, instagram: { ...d.instagram, ...patch } }));

  /** Picked Google locations ([] = all). Every location picked collapses back to all; the last one can't be unticked. */
  const pickedLocs = draft.google.locations.filter((k) => locIds.includes(k));
  const isLocOn = (key: string) => !pickedLocs.length || pickedLocs.includes(key);
  const toggleLocation = (key: string) => {
    const cur = pickedLocs.length ? pickedLocs : locIds;
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    if (!next.length) return;
    setG({ locations: next.length === locIds.length ? [] : next });
  };

  const full = useMemo<PostDraft>(() => ({ ...draft, scheduled_at: mode === "now" ? null : localToIso(when) }), [draft, mode, when]);
  const issues = useMemo(() => validatePost(full, { connected, when: mode, locationIds: locIds }), [full, connected, mode, locIds]);
  const errors = issues.filter((i) => i.level === "error");
  const shown = useMemo(() => issuesByField(issues.filter((i) => attempted || i.level === "warning")), [issues, attempted]);
  const has = (c: Channel) => draft.channels.includes(c);
  /** Selected channels in the fixed Google → Facebook → Instagram → LinkedIn → X order. */
  const chs = CHANNELS.filter(has);
  const previewChannel = draft.channels.includes(preview) ? preview : chs[0];

  const account = (c: Channel): PreviewAccount => {
    const current = locations.find((l) => l.id === currentLocationId) ?? locations[0];
    const gLoc = locations.find((l) => pickedLocs.includes(l.id)) ?? current;
    const name = (c === "google" ? gLoc?.title : current?.title) || "Your business";
    return { name, logoUrl: null, handle: handleFromName(current?.title || "Your business") };
  };

  const close = async () => {
    if (dirty && !busy) {
      const ok = await confirm({ title: "Discard changes?", confirmLabel: "Discard", tone: "danger" });
      if (!ok) return;
    }
    onOpenChange(false);
  };

  const toggleChannel = (c: Channel) => {
    const channels = draft.channels.includes(c) ? draft.channels.filter((x) => x !== c) : CHANNELS.filter((x) => x === c || draft.channels.includes(x));
    set({ channels });
    if (!draft.channels.includes(c)) setPreview(c);
    else if (preview === c) setPreview(channels[0] ?? "google");
  };

  const refresh = () => startTransition(() => router.refresh());

  // ------------------------------------------------------------ actions
  const submit = async () => {
    setAttempted(true);
    if (errors.length) {
      toast.error(errors.length > 1 ? `${errors[0].message} (+${errors.length - 1} more)` : errors[0].message);
      setPane("edit");
      requestAnimationFrame(() => summaryRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
      return;
    }
    setBusy(mode);
    const res = await savePost(post?.id ?? null, full, mode);
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (mode === "draft") toast.success("Draft saved");
    else if (mode === "schedule") toast.success(`Scheduled for ${format(new Date(full.scheduled_at as string), "EEE d MMM, h:mm a")}`);
    else toast.success("Published");
    refresh();
    onOpenChange(false);
  };

  const unschedule = async () => {
    setBusy("unschedule");
    const res = await savePost(post?.id ?? null, { ...draft, scheduled_at: localToIso(when) }, "draft");
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Moved to drafts");
    refresh();
    onOpenChange(false);
  };

  const duplicate = async () => {
    setMenuOpen(false);
    setBusy("dup");
    const res = await savePost(null, { ...draft, title: `${draft.title || "Post"} (copy)`, scheduled_at: null }, "draft");
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Duplicated as a draft");
    refresh();
    onOpenChange(false);
  };

  const del = async () => {
    setMenuOpen(false);
    if (!post) return;
    // Where it's live: deleted there too on Facebook, Google and LinkedIn; Instagram only in its own app.
    const liveOn = post.channels.filter((c) => post.results?.[c]?.status === "published");
    if (post.imported && !liveOn.includes(post.imported.channel)) liveOn.push(post.imported.channel);
    const removed = liveOn.filter((c) => c === "facebook" || c === "google" || c === "linkedin");
    const stays = liveOn.filter((c) => c === "instagram");
    const list = (cs: Channel[]) => cs.map((c) => CHANNEL_LABEL[c]).join(" and ");
    const ok = await confirm({
      title: "Delete this post?",
      description: liveOn.length
        ? [removed.length ? `It's also deleted from ${list(removed)}.` : "", stays.length ? `${list(stays)} doesn't let apps delete posts — remove it in the ${list(stays)} app.` : ""]
            .filter(Boolean)
            .join(" ")
        : undefined,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy("delete");
    const res = await deletePost(post.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Post deleted");
    refresh();
    onOpenChange(false);
  };

  const retry = async () => {
    if (!post) return;
    const missing = failedChannels(post).filter((c) => !connected.includes(c));
    if (missing.length) return void toast.error(`Connect ${missing.map((c) => CHANNEL_LABEL[c]).join(", ")} to publish`);
    setBusy("retry");
    const res = await publishPost(post.id);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    toast.success("Published");
    refresh();
    onOpenChange(false);
  };

  // ------------------------------------------------------------ media
  const onFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    const room = MAX_MEDIA - draft.media.length;
    if (room <= 0) return void toast.error(`Up to ${MAX_MEDIA} media items`);
    setUploading(true);
    try {
      const added: PostMedia[] = [];
      for (const f of list.slice(0, room)) {
        if (!/^image\/(png|jpeg|webp)$/.test(f.type)) {
          toast.error(`${f.name}: use JPG, PNG or WebP`);
          continue;
        }
        if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
          toast.error(`${f.name}: max ${MAX_UPLOAD_MB} MB`);
          continue;
        }
        const img = await readImage(f);
        added.push({ url: img.url, type: "image", name: f.name, alt: "", width: img.width, height: img.height, size: img.size, mime: img.mime });
      }
      if (added.length) setDraft((d) => ({ ...d, media: [...d.media, ...added] }));
    } catch {
      toast.error("Couldn't read that image");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addVideo = () => {
    const url = videoUrl.trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return void toast.error("Paste a video link (https://…)");
    if (draft.media.length >= MAX_MEDIA) return void toast.error(`Up to ${MAX_MEDIA} media items`);
    set({ media: [...draft.media, { url, type: "video", name: url.split("/").pop()?.slice(0, 60) || "Video" }] });
    setVideoUrl("");
  };

  const moveMedia = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.media.length) return;
    const media = [...draft.media];
    [media[i], media[j]] = [media[j], media[i]];
    set({ media });
  };

  const addTags = (raw: string) => {
    const tags = raw
      .split(/[\s,]+/)
      .map(normalizeHashtag)
      .filter(Boolean);
    if (!tags.length) return setTagInput("");
    const seen = new Set(draft.hashtags.map((t) => t.toLowerCase()));
    set({ hashtags: [...draft.hashtags, ...tags.filter((t) => !seen.has(t.toLowerCase()) && (seen.add(t.toLowerCase()), true))] });
    setTagInput("");
  };

  // ------------------------------------------------------------ bits
  const msg = (f: PostField) => {
    const list = shown[f];
    if (!list?.length) return null;
    return (
      <ul className="space-y-0.5">
        {list.map((i) => (
          <li key={i.message} className={cn("flex items-start gap-1 text-xs", i.level === "error" ? "text-destructive" : "text-warning")}>
            <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
            {i.message}
          </li>
        ))}
      </ul>
    );
  };
  const bad = (f: PostField) => !!shown[f]?.some((i) => i.level === "error");
  const field = (f?: PostField, extra?: string) => cn(inputClass, f && bad(f) && "border-destructive focus-visible:ring-destructive/30", extra);

  const tz = browserTz();
  const scheduledIso = full.scheduled_at;
  const primary = primaryActionLabel(mode, scheduledIso);
  const failed = post ? failedChannels(post) : [];
  const previewWhen = mode === "schedule" && scheduledIso ? new Date(scheduledIso) : post?.published_at ? new Date(post.published_at) : null;
  const igTags = hashtagsIn(channelText(draft, "instagram")).length;

  const textCounters = (list: Channel[]) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {list.map((c) => (
        <span key={c} className="inline-flex items-center gap-1">
          <ChannelIcon channel={c} className="h-3 w-3" />
          <Counter value={[...channelText(draft, c)].length} max={CHANNEL_LIMIT[c]} />
          {c === "instagram" && <span className={cn("tabular-nums", igTags > 30 && "font-semibold text-destructive")}>· {igTags}/30 #</span>}
        </span>
      ))}
    </div>
  );

  // ------------------------------------------------------------ render
  const form = (
    <div className="min-w-0">
      {/* Read-only info for published posts: imported note and per-network stats. */}
      {post?.imported && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
          <ChannelIcon channel={post.imported.channel} className="mt-0.5" />
          <p className="min-w-0 flex-1">
            <span className="font-semibold">Posted directly on {CHANNEL_LABEL[post.imported.channel]}.</span>{" "}
            <span className="text-muted-foreground">Pulled into your calendar when the account synced. Edit or delete it on {CHANNEL_LABEL[post.imported.channel]}.</span>
          </p>
        </div>
      )}
      {post && postStatChannels(post).length > 0 && (
        <Section title="Performance">
          <PostPerformance post={post} />
        </Section>
      )}
      <fieldset disabled={locked} className="min-w-0">
        {post?.results && Object.keys(post.results).length > 0 && (
          <Section title="Results">
            <ul className="divide-y rounded-lg border">
              {CHANNELS.filter((c) => post.channels.includes(c)).map((c) => {
                const r = post.results?.[c];
                const st = r?.status ?? "pending";
                return (
                  <li key={c} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                    <ChannelIcon channel={c} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2">
                        <span className="font-semibold">{CHANNEL_LABEL[c]}</span>
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
                            st === "published" ? "bg-success/10 text-success" : st === "failed" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning",
                          )}
                        >
                          {st === "published" ? "Published" : st === "failed" ? "Failed" : "Pending"}
                        </span>
                        {r?.posted_at && <span className="text-xs text-muted-foreground">{format(parseISO(r.posted_at), "d MMM, h:mm a")}</span>}
                      </p>
                      {r?.error && <p className="text-xs text-destructive">{r.error}</p>}
                    </div>
                    {r?.permalink && (
                      <a href={r.permalink} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-primary hover:underline">
                        View on {CHANNEL_LABEL[c]} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        <Section title="Channels">
          <div className="flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const on = has(c);
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleChannel(c)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
                    on ? "border-primary bg-primary/5 font-semibold text-foreground" : "bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <ChannelIcon channel={c} />
                  {CHANNEL_LABEL[c]}
                </button>
              );
            })}
          </div>
          {!locked && chs.some((c) => !connected.includes(c)) && (
            <ul className="space-y-1">
              {chs
                .filter((c) => !connected.includes(c))
                .map((c) => (
                  <li key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ChannelIcon channel={c} className="h-3 w-3" />
                    Connect {CHANNEL_LABEL[c]} to publish ·
                    <a href="/settings" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">
                      Connect
                    </a>
                  </li>
                ))}
            </ul>
          )}
          {msg("channels")}
        </Section>

        <Section title="Content">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="mk-title">Title</Label>
              <input id="mk-title" value={draft.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} placeholder="Internal name" className={field()} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mk-label">Campaign</Label>
              <input id="mk-label" value={draft.label} maxLength={60} onChange={(e) => set({ label: e.target.value })} placeholder="e.g. Fall promo" className={field()} />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="mk-body">Text</Label>
              {draft.channels.length > 1 && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  Customize per channel
                  <Switch checked={draft.custom_text} onChange={(v) => set({ custom_text: v })} label="Customize per channel" />
                </span>
              )}
            </div>
            <textarea id="mk-body" rows={6} value={draft.body} className={field("body")} onChange={(e) => set({ body: e.target.value })} placeholder="What do you want to share?" />
            {!draft.custom_text && textCounters(chs)}
            {msg("body")}
          </div>

          {draft.custom_text &&
            chs.map((c) => {
              const f = `${c}.text` as PostField;
              return (
                <div key={c} className="space-y-1.5">
                  <Label htmlFor={`mk-text-${c}`} className="flex items-center gap-1.5">
                    <ChannelIcon channel={c} className="h-3.5 w-3.5" /> {CHANNEL_LABEL[c]} text
                  </Label>
                  <textarea
                    id={`mk-text-${c}`}
                    rows={4}
                    value={draft[c].text}
                    className={field(f)}
                    onChange={(e) => setDraft((d) => ({ ...d, [c]: { ...d[c], text: e.target.value } }))}
                    placeholder={draft.body || "Uses the main text"}
                  />
                  {textCounters([c])}
                  {msg(f)}
                </div>
              );
            })}

          {(has("facebook") || has("instagram") || has("linkedin")) && (
            <div className="space-y-1.5">
              <Label htmlFor="mk-tags">
                Hashtags{" "}
                <span className="font-normal text-muted-foreground">
                  ·{" "}
                  {(["facebook", "instagram", "linkedin"] as Channel[])
                    .filter(has)
                    .map((c) => CHANNEL_LABEL[c])
                    .join(", ")}
                </span>
              </Label>
              <div className={cn("flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5", bad("hashtags") && "border-destructive")}>
                {draft.hashtags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    #{t}
                    {!locked && (
                      <button
                        type="button"
                        aria-label={`Remove #${t}`}
                        onClick={() => set({ hashtags: draft.hashtags.filter((x) => x !== t) })}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </span>
                ))}
                <input
                  id="mk-tags"
                  value={tagInput}
                  onChange={(e) => (/[\s,]$/.test(e.target.value) ? addTags(e.target.value) : setTagInput(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTags(tagInput);
                    } else if (e.key === "Backspace" && !tagInput && draft.hashtags.length) set({ hashtags: draft.hashtags.slice(0, -1) });
                  }}
                  onBlur={() => addTags(tagInput)}
                  placeholder={draft.hashtags.length ? "" : "#austin #smallbusiness"}
                  className="h-6 min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              {msg("hashtags")}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mk-note">Internal note</Label>
            <textarea id="mk-note" rows={2} value={draft.note} maxLength={2000} onChange={(e) => set({ note: e.target.value })} placeholder="Only your team sees this" className={field()} />
          </div>
        </Section>

        <Section title="Media">
          {draft.media.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {draft.media.map((m, i) => (
                <li key={`${m.url.slice(-40)}-${i}`} className="flex items-center gap-3 p-2">
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                    {m.type === "image" ? (
                      <img referrerPolicy="no-referrer" src={m.url} alt={m.alt ?? ""} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Link2 className="h-4 w-4" />
                      </span>
                    )}
                    <span className="absolute left-0.5 top-0.5 rounded bg-background/90 px-1 text-[10px] font-semibold tabular-nums">{i + 1}</span>
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    {m.type === "image" ? (
                      <input
                        value={m.alt ?? ""}
                        aria-label={`Alt text for image ${i + 1}`}
                        placeholder="Alt text"
                        className={field(undefined, "h-8 py-1")}
                        maxLength={1000}
                        onChange={(e) => set({ media: draft.media.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })}
                      />
                    ) : (
                      <p className="truncate text-sm">{m.url}</p>
                    )}
                    <p className="truncate text-[11px] text-muted-foreground">
                      {m.type === "video" ? "Video link" : [m.width && m.height ? `${m.width}×${m.height}` : null, m.size ? fileSize(m.size) : null, m.name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {!locked && (
                    <div className="flex shrink-0 items-center">
                      <button type="button" className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Move up" disabled={i === 0} onClick={() => moveMedia(i, -1)}>
                        <ArrowUp />
                      </button>
                      <button type="button" className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Move down" disabled={i === draft.media.length - 1} onClick={() => moveMedia(i, 1)}>
                        <ArrowDown />
                      </button>
                      <button type="button" className={buttonClass("ghost", "icon", "h-8 w-8")} aria-label="Remove" onClick={() => set({ media: draft.media.filter((_, j) => j !== i) })}>
                        <X />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!locked && (
            <>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void onFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/40",
                  dragOver && "border-primary bg-accent",
                )}
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : dragOver ? (
                  <Upload className="h-5 w-5 text-primary" />
                ) : (
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="text-sm font-semibold">{uploading ? "Adding images…" : dragOver ? "Drop to add" : "Drag images here or click to upload"}</span>
                <span className="text-xs text-muted-foreground">
                  JPG, PNG or WebP · up to {MAX_UPLOAD_MB} MB · {MAX_MEDIA - draft.media.length} of {MAX_MEDIA} left
                </span>
              </button>
              <div className="flex min-w-0 gap-2">
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addVideo();
                    }
                  }}
                  placeholder="Video link (.mp4, YouTube…)"
                  className={field(undefined, "h-8 min-w-0 py-1")}
                  aria-label="Video link"
                />
                <button type="button" className={buttonClass("outline", "sm")} onClick={addVideo}>
                  Add
                </button>
              </div>
            </>
          )}
          {msg("media")}
        </Section>

        {has("google") && (
          <Section title="Google" icon={<ChannelIcon channel="google" className="h-3.5 w-3.5" />}>
            {locations.length > 1 && (
              <div className="space-y-1.5">
                <Label>Locations</Label>
                <div className="relative max-w-xs">
                  <button
                    type="button"
                    aria-expanded={locOpen}
                    onClick={() => setLocOpen((o) => !o)}
                    className={cn(
                      "flex h-9 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      bad("google.locations") && "border-destructive",
                    )}
                  >
                    <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {!pickedLocs.length
                        ? `All locations (${locations.length})`
                        : pickedLocs.length === 1
                          ? locations.find((l) => l.id === pickedLocs[0])?.title
                          : `${pickedLocs.length} of ${locations.length} locations`}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
                  </button>
                  {locOpen && (
                    <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border bg-popover p-1 shadow-elegant">
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm font-semibold hover:bg-muted/50">
                        <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={!pickedLocs.length} onChange={() => setG({ locations: [] })} />
                        All locations
                      </label>
                      <div className="my-1 h-px bg-border" />
                      {locations.map((l) => (
                        <label key={l.id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-muted/50">
                          <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--primary))]" checked={isLocOn(l.id)} onChange={() => toggleLocation(l.id)} />
                          <span className="truncate">{l.title}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {msg("google.locations")}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Post type</Label>
              <Segmented
                label="Google post type"
                value={draft.google.type}
                onChange={(v) => setG({ type: v as GooglePostType })}
                options={(["update", "event", "offer"] as GooglePostType[]).map((t) => ({ value: t, label: GOOGLE_TYPE_LABEL[t] }))}
              />
            </div>

            {draft.google.type === "event" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mk-ev-title" className="flex justify-between">
                    Event title{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      <Counter value={draft.google.event.title.length} max={58} />
                    </span>
                  </Label>
                  <input
                    id="mk-ev-title"
                    value={draft.google.event.title}
                    className={field("google.event.title")}
                    onChange={(e) => setG({ event: { ...draft.google.event, title: e.target.value } })}
                  />
                  {msg("google.event.title")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mk-ev-start">Starts</Label>
                  <DateTimeField
                    id="mk-ev-start"
                    value={draft.google.event.start}
                    invalid={bad("google.event.start")}
                    defaultTime="10:00"
                    onChange={(v) => setG({ event: { ...draft.google.event, start: v, end: draft.google.event.end || v } })}
                  />
                  {msg("google.event.start")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mk-ev-end">Ends</Label>
                  <DateTimeField
                    id="mk-ev-end"
                    value={draft.google.event.end}
                    min={draft.google.event.start ? new Date(draft.google.event.start) : null}
                    invalid={bad("google.event.end")}
                    defaultTime="14:00"
                    onChange={(v) => setG({ event: { ...draft.google.event, end: v } })}
                  />
                  {msg("google.event.end")}
                </div>
              </div>
            )}

            {draft.google.type === "offer" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mk-of-title" className="flex justify-between">
                    Offer title{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      <Counter value={draft.google.offer.title.length} max={58} />
                    </span>
                  </Label>
                  <input
                    id="mk-of-title"
                    value={draft.google.offer.title}
                    className={field("google.offer.title")}
                    onChange={(e) => setG({ offer: { ...draft.google.offer, title: e.target.value } })}
                    placeholder="e.g. 20% off your first visit"
                  />
                  {msg("google.offer.title")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mk-of-start">Starts</Label>
                  <DateField id="mk-of-start" value={draft.google.offer.start} invalid={bad("google.offer.start")} onChange={(v) => setG({ offer: { ...draft.google.offer, start: v } })} />
                  {msg("google.offer.start")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mk-of-end">Ends</Label>
                  <DateField
                    id="mk-of-end"
                    value={draft.google.offer.end}
                    min={draft.google.offer.start || undefined}
                    invalid={bad("google.offer.end")}
                    onChange={(v) => setG({ offer: { ...draft.google.offer, end: v } })}
                  />
                  {msg("google.offer.end")}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mk-coupon">Coupon code</Label>
                  <input id="mk-coupon" value={draft.google.offer.coupon} maxLength={58} className={field()} onChange={(e) => setG({ offer: { ...draft.google.offer, coupon: e.target.value } })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mk-redeem">Redeem link</Label>
                  <input
                    id="mk-redeem"
                    value={draft.google.offer.url}
                    className={field("google.offer.url")}
                    onChange={(e) => setG({ offer: { ...draft.google.offer, url: e.target.value } })}
                    placeholder="https://"
                  />
                  {msg("google.offer.url")}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="mk-terms">Terms</Label>
                  <textarea
                    id="mk-terms"
                    rows={2}
                    value={draft.google.offer.terms}
                    maxLength={5000}
                    className={field()}
                    onChange={(e) => setG({ offer: { ...draft.google.offer, terms: e.target.value } })}
                  />
                </div>
              </div>
            )}

            {draft.google.type !== "offer" && (
              <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <div className="space-y-1.5">
                  <Label htmlFor="mk-cta">Button</Label>
                  <select id="mk-cta" value={draft.google.cta.type} className={field()} onChange={(e) => setG({ cta: { ...draft.google.cta, type: e.target.value as CtaType } })}>
                    {(Object.keys(CTA_LABEL) as CtaType[]).map((k) => (
                      <option key={k} value={k}>
                        {CTA_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                {draft.google.cta.type !== "none" && draft.google.cta.type !== "CALL" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="mk-cta-url">Button link</Label>
                    <input
                      id="mk-cta-url"
                      value={draft.google.cta.url}
                      className={field("google.cta.url")}
                      onChange={(e) => setG({ cta: { ...draft.google.cta, url: e.target.value } })}
                      placeholder="https://"
                    />
                    {msg("google.cta.url")}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {has("facebook") && (
          <Section title="Facebook" icon={<ChannelIcon channel="facebook" className="h-3.5 w-3.5" />}>
            <div className="space-y-1.5">
              <Label htmlFor="mk-fb-link">Link</Label>
              <input id="mk-fb-link" value={draft.facebook.link} className={field("facebook.link")} onChange={(e) => setFb({ link: e.target.value })} placeholder="https://" />
              {msg("facebook.link")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mk-fb-comment">First comment</Label>
              <textarea id="mk-fb-comment" rows={2} value={draft.facebook.first_comment} className={field("facebook.first_comment")} onChange={(e) => setFb({ first_comment: e.target.value })} />
              {msg("facebook.first_comment")}
            </div>
          </Section>
        )}

        {has("instagram") && (
          <Section title="Instagram" icon={<ChannelIcon channel="instagram" className="h-3.5 w-3.5" />}>
            <div className="space-y-1.5">
              <Label htmlFor="mk-ig-comment" className="flex justify-between">
                First comment
                <span className="text-xs font-normal text-muted-foreground">
                  <Counter value={hashtagsIn(draft.instagram.first_comment).length} max={30} suffix=" #" />
                </span>
              </Label>
              <textarea
                id="mk-ig-comment"
                rows={2}
                value={draft.instagram.first_comment}
                className={field("instagram.first_comment")}
                onChange={(e) => setIg({ first_comment: e.target.value })}
                placeholder="#hashtags"
              />
              {msg("instagram.first_comment")}
            </div>
          </Section>
        )}

        {!locked && (
          <Section title="When">
            <Segmented
              label="When"
              value={mode}
              onChange={setMode}
              options={[
                { value: "now", label: "Publish now" },
                { value: "schedule", label: "Schedule" },
                { value: "draft", label: "Save as draft" },
              ]}
            />
            {mode !== "now" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-full max-w-sm space-y-1.5">
                    <Label htmlFor="mk-when">{mode === "schedule" ? "Date and time" : "Calendar date (optional)"}</Label>
                    <DateTimeField id="mk-when" value={when} min={mode === "schedule" ? new Date() : null} invalid={bad("scheduled_at")} clearable={mode === "draft"} onChange={setWhen} />
                  </div>
                  {mode === "schedule" && (
                    <div className="flex gap-1.5">
                      <button type="button" className={buttonClass("outline", "sm")} onClick={() => setWhen(isoToLocal(quickPickTime("tomorrow").toISOString()))}>
                        Tomorrow 9am
                      </button>
                      <button type="button" className={buttonClass("outline", "sm")} onClick={() => setWhen(isoToLocal(quickPickTime("next_monday").toISOString()))}>
                        Next Mon 9am
                      </button>
                    </div>
                  )}
                </div>
                {mode === "schedule" && tz && <p className="text-xs text-muted-foreground">{tz.replace(/_/g, " ")}</p>}
                {msg("scheduled_at")}
              </div>
            )}
            {post?.status === "scheduled" && (
              <button type="button" className={buttonClass("outline", "sm")} onClick={unschedule} disabled={!!busy}>
                {busy === "unschedule" && <Loader2 className="animate-spin" />}
                Unschedule
              </button>
            )}
            {attempted && errors.length > 0 && (
              <div ref={summaryRef}>
                <ErrorSummary issues={errors} />
              </div>
            )}
          </Section>
        )}
      </fieldset>
    </div>
  );

  const previewPane = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {draft.channels.length > 0 && (
          <Segmented
            label="Preview channel"
            size="sm"
            value={previewChannel ?? "google"}
            onChange={setPreview}
            options={chs.map((c) => ({
              value: c,
              label: (
                <>
                  <ChannelIcon channel={c} className="h-3.5 w-3.5" />
                  {CHANNEL_LABEL[c]}
                </>
              ),
            }))}
          />
        )}
        {previewChannel === "facebook" && (
          <Segmented
            label="Device"
            size="sm"
            value={fbDevice}
            onChange={setFbDevice}
            options={[
              { value: "mobile", label: "Mobile" },
              { value: "desktop", label: "Desktop" },
            ]}
          />
        )}
        {previewChannel === "instagram" && (
          <Segmented
            label="Aspect ratio"
            size="sm"
            value={igAspect}
            onChange={setIgAspect}
            options={[
              { value: "1:1", label: "1:1" },
              { value: "4:5", label: "4:5" },
            ]}
          />
        )}
      </div>
      {!previewChannel ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Pick a channel</p>
      ) : previewChannel === "google" ? (
        <div className="mx-auto max-w-[400px]">
          <GooglePreview draft={draft} account={account("google")} when={previewWhen} />
        </div>
      ) : previewChannel === "facebook" ? (
        <FacebookPreview draft={draft} account={account("facebook")} when={previewWhen} device={fbDevice} />
      ) : previewChannel === "linkedin" ? (
        <LinkedInPreview draft={draft} account={account("linkedin")} when={previewWhen} />
      ) : (
        <InstagramPreview draft={draft} account={account("instagram")} when={previewWhen} aspect={igAspect} />
      )}
    </div>
  );

  const menu = post && (
    <div className="relative">
      <button type="button" className={buttonClass("outline", "icon")} aria-label="More actions" aria-expanded={menuOpen} disabled={!!busy} onClick={() => setMenuOpen((o) => !o)}>
        <MoreHorizontal />
      </button>
      {menuOpen && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-44 rounded-xl border bg-popover p-1 shadow-elegant">
          <button type="button" onClick={duplicate} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
            <Copy className="h-4 w-4" /> Duplicate
          </button>
          <div className="my-1 h-px bg-border" />
          <button type="button" onClick={del} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );

  const spinner = (k: string) => busy === k && <Loader2 className="animate-spin" />;

  return (
    <>
      <Modal
        open={open}
        onClose={() => void close()}
        className="h-[100dvh] max-w-[1100px] sm:h-[min(92dvh,940px)] sm:w-[calc(100vw-1.5rem)]"
        title={
          <>
            <span className="truncate">{post ? (locked ? post.title || "Post" : "Edit post") : "New post"}</span>
            {post?.imported && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Imported</span>}
            {post && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", POST_STATUS[post.status].tone)}>{POST_STATUS[post.status].label}</span>}
          </>
        }
      >
        <div className="border-b px-5 py-2 lg:hidden">
          <Segmented
            label="Pane"
            size="sm"
            value={pane}
            onChange={setPane}
            options={[
              { value: "edit", label: "Edit" },
              { value: "preview", label: "Preview" },
            ]}
          />
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className={cn("min-h-0 min-w-0 overflow-y-auto px-5 py-5", pane === "preview" && "max-lg:hidden")}>{form}</div>
          <aside className={cn("min-h-0 min-w-0 overflow-y-auto bg-muted/40 px-5 py-5 lg:border-l", pane === "edit" && "max-lg:hidden")}>
            <p className="label-caps mb-3 max-lg:hidden">Preview</p>
            {previewPane}
          </aside>
        </div>

        <div className="flex items-center gap-2 border-t bg-card px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {menu}
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <button type="button" className={buttonClass("outline", "default", "max-sm:hidden")} onClick={() => void close()} disabled={!!busy && busy !== "retry"}>
              {locked ? "Close" : "Cancel"}
            </button>
            {locked ? (
              post?.status === "partially_failed" ? (
                <button type="button" className={buttonClass()} onClick={retry} disabled={!!busy}>
                  {busy === "retry" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                  {busy === "retry" ? BUSY_LABEL.retry : "Retry failed channels"}
                </button>
              ) : post?.status === "published" ? (
                <button type="button" className={buttonClass()} onClick={duplicate} disabled={!!busy}>
                  {spinner("dup") || <Copy />}
                  {busy === "dup" ? BUSY_LABEL.dup : "Duplicate"}
                </button>
              ) : null
            ) : (
              <>
                {failed.length > 0 && (
                  <button type="button" className={buttonClass("outline", "default", "max-sm:hidden")} onClick={retry} disabled={!!busy}>
                    {busy === "retry" ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                    Retry failed channels
                  </button>
                )}
                <button type="button" className={buttonClass("default", "default", "min-w-0")} onClick={submit} disabled={!!busy}>
                  {spinner(mode)}
                  <span className="truncate">{busy === mode ? BUSY_LABEL[mode] : primary}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </Modal>
      {dialog}
    </>
  );
}

function ErrorSummary({ issues }: { issues: PostIssue[] }) {
  return (
    <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
      <p className="text-sm font-semibold text-destructive">Fix before continuing</p>
      <ul className="mt-1 space-y-0.5">
        {issues.map((i, k) => (
          <li key={`${i.message}-${k}`} className="flex items-center gap-1.5 text-sm text-destructive">
            {i.channel ? <ChannelIcon channel={i.channel} className="h-3 w-3" /> : <span className="h-1 w-1 rounded-full bg-destructive" />}
            {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
