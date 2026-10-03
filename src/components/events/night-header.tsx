import Link from "next/link";
import { CircleHelp, Timer } from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { GoingButton } from "@/components/nights/going-button";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { FollowStoreButton } from "@/components/stores/follow-store-button";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { cn } from "@/lib/cn";
import { hereNowLine, playersLine } from "@/lib/events/night-copy";
import { SITE } from "@/lib/site";
import { instantToLocal } from "@/lib/time/zone";

/**
 * The night's header: four lines and nothing twice.
 *
 * The founder (2026-10-03): "The current event page repeats too much
 * information (1 here now, 1 tonight, You're going, You're going
 * button, 1 going, Who's going, another attendance count). REMOVE
 * REPEATED INFORMATION. EVENT HEADER: one compact header: Venue, Event
 * name, Date/time, RSVP state, Attendance."
 *
 * So: the store (its page behind it, the Verified glyph, the Follow
 * chip for an account), the night's name in capitals (CSS, never the
 * data), when, and one line that says the RSVP, how many players, and
 * how many are here now while that is true. Attendance appears here
 * and nowhere else on the page. The Going chip is the one tap: the
 * check and "Going" once pressed, which presses off again. The timer
 * remote and the help page stay as the two small round controls on
 * the name's line, as the walk-in door draws them.
 *
 * Plain props on purpose, so the header can be drawn on a page with
 * no database behind it. The app's night-header.tsx draws the same
 * four lines with the same words; tests/unit/nights2-parity.test.ts
 * holds the two together.
 */

const DAY: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};
const CLOCK: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

/**
 * "Sat, Oct 3 · 11:00 AM to 2:00 PM", in the store's zone. A night
 * that ends on another day says so; one with no planned end (a
 * walk-in room still running) says only when it opened.
 */
export function nightWhenLine(
  startsAt: string,
  endsAt: string | null,
  timeZone: string,
): string {
  const start = new Date(startsAt);
  const day = new Intl.DateTimeFormat("en-US", { ...DAY, timeZone }).format(start);
  const clock = new Intl.DateTimeFormat("en-US", { ...CLOCK, timeZone });
  const head = `${day} · ${clock.format(start)}`;
  if (!endsAt) return head;

  const end = new Date(endsAt);
  const sameDay =
    instantToLocal(start, timeZone).slice(0, 10) ===
    instantToLocal(end, timeZone).slice(0, 10);
  const endLabel = sameDay
    ? clock.format(end)
    : `${new Intl.DateTimeFormat("en-US", { ...DAY, timeZone }).format(end)}, ${clock.format(end)}`;
  return `${head} to ${endLabel}`;
}

export function NightHeader({
  storeId,
  storeName,
  storeVerified,
  following,
  code,
  name,
  when,
  remoteHref,
  helpHref,
  line,
}: {
  storeId: string;
  storeName: string;
  storeVerified: boolean;
  /** Whether the viewer follows the store; null for a guest, who gets no chip. */
  following: boolean | null;
  /** The night's code, for the Follow chip's repaint and the sign-in return. */
  code: string;
  name: string;
  /** The night's window, from `nightWhenLine`. */
  when: string;
  /** The timer remote, for an organizer of this store; null draws no icon. */
  remoteHref: string | null;
  /** The "how a night works" page; null draws no icon. */
  helpHref: string | null;
  /**
   * The RSVP and the count, while the night can be joined; null on a
   * night that is over or never opened, which has nothing to RSVP to.
   */
  line: {
    eventId: string;
    youGoing: boolean;
    goingCount: number;
    signedIn: boolean;
    /** Players seen in the last fifteen minutes; drawn only when > 0. */
    hereNow: number;
  } | null;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link
          href={`/s/${storeId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-text-secondary underline-offset-4 hover:underline"
        >
          {storeName}
          {storeVerified && <VerifiedMark className="size-4" />}
        </Link>
        {following !== null && (
          <FollowStoreButton storeId={storeId} initial={following} code={code} />
        )}
      </div>

      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 text-xl font-bold tracking-tight text-text-primary uppercase">
          {name}
        </h1>
        {(remoteHref || helpHref) && (
          <div className="flex shrink-0 items-center gap-2">
            {remoteHref && (
              <RoundLink href={remoteHref} label="Timer remote" tone="accent">
                <Timer className="size-4" aria-hidden="true" />
              </RoundLink>
            )}
            {helpHref && (
              <RoundLink href={helpHref} label="How a night works" tone="muted">
                <CircleHelp className="size-4" aria-hidden="true" />
              </RoundLink>
            )}
          </div>
        )}
      </div>

      <p className="text-sm text-text-secondary">{when}</p>

      {line && (
        <p className="flex h-6 flex-wrap items-center gap-x-3 text-sm">
          <GoingButton
            eventId={line.eventId}
            youGoing={line.youGoing}
            goingCount={line.goingCount}
            signedIn={line.signedIn}
            next={`/e/${code}`}
            compact
          />
          <span className="text-text-secondary tabular-nums">
            {playersLine(line.goingCount)}
          </span>
          {line.hereNow > 0 && (
            <span className="text-text-muted tabular-nums">
              {hereNowLine(line.hereNow)}
            </span>
          )}
        </p>
      )}
    </header>
  );
}

/** A small round icon link: accent for the remote, muted for help. */
function RoundLink({
  href,
  label,
  tone,
  children,
}: {
  href: string;
  label: string;
  tone: "accent" | "muted";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border bg-surface transition-colors",
        tone === "accent"
          ? "border-accent/40 text-accent hover:border-accent hover:bg-accent/10"
          : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * A small uppercase label over a section of the night page.
 *
 * The founder: "USE LESS CONTAINERIZATION. Not every section needs a
 * giant rounded rectangle. Use spacing, typography, dividers, small
 * surface changes for hierarchy." This is the typography half: the
 * label, and a hairline above it when the section is not the first.
 */
export function SectionLabel({
  id,
  children,
  trailing,
}: {
  id?: string;
  children: React.ReactNode;
  /** A control on the label's line, at its right. */
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2
        id={id}
        className="text-xs font-semibold tracking-wide text-text-muted uppercase"
      >
        {children}
      </h2>
      {trailing}
    </div>
  );
}

/**
 * The night pages' chrome: the mark, a column, the dock. `wide` is for
 * a page with a board on it; a join form or a closed door stays narrow.
 */
export function NightShell({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center justify-start gap-3 px-5 pt-5 pb-16 sm:gap-5 sm:pt-10"
      >
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>
        <div
          className={cn("flex w-full flex-col gap-3", wide ? "max-w-2xl" : "max-w-md")}
        >
          {children}
        </div>

        {/* The board's last control must not hide under the tab bar. */}
        <TabBarSpacer />
      </main>

      {/* The app's bottom bar, so a night feels the same in both. */}
      <PlayerTabBar />
    </>
  );
}
