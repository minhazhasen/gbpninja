// Which locations a page covers, kept in `?location=`: "all", one id, or several ids joined by ",".

/** Selected location ids (never empty). Unknown ids are dropped; nothing valid → the first location. */
export function parseLocationScope(param: string | undefined, locationIds: string[]): string[] {
  if (param === "all") return [...locationIds];
  const picked = (param ?? "").split(",").filter((id) => locationIds.includes(id));
  return picked.length ? picked : locationIds.slice(0, 1);
}

export const serializeLocationScope = (ids: string[], locationIds: string[]) => (ids.length === locationIds.length ? "all" : ids.join(","));
