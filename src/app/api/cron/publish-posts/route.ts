// Scheduled posts: call every 5 minutes with "Authorization: Bearer $CRON_SECRET" — publishes every post whose time has come
// (see src/lib/publish-due.ts).
import { NextResponse } from "next/server";
import { publishDueEverywhere } from "@/lib/publish-due";
import { recordJobRun } from "@/lib/job-runs";

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
  try {
    const published = await publishDueEverywhere();
    const n = Object.values(published).reduce((s, xs) => s + xs.length, 0);
    recordJobRun("cron:publish-posts", true, n ? `${n} post${n === 1 ? "" : "s"} published` : "Nothing due");
    return NextResponse.json({ published });
  } catch (e) {
    recordJobRun("cron:publish-posts", false, e instanceof Error ? e.message : "Failed");
    throw e;
  }
}

export const POST = GET;
