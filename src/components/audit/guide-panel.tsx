"use client";

// Right-hand panel on the editor tabs: what Google recommends for the open field, what to avoid, and an example
// written for this business. Follows the field being edited; shows tab-level advice when nothing is open.
import type { CategoryUsage } from "@/lib/competitors";
import { toast } from "sonner";
import { Check, Copy, Lightbulb, Plus, X } from "lucide-react";
import { Card, buttonClass } from "@/components/ui";
import type { AuditTab } from "@/lib/audit";
import type { Location, ProfileSuggestions } from "@/lib/gbp/types";
import { DESCRIPTION_GOOD, MAX_SECONDARY_CATEGORIES, attributeLabel, cityOf, suggestDescription } from "@/lib/profile";

interface Guide {
  title: string;
  why?: string;
  recommended: string[];
  avoid?: string[];
  /** Copyable example text, or examples rendered as a list. */
  example?: string;
  examples?: { label: string; value: string; good?: boolean }[];
}

function guideFor(key: string, l: Location, s: ProfileSuggestions): Guide {
  const city = cityOf(l.address) || "your city";
  const kind = l.primaryCategory.toLowerCase();
  switch (key) {
    // ---- About
    case "about":
      return {
        title: "About your business",
        why: "Name, category and description are what Google reads first to decide which searches you show up for.",
        recommended: [
          "Use your real-world business name",
          "Pick the most specific primary category",
          `Add 3 or more additional categories (up to ${MAX_SECONDARY_CATEGORIES})`,
          `Write a ${DESCRIPTION_GOOD}+ character description`,
          "Add your opening date",
        ],
      };
    case "name":
      return {
        title: "Business name",
        why: "Your name must match your storefront, website and signage. Extra keywords are against Google's guidelines and can get the profile suspended.",
        recommended: ["Exactly as it appears on your sign and website", "Same spelling and capitalisation everywhere"],
        avoid: ['Keywords or locations ("Best Dentist Austin")', "Taglines, phone numbers or URLs", "ALL CAPS or special characters"],
        examples: [
          { label: "Good", value: l.title, good: true },
          { label: "Avoid", value: `${l.title} – Best ${l.primaryCategory} in ${city}` },
        ],
      };
    case "cat":
      return {
        title: "Business category",
        why: "The primary category is the strongest ranking signal you control. Additional categories help you appear for related searches.",
        recommended: ["Primary: the one category that best describes the whole business", "Additional: other things you actually do", "Use the most specific category available"],
        avoid: ["Categories for products you sell (use Products instead)", "Locations or adjectives", "Changing the primary category often"],
        examples: [{ label: "Primary", value: l.primaryCategory, good: true }, ...s.categories.slice(0, 4).map((c) => ({ label: "Additional", value: c.name, good: true }))],
      };
    case "desc":
      return {
        title: "Description",
        why: 'Shown under "From the business". Google uses it to understand what you offer; customers use it to decide.',
        recommended: [
          `${DESCRIPTION_GOOD}–750 characters`,
          `Say what you do and where (\"${kind}\", \"${city}\")`,
          "Mention your main services and who you serve",
          "What makes you different, in plain words",
          "Put the most important part in the first 250 characters",
        ],
        avoid: ["Links, phone numbers or email addresses", "Prices, promotions or ALL CAPS", "Keyword lists"],
        example: suggestDescription(l),
      };
    case "open":
      return {
        title: "Opening date",
        recommended: ["Year and month are required; add the day if you know it", "The date you first opened at this address", "Use a future date (up to a year ahead) if you haven't opened yet"],
        examples: [{ label: "Example", value: "March 2016", good: true }],
      };

    // ---- Contact
    case "contact":
      return {
        title: "Contact",
        why: "Every contact option adds a button on your profile. More buttons means more ways for customers to reach you.",
        recommended: ["A local phone number answered during business hours", "Your website's most relevant page", "A booking link if you take appointments", "Links to your active social profiles"],
      };
    case "phone":
      return {
        title: "Phone number",
        recommended: ["A local number rather than a call centre", "Answered during your listed hours", "Add up to 2 more numbers (e.g. a mobile)"],
        avoid: ["Premium-rate numbers", "Numbers that redirect to another business"],
        examples: [{ label: "Example", value: l.phone || "+1 512-555-0134", good: true }],
      };
    case "chat":
      return {
        title: "Chat",
        why: "Adds a Chat button so customers can message you directly.",
        recommended: ["A WhatsApp click-to-chat link or an SMS link", "Only if someone replies within a few hours"],
        examples: [
          { label: "WhatsApp", value: "https://wa.me/15125550134", good: true },
          { label: "SMS", value: "sms:+15125550134", good: true },
        ],
      };
    case "web":
      return {
        title: "Website",
        recommended: ["Your homepage, or the page for this location if you have several", "A secure https:// address", "A page that loads fast on phones"],
        avoid: ["Social media pages as your website", "Links that redirect to another domain"],
        examples: [{ label: "Example", value: l.websiteUri || "https://example.com/austin", good: true }],
      };
    case "book":
      return {
        title: "Appointment link",
        why: "Adds a Book button so customers can book straight from Search and Maps.",
        recommended: ["A page where customers can book directly", "Your booking provider's page for this location"],
        examples: [{ label: "Example", value: "https://example.com/book", good: true }],
      };
    case "social":
      return {
        title: "Social profiles",
        recommended: ["Link the profiles you post on regularly", "Use the full profile URL", "At least 2 networks"],
        avoid: ["Inactive or personal profiles"],
        examples: [
          { label: "Facebook", value: "https://www.facebook.com/yourpage", good: true },
          { label: "Instagram", value: "https://www.instagram.com/yourhandle/", good: true },
        ],
      };

    // ---- Location
    case "location":
      return {
        title: "Location and areas",
        why: "Your address decides where you appear on Maps. A service area tells Google where you travel to.",
        recommended: ["A precise street address customers can visit", "Hide the address only if you serve customers at their location", "List the cities or ZIP codes you serve"],
      };
    case "addr":
      return {
        title: "Business location",
        recommended: ["Full street address with suite or unit number", 'Choose No for "Show business address" only if customers don\'t visit you'],
        avoid: ["PO boxes or virtual offices", "Cross streets or landmarks instead of an address"],
        examples: [{ label: "Example", value: l.address || "120 Main St, Suite 200, Austin, TX 78701", good: true }],
      };
    case "area":
      return {
        title: "Service area",
        recommended: ["Cities, ZIP codes or regions you actually travel to", "Up to 20 areas", "Keep it within about 2 hours' drive of your base"],
        avoid: ["Whole states or countries"],
        examples: [
          { label: "Area", value: `${city}, TX, USA`, good: true },
          { label: "Area", value: "Round Rock, TX, USA", good: true },
        ],
      };

    // ---- Hours
    case "hours":
      return {
        title: "Opening hours",
        why: "Profiles without hours look closed, and wrong hours send customers to a locked door.",
        recommended: [
          "Set hours for every day, including closed days",
          "Use split hours for lunch breaks",
          "Add special hours before every public holiday",
          'Use "More hours" for delivery, pick-up or online hours',
        ],
        examples: [
          { label: "Weekdays", value: "Mon–Fri: 8 AM–6 PM", good: true },
          { label: "Weekend", value: "Sat: 9 AM–1 PM · Sun: Closed", good: true },
        ],
      };
    case "special":
      return {
        title: "Special hours",
        recommended: ["Add holidays a few weeks ahead", "Mark closed days explicitly", "Remove them after they pass"],
        examples: [
          { label: "Christmas Day", value: "Dec 25: Closed", good: true },
          { label: "New Year's Eve", value: "Dec 31: 9 AM–1 PM", good: true },
        ],
      };
    case "moreHours":
      return {
        title: "More hours",
        recommended: ["Add only when it differs from your main hours", "Common: Access, Delivery, Pick-up, Online operating hours"],
        examples: [{ label: "Access", value: "Mon–Fri: 5 AM–11 PM", good: true }],
      };

    // ---- More (attributes)
    case "more":
    case "attr":
      return {
        title: "Attributes",
        why: 'Shown under About and used to match searches like "wheelchair accessible" or "accepts credit cards".',
        recommended: ["Turn on everything that's true", "Accessibility and payment options matter to many customers", "Review them when something changes"],
        avoid: ["Attributes that aren't true. Customers can suggest edits and Google may remove them."],
        examples: s.attributes.slice(0, 4).map((a) => ({ label: a.reason || "Suggested", value: attributeLabel(a.name), good: true })),
      };

    // ---- Services, products, photos
    case "services":
      return {
        title: "Services",
        why: 'Services help you appear for specific searches like "teeth whitening near me".',
        recommended: ["At least 5 services", 'A price or "From" price for each', "A short description: what's included and how long it takes", "Group services under the right category"],
        avoid: ["Duplicating the same service under several names", "Prices you can't honour"],
        examples: [
          { label: "Service", value: "Teeth whitening · From $199", good: true },
          { label: "Description", value: "In-office whitening in about 60 minutes, with take-home trays for touch-ups.", good: true },
        ],
      };
    case "products":
      return {
        title: "Products",
        why: "Products appear as a scrollable catalogue with photos and prices on your profile.",
        recommended: ["At least 3 products", "A clear square photo for each", "A price or price range", "A button linking to buy or learn more"],
        avoid: ["Stock photos with watermarks", "Services listed as products"],
        examples: [{ label: "Product", value: "Electric toothbrush · $89 · Buy", good: true }],
      };
    case "photos":
      return {
        title: "Photos",
        why: "Profiles with photos get more requests for directions and more website clicks.",
        recommended: ["A square logo and a cover photo", "10+ photos: exterior, interior, team, work", "Add new photos every month", "At least 720 × 720 px, well lit, no filters"],
        avoid: ["Stock photos", "Text-heavy graphics or ads"],
      };
    default:
      return guideFor("about", l, s);
  }
}

