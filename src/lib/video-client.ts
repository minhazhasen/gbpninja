// Browser side of a Media Library video upload: send the file in 4 MB pieces (server actions), then finish it.
import { finishVideo, uploadVideoChunk } from "@/app/(app)/actions";
import type { PhotoCategory } from "@/lib/gbp/types";

const CHUNK = 4 * 1024 * 1024;

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Couldn't read the video"));
    r.readAsDataURL(blob);
  });

export async function uploadVideo(locationId: string, file: File, category: PhotoCategory, onProgress: (share: number) => void): Promise<{ ok: true } | { ok: false; error: string }> {
  const uploadId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const pieces = Math.max(1, Math.ceil(file.size / CHUNK));
  try {
    for (let i = 0; i < pieces; i++) {
      const res = await uploadVideoChunk(uploadId, i, await toBase64(file.slice(i * CHUNK, (i + 1) * CHUNK)));
      if (!res.ok) return res;
      onProgress((i + 1) / (pieces + 1));
    }
    const ext = /\.mov$/i.test(file.name) || file.type === "video/quicktime" ? "mov" : "mp4";
    const done = await finishVideo(locationId, uploadId, ext, category);
    onProgress(1);
    return done.ok ? { ok: true } : done;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed" };
  }
}
