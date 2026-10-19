"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProvider } from "@/lib/gbp";

const replySchema = z.object({
  locationId: z.string().min(1),
  reviewId: z.string().min(1),
  comment: z.string().trim().min(1).max(4096),
});

export async function replyToReview(formData: FormData) {
  const input = replySchema.parse(Object.fromEntries(formData));
  await (await getProvider()).replyToReview(input.locationId, input.reviewId, input.comment);
  revalidatePath("/reviews");
}

const postSchema = z.object({
  locationId: z.string().min(1),
  type: z.enum(["STANDARD", "EVENT", "OFFER"]),
  summary: z.string().trim().min(1).max(1500),
  scheduledFor: z.string().min(1),
  ctaUrl: z.string().url().optional().or(z.literal("")),
});

export async function createPost(formData: FormData) {
  const input = postSchema.parse(Object.fromEntries(formData));
  await (await getProvider()).createPost({
    locationId: input.locationId,
    type: input.type,
    summary: input.summary,
    scheduledFor: new Date(input.scheduledFor).toISOString(),
    callToAction: input.ctaUrl ? { actionType: "LEARN_MORE", url: input.ctaUrl } : undefined,
  });
  revalidatePath("/calendar");
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
  revalidatePath("/audit");
}
