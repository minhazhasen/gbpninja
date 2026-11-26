// Message templates: review replies (the only kind shown since review requests were removed). The request_email / request_sms
// kinds stay in the type so templates saved earlier still load; they are no longer listed or editable.
import type { MessageTemplate, StarRating, TemplateKind } from "@/lib/gbp/types";

export const TEMPLATE_KINDS: { key: TemplateKind; label: string; short: string; hint: string }[] = [
  { key: "reply", label: "Review replies", short: "Review replies", hint: "Public replies on Google. Suggested by star rating in the review dialog." },
];
export const kindInfo = (k: TemplateKind) => TEMPLATE_KINDS.find((t) => t.key === k) ?? TEMPLATE_KINDS[0];
export const isTemplateKind = (v: unknown): v is TemplateKind => TEMPLATE_KINDS.some((t) => t.key === v);

/** Merge fields: clicking a chip in the editor inserts the token. */
export const TEMPLATE_FIELDS: { token: string; label: string; kinds: TemplateKind[] }[] = [
  { token: "{{name}}", label: "First name", kinds: ["request_email", "request_sms", "reply"] },
  { token: "{{full_name}}", label: "Full name", kinds: ["request_email", "request_sms"] },
  { token: "{{business}}", label: "Business name", kinds: ["request_email", "request_sms", "reply"] },
  { token: "{{link}}", label: "Review link", kinds: ["request_email", "request_sms"] },
];

export interface MergeVars {
  name?: string | null;
  business?: string | null;
  link?: string | null;
}

/** Fill {{name}} (first name), {{full_name}}, {{business}} (or legacy {{company}}) and {{link}}. */
export function mergeTemplate(tpl: string, vars: MergeVars) {
  const full = (vars.name || "").trim();
  const first = full.split(/\s+/)[0] || "there";
  const business = (vars.business || "our team").trim();
  return tpl
    .replace(/\{\{\s*name\s*\}\}/gi, first)
    .replace(/\{\{\s*full_name\s*\}\}/gi, full || "there")
    .replace(/\{\{\s*(business|company)\s*\}\}/gi, business)
    .replace(/\{\{\s*link\s*\}\}/gi, (vars.link || "").trim());
}

/** Data used for live previews in Settings. */
export const SAMPLE_VARS: MergeVars = { name: "Jane Smith", business: "Sunrise Dental Clinic", link: "https://g.page/r/sunrise-dental/review" };

/** Best template for a review: default reply that covers the rating, else any that does, else the first. */
export function replyFor(templates: MessageTemplate[], rating: StarRating) {
  const replies = templates.filter((t) => t.kind === "reply");
  const covers = replies.filter((t) => !t.ratings?.length || t.ratings.includes(rating));
  return covers.find((t) => t.isDefault) ?? covers[0] ?? replies[0] ?? null;
}

/** Default first, then by name. */
export const templateOrder = (a: MessageTemplate, b: MessageTemplate) => Number(!!b.isDefault) - Number(!!a.isDefault) || a.name.localeCompare(b.name);

/** Starter set every workspace begins with. */
export const STARTER_TEMPLATES: Omit<MessageTemplate, "id" | "updatedAt">[] = [
  {
    kind: "request_email",
    name: "Friendly ask",
    isDefault: true,
    subject: "How was your visit to {{business}}?",
    body: "Hi {{name}},\n\nThank you for choosing {{business}}! If you have a minute, we'd really appreciate a quick Google review. It helps other customers find us.\n\n{{link}}\n\nThank you!\n{{business}}",
  },
  {
    kind: "request_email",
    name: "Gentle reminder",
    subject: "A quick favour, {{name}}?",
    body: "Hi {{name}},\n\nJust a friendly reminder: if you enjoyed your visit, a short review on Google would mean a lot to our small team.\n\n{{link}}\n\nIt only takes a minute. Thank you!\n{{business}}",
  },
  {
    kind: "request_sms",
    name: "Short text",
    isDefault: true,
    body: "Hi {{name}}, thanks for choosing {{business}}! Would you leave us a quick Google review? {{link}}",
  },
  {
    kind: "reply",
    name: "Thank you (positive)",
    isDefault: true,
    ratings: [4, 5] as StarRating[],
    body: "Hi {{name}}, thank you so much for the kind words! We loved having you and look forward to seeing you again. — {{business}}",
  },
  { kind: "reply", name: "Short thanks", ratings: [5] as StarRating[], body: "Thanks {{name}}! We really appreciate you taking the time to leave a review. — {{business}}" },
  {
    kind: "reply",
    name: "Mixed feedback",
    ratings: [3] as StarRating[],
    body: "Hi {{name}}, thank you for the honest feedback. We're glad parts of your visit went well and we're already working on the rest. — {{business}}",
  },
  {
    kind: "reply",
    name: "Apology (negative)",
    ratings: [1, 2] as StarRating[],
    body: "Hi {{name}}, we're sorry your experience fell short. Please contact us directly so we can make it right. — {{business}}",
  },
];
