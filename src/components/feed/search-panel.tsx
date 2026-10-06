"use client";

import dynamic from "next/dynamic";

/**
 * The Search tab's body: the one search for cards, players and stores.
 *
 * Client-only on purpose. EverythingSearch reads this device's recent
 * searches as it first draws, and a server render has no device to
 * read them from, so drawing it there would hand the browser a page
 * that disagrees with itself. Skipping the server render costs a blank
 * frame before the field appears; the field is the whole page.
 */
const EverythingSearch = dynamic(
  () => import("@/components/feed/everything-search").then((m) => m.EverythingSearch),
  { ssr: false },
);

export function SearchPanel({ account = null }: { account?: string | null }) {
  return <EverythingSearch account={account} />;
}
