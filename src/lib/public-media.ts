// Public links for post images / videos. Google posts and Instagram only take media from a public https link (they fetch it), while
// the composer keeps uploads as data: URLs. This saves the file next to the database (outside the deploy folder) under a random,
// unguessable name and serves it at APP_URL/api/media/<name> (src/app/api/media/[file]/route.ts). Server-only.
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime" };
const EXT: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([e, t]) => [t, e]));
export const MEDIA_NAME = /^[a-f0-9]{48}\.(jpg|png|webp|gif|mp4|mov)$/;

/** Where media files live: a "media" folder beside the SQLite file (prod: ~/gbpninja-data/media). */
export function mediaDir() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  const file = url.startsWith("file:") ? url.slice(5) : "./dev.db";
  return path.join(path.isAbsolute(file) ? path.dirname(file) : path.join(process.cwd(), "prisma"), "media");
}

/** The app's public address, for links other services fetch (APP_URL, e.g. https://app.gbpninja.com). */
export const appUrl = () => (process.env.APP_URL || "http://localhost:3001").replace(/\/$/, "");
export const appIsPublic = () => !/^https?:\/\/(localhost|127\.|\[::1\])/.test(appUrl());

/** A public https link for a media item: https URLs pass through, data: URLs are saved and served by the app. */
export async function publicMediaUrl(src: string, service = "Instagram"): Promise<string> {
  if (/^https:\/\//.test(src)) return src;
  const m = src.match(/^data:([\w/+.-]+);base64,(.+)$/);
  if (!m) throw new Error("This media item has no usable link");
  const ext = EXT[m[1]];
  if (!ext) throw new Error(`Unsupported media type ${m[1]}`);
  if (!appIsPublic())
    throw new Error(
      `${service} needs the image on a public link, which this computer (localhost) can't give it. Publish from the live site (${appUrl().includes("localhost") ? "app.gbpninja.com" : appUrl()}).`,
    );
  const name = `${randomBytes(24).toString("hex")}.${ext}`;
  await mkdir(mediaDir(), { recursive: true });
  await writeFile(path.join(mediaDir(), name), Buffer.from(m[2], "base64"));
  return `${appUrl()}/api/media/${name}`;
}

/** Bytes + type of a data: URL (for direct uploads, e.g. Facebook photos). */
export function dataUrlBlob(src: string): Blob | null {
  const m = src.match(/^data:([\w/+.-]+);base64,(.+)$/);
  return m ? new Blob([Buffer.from(m[2], "base64")], { type: m[1] }) : null;
}

export async function readMedia(name: string) {
  if (!MEDIA_NAME.test(name)) return null;
  try {
    return { body: await readFile(path.join(mediaDir(), name)), type: TYPES[name.split(".").pop()!] };
  } catch {
    return null;
  }
}
