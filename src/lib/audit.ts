import type { Location, Review } from "./gbp/types";

export type Severity = "high" | "medium" | "low";

export interface AuditIssue {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
  /** True when the issue can be fixed from the app by editing profile fields. */
  fixable: boolean;
}

export interface AuditResult {
  score: number; // 0-100
  issues: AuditIssue[];
  passed: string[];
}

interface Rule {
  id: string;
  title: string;
  severity: Severity;
  weight: number;
  fixable?: boolean;
  check: (loc: Location, reviews: Review[]) => string | null; // null = pass, string = failure detail
}

const rules: Rule[] = [
  { id: "verified", title: "Profile is verified", severity: "high", weight: 15,
    check: (l) => (l.verified ? null : "Unverified profiles may not appear in Search or Maps.") },
  { id: "description", title: "Business description is complete", severity: "high", weight: 10, fixable: true,
    check: (l) => ((l.description?.length ?? 0) >= 250 ? null : `Description is ${l.description?.length ?? 0} chars; aim for 250–750.`) },
  { id: "phone", title: "Phone number set", severity: "high", weight: 10, fixable: true,
    check: (l) => (l.phone ? null : "Add a primary phone number.") },
  { id: "website", title: "Website set", severity: "medium", weight: 8, fixable: true,
    check: (l) => (l.websiteUri ? null : "Add a website URL.") },
  { id: "hours", title: "Regular hours set", severity: "high", weight: 10, fixable: true,
    check: (l) => (l.regularHours?.length ? null : "Add opening hours.") },
  { id: "categories", title: "Additional categories used", severity: "medium", weight: 6, fixable: true,
    check: (l) => (l.additionalCategories.length >= 2 ? null : "Add 2+ relevant secondary categories.") },
  { id: "photos", title: "At least 10 photos", severity: "medium", weight: 8,
    check: (l) => (l.photoCount >= 10 ? null : `Only ${l.photoCount} photos uploaded.`) },
  { id: "logo", title: "Logo uploaded", severity: "low", weight: 4,
    check: (l) => (l.hasLogo ? null : "Upload a logo.") },
  { id: "cover", title: "Cover photo uploaded", severity: "low", weight: 4,
    check: (l) => (l.hasCoverPhoto ? null : "Upload a cover photo.") },
  { id: "services", title: "Services listed", severity: "medium", weight: 6, fixable: true,
    check: (l) => (l.serviceCount >= 3 ? null : `Only ${l.serviceCount} services listed; add at least 3.`) },
  { id: "attributes", title: "Attributes filled in", severity: "low", weight: 4, fixable: true,
    check: (l) => (l.attributes.length >= 3 ? null : "Add relevant attributes (accessibility, amenities…).") },
  { id: "reply-rate", title: "Replying to reviews", severity: "medium", weight: 10,
    check: (_l, r) => {
      if (!r.length) return null;
      const rate = r.filter((x) => x.reply).length / r.length;
      return rate >= 0.8 ? null : `Reply rate is ${Math.round(rate * 100)}%; aim for 80%+.`;
    } },
  { id: "rating", title: "Average rating ≥ 4.0", severity: "medium", weight: 5,
    check: (_l, r) => {
      if (!r.length) return null;
      const avg = r.reduce((s, x) => s + x.rating, 0) / r.length;
      return avg >= 4 ? null : `Average rating is ${avg.toFixed(1)}.`;
    } },
];

export function auditLocation(location: Location, reviews: Review[]): AuditResult {
  const total = rules.reduce((s, r) => s + r.weight, 0);
  let earned = 0;
  const issues: AuditIssue[] = [];
  const passed: string[] = [];
  for (const rule of rules) {
    const failure = rule.check(location, reviews);
    if (failure === null) {
      earned += rule.weight;
      passed.push(rule.title);
    } else {
      issues.push({ id: rule.id, title: rule.title, detail: failure, severity: rule.severity, fixable: !!rule.fixable });
    }
  }
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { score: Math.round((earned / total) * 100), issues, passed };
}
