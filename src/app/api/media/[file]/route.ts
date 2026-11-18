// Public media for social posts and the Media Library (see src/lib/public-media.ts): random 48-hex names, no listing, read-only.
// Supports byte ranges so videos play and seek in every browser (Safari needs them).
import { readMedia } from "@/lib/public-media";

const headers = (type: string) => ({ "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" });

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = await readMedia((await params).file);
  if (!file) return new Response("Not found", { status: 404 });
  const size = file.body.length;
  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new Response(new Uint8Array(file.body.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers(file.type), "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(file.body), { headers: { ...headers(file.type), "Content-Length": String(size) } });
}
