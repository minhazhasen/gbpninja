// Publish a post to the connected Facebook Page / Instagram business account (Graph API, Page token from meta/oauth.ts).
//   Facebook: text/link → /{page}/feed; one photo → /{page}/photos (uploaded directly, data: URLs too); several photos → each
//             uploaded unpublished, then /{page}/feed with attached_media; video → /{page}/videos. Optional first comment.
//   Instagram: needs media on a public link (public-media.ts): one image, a carousel (≤10) or a Reel; container → wait until
//             FINISHED → /{ig}/media_publish. Optional first comment. Text-only isn't possible on Instagram.
import { channelMedia, channelText, type Post } from "@/lib/posts";
import { dataUrlBlob, publicMediaUrl } from "@/lib/public-media";
import { MetaApiError, graph, metaPages, type MetaPage } from "./oauth";

export interface MetaPublished {
  id: string;
  permalink: string | null;
}

const form = (fields: Record<string, string | Blob>, token: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  f.append("access_token", token);
  return f;
};

async function pageFor(targetId: string, by: "page" | "instagram"): Promise<MetaPage> {
  const find = (pages: MetaPage[]) => pages.find((p) => (by === "page" ? p.id === targetId : p.instagram?.id === targetId));
  // The Page list is cached; re-read it once if the connected account isn't in it (new Page, new token).
  const page = find(await metaPages()) ?? find(await metaPages(true));
  if (!page)
    throw new Error(by === "page" ? "The connected Facebook Page isn't available any more. Reconnect in Settings." : "The connected Instagram account isn't linked to your Facebook Pages any more.");
  return page;
}

export async function publishToFacebook(post: Post, pageId: string): Promise<MetaPublished> {
  const page = await pageFor(pageId, "page");
  const message = channelText(post, "facebook");
  const media = channelMedia(post.media, "facebook");
  let id: string;

  if (media[0]?.type === "video") {
    const v = media[0];
    const blob = dataUrlBlob(v.url);
    const r = await graph<{ id: string }>(`https://graph-video.facebook.com/v21.0/${page.id}/videos`, page.token, {
      method: "POST",
      body: blob ? form({ source: blob, description: message }, page.token) : form({ file_url: v.url, description: message }, page.token),
    });
    id = r.id;
  } else if (media.length === 1) {
    const blob = dataUrlBlob(media[0].url);
    const r = await graph<{ id: string; post_id?: string }>(`${page.id}/photos`, page.token, {
      method: "POST",
      body: form({ ...(blob ? { source: blob } : { url: media[0].url }), caption: message, published: "true" }, page.token),
    });
    id = r.post_id ?? r.id;
  } else if (media.length > 1) {
    const ids: string[] = [];
    for (const m of media) {
      const blob = dataUrlBlob(m.url);
      const r = await graph<{ id: string }>(`${page.id}/photos`, page.token, { method: "POST", body: form({ ...(blob ? { source: blob } : { url: m.url }), published: "false" }, page.token) });
      ids.push(r.id);
    }
    const body = new URLSearchParams({ message });
    ids.forEach((mid, i) => body.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: mid })));
    id = (await graph<{ id: string }>(`${page.id}/feed`, page.token, { method: "POST", body })).id;
  } else {
    const body = new URLSearchParams({ message });
    if (post.facebook.link) body.set("link", post.facebook.link);
    id = (await graph<{ id: string }>(`${page.id}/feed`, page.token, { method: "POST", body })).id;
  }

  if (post.facebook.first_comment.trim()) await graph(`${id}/comments`, page.token, { method: "POST", body: new URLSearchParams({ message: post.facebook.first_comment.trim() }) }).catch(() => {});
  return { id, permalink: `https://www.facebook.com/${id}` };
}

/** Wait for an Instagram media container to finish processing (Reels can take a while). */
async function ready(containerId: string, token: string) {
  for (let i = 0; i < 40; i++) {
    const r = await graph<{ status_code?: string; status?: string }>(containerId, token, { params: { fields: "status_code,status" } });
    if (r.status_code === "FINISHED" || r.status_code === "PUBLISHED") return;
    if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new Error(`Instagram couldn't process the media (${r.status ?? r.status_code}).`);
    await new Promise((res) => setTimeout(res, i < 5 ? 1500 : 4000));
  }
  throw new Error("Instagram is still processing the video. Try publishing again in a few minutes.");
}

export async function publishToInstagram(post: Post, igId: string): Promise<MetaPublished> {
  const page = await pageFor(igId, "instagram");
  const caption = channelText(post, "instagram");
  const media = channelMedia(post.media, "instagram");
  if (!media.length) throw new Error("Instagram posts need a photo or a video.");
  const urls = await Promise.all(media.map((m) => publicMediaUrl(m.url)));
  const item = (m: (typeof media)[number], url: string, extra: Record<string, string> = {}) =>
    new URLSearchParams(m.type === "video" ? { media_type: media.length > 1 ? "VIDEO" : "REELS", video_url: url, ...extra } : { image_url: url, ...extra });

  let container: string;
  if (media.length === 1) {
    const body = item(media[0], urls[0], { caption });
    container = (await graph<{ id: string }>(`${igId}/media`, page.token, { method: "POST", body })).id;
  } else {
    const children: string[] = [];
    for (let i = 0; i < media.length; i++) {
      const c = (await graph<{ id: string }>(`${igId}/media`, page.token, { method: "POST", body: item(media[i], urls[i], { is_carousel_item: "true" }) })).id;
      await ready(c, page.token);
      children.push(c);
    }
    container = (await graph<{ id: string }>(`${igId}/media`, page.token, { method: "POST", body: new URLSearchParams({ media_type: "CAROUSEL", children: children.join(","), caption }) })).id;
  }
  await ready(container, page.token);
  const { id } = await graph<{ id: string }>(`${igId}/media_publish`, page.token, { method: "POST", body: new URLSearchParams({ creation_id: container }) });
  if (post.instagram.first_comment.trim()) await graph(`${id}/comments`, page.token, { method: "POST", body: new URLSearchParams({ message: post.instagram.first_comment.trim() }) }).catch(() => {});
  const permalink = await graph<{ permalink?: string }>(id, page.token, { params: { fields: "permalink" } })
    .then((r) => r.permalink ?? null)
    .catch(() => null);
  return { id, permalink };
}

/** Delete a published Facebook post (feed post, photo or video id). Already gone counts as done. */
export async function deleteFromFacebook(externalId: string, pageId: string | undefined): Promise<void> {
  // Feed ids are "<page id>_<post id>": that tells us the Page even if the connection changed since.
  const owner = externalId.includes("_") ? externalId.split("_")[0] : pageId;
  if (!owner) throw new Error("Don't know which Facebook Page this post is on");
  const page = await pageFor(owner, "page");
  try {
    await graph(externalId, page.token, { method: "DELETE" });
  } catch (e) {
    // 100 / 803 = no such object (deleted on Facebook already).
    if (e instanceof MetaApiError && (e.code === 100 || e.code === 803)) return;
    throw e;
  }
}
