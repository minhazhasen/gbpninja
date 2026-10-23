"use client";
/* eslint-disable @next/next/no-img-element -- previews render user media (data:/remote URLs) as-is */

/*
 * Ported from TasksBook CRM (src/components/marketing/PostPreviews.tsx).
 * Look-alike previews of a post on Google Business Profile, Facebook, Instagram and LinkedIn.
 * They imitate each platform's light theme on purpose, so the colours here are the
 * platforms' own greys / link blues (the one place raw colours are allowed, like ChannelIcon).
 */
import { useState, type ReactNode } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { Bookmark, ChevronLeft, ChevronRight, ExternalLink, Globe, Heart, ImagePlus, Link2, MessageCircle, MoreHorizontal, Phone, Play, Send, Share2, Tag, ThumbsUp, X } from "lucide-react";
import { CTA_LABEL, channelMedia, channelText, formatEventRange, formatOfferRange, truncateForPreview, type PostDraft, type PostMedia } from "@/lib/posts";
import { cn } from "@/lib/utils";

export interface PreviewAccount {
  name: string;
  logoUrl?: string | null;
  handle: string;
}

/** Hashtags + links in the platform's link colour. */
function Rich({ text, linkClass }: { text: string; linkClass: string }) {
  const parts = text.split(/(#[\p{L}\p{N}_]+|https?:\/\/\S+)/gu);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={linkClass}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Clamp({
  text,
  chars,
  lines,
  more,
  linkClass,
  moreClass,
  className,
  lead,
}: {
  text: string;
  chars: number;
  lines: number;
  more: string;
  linkClass: string;
  moreClass: string;
  className?: string;
  lead?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const cut = open ? null : truncateForPreview(text, chars, lines);
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {lead}
      <Rich text={cut ?? text} linkClass={linkClass} />
      {cut != null && (
        <>
          {"… "}
          <button type="button" onClick={() => setOpen(true)} className={moreClass}>
            {more}
          </button>
        </>
      )}
    </p>
  );
}

function Avatar({ account, size, className }: { account: PreviewAccount; size: number; className?: string }) {
  const initial = account.name.trim().charAt(0).toUpperCase() || "B";
  const [broken, setBroken] = useState<string | null>(null);
  return account.logoUrl && broken !== account.logoUrl ? (
    <img
      src={account.logoUrl}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setBroken(account.logoUrl ?? null)}
      style={{ width: size, height: size }}
      className={cn("shrink-0 rounded-full border border-black/5 bg-white object-contain", className)}
    />
  ) : (
    <span style={{ width: size, height: size, fontSize: size * 0.42 }} className={cn("flex shrink-0 items-center justify-center rounded-full bg-[#E8EAED] font-semibold text-[#3C4043]", className)}>
      {initial}
    </span>
  );
}

