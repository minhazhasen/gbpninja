// Demo copy of Google's business category list (the real list has ~4,000 entries per region and language,
// served by Business Information `categories.list`). Ids follow Google's `categories/gcid:…` format.
import type { BusinessCategory } from "./types";

const NAMES = [
  // Health & dental
  "Dentist", "Cosmetic dentist", "Dental clinic", "Emergency dental service", "Pediatric dentist", "Teeth whitening service",
  "Dental implants periodontist", "Dental implants provider", "Orthodontist", "Endodontist", "Oral surgeon", "Periodontist",
  "Prosthodontist", "Dental hygienist", "Dental laboratory", "Dental supply store", "Denture care center", "Dental radiology",
  "Doctor", "Family practice physician", "Medical clinic", "Urgent care center", "Pediatrician", "Dermatologist", "Chiropractor",
  "Physical therapist", "Physical therapy clinic", "Optometrist", "Eye care center", "Massage therapist", "Acupuncturist",
  "Psychologist", "Counselor", "Pharmacy", "Veterinarian", "Animal hospital", "Medical spa", "Day spa",
  // Food & drink
  "Cafe", "Coffee shop", "Coffee roasters", "Espresso bar", "Tea house", "Bakery", "Pastry shop", "Breakfast restaurant", "Brunch restaurant",
  "Restaurant", "American restaurant", "Italian restaurant", "Mexican restaurant", "Pizza restaurant", "Vegan restaurant",
  "Vegetarian restaurant", "Sandwich shop", "Juice shop", "Dessert shop", "Ice cream shop", "Bar", "Cocktail bar", "Wine bar",
  "Brewery", "Caterer", "Food truck", "Dried flower shop", "Dried seafood shop", "Madrilian restaurant",
  // Fitness
  "Gym", "Fitness center", "Health club", "Personal trainer", "Yoga studio", "Pilates studio", "Boxing gym", "Martial arts school",
  "CrossFit gym", "Dance school", "Swimming pool", "Rock climbing gym", "Sports club",
  // Education & driving
  "Driving school", "Driving test center", "Driving licence training school", "Driver's licence office", "Truck driving school",
  "Motorcycle driving school", "Tutoring service", "Language school", "Music school", "Art school", "Vocational school",
  "Preschool", "Day care center", "Educational consultant", "Test preparation center",
  // Home & trades
  "Plumber", "Electrician", "HVAC contractor", "Air conditioning contractor", "Roofing contractor", "General contractor",
  "Handyman", "Painter", "Landscaper", "Lawn care service", "Tree service", "Pest control service", "Locksmith", "Cleaning service",
  "House cleaning service", "Carpet cleaning service", "Window cleaning service", "Pool cleaning service", "Moving company",
  "Garage door supplier", "Fence contractor", "Flooring contractor", "Kitchen remodeler", "Bathroom remodeler", "Solar energy company",
  "Drilling contractor", "Drilling equipment supplier", "Drinking water supplier", "Drinking water fountain",
  // Auto
  "Auto repair shop", "Car dealer", "Used car dealer", "Car wash", "Auto body shop", "Tire shop", "Oil change service",
  "Auto glass shop", "Towing service", "Driveshaft shop", "Car rental agency",
  // Beauty
  "Beauty salon", "Hair salon", "Barber shop", "Nail salon", "Eyelash salon", "Waxing hair removal service", "Tanning studio",
  "Tattoo shop", "Make-up artist", "Skin care clinic",
  // Professional services
  "Lawyer", "Family law attorney", "Personal injury attorney", "Accountant", "Tax preparation service", "Insurance agency",
  "Real estate agency", "Real estate agent", "Mortgage broker", "Financial planner", "Marketing agency", "Internet marketing service",
  "Website designer", "Graphic designer", "Photographer", "Wedding photographer", "Event planner", "Print shop", "Computer repair service",
  "Cell phone store", "IT services company", "Software company", "Consultant", "Notary public", "Translator",
  // Retail
  "Clothing store", "Shoe store", "Jewelry store", "Florist", "Gift shop", "Book store", "Furniture store", "Hardware store",
  "Pet store", "Pet groomer", "Dog trainer", "Grocery store", "Liquor store", "Toy store", "Sporting goods store", "Bicycle shop",
  // Hospitality & entertainment
  "Hotel", "Motel", "Bed & breakfast", "Event venue", "Wedding venue", "Banquet hall", "Movie theater", "Drive-in cinema",
  "Bowling alley", "Escape room center", "Amusement center", "Museum", "Art gallery", "Night club",
];

const slug = (n: string) => n.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
export const GOOGLE_CATEGORIES: BusinessCategory[] = [...new Set(NAMES)].map((displayName) => ({ id: `categories/gcid:${slug(displayName)}`, displayName }));

/** Google-style typeahead: names starting with the query first, then any word starting with it, then contains. */
export function searchCategoryList(list: BusinessCategory[], query: string, limit = 12): BusinessCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (n: string) => {
    const s = n.toLowerCase();
    if (s.startsWith(q)) return 0;
    if (s.split(/[\s-]+/).some((w) => w.startsWith(q))) return 1;
    return s.includes(q) ? 2 : 3;
  };
  return list
    .map((c) => ({ c, r: rank(c.displayName) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.c.displayName.localeCompare(b.c.displayName))
    .slice(0, limit)
    .map((x) => x.c);
}
