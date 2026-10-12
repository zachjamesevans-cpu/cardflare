"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPin, MessageCircle } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { answerNearbyAction, stopTradingAction } from "@/lib/nearby/actions";
import type { NearbyMatch, WantedGroup } from "@/lib/nearby/matching";
import {
  ANSWER_DRAFT,
  WANTED_PATH,
  WANTED_SORTS,
  type WantedSort,
} from "@/lib/nearby/shared";

/** How many people a card shows before "Show all". */
const FIRST_PEOPLE = 5;

const threadHref = (threadId: string) =>
  `/local?thread=${encodeURIComponent(threadId)}`;

/**
 * "Wanted near you": every card of yours somebody near you wants, one
 * section each, people inside. Grouped by card because that is the
 * question - which of mine is wanted - and because a big city can put
 * a hundred people on this screen. The app's screen is the same
 * (mobile/src/screens/wanted-near-you.tsx).
 */
export function WantedList({
  groups,
  sort,
  tiles,
}: {
  groups: WantedGroup[];
  sort: WantedSort;
  /** Each card's picture, drawn by the server with the Feed's tile. */
  tiles: Record<string, React.ReactNode>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Sort" className="flex flex-wrap gap-2">
        {WANTED_SORTS.map((option) => (
          <Link
            key={option.key}
            href={`${WANTED_PATH}?sort=${option.key}`}
            aria-current={option.key === sort ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-semibold",
              option.key === sort
                ? "border-accent bg-accent/10 text-accent"
                : "border-border text-text-secondary hover:text-text-primary",
            )}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {groups.map((group) => (
        <CardSection
          key={group.card.cardId}
          group={group}
          tile={tiles[group.card.cardId]}
        />
      ))}
    </div>
  );
}

/** One card of yours, and the people near you who want it. */
function CardSection({ group, tile }: { group: WantedGroup; tile: React.ReactNode }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const shown = all ? group.people : group.people.slice(0, FIRST_PEOPLE);
  const count = group.people.length;

  return (
    <section className="flex flex-col gap-3 border-b border-border pb-5 last:border-b-0">
      <div className="flex items-center gap-3">
        {tile}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate font-semibold text-text-primary">
            {group.card.cardName}
          </h2>
          <p className="text-xs text-text-muted">
            {count} {count === 1 ? "person wants" : "people want"} this
            {group.card.match === "other-printing" && " · You have another printing"}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {shown.map((person) => (
          <PersonRow key={`${person.ask.kind}-${person.ask.id}`} person={person} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        {count > FIRST_PEOPLE && (
          <button
            type="button"
            onClick={() => setAll(!all)}
            className="text-sm font-semibold text-accent"
          >
            {all ? "Show fewer" : `Show all ${count}`}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await stopTradingAction(group.haveEntryId);
              if (result.ok) router.refresh();
              else setError(result.message);
            })
          }
          className="ml-auto text-sm text-text-muted hover:text-text-primary"
        >
          {pending ? "Saving…" : "Not trading this anymore"}
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </section>
  );
}

/**
 * One person: face, name, how far, and the message icon to the right.
 * No "I have this" - the founder: "of course you have it... that's the
 * whole reason it's on your screen." The icon opens a draft under the
 * row; nothing is sent until Send. Once there is a conversation the
 * icon is filled and goes straight to it.
 */
function PersonRow({ person }: { person: NearbyMatch }) {
  const router = useRouter();
  const [drafting, setDrafting] = useState(false);
  const [text, setText] = useState(ANSWER_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const first = person.wanter.displayName.split(" ")[0];

  const send = () =>
    startTransition(async () => {
      setError(null);
      const result = await answerNearbyAction(person.ask, text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(threadHref(result.threadId));
    });

  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <PlayerAvatar
          displayName={person.wanter.displayName}
          seed={person.wanter.playerId}
          avatarUrl={person.wanter.avatarUrl}
          frame={person.wanter.frame}
          ring={person.wanter.ring}
          aura={person.wanter.aura}
          ringArt={person.wanter.ringArt}
          auraArt={person.wanter.auraArt}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">
            {person.wanter.displayName}
          </p>
          <p className="flex items-center gap-1 text-xs text-text-muted">
            <MapPin className="size-3.5" aria-hidden="true" />
            {person.milesLabel}
            {person.threadId && " · Messaged"}
          </p>
        </div>
        <button
          type="button"
          aria-label={
            person.threadId
              ? `Open your conversation with ${first}`
              : `Message ${first} about ${person.card.cardName}`
          }
          aria-expanded={person.threadId ? undefined : drafting}
          onClick={() =>
            person.threadId
              ? router.push(threadHref(person.threadId))
              : setDrafting(!drafting)
          }
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full border",
            person.threadId
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border-strong text-accent hover:bg-elevated",
          )}
        >
          <MessageCircle
            className={cn("size-5", person.threadId && "fill-current")}
            aria-hidden="true"
          />
        </button>
      </div>

      {drafting && !person.threadId && (
        <div className="flex flex-col gap-2 pl-11">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            aria-label={`Message to ${first}`}
            className="w-full resize-none rounded-[var(--radius-control)] border border-border-strong bg-canvas px-3 py-2 text-sm text-text-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !text.trim()}
              onClick={send}
              className={buttonStyles("primary", "sm")}
            >
              {pending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setDrafting(false)}
              className={buttonStyles("ghost", "sm")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="pl-11 text-sm text-danger">{error}</p>}
    </li>
  );
}