/** Map an open field key from fields.tsx (or the tab) to a guide key. */
function resolveKey(tab: AuditTab, focus: string | null) {
  if (!focus) return tab;
  if (focus.startsWith("more:")) return "moreHours";
  if (tab === "more") return "attr";
  return focus;
}

export function GuidePanel({
  tab,
  focus,
  location,
  suggestions,
  competitorCategories,
  draftCategories = [],
  onAddCategory,
}: {
  tab: AuditTab;
  focus: string | null;
  location: Location;
  suggestions: ProfileSuggestions;
  /** Categories nearby competitors use: replaces the category example with "+" to add them. */
  competitorCategories?: { total: number; list: CategoryUsage[] };
  /** Primary + additional categories in the open editor (unsaved changes included). */
  draftCategories?: string[];
  /** Adds a category to the open category editor's draft. */
  onAddCategory?: (name: string) => void;
}) {
  const key = resolveKey(tab, focus);
  const g = guideFor(key, location, suggestions);
  const fromCompetitors = key === "cat" && !!competitorCategories?.list.length;
  const group = tab === "more" && focus && !focus.startsWith("more:") ? focus : null;
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy. Select the text instead.");
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-14 items-center gap-3 border-b px-5 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Lightbulb className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold tracking-tight">{group ?? g.title}</h2>
          <p className="text-xs text-muted-foreground">{focus ? "Recommendations for this field" : "Click a field to see tips for it"}</p>
        </div>
      </div>

      <div className="space-y-5 px-5 py-4">
        {g.why && <p className="text-sm text-muted-foreground">{g.why}</p>}

        <div>
          <p className="label-caps mb-2">Recommended</p>
          <ul className="space-y-1.5">
            {g.recommended.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                {r}
              </li>
            ))}
          </ul>
        </div>

        {g.avoid && (
          <div>
            <p className="label-caps mb-2">Avoid</p>
            <ul className="space-y-1.5">
              {g.avoid.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}

        {g.example && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="label-caps">Example for {location.title}</p>
              <button type="button" className={buttonClass("ghost", "sm", "h-7 px-2")} onClick={() => copy(g.example!)}>
                <Copy /> Copy
              </button>
            </div>
            <p className="rounded-xl bg-muted/60 px-3.5 py-3 text-sm leading-relaxed">{g.example}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{g.example.length} characters. Edit it to sound like you.</p>
          </div>
        )}

        {fromCompetitors && (
          <CompetitorCategories
            usage={competitorCategories!}
            primary={draftCategories[0] ?? location.primaryCategory}
            draft={draftCategories.slice(1)}
            saved={location.additionalCategories}
            canAdd={focus === "cat" && !!onAddCategory}
            onAdd={(name) => onAddCategory?.(name)}
          />
        )}

        {!fromCompetitors && !!g.examples?.length && (
          <div>
            <p className="label-caps mb-2">{g.examples.some((e) => !e.good) ? "Examples" : "Example"}</p>
            <ul className="divide-y rounded-xl border">
              {g.examples.map((e, i) => (
                <li key={i} className="flex items-center gap-3 px-3.5 py-2.5">
                  {e.good ? <Check className="h-4 w-4 shrink-0 text-success" /> : <X className="h-4 w-4 shrink-0 text-destructive" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11px] text-muted-foreground">{e.label}</span>
                    <span className={e.good ? "block break-words text-sm" : "block break-words text-sm text-muted-foreground line-through"}>{e.value}</span>
                  </span>
                  {e.good && (
                    <button type="button" className={buttonClass("ghost", "icon", "h-7 w-7 text-muted-foreground")} onClick={() => copy(e.value)} aria-label={`Copy ${e.label}`}>
                      <Copy />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

/** The category guide's example: categories nearby competitors use, with "+" to add one to the open editor's draft. */
function CompetitorCategories({
  usage,
  primary,
  draft,
  saved,
  canAdd,
  onAdd,
}: {
  usage: { total: number; list: CategoryUsage[] };
  primary: string;
  draft: string[];
  saved: string[];
  canAdd: boolean;
  onAdd: (name: string) => void;
}) {
  const has = (list: string[], name: string) => list.some((x) => x.toLowerCase() === name.toLowerCase());
  const full = draft.length >= MAX_SECONDARY_CATEGORIES;
  return (
    <div>
      <p className="label-caps mb-2">Used by nearby competitors</p>
      <ul className="divide-y rounded-xl border">
        {usage.list.map((c) => {
          const isPrimary = c.name.toLowerCase() === primary.toLowerCase();
          const inDraft = has(draft, c.name);
          const state = isPrimary ? "Your primary" : inDraft ? (has(saved, c.name) ? "On your profile" : "Added · save to keep") : null;
          return (
            <li key={c.name} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm">{c.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {c.count} of {usage.total} competitors{state ? ` · ${state}` : ""}
                </span>
              </span>
              {state ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success/10 text-success" title={state}>
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onAdd(c.name)}
                  disabled={!canAdd || full}
                  aria-label={`Add ${c.name}`}
                  title={full ? `Google allows ${MAX_SECONDARY_CATEGORIES} additional categories` : canAdd ? "Add to your categories" : "Open Business category to add"}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-accent text-accent-foreground transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Only add categories that truly describe your business. Click Save to keep them.</p>
    </div>
  );
}