function VideoTile({ m, className }: { m: PostMedia; className?: string }) {
  let host = "";
  try {
    host = new URL(m.url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  return (
    <div className={cn("relative flex items-center justify-center bg-[#1C1E21] text-white", className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50">
        <Play className="ml-0.5 h-6 w-6 fill-white" />
      </span>
      {host && <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px]">{host}</span>}
    </div>
  );
}

function Tile({ m, className }: { m: PostMedia; className?: string }) {
  return m.type === "video" ? <VideoTile m={m} className={className} /> : <img referrerPolicy="no-referrer" src={m.url} alt={m.alt ?? ""} className={cn("bg-[#F0F2F5] object-cover", className)} />;
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
const titleOf = (url: string) => {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last
      ? decodeURIComponent(last)
          .replace(/[-_]+/g, " ")
          .replace(/\.\w+$/, "")
          .replace(/^\w/, (c) => c.toUpperCase())
      : u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// ================================================================ Google
/**
 * The post's time the way each network shows it. No time (posting now) or within the last minute: "Just now". Past posts get their
 * real date (Google: "3 days ago"; LinkedIn: "2d"), scheduled ones the date they'll go out.
 */
function postTime(when: Date | null, network: "google" | "facebook" | "instagram" | "linkedin" | "x") {
  const now = network === "linkedin" ? "Now" : network === "x" ? "now" : "Just now";
  if (!when || Math.abs(when.getTime() - Date.now()) < 60_000) return now;
  const past = when.getTime() < Date.now();
  if (network === "google") return past ? `${formatDistanceToNowStrict(when)} ago` : format(when, "MMM d");
  if (network === "facebook") return format(when, when.getFullYear() === new Date().getFullYear() ? "MMMM d 'at' h:mm a" : "MMMM d, yyyy");
  if (network === "instagram") return format(when, when.getFullYear() === new Date().getFullYear() ? "MMMM d" : "MMMM d, yyyy");
  if (network === "linkedin" && past) {
    const mins = Math.round((Date.now() - when.getTime()) / 60_000);
    return mins < 60
      ? `${mins}m`
      : mins < 1440
        ? `${Math.round(mins / 60)}h`
        : mins < 10_080
          ? `${Math.round(mins / 1440)}d`
          : mins < 43_200
            ? `${Math.round(mins / 10_080)}w`
            : `${Math.round(mins / 43_200)}mo`;
  }
  return format(when, when.getFullYear() === new Date().getFullYear() ? "MMM d" : "MMM d, yyyy");
}

export function GooglePreview({ draft, account, when }: { draft: PostDraft; account: PreviewAccount; when: Date | null }) {
  const g = draft.google;
  const text = channelText(draft, "google");
  const img = channelMedia(draft.media, "google")[0];
  const time = postTime(when, "google");
  const cta = g.type !== "offer" && g.cta.type !== "none" ? g.cta.type : null;
  return (
    <article className="overflow-hidden rounded-xl border border-[#DADCE0] bg-white font-[Roboto,Arial,sans-serif] text-[14px] leading-5 text-[#202124]">
      <header className="flex items-center gap-3 px-4 pb-3 pt-4">
        <Avatar account={account} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-[#202124]">{account.name}</p>
          <p className="text-[12px] text-[#70757A]">{time}</p>
        </div>
        <Share2 className="h-[18px] w-[18px] text-[#5F6368]" aria-hidden />
      </header>
      <div className="px-4">
        {img ? (
          <img referrerPolicy="no-referrer" src={img.url} alt={img.alt ?? ""} className="aspect-[4/3] w-full rounded-lg bg-[#F1F3F4] object-cover" />
        ) : g.type !== "update" ? null : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-[#F1F3F4] text-[12px] text-[#70757A]">No photo</div>
        )}
      </div>
      <div className="space-y-2 px-4 pb-4 pt-3">
        {g.type === "event" && (
          <div>
            <p className="text-[16px] font-semibold leading-6 text-[#202124]">{g.event.title || "Event title"}</p>
            {g.event.start && <p className="text-[12px] text-[#70757A]">{formatEventRange(g.event.start, g.event.end)}</p>}
          </div>
        )}
        {g.type === "offer" && (
          <div className="space-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F4EA] px-2 py-0.5 text-[11px] font-semibold text-[#137333]">
              <Tag className="h-3 w-3" /> Offer
            </span>
            <p className="text-[16px] font-semibold leading-6 text-[#202124]">{g.offer.title || "Offer title"}</p>
            {g.offer.start && <p className="text-[12px] text-[#70757A]">{formatOfferRange(g.offer.start, g.offer.end)}</p>}
          </div>
        )}
        {text && <Clamp text={text} chars={230} lines={4} more="More" linkClass="text-[#1A73E8]" moreClass="text-[14px] text-[#1A73E8]" className="text-[14px] text-[#3C4043]" />}
        {g.type === "offer" && g.offer.coupon && (
          <div className="rounded-lg border border-dashed border-[#DADCE0] px-3 py-2 text-center">
            <p className="text-[11px] text-[#70757A]">Show this code at the store</p>
            <p className="font-mono text-[16px] font-semibold tracking-wider text-[#202124]">{g.offer.coupon}</p>
          </div>
        )}
        {g.type === "offer" && (g.offer.url || g.offer.terms) && (
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {g.offer.url && (
              <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#DADCE0] px-4 text-[14px] text-[#1A73E8]">
                View offer <ExternalLink className="h-3.5 w-3.5" />
              </span>
            )}
            {g.offer.terms && <span className="text-[12px] text-[#70757A] underline decoration-dotted">Terms and conditions</span>}
          </div>
        )}
        {cta && (
          <div className="pt-1">
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#DADCE0] px-4 text-[14px] text-[#1A73E8]">
              {cta === "CALL" ? <Phone className="h-3.5 w-3.5" /> : null}
              {CTA_LABEL[cta]}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

// ================================================================ Facebook
function FbGrid({ media }: { media: PostMedia[] }) {
  const n = media.length;
  if (!n) return null;
  if (n === 1) return <Tile m={media[0]} className="block max-h-[520px] w-full object-cover aspect-[4/3]" />;
  if (n === 2)
    return (
      <div className="grid grid-cols-2 gap-0.5">
        {media.map((m, i) => (
          <Tile key={i} m={m} className="aspect-square w-full" />
        ))}
      </div>
    );
  if (n === 3)
    return (
      <div className="grid grid-cols-2 gap-0.5">
        <Tile m={media[0]} className="col-span-2 aspect-[2/1] w-full" />
        <Tile m={media[1]} className="aspect-square w-full" />
        <Tile m={media[2]} className="aspect-square w-full" />
      </div>
    );
  if (n === 4)
    return (
      <div className="grid grid-cols-2 gap-0.5">
        {media.map((m, i) => (
          <Tile key={i} m={m} className="aspect-square w-full" />
        ))}
      </div>
    );
  const rest = n - 5;
  return (
    <div className="space-y-0.5">
      <div className="grid grid-cols-2 gap-0.5">
        <Tile m={media[0]} className="aspect-square w-full" />
        <Tile m={media[1]} className="aspect-square w-full" />
      </div>
      <div className="grid grid-cols-3 gap-0.5">
        {media.slice(2, 5).map((m, i) => (
          <div key={i} className="relative">
            <Tile m={m} className="aspect-square w-full" />
            {i === 2 && rest > 0 && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-[28px] font-semibold text-white">+{rest}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FacebookPreview({ draft, account, when, device }: { draft: PostDraft; account: PreviewAccount; when: Date | null; device: "mobile" | "desktop" }) {
  const text = channelText(draft, "facebook");
  const media = channelMedia(draft.media, "facebook");
  const link = draft.facebook.link.trim();
  const shown = link && media.length ? `${text}${text ? "\n\n" : ""}${link}` : text;
  const time = postTime(when, "facebook");
  const comment = draft.facebook.first_comment.trim();
  const action = "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md text-[15px] font-semibold text-[#65676B]";
  return (
    <article
      className={cn(
        'mx-auto overflow-hidden bg-white font-[system-ui,-apple-system,"Segoe_UI",Helvetica,Arial,sans-serif] text-[15px] leading-[1.34] text-[#050505]',
        device === "mobile" ? "max-w-[375px] border-y border-[#CED0D4]" : "max-w-[500px] rounded-lg border border-[#E4E6EB] shadow-sm",
      )}
    >
      <header className="flex items-start gap-2 px-4 pb-2 pt-3">
        <Avatar account={account} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">
            {account.name}
            <span className="font-normal text-[#65676B]"> · </span>
            <span className="text-[#0866FF]">Follow</span>
          </p>
          <p className="flex items-center gap-1 text-[13px] text-[#65676B]">
            {time} · <Globe className="h-3 w-3" aria-label="Public" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-[#65676B]" aria-hidden />
        {device === "desktop" && <X className="ml-2 h-5 w-5 text-[#65676B]" aria-hidden />}
      </header>
      {shown && (
        <Clamp
          text={shown}
          chars={device === "mobile" ? 180 : 280}
          lines={5}
          more="See more"
          linkClass="text-[#0064D1]"
          moreClass="font-semibold text-[#65676B] hover:underline"
          className="px-4 pb-3"
        />
      )}
      {media.length > 0 ? (
        <FbGrid media={media} />
      ) : link ? (
        <div className="border-y border-[#E4E6EB] bg-[#F0F2F5]">
          <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-[#E4E6EB] text-[#8A8D91]">
            <Link2 className="h-8 w-8" />
          </div>
          <div className="px-4 py-2.5">
            <p className="truncate text-[13px] uppercase text-[#65676B]">{domainOf(link)}</p>
            <p className="truncate text-[17px] font-semibold leading-snug text-[#050505]">{titleOf(link)}</p>
          </div>
        </div>
      ) : null}
      <div className="flex items-center justify-between px-4 py-2.5 text-[15px] text-[#65676B]">
        <span className="flex items-center gap-1.5">
          <span className="flex -space-x-1">
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#0866FF] ring-2 ring-white">
              <ThumbsUp className="h-2.5 w-2.5 fill-white text-white" />
            </span>
            <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#F33E58] ring-2 ring-white">
              <Heart className="h-2.5 w-2.5 fill-white text-white" />
            </span>
          </span>
          24
        </span>
        <span>{comment ? "1 comment" : "3 comments"} · 2 shares</span>
      </div>
      <div className="mx-4 flex border-t border-[#CED0D4] py-1">
        <span className={action}>
          <ThumbsUp className="h-[18px] w-[18px]" /> Like
        </span>
        <span className={action}>
          <MessageCircle className="h-[18px] w-[18px]" /> Comment
        </span>
        <span className={action}>
          <Share2 className="h-[18px] w-[18px]" /> Share
        </span>
      </div>
      {comment && (
        <div className="flex gap-2 border-t border-[#CED0D4] px-4 py-3">
          <Avatar account={account} size={32} />
          <div className="min-w-0">
            <div className="rounded-2xl bg-[#F0F2F5] px-3 py-2">
              <p className="text-[13px] font-semibold">{account.name}</p>
              <p className="whitespace-pre-wrap break-words text-[15px]">
                <Rich text={comment} linkClass="text-[#0064D1]" />
              </p>
            </div>
            <p className="px-3 pt-0.5 text-[12px] font-semibold text-[#65676B]">Just now · Like · Reply</p>
          </div>
        </div>
      )}
    </article>
  );
}

// ================================================================ Instagram
export function InstagramPreview({ draft, account, when, aspect }: { draft: PostDraft; account: PreviewAccount; when: Date | null; aspect: "1:1" | "4:5" }) {
  const media = channelMedia(draft.media, "instagram");
  const [idx, setIdx] = useState(0);
  const i = Math.min(idx, Math.max(0, media.length - 1));
  const text = channelText(draft, "instagram");
  const comment = draft.instagram.first_comment.trim();
  const time = postTime(when, "instagram");
  const box = aspect === "4:5" ? "aspect-[4/5]" : "aspect-square";
  const icon = "h-6 w-6 text-[#000]";
  const user = <span className="font-semibold">{account.handle}</span>;
  return (
    <article className="mx-auto max-w-[375px] overflow-hidden border border-[#DBDBDB] bg-white font-[system-ui,-apple-system,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif] text-[14px] leading-[18px] text-[#000] sm:rounded-lg">
      <header className="flex items-center gap-2.5 px-3 py-2.5">
        <span className="rounded-full p-[2px]" style={{ background: "linear-gradient(45deg,#FEDA75,#FA7E1E,#D62976,#962FBF,#4F5BD5)" }}>
          <span className="block rounded-full bg-white p-[2px]">
            <Avatar account={account} size={28} />
          </span>
        </span>
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">{account.handle}</p>
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </header>
      {media.length ? (
        <div className="relative">
          <Tile m={media[i]} className={cn("block w-full", box)} />
          {media.length > 1 && (
            <>
              <span className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-0.5 text-[12px] font-semibold text-white">
                {i + 1}/{media.length}
              </span>
              {i > 0 && (
                <button
                  type="button"
                  aria-label="Previous"
                  onClick={() => setIdx(i - 1)}
                  className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#262626] shadow"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {i < media.length - 1 && (
                <button
                  type="button"
                  aria-label="Next"
                  onClick={() => setIdx(i + 1)}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-[#262626] shadow"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className={cn("flex w-full flex-col items-center justify-center gap-2 bg-[#FAFAFA] text-[13px] text-[#737373]", box)}>
          <ImagePlus className="h-8 w-8" />
          Add an image to post on Instagram
        </div>
      )}
      <div className="flex items-center px-3 pt-2.5">
        <div className="flex flex-1 items-center gap-4">
          <Heart className={icon} />
          <MessageCircle className={cn(icon, "-scale-x-100")} />
          <Send className={icon} />
        </div>
        {media.length > 1 && (
          <div className="flex flex-1 justify-center gap-1">
            {media.map((_, k) => (
              <span key={k} className={cn("h-1.5 w-1.5 rounded-full", k === i ? "bg-[#0095F6]" : "bg-[#C7C7C7]")} />
            ))}
          </div>
        )}
        <div className="flex flex-1 justify-end">
          <Bookmark className={icon} />
        </div>
      </div>
      <div className="space-y-1 px-3 pb-3 pt-2">
        <p>
          Liked by <span className="font-semibold">your_customer</span> and <span className="font-semibold">others</span>
        </p>
        {text && <Clamp text={text} chars={90} lines={2} more="more" lead={<>{user} </>} linkClass="text-[#00376B]" moreClass="text-[#737373]" />}
        {comment && (
          <p className="whitespace-pre-wrap break-words">
            {user} <Rich text={comment} linkClass="text-[#00376B]" />
          </p>
        )}
        <p className="pt-0.5 text-[10px] uppercase tracking-[0.2px] text-[#737373]">{time}</p>
      </div>
    </article>
  );
}

export function LinkedInPreview({ draft, account, when }: { draft: PostDraft; account: PreviewAccount; when: Date | null }) {
  const text = channelText(draft, "linkedin");
  const media = channelMedia(draft.media, "linkedin");
  const video = draft.media.find((m) => m.type === "video");
  const shown = video && !text.includes(video.url) ? `${text}${text ? "\n\n" : ""}${video.url}` : text;
  const time = postTime(when, "linkedin");
  const action = "flex h-10 flex-1 items-center justify-center gap-1.5 rounded text-[14px] font-semibold text-[#666666]";
  return (
    <article
      className={
        'mx-auto max-w-[555px] overflow-hidden rounded-lg border border-[#E0DFDC] bg-white font-[system-ui,-apple-system,"Segoe_UI",Roboto,Helvetica,Arial,sans-serif] text-[14px] leading-[1.43] text-[#191919]'
      }
    >
      <header className="flex items-start gap-2 px-4 pb-2 pt-3">
        <Avatar account={account} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold">{account.name}</p>
          <p className="truncate text-[12px] text-[#666666]">1,284 followers</p>
          <p className="flex items-center gap-1 text-[12px] text-[#666666]">
            {time} · <Globe className="h-3 w-3" aria-label="Public" />
          </p>
        </div>
        <MoreHorizontal className="h-5 w-5 text-[#666666]" aria-hidden />
      </header>
      {shown && <Clamp text={shown} chars={210} lines={3} more="…see more" linkClass="font-semibold text-[#0A66C2]" moreClass="text-[#666666] hover:underline" className="px-4 pb-2" />}
      {media.length > 0 && (
        <div className={cn("grid gap-0.5", media.length > 1 && "grid-cols-2")}>
          {media.slice(0, 4).map((m, i) => (
            <div key={m.url} className={cn("relative bg-[#F3F2EF]", media.length === 1 ? "aspect-[1.91/1]" : "aspect-square", media.length === 3 && i === 0 && "col-span-2 aspect-[1.91/1]")}>
              <img referrerPolicy="no-referrer" src={m.url} alt={m.alt || ""} className="h-full w-full object-cover" />
              {i === 3 && media.length > 4 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-semibold text-white">+{media.length - 4}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between px-4 py-2 text-[12px] text-[#666666]">
        <span className="flex items-center gap-1">
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#378FE9]">
            <ThumbsUp className="h-2.5 w-2.5 fill-white text-white" />
          </span>
          18
        </span>
        <span>2 comments · 1 repost</span>
      </div>
      <div className="mx-3 flex border-t border-[#E0DFDC] py-1">
        <span className={action}>
          <ThumbsUp className="h-[18px] w-[18px]" /> Like
        </span>
        <span className={action}>
          <MessageCircle className="h-[18px] w-[18px]" /> Comment
        </span>
        <span className={action}>
          <Share2 className="h-[18px] w-[18px]" /> Repost
        </span>
        <span className={action}>
          <Send className="h-[18px] w-[18px]" /> Send
        </span>
      </div>
    </article>
  );
}
