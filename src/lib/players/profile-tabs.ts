/**
 * The profile's tabs, as data: which ones a profile has and which one a
 * `?tab=` value names.
 *
 * Kept apart from the strip (src/components/players/profile-tabs.tsx)
 * because the strip is a client component and the two profile pages
 * are Server Components that read the address before they render; a
 * server file may not call into a client module. No server-only
 * import here either, so the app could mirror it word for word.
 */

export type ProfileTab =
  "flares" | "hunts" | "binders" | "showcase" | "trades" | "embers";

const OWN: ProfileTab[] = [
  "flares",
  "hunts",
  "binders",
  "showcase",
  "trades",
  "embers",
];
const THEIRS: ProfileTab[] = ["flares", "hunts", "binders", "showcase"];

export const DEFAULT_PROFILE_TAB: ProfileTab = "flares";

/** The tabs a profile draws: all six for its owner, four for anyone else. */
export function profileTabsFor(yours: boolean): ProfileTab[] {
  return yours ? OWN : THEIRS;
}

/**
 * The tab a `?tab=` value names, when it names one this profile has.
 * Anything else is the default: a stale link is not an error.
 */
export function profileTabFrom(
  value: string | string[] | undefined,
  yours: boolean,
): ProfileTab {
  const key = Array.isArray(value) ? value[0] : value;
  const tabs = profileTabsFor(yours);
  return tabs.includes(key as ProfileTab) ? (key as ProfileTab) : DEFAULT_PROFILE_TAB;
}
