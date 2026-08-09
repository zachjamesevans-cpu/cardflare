import { UTC } from "./zone";

/**
 * The timezone picker's short list.
 *
 * The full IANA database is ~400 names and reads like a gazetteer; a store
 * owner wants "Central Time", not a scroll through Africa/Abidjan. So the
 * picker offers the zones stores actually sit in, labelled the way people
 * say them, grouped US-first because that is where the pilot is.
 *
 * The values stay real IANA names — the server validates against the full
 * database (`isValidTimeZone`) and every conversion runs on the canonical
 * zone, so shortening the *menu* loses nothing. A store already set to a
 * zone this list omits keeps it: the current zone is always appended, so
 * opening the form can never silently move a store.
 *
 * Free of server-only imports so the list can be unit-tested — including
 * that every value here actually names a zone `Intl` knows.
 */

export interface ZoneChoice {
  /** A canonical IANA zone name; what is stored and validated. */
  value: string;
  /** What the store owner reads. */
  label: string;
}

export interface ZoneGroup {
  label: string;
  choices: ZoneChoice[];
}

const US_AND_CANADA: ZoneChoice[] = [
  { value: "America/New_York", label: "Eastern Time (New York)" },
  { value: "America/Chicago", label: "Central Time (Chicago)" },
  { value: "America/Denver", label: "Mountain Time (Denver)" },
  { value: "America/Phoenix", label: "Arizona, no daylight saving (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific Time (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska Time (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (Honolulu)" },
  { value: "America/Halifax", label: "Atlantic Time (Halifax)" },
  { value: "America/St_Johns", label: "Newfoundland Time (St. John's)" },
];

const INTERNATIONAL: ZoneChoice[] = [
  { value: "America/Mexico_City", label: "Mexico (Mexico City)" },
  { value: "America/Sao_Paulo", label: "Brazil (São Paulo)" },
  { value: "Europe/London", label: "UK & Ireland (London)" },
  { value: "Europe/Berlin", label: "Central Europe (Berlin, Paris)" },
  { value: "Europe/Athens", label: "Eastern Europe (Athens)" },
  { value: "Asia/Tokyo", label: "Japan (Tokyo)" },
  { value: "Asia/Seoul", label: "South Korea (Seoul)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Singapore", label: "Singapore" },
  { value: "Australia/Sydney", label: "Australia East (Sydney)" },
  { value: "Pacific/Auckland", label: "New Zealand (Auckland)" },
];

/**
 * The groups the picker renders, with the store's current zone guaranteed
 * to appear exactly once. A zone outside the short list (set before this
 * list existed, or by a store somewhere it doesn't cover) gets its own
 * group under its raw IANA name rather than being dropped — the rule since
 * the picker's first version: opening the form never reselects anything.
 */
export function timeZoneChoices(current?: string): ZoneGroup[] {
  const groups: ZoneGroup[] = [
    { label: "United States & Canada", choices: US_AND_CANADA },
    { label: "International", choices: INTERNATIONAL },
  ];

  const known = new Set([
    UTC,
    ...US_AND_CANADA.map((choice) => choice.value),
    ...INTERNATIONAL.map((choice) => choice.value),
  ]);

  if (current && !known.has(current)) {
    groups.push({
      label: "Currently set",
      choices: [{ value: current, label: current.replace(/_/g, " ") }],
    });
  }

  return groups;
}
