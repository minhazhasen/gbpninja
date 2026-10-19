import { getProvider, type Location } from "./gbp";

export type PageProps = { searchParams: Promise<{ location?: string }> };

/** Resolves the selected location from `?location=`, falling back to the first one. */
export async function resolveLocation(searchParams: PageProps["searchParams"]): Promise<{
  locations: Location[];
  location: Location;
}> {
  const { location: selected } = await searchParams;
  const provider = await getProvider();
  const locations = await provider.listLocations();
  if (!locations.length) throw new Error("No locations found for this account.");
  const location = locations.find((l) => l.id === selected) ?? locations[0];
  return { locations, location };
}
