import Link from "next/link";
import { CalendarClock, QrCode, Radio } from "lucide-react";

import { GoingButton } from "@/components/nights/going-button";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatEventMoment } from "@/lib/events/format";
import { goingLine, NO_NIGHTS, SCAN_OR_CODE } from "@/lib/events/going-copy";
import type { NightItem } from "@/lib/events/nights";
import { cn } from "@/lib/cn";

/**
 * The Nights tab: every night that matters to this player, in three
 * sections, each drawn only when it has something in it.
 *
 * "Live now" is a room the player can walk into. "You're going" is the
 * nights they have put themselves on. "Coming up" is everything else
 * at the stores they follow or that are near them. A row is the night
 * and the store, when it is, how many are going, and the Going button;
 * the whole row opens the room, because the room is where who is
 * hunting what lives.
 *
 * The old Room page is one button down, for the counter code and the
 * printed QR: the founder's dock keeps its hero tabs, and the code
 * door is the live night's door, not a tab of its own.
 *
 * The app's screens/nights.tsx draws the same sections with the same
 * words; tests/unit/nights-parity.test.ts holds the two together.
 */

/** The three sections, in the order they are drawn. */
export const NIGHT_SECTIONS = {
  live: "Live now",
  going: "You're going",
  coming: "Coming up",
} as const;

export function splitNights(nights: NightItem[]): {
  live: NightItem[];
  going: NightItem[];
  coming: NightItem[];
} {
  return {
    live: nights.filter((night) => night.phase === "live"),
    going: nights.filter((night) => night.phase !== "live" && night.youGoing),
    coming: nights.filter((night) => night.phase !== "live" && !night.youGoing),
  };
}

export function NightList({
  nights,
  signedIn,
}: {
  nights: NightItem[];
  /** A signed-in account can say Going; a guest gets the sign-in door. */
  signedIn: boolean;
}) {
  const { live, going, coming } = splitNights(nights);
  const sections = [
    { key: "live", title: NIGHT_SECTIONS.live, items: live },
    { key: "going", title: NIGHT_SECTIONS.going, items: going },
    { key: "coming", title: NIGHT_SECTIONS.coming, items: coming },
  ].filter((section) => section.items.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-text-primary">Nights</h2>
        <Link href="/room" className={buttonStyles("secondary", "sm")}>
          <QrCode className="size-4" aria-hidden="true" />
          {SCAN_OR_CODE}
        </Link>
      </div>

      {sections.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <CalendarClock className="size-6 text-text-muted" aria-hidden="true" />
          <p className="text-text-secondary">{NO_NIGHTS}</p>
          <Link href="/feed" className={buttonStyles("secondary", "sm")}>
            Open the Feed
          </Link>
        </Card>
      ) : (
        sections.map((section) => (
          <section
            key={section.key}
            className="flex flex-col gap-2"
            aria-labelledby={`nights-${section.key}`}
          >
            <h3
              id={`nights-${section.key}`}
              className="flex items-center gap-2 text-sm font-semibold tracking-[0.12em] text-text-muted uppercase"
            >
              {section.key === "live" && (
                <Radio className="size-4 text-accent" aria-hidden="true" />
              )}
              {section.title}
            </h3>
            <ul className="flex flex-col gap-2">
              {section.items.map((night) => (
                <NightRow key={night.eventId} night={night} signedIn={signedIn} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/**
 * One night. The link covers the whole row through a stretched
 * pseudo-element, so the name, the store and the empty space all open
 * the room, while the Going button sits above it and keeps its own
 * tap: a button inside a link is two controls fighting for one press.
 */
function NightRow({ night, signedIn }: { night: NightItem; signedIn: boolean }) {
  const href = night.code ? `/e/${night.code}` : `/s/${night.storeId}`;

  return (
    <Card
      as="li"
      className={cn(
        "relative flex flex-col gap-3 p-4 transition-colors hover:border-border-strong",
        night.phase === "live" && "border-accent/40",
      )}
    >
      {/* Stacked, not side by side: at a phone's width a button beside
          the words truncated the name and wrapped the date. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={href}
          className="truncate font-semibold text-text-primary after:absolute after:inset-0 after:content-['']"
        >
          {night.name}
        </Link>
        <p className="flex items-center gap-1.5 truncate text-sm text-text-secondary">
          {night.storeName}
          {night.storeVerified && <VerifiedMark className="size-4" />}
        </p>
        <p className="flex items-center gap-1.5 text-sm text-text-muted">
          <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
          {night.phase === "live"
            ? "Open now"
            : formatEventMoment(night.startsAt, night.timeZone)}
        </p>
      </div>

      {/* Live: the room is the door, and the row already opens it.
          Before that: Going, with the count beside it. */}
      {night.phase === "live" ? (
        <span className="relative z-10 text-sm text-text-secondary tabular-nums">
          {goingLine(night.goingCount)}
        </span>
      ) : (
        <GoingButton
          eventId={night.eventId}
          youGoing={night.youGoing}
          goingCount={night.goingCount}
          signedIn={signedIn}
          next={href}
          className="relative z-10"
        />
      )}
    </Card>
  );
}
