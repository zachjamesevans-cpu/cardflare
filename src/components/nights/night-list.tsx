import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { CodeSheet } from "@/components/nights/code-sheet";
import { NightCard } from "@/components/nights/night-card";
import { NightsTabs } from "@/components/nights/nights-tabs";
import { buttonStyles } from "@/components/ui/button";
import { NO_NIGHTS } from "@/lib/events/going-copy";
import { GOING_EMPTY, PAST_EMPTY } from "@/lib/events/night-copy";
import type { NightItem } from "@/lib/events/nights";

/**
 * The Nights tab: "Nights", the QR icon, and three lists behind a strip.
 *
 * The founder (2026-10-03): "The current Nights landing page is too
 * large and sparse... Redesign to be much denser and more useful."
 * So the heading is one line with the small code door at its right,
 * the strip under it is Going | Nearby | Past with Going first, and
 * each tab is a column of short cards.
 *
 * Going is every night you said yes to that has not ended, Nearby is
 * everything else coming up at the stores you follow or that are near
 * you, and Past is the nights you went to in the last month. Each has
 * its own one-line empty state. The server orders the list (live,
 * then by start, then finished newest first) and the tabs keep that
 * order.
 *
 * The app's screens/nights.tsx draws the same strip with the same
 * words; tests/unit/nights2-parity.test.ts holds the two together.
 */

export type NightTab = "going" | "nearby" | "past";

/** The three tabs, in the order they are drawn. */
export const NIGHT_TAB_ORDER: NightTab[] = ["going", "nearby", "past"];

export const DEFAULT_NIGHT_TAB: NightTab = "going";

/** The tab a `?tab=` value names; anything else is Going. */
export function nightTabFrom(value: string | string[] | undefined): NightTab {
  const key = Array.isArray(value) ? value[0] : value;
  return NIGHT_TAB_ORDER.includes(key as NightTab)
    ? (key as NightTab)
    : DEFAULT_NIGHT_TAB;
}

export function splitNights(nights: NightItem[]): Record<NightTab, NightItem[]> {
  return {
    going: nights.filter((night) => night.phase !== "finished" && night.youGoing),
    nearby: nights.filter((night) => night.phase !== "finished" && !night.youGoing),
    past: nights.filter((night) => night.phase === "finished"),
  };
}

export function NightList({
  nights,
  signedIn,
  tab,
}: {
  nights: NightItem[];
  /** A signed-in account can say Going; a guest gets the sign-in door. */
  signedIn: boolean;
  /** The tab to open on. */
  tab: NightTab;
}) {
  const lists = splitNights(nights);
  /* Whether this player follows a store, as far as the list can say:
     any night on any tab at a store they follow. The app's
     `mobile/src/screens/nights.tsx` reads it the same way. */
  const followsAStore = nights.some((night) => night.following);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-text-primary">Nights</h2>
        <CodeSheet />
      </div>

      <NightsTabs
        /* Remounted on a new ?tab=, so "See what's nearby" lands there. */
        key={tab}
        initial={tab}
        panes={{
          going: (
            <NightColumn nights={lists.going} signedIn={signedIn}>
              <Empty line={GOING_EMPTY}>
                <Link
                  href="/nights?tab=nearby"
                  className={buttonStyles("secondary", "sm")}
                >
                  {SEE_NEARBY}
                </Link>
              </Empty>
            </NightColumn>
          ),
          nearby: (
            <NightColumn nights={lists.nearby} signedIn={signedIn}>
              <Empty line={followsAStore ? STORES_QUIET : NO_NIGHTS}>
                <Link
                  href="/feed?tab=nearby"
                  className={buttonStyles("secondary", "sm")}
                >
                  {FIND_STORES}
                </Link>
              </Empty>
            </NightColumn>
          ),
          past: (
            <NightColumn nights={lists.past} signedIn={signedIn}>
              <Empty line={PAST_EMPTY} />
            </NightColumn>
          ),
        }}
      />
    </div>
  );
}

function NightColumn({
  nights,
  signedIn,
  children,
}: {
  nights: NightItem[];
  signedIn: boolean;
  /** What the column says when there is nothing in it. */
  children: React.ReactNode;
}) {
  if (nights.length === 0) return <>{children}</>;
  return (
    <ul className="flex flex-col gap-2">
      {nights.map((night) => (
        <NightCard key={night.eventId} night={night} signedIn={signedIn} />
      ))}
    </ul>
  );
}

/** One quiet line, centred, with room for one door under it. */
/**
 * Nearby with nothing on it, for somebody who already follows a store,
 * and the two ways onward. The app's nights screen says the same.
 */
const STORES_QUIET = "Your stores haven't scheduled a night yet.";
const SEE_NEARBY = "See what's nearby";
const FIND_STORES = "Find stores near you";

function Empty({ line, children }: { line: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <CalendarClock className="size-6 text-text-muted" aria-hidden="true" />
      <p className="text-sm text-text-secondary">{line}</p>
      {children}
    </div>
  );
}
