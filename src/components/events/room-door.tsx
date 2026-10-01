import Link from "next/link";
import { CalendarClock, CircleHelp, MapPin, Timer } from "lucide-react";

import { EventLobby } from "@/components/events/event-lobby";
import { FollowStoreButton } from "@/components/stores/follow-store-button";
import { VerifiedMark } from "@/components/stores/verified-mark";
import { Card } from "@/components/ui/card";
import type { Participant } from "@/lib/events/participants";
import { cn } from "@/lib/cn";

/**
 * The room's door: one card, three lines.
 *
 * The founder, on the old Room tab: "There's just so many blocks...
 * moving the remote from a big block to a small little remote icon if
 * they have access to it. It's all just disconnected and want it to
 * flow better." So the store's name and the Follow chip are the first
 * line, the night's name is the second with the room's two small
 * controls at its right end, and the third is the room's pulse: who is
 * here, how many tonight, how many Flares. That third line is the
 * button that opens the people list, which used to be a card of its
 * own at the foot of the page.
 *
 * Plain props on purpose: everything is a string, a number or a list,
 * so the door can be drawn on a page with no database behind it.
 */

/**
 * One face per person.
 *
 * The audit of 2026-10-01: the door said "1 here now" over two faces,
 * and the same player was in the list twice. An account that joined
 * from a second device, or rejoined after its session lapsed, has two
 * sessions in the room, and the roster is written per session. So the
 * list is folded by account before it is drawn, falling back to the
 * session for a guest, who has nothing else to be folded by. The one
 * kept is the viewer's own session when it is among them (so "you"
 * still reads as you), else the one that is present, else the most
 * recently seen. The count is then the faces, because it is counted
 * from the same list.
 */
export function dedupeParticipants(
  participants: Participant[],
  youId: string,
): Participant[] {
  const byPerson = new Map<string, Participant>();
  for (const participant of participants) {
    const key = participant.playerId ?? participant.playerSessionId;
    const kept = byPerson.get(key);
    if (!kept) {
      byPerson.set(key, participant);
      continue;
    }
    if (kept.playerSessionId === youId) continue;
    const better =
      participant.playerSessionId === youId ||
      (participant.present && !kept.present) ||
      (participant.present === kept.present &&
        participant.lastSeenAt > kept.lastSeenAt);
    if (better) byPerson.set(key, participant);
  }
  return [...byPerson.values()];
}
export function RoomDoor({
  storeId,
  storeName,
  storeVerified,
  following,
  code,
  name,
  when,
  location,
  remoteHref,
  helpHref,
  people,
}: {
  storeId: string;
  storeName: string;
  storeVerified: boolean;
  /** Whether the viewer follows the store; null for a guest, who gets no chip. */
  following: boolean | null;
  /** The room's join code, for the Follow chip's repaint and the leave form. */
  code: string;
  /** The night's name. */
  name: string;
  /** "Trading now", or the formatted window of a scheduled event. */
  when: string;
  /** "City, Region", or empty. */
  location: string;
  /**
   * Where the timer remote lives, for an organizer of this store; null
   * draws no icon. The remote is a small round control on the title
   * line now, not a card.
   */
  remoteHref: string | null;
  /** The "how a night works" page, for a scheduled event; null for walk-in. */
  helpHref: string | null;
  /**
   * The room's pulse and its people list, once the viewer is in the
   * room. Null before they have joined: a join form has no roster.
   */
  people: {
    participants: Participant[];
    youId: string;
    imagesEnabled: boolean;
    flareCount: number;
  } | null;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/s/${storeId}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline"
          >
            {storeName}
            {/* Verified is the badge everybody sees beside a store's
                name. Ultra is a tier and is never drawn here. */}
            {storeVerified && <VerifiedMark className="size-4" />}
          </Link>
          {following !== null && (
            <FollowStoreButton storeId={storeId} initial={following} code={code} />
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-2xl font-bold tracking-tight text-text-primary">
            {name}
          </h1>

          {(remoteHref || helpHref) && (
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
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
      </div>

      <dl className="flex flex-col gap-2 text-sm text-text-secondary">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 shrink-0 text-text-muted" aria-hidden />
          <dt className="sr-only">When</dt>
          <dd>{when}</dd>
        </div>
        {location && (
          <div className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-text-muted" aria-hidden />
            <dt className="sr-only">Where</dt>
            <dd>{location}</dd>
          </div>
        )}
      </dl>

      {people && (
        <EventLobby
          code={code}
          participants={dedupeParticipants(people.participants, people.youId)}
          youId={people.youId}
          imagesEnabled={people.imagesEnabled}
          flareCount={people.flareCount}
        />
      )}
    </Card>
  );
}

/**
 * A small round icon link. The remote wears the accent ring so an
 * organizer's eye finds it; help wears the muted one so a player's
 * eye does not.
 */
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
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border bg-surface transition-colors",
        tone === "accent"
          ? "border-accent/40 text-accent hover:border-accent hover:bg-accent/10"
          : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {children}
    </Link>
  );
}
