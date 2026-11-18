// Video uploads for the Media Library. A video (up to 75 MB) can't go in one request, so the browser sends it in pieces
// (server actions, base64): they're appended to a temporary file, then the finished file is moved next to the other public
// media (<data dir>/media, served at /api/media/<name>) where Google fetches it. Server-only.
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { appIsPublic, appUrl, mediaDir } from "@/lib/public-media";

export const VIDEO_MAX_BYTES = 75 * 1024 * 1024;
/** Bytes per piece (base64 makes it ~5.4 MB, under the 25 MB server action limit). */
export const VIDEO_CHUNK_BYTES = 4 * 1024 * 1024;
const UPLOAD_ID = /^[a-f0-9]{32}$/;

const tmpDir = () => path.join(mediaDir(), "tmp");
const tmpFile = (uploadId: string) => path.join(tmpDir(), `${uploadId}.part`);

/** Add the next piece. Pieces must arrive in order (`index` 0, 1, 2…): a gap or repeat is refused. */
export async function appendVideoChunk(uploadId: string, index: number, base64: string) {
  if (!UPLOAD_ID.test(uploadId)) throw new Error("Invalid upload");
  const bytes = Buffer.from(base64, "base64");
  if (!bytes.length || bytes.length > VIDEO_CHUNK_BYTES) throw new Error("That piece of the video was the wrong size. Try again.");
  await mkdir(tmpDir(), { recursive: true });
  const file = tmpFile(uploadId);
  const have = index === 0 ? 0 : await stat(file).then((s) => s.size, () => -1);
  if (index === 0) await rm(file, { force: true });
  else if (have !== index * VIDEO_CHUNK_BYTES) throw new Error("A piece of the video went missing. Try the upload again.");
  if (have + bytes.length > VIDEO_MAX_BYTES) {
    await rm(file, { force: true });
    throw new Error("Videos must be 75 MB or smaller");
  }
  await appendFile(file, bytes);
}

/** The finished upload as a public media file; returns its link (absolute on the live site, /api/media/… locally). */
export async function finishVideoUpload(uploadId: string, ext: "mp4" | "mov") {
  if (!UPLOAD_ID.test(uploadId)) throw new Error("Invalid upload");
  const file = tmpFile(uploadId);
  const size = await stat(file).then((s) => s.size, () => 0);
  if (!size) throw new Error("The video didn't arrive. Try again.");
  const name = `${randomBytes(24).toString("hex")}.${ext}`;
  await rename(file, path.join(mediaDir(), name));
  await cleanStale();
  return appIsPublic() ? `${appUrl()}/api/media/${name}` : `/api/media/${name}`;
}

/** Pieces of uploads that never finished (closed tab…), after a day. */
async function cleanStale() {
  const dir = tmpDir();
  for (const f of await readdir(dir).catch(() => [] as string[])) {
    const p = path.join(dir, f);
    const age = Date.now() - (await stat(p).then((s) => s.mtimeMs, () => Date.now()));
    if (age > 86_400_000) await rm(p, { force: true });
  }
}
