import type { Metadata } from "next";

import { SettingsContent } from "./settings-content";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Settings: the menu of categories (lib/players/settings-sections.ts),
 * each opening its own page at /profile/settings/<section>. The app's
 * Settings screen is the same.
 */
export default async function ProfileSettingsPage() {
  return <SettingsContent section={null} />;
}
