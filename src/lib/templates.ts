// Message templates (review-request email / text, review replies): kinds, merge fields and the starter set.
import type { MessageTemplate, StarRating, TemplateKind } from "@/lib/gbp/types";

export const TEMPLATE_KINDS: { key: TemplateKind; label: string; short: string; hint: string }[] = [
  { key: "request_email", label: "Review request emails", short: "Request emails", hint: "Sent from your Gmail when you ask a customer for a review." },
  { key: "request_sms", label: "Review request texts", short: "Request texts", hint: "Opened in your phone's messages app. Keep it short." },
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

/** The review link merge field. Request emails keep it unmerged until sending, where it becomes a button. */
export const LINK_TOKEN = "{{link}}";
const LINK_RE = /\{\{\s*link\s*\}\}/i;
export const splitOnLink = (text: string) => text.split(LINK_RE);
export const REVIEW_BUTTON_LABEL = "Leave a Google review";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** HTML for a request email: text with line breaks, {{link}} as a "Leave a Google review" button.
 *  Email clients ignore CSS variables and classes, so colours are inline (brand primary #3D5BE0). */
export function emailHtml(text: string, link: string | null) {
  const button = link
    ? `<a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#3D5BE0;color:#ffffff;font-weight:600;text-decoration:none">${REVIEW_BUTTON_LABEL}</a>`
    : "";
  const body = splitOnLink(text)
    .map((part) => escapeHtml(part).replace(/\r?\n/g, "<br>"))
    .join(button);
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${body}</div>`;
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
