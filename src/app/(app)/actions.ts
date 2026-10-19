"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProvider } from "@/lib/gbp";

/** Only same-app paths, so a crafted form can't redirect off-site. */
const safeReturn = (v: unknown) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : null);

const replySchema = z.object({
  locationId: z.string().min(1),
  reviewId: z.string().min(1),
  comment: z.string().trim().min(1).max(4096),
});

export async function replyToReview(formData: FormData) {
  const input = replySchema.parse(Object.fromEntries(formData));
  await (await getProvider()).replyToReview(input.locationId, input.reviewId, input.comment);
  revalidatePath("/", "layout");
}

const postSchema = z.object({
  locationId: z.string().min(1),
  type: z.enum(["STANDARD", "EVENT", "OFFER"]),
  summary: z.string().trim().min(1).max(1500),
  scheduledFor: z.string().min(1),
  ctaUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["DRAFT", "SCHEDULED"]).default("SCHEDULED"),
});

export async function createPost(formData: FormData) {
  const input = postSchema.parse(Object.fromEntries(formData));
  await (await getProvider()).createPost({
    locationId: input.locationId,
    type: input.type,
    summary: input.summary,
    status: input.status,
    // TODO: datetime-local has no timezone; use the location's timezone once we have it.
    scheduledFor: new Date(input.scheduledFor).toISOString(),
    callToAction: input.ctaUrl ? { actionType: "LEARN_MORE", url: input.ctaUrl } : undefined,
  });
  revalidatePath("/", "layout");
  const back = safeReturn(formData.get("returnTo"));
  if (back) redirect(back);
}

const fixSchema = z.object({
  locationId: z.string().min(1),
  description: z.string().trim().max(750).optional(),
  phone: z.string().trim().optional(),
  websiteUri: z.string().url().optional().or(z.literal("")),
  additionalCategories: z.string().optional(), // comma-separated
});

export async function applyAuditFixes(formData: FormData) {
  const input = fixSchema.parse(Object.fromEntries(formData));
  const patch: Record<string, unknown> = {};
  if (input.description) patch.description = input.description;
  if (input.phone) patch.phone = input.phone;
  if (input.websiteUri) patch.websiteUri = input.websiteUri;
  if (input.additionalCategories)
    patch.additionalCategories = input.additionalCategories.split(",").map((s) => s.trim()).filter(Boolean);
  await (await getProvider()).updateLocation(input.locationId, patch);
  revalidatePath("/", "layout");
}
