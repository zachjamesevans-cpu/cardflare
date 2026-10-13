import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isSettingsSection, sectionTitle } from "@/lib/players/settings-sections";

import { SettingsContent } from "../settings-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  return {
    title: isSettingsSection(section) ? sectionTitle(section) : "Settings",
    robots: { index: false, follow: false },
  };
}

/** One category of Settings: Account, Notifications, Privacy & safety... */
export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!isSettingsSection(section)) notFound();
  return <SettingsContent section={section} />;
}
