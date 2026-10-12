/**
 * Settings, in categories. The founder (2026-10-12): "can we put the
 * settings into different categories so it's just not a bunch of random
 * settings on one page? instagram for example has things like account
 * settings/ profile settings, security, etc." Then: "okay build it".
 *
 * The menu is these, in this order, each a row with a one-line summary
 * of where it stands; each opens its own page. Sign out sits under the
 * menu on its own, the way Instagram keeps it.
 *
 * Free of imports so the app carries a word-for-word twin
 * (mobile/src/settings-sections.ts): same categories, same order, same
 * words on both.
 */

export type SettingsSection =
  | "account"
  | "notifications"
  | "privacy"
  | "display"
  | "collection"
  | "stores"
  | "help";

export const SETTINGS_SECTIONS: {
  key: SettingsSection;
  title: string;
  /** What is inside, for the row when there is no state to summarise. */
  blurb: string;
}[] = [
  { key: "account", title: "Account", blurb: "Name, email, password and Pro" },
  { key: "notifications", title: "Notifications", blurb: "What buzzes your phone" },
  {
    key: "privacy",
    title: "Privacy & safety",
    blurb: "Your ZIP code, nearby matching and blocked players",
  },
  { key: "display", title: "Feed & display", blurb: "How the Feed looks" },
  {
    key: "collection",
    title: "Collection & Flares",
    blurb: "Your collection, deck lists and rooms",
  },
  { key: "stores", title: "Your stores", blurb: "The stores you run" },
  { key: "help", title: "Help", blurb: "Contact us, terms and privacy" },
];

export function isSettingsSection(value: unknown): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.key === value);
}

export function sectionTitle(key: SettingsSection): string {
  return SETTINGS_SECTIONS.find((section) => section.key === key)?.title ?? "Settings";
}

/** "3 of 4 on", for the Notifications row. */
export function notificationsSummary(prefs: object | null): string | null {
  if (!prefs) return null;
  const values = Object.values(prefs);
  const on = values.filter((value) => value === true).length;
  if (on === values.length) return "All on";
  if (on === 0) return "All off";
  return `${on} of ${values.length} on`;
}

/** "Nearby on · 2 blocked", for the Privacy & safety row. */
export function privacySummary(input: {
  nearbyOn: boolean | null;
  blocked: number | null;
}): string | null {
  const parts: string[] = [];
  if (input.nearbyOn !== null) parts.push(input.nearbyOn ? "Nearby on" : "Nearby off");
  if (input.blocked !== null && input.blocked > 0)
    parts.push(`${input.blocked} blocked`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "Classic · Pure black", for the Feed & display row. */
export function displaySummary(viewTitle: string, pureBlack: boolean): string {
  return pureBlack ? `${viewTitle} · Pure black` : viewTitle;
}
