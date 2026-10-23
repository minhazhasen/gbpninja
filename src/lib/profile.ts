// Profile helpers shared by the audit engine and the audit page.
import type { Location, PhotoCategory, PostalAddress } from "./gbp/types";

/** Google limits (Business Information API). */
export const MAX_SECONDARY_CATEGORIES = 9;
export const DESCRIPTION_MAX = 750;
export const DESCRIPTION_GOOD = 250;

/** Attribute catalogue in the groups Google shows under Business information → More. Ids are ours (snake_case). */
export const ATTRIBUTE_GROUPS: { group: string; items: [id: string, label: string][] }[] = [
  {
    group: "From the business",
    items: [
      ["women_owned", "Identifies as women-owned"],
      ["black_owned", "Identifies as Black-owned"],
      ["veteran_owned", "Identifies as veteran-owned"],
      ["latino_owned", "Identifies as Latino-owned"],
      ["asian_owned", "Identifies as Asian-owned"],
      ["lgbtq_owned", "Identifies as LGBTQ+ owned"],
    ],
  },
  {
    group: "Accessibility",
    items: [
      ["wheelchair_accessible_entrance", "Has wheelchair-accessible entrance"],
      ["wheelchair_accessible_seating", "Has wheelchair-accessible seating"],
      ["wheelchair_accessible_restroom", "Has wheelchair-accessible toilet"],
      ["wheelchair_accessible_parking", "Has wheelchair-accessible car park"],
      ["wheelchair_accessible_lift", "Has wheelchair-accessible lift"],
      ["assistive_hearing_loop", "Has assistive hearing loop"],
    ],
  },
  {
    group: "Amenities",
    items: [
      ["restroom", "Toilets"],
      ["gender_neutral_restroom", "Gender-neutral toilets"],
      ["free_wifi", "Free Wi‑Fi"],
      ["wifi", "Wi‑Fi"],
      ["showers", "Showers"],
      ["lockers", "Lockers"],
    ],
  },
  {
    group: "Children",
    items: [
      ["good_for_kids", "Good for kids"],
      ["kids_menu", "Kids' menu"],
      ["changing_table", "Changing table"],
      ["high_chairs", "High chairs"],
    ],
  },
  {
    group: "Crowd",
    items: [
      ["lgbtq_friendly", "LGBTQ+ friendly"],
      ["transgender_safespace", "Transgender safe space"],
      ["family_friendly", "Family-friendly"],
      ["college_students", "Popular with college students"],
    ],
  },
  {
    group: "Parking",
    items: [
      ["on_site_parking", "On-site parking"],
      ["free_parking_lot", "Free parking lot"],
      ["free_street_parking", "Free street parking"],
      ["paid_parking_lot", "Paid parking lot"],
      ["paid_street_parking", "Paid street parking"],
      ["parking_garage", "Parking garage"],
    ],
  },
  {
    group: "Payments",
    items: [
      ["accepts_debit_cards", "Accepts debit cards"],
      ["accepts_credit_cards", "Accepts credit cards"],
      ["accepts_nfc", "Accepts NFC mobile payments"],
      ["not_cash_only", "Not cash-only"],
      ["cash_only", "Cash only"],
      ["accepts_checks", "Accepts cheques"],
    ],
  },
  {
    group: "Planning",
    items: [
      ["appointment_required", "Appointment required"],
      ["online_appointments", "Online appointments"],
      ["accepts_new_patients", "Accepting new patients"],
      ["walk_ins", "Walk-ins welcome"],
    ],
  },
  {
    group: "Service options",
    items: [
      ["onsite_services", "On-site services available"],
      ["online_classes", "Online classes"],
      ["online_estimates", "Online estimates"],
      ["dine_in", "Dine-in"],
      ["takeout", "Takeaway"],
      ["delivery", "Delivery"],
      ["outdoor_seating", "Outdoor seating"],
    ],
  },
  {
    group: "Offerings",
    items: [
      ["vegetarian_options", "Vegetarian options"],
      ["organic_products", "Organic products"],
      ["same_day_service", "Same-day service"],
    ],
  },
];
const ATTRIBUTE_INDEX = new Map(ATTRIBUTE_GROUPS.flatMap((g) => g.items.map(([id, label]) => [id, { label, group: g.group }] as const)));
export const attributeGroup = (id: string) => ATTRIBUTE_INDEX.get(id)?.group ?? "Other";

export const SOCIAL_NETWORKS = [
  { id: "facebook", label: "Facebook", placeholder: "https://www.facebook.com/yourpage" },
  { id: "instagram", label: "Instagram", placeholder: "https://www.instagram.com/yourhandle/" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://www.linkedin.com/company/yourcompany/" },
  { id: "pinterest", label: "Pinterest", placeholder: "https://www.pinterest.com/yourhandle/" },
  { id: "tiktok", label: "TikTok", placeholder: "https://www.tiktok.com/@yourhandle" },
  { id: "x", label: "X (Twitter)", placeholder: "https://x.com/yourhandle" },
  { id: "youtube", label: "YouTube", placeholder: "https://www.youtube.com/@yourchannel" },
] as const;

/** Types offered under Hours → "Add more hours". */
export const MORE_HOURS_TYPES = [
  "Access",
  "Breakfast",
  "Brunch",
  "Delivery",
  "Dinner",
  "Drive-through",
  "Happy hours",
  "Hours for the elderly",
  "Kitchen",
  "Lunch",
  "Online operating hours",
  "Pick-up",
  "Takeaway",
] as const;

export const OPEN_STATUS = [
  { value: "open", label: "Open with main hours", hint: "Show the days and times you're open" },
  { value: "always_open", label: "Always open", hint: "Open 24 hours, 7 days a week" },
  { value: "temporarily_closed", label: "Temporarily closed", hint: "You'll open again in the future" },
] as const;
export const openStatusLabel = (s?: string) =>
  ({ open: "Open with main hours", always_open: "Always open (24 hours)", temporarily_closed: "Temporarily closed", open_no_hours: "Open with no main hours", permanently_closed: "Permanently closed" })[s ?? "open"] ?? "Open with main hours";

export const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "IE", name: "Ireland" },
  { code: "NZ", name: "New Zealand" },
  { code: "IN", name: "India" },
  { code: "BD", name: "Bangladesh" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
] as const;

