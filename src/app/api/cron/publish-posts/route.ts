// Scheduled posts: call every 5 minutes with "Authorization: Bearer $CRON_SECRET" — publishes every post whose time has come
// (see src/lib/publish-due.ts).
import { NextResponse } from "next/server";
import { publishDueEverywhere } from "@/lib/publish-due";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  // No secret configured: allowed only outside production (local testing).
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ published: await publishDueEverywhere() });
}

export const POST = GET;
