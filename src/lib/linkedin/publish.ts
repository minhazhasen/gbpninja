// Publish to / delete from LinkedIn (Posts API, https://api.linkedin.com/rest/posts) as the connected member.
// Images: /rest/images?action=initializeUpload → PUT the bytes to the upload URL → reference the image URN (one image, or
// multiImage for 2–20). Text is LinkedIn's "little text" format: reserved characters escaped, hashtags turned into hashtag tags.
// LinkedIn-Version: a version a few months old (versions stay supported about a year), or LINKEDIN_API_VERSION.
import { format, subMonths } from "date-fns";
import { channelMedia, channelText, type Post } from "@/lib/posts";
import { linkedinAccount, linkedinToken } from "./oauth";

const REST = "https://api.linkedin.com/rest";
const version = () => process.env.LINKEDIN_API_VERSION || format(subMonths(new Date(), 3), "yyyyMM");

async function li(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${REST}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": version(), "X-Restli-Protocol-Version": "2.0.0", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  if (!res.ok) {
    const e = (await res.json().catch(() => ({}))) as { message?: string; status?: number };
    if (res.status === 401) throw new Error("LinkedIn access expired or was removed. Reconnect LinkedIn in Settings → Accounts.");
    const err = new Error(e.message ? `LinkedIn: ${e.message}` : `LinkedIn error ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res;
}

/** LinkedIn "little text": escape reserved characters; #words become hashtag tags so they stay clickable. */
export function littleText(text: string) {
  const esc = (s: string) => s.replace(/[\\|{}@\[\]()<>#*_~]/g, (c) => `\\${c}`);
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    out.push(esc(text.slice(last, m.index)), `{hashtag|\\#|${esc(m[1])}}`);
    last = m.index! + m[0].length;
  }
  out.push(esc(text.slice(last)));
  return out.join("");
}

async function uploadImage(src: string, owner: string, token: string): Promise<string> {
  const init = await li("images?action=initializeUpload", token, { method: "POST", body: JSON.stringify({ initializeUploadRequest: { owner } }) });
  const { value } = (await init.json()) as { value: { uploadUrl: string; image: string } };
  const data = src.match(/^data:([\w/+.-]+);base64,(.+)$/);
  const bytes = data ? Buffer.from(data[2], "base64") : Buffer.from(await (await fetch(src)).arrayBuffer());
  const put = await fetch(value.uploadUrl, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": data?.[1] ?? "application/octet-stream" }, body: new Uint8Array(bytes) });
  if (!put.ok) throw new Error(`LinkedIn didn't accept the image (${put.status})`);
  return value.image;
}

export async function publishToLinkedin(post: Post): Promise<{ id: string; permalink: string }> {
  const account = await linkedinAccount();
  if (!account?.memberId) throw new Error("Connect LinkedIn in Settings → Accounts first");
  const token = await linkedinToken();
  const author = `urn:li:person:${account.memberId}`;
  const images = channelMedia(post.media, "linkedin");
  const ids: { id: string; altText: string }[] = [];
  for (const m of images) ids.push({ id: await uploadImage(m.url, author, token), altText: m.alt ?? "" });

  const body: Record<string, unknown> = {
    author,
    commentary: littleText(channelText(post, "linkedin")),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (ids.length === 1) body.content = { media: ids[0] };
  else if (ids.length > 1) body.content = { multiImage: { images: ids } };

  const res = await li("posts", token, { method: "POST", body: JSON.stringify(body) });
  const id = res.headers.get("x-restli-id") ?? res.headers.get("x-linkedin-id") ?? "";
  if (!id) throw new Error("LinkedIn didn't return the new post's id");
  return { id, permalink: `https://www.linkedin.com/feed/update/${id}/` };
}

/** Delete a published LinkedIn post (already deleted counts as done). */
export async function deleteFromLinkedin(urn: string) {
  const token = await linkedinToken();
  try {
    await li(`posts/${encodeURIComponent(urn)}`, token, { method: "DELETE" });
  } catch (e) {
    if ((e as { status?: number }).status === 404) return;
    throw e;
  }
}
