// A business's time zone from its address (Google's Business Information API doesn't return one). Reviews and other dated data are
// counted in the business's own time — a review written at 9 pm in Las Vegas belongs to that day and month there, not to the next
// day in the viewer's time zone. US states / Canadian provinces / Australian states by region, other countries by their main zone.
// Fallback UTC.

const US: Record<string, string> = {
  AL: "America/Chicago",
  AK: "America/Anchorage",
  AZ: "America/Phoenix",
  AR: "America/Chicago",
  CA: "America/Los_Angeles",
  CO: "America/Denver",
  CT: "America/New_York",
  DE: "America/New_York",
  DC: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  HI: "Pacific/Honolulu",
  ID: "America/Boise",
  IL: "America/Chicago",
  IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago",
  KS: "America/Chicago",
  KY: "America/New_York",
  LA: "America/Chicago",
  ME: "America/New_York",
  MD: "America/New_York",
  MA: "America/New_York",
  MI: "America/Detroit",
  MN: "America/Chicago",
  MS: "America/Chicago",
  MO: "America/Chicago",
  MT: "America/Denver",
  NE: "America/Chicago",
  NV: "America/Los_Angeles",
  NH: "America/New_York",
  NJ: "America/New_York",
  NM: "America/Denver",
  NY: "America/New_York",
  NC: "America/New_York",
  ND: "America/Chicago",
  OH: "America/New_York",
  OK: "America/Chicago",
  OR: "America/Los_Angeles",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  UT: "America/Denver",
  VT: "America/New_York",
  VA: "America/New_York",
  WA: "America/Los_Angeles",
  WV: "America/New_York",
  WI: "America/Chicago",
  WY: "America/Denver",
  PR: "America/Puerto_Rico",
};
const CA: Record<string, string> = {
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  SK: "America/Regina",
  MB: "America/Winnipeg",
  ON: "America/Toronto",
  QC: "America/Toronto",
  NB: "America/Moncton",
  NS: "America/Halifax",
  PE: "America/Halifax",
  NL: "America/St_Johns",
  YT: "America/Whitehorse",
  NT: "America/Yellowknife",
  NU: "America/Iqaluit",
};
const AU: Record<string, string> = {
  NSW: "Australia/Sydney",
  ACT: "Australia/Sydney",
  VIC: "Australia/Melbourne",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  WA: "Australia/Perth",
  TAS: "Australia/Hobart",
  NT: "Australia/Darwin",
};
const COUNTRY: Record<string, string> = {
  GB: "Europe/London",
  IE: "Europe/Dublin",
  BD: "Asia/Dhaka",
  IN: "Asia/Kolkata",
  PK: "Asia/Karachi",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  SG: "Asia/Singapore",
  MY: "Asia/Kuala_Lumpur",
  PH: "Asia/Manila",
  NZ: "Pacific/Auckland",
  ZA: "Africa/Johannesburg",
  NG: "Africa/Lagos",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon",
  CH: "Europe/Zurich",
  AT: "Europe/Vienna",
  TR: "Europe/Istanbul",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  CN: "Asia/Shanghai",
  HK: "Asia/Hong_Kong",
  TH: "Asia/Bangkok",
  ID: "Asia/Jakarta",
  VN: "Asia/Ho_Chi_Minh",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AR: "America/Argentina/Buenos_Aires",
  CL: "America/Santiago",
  CO: "America/Bogota",
  US: "America/New_York",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
};

export function timeZoneFor(address?: { regionCode?: string; administrativeArea?: string } | null): string {
  const country = address?.regionCode?.toUpperCase() ?? "";
  const area = address?.administrativeArea?.toUpperCase().trim() ?? "";
  const byArea = country === "US" ? US[area] : country === "CA" ? CA[area] : country === "AU" ? AU[area] : undefined;
  return byArea ?? COUNTRY[country] ?? "UTC";
}

const formats = new Map<string, Intl.DateTimeFormat>();
/**
 * The wall-clock moment of `iso` in `timeZone`, as a local Date (same year/month/day/hour), so date-fns bucketing
 * (startOfMonth, startOfDay…) groups by the business's own calendar.
 */
export function inZone(iso: string | Date, timeZone: string): Date {
  let f = formats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
    formats.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return new Date(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
}
