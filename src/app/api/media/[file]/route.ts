// Public media for social posts (see src/lib/public-media.ts): random 48-hex names, no listing, read-only.
import { readMedia } from "@/lib/public-media";

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = await readMedia((await params).file);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file.body), { headers: { "Content-Type": file.type, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