export const US_STATES: [code: string, name: string][] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"],
  ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

/** One line the way Google shows it: "7398 Smoke Ranch Rd #268, Las Vegas, NV 89128". Line 2 joins the street with a space. */
export function formatAddress(a: PostalAddress) {
  const street = a.addressLines.map((x) => x.trim()).filter(Boolean).join(" ");
  const region = [a.administrativeArea, a.postalCode].map((x) => x.trim()).filter(Boolean).join(" ");
  return [street, a.locality.trim(), region].filter(Boolean).join(", ");
}

/** Best-effort split of a one-line US-style address into Google's structure (used when only `address` is known). */
export function parseAddress(address: string): PostalAddress {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  const last = parts.length > 2 ? parts.pop()! : "";
  const m = last.match(/^([A-Za-z]{2,})\s+([\w -]+)$/);
  return { regionCode: "US", addressLines: [parts[0] ?? "", ""], locality: parts[1] ?? "", administrativeArea: m ? m[1] : last, postalCode: m ? m[2] : "" };
}

/** Photo categories in the order Google's Photos page lists them. */
export const PHOTO_CATEGORIES: { id: PhotoCategory; label: string }[] = [
  { id: "exterior", label: "Exterior" },
  { id: "interior", label: "Interior" },
  { id: "product", label: "Products" },
  { id: "at_work", label: "At work" },
  { id: "team", label: "Team" },
  { id: "food_and_drink", label: "Food & drink" },
  { id: "common_area", label: "Common areas" },
  { id: "additional", label: "Other" },
];
export const photoCategoryLabel = (c: PhotoCategory) => (c === "logo" ? "Logo" : c === "cover" ? "Cover photo" : (PHOTO_CATEGORIES.find((x) => x.id === c)?.label ?? "Other"));
/** Google's limits: JPG or PNG, 10 KB–5 MB, at least 250 × 250 px (720 × 720 recommended). */
export const PHOTO_MIN_PX = 250;
export const PHOTO_RECOMMENDED_PX = 720;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const MAX_ADDITIONAL_PHONES = 2;
export const MAX_SERVICE_AREAS = 20;

/** "August 2001" / "12 August 2001" from YYYY-MM(-DD). */
export function formatOpeningDate(d?: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, day || 1);
  return date.toLocaleDateString("en-US", day ? { day: "numeric", month: "long", year: "numeric" } : { month: "long", year: "numeric" });
}

/** Google limits for services and products. */
export const SERVICE_DESCRIPTION_MAX = 300;
export const PRODUCT_NAME_MAX = 58;
export const PRODUCT_DESCRIPTION_MAX = 1000;

export const money = (n: number) => `$${n % 1 ? n.toFixed(2) : n}`;
export function servicePrice(s: { priceType?: string; price?: number }) {
  if (s.priceType === "free") return "Free";
  if (s.priceType === "fixed" && s.price != null) return money(s.price);
  if (s.priceType === "from" && s.price != null) return `From ${money(s.price)}`;
  return "";
}
export function productPrice(p: { priceType?: string; price?: number; priceMax?: number }) {
  if (p.priceType === "fixed" && p.price != null) return money(p.price);
  if (p.priceType === "range" && p.price != null) return p.priceMax != null ? `${money(p.price)}–${money(p.priceMax)}` : `From ${money(p.price)}`;
  return "";
}
export const PRODUCT_BUTTON_LABEL = { none: "No button", order: "Order online", buy: "Buy", learn: "Learn more", offer: "Get offer", call: "Call" } as const;

export const attributeLabel = (id: string) => ATTRIBUTE_INDEX.get(id)?.label ?? id.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type Day = (typeof DAYS)[number];
export const DAY_LABEL: Record<Day, string> = { MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun" };

/** "Austin" from "120 Main St, Austin, TX 78701". */
export const cityOf = (address: string) => address.split(",").map((s) => s.trim())[1] ?? "";

/** Google rejects descriptions with links or phone numbers. */
export const hasContactInText = (text: string) => /https?:\/\/|www\.|\+?\d[\d\s().-]{7,}\d/i.test(text);

/** Template description from the profile's own data (stand-in until an AI writer is wired up). */
export function suggestDescription(l: Pick<Location, "title" | "primaryCategory" | "address" | "services">): string {
  const city = cityOf(l.address);
  const kind = l.primaryCategory.toLowerCase();
  const services = l.services.slice(0, 4).map((s) => s.name.toLowerCase());
  const parts = [
    `${l.title} is a trusted ${kind}${city ? ` in ${city}` : ""}.`,
    services.length ? `We offer ${services.slice(0, -1).join(", ")}${services.length > 1 ? " and " : ""}${services.at(-1)}, delivered by a friendly, experienced team.` : "Our friendly, experienced team is here to help you every step of the way.",
    `Whether it's your first visit or you're a regular, we focus on quality, honest advice and a welcoming experience${city ? ` for everyone in ${city} and nearby` : ""}.`,
    "Get in touch or book online today — we look forward to seeing you.",
  ];
  return parts.join(" ").slice(0, DESCRIPTION_MAX);
}
