"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPin, MessageCircle, MoreHorizontal, XCircle } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { cardImageAlt } from "@/lib/cards/images";
import { stopTradingAction } from "@/lib/nearby/actions";
import type { NearbyMatch, WantedGroup } from "@/lib/nearby/matching";
import { newMessageHref, shortMiles } from "@/lib/nearby/shared";

const threadHref = (threadId: string) =>
  `/local?thread=${encodeURIComponent(threadId)}`;

/**
 * "Wanted near you", as your binder: the cards of yours somebody near
 * you wants, in a grid, each wearing how many people want it. Click
 * one and its people open in a sheet. The founder, of the list this
 * replaced: "seems like a lot of info for someone." The app's screen
 * is the same (mobile/src/screens/wanted.tsx).
 */
export function WantedGrid({
  groups,
  initialCardId,
}: {
  groups: WantedGroup[];
  /** The card the Feed's summary was clicked on, opened straight away. */
  initialCardId: string | null;
}) {
  const [openCard, setOpenCard] = useState<string | null>(
    groups.some((group) => group.card.cardId === initialCardId) ? initialCardId : null,
  );
  const open = groups.find((group) => group.card.cardId === openCard) ?? null;

  return (
    <>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {groups.map((group) => {
          const count = group.people.length;
          return (
            <li key={group.card.cardId}>
              <button
                type="button"
                onClick={() => setOpenCard(group.card.cardId)}
                aria-label={`${group.card.cardName}, ${count} ${count === 1 ? "person wants" : "people want"} it`}
                className="relative block w-full cursor-pointer rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
              >
                {/* The held ring, the same as every card of yours. */}
                <span className="block aspect-[60/84] w-full overflow-hidden rounded-[6px] border border-border bg-elevated shadow-[0_0_14px_rgba(206,252,132,0.5)] ring-[3px] ring-accent">
                  {group.card.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={group.card.imageUrl}
                      alt={cardImageAlt(group.card.cardName, group.card.cardNumber)}
                      className="size-full object-contain"
                    />
                  )}
                </span>
                {/* How many people near you want it. */}
                <span className="absolute -top-2 -right-2 flex h-7 min-w-7 items-center justify-center rounded-full border-2 border-canvas bg-accent px-1.5 text-[13px] font-extrabold text-accent-contrast">
                  {count}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet
        open={open !== null}
        onClose={() => setOpenCard(null)}
        title={open?.card.cardName ?? ""}
      >
        {open && <PeopleForCard key={open.card.cardId} group={open} />}
      </Sheet>
    </>
  );
}

/**
 * One card's people: closest first, the ones already messaged at the
 * foot. "Not trading this anymore" is behind the three dots, out of the
 * way of the thing you came to do.
 */
function PeopleForCard({ group }: { group: WantedGroup }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const count = group.people.length;

  const stop = () =>
    startTransition(async () => {
      setError(null);
      const result = await stopTradingAction(group.haveEntryId);
      if (result.ok) router.refresh();
      else setError(result.message);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm text-text-muted">
          {count} {count === 1 ? "person wants" : "people want"} this
          {group.card.match === "other-printing" && " · You have another printing"}
        </p>
        {/* The three dots open a row in place rather than a dropdown,
            which the sheet's scrolling body would clip; the app's sheet
            does the same. */}
        <button
          type="button"
          onClick={() => setMenu(!menu)}
          aria-label={`More for ${group.card.cardName}`}
          aria-expanded={menu}
          className="-m-1 shrink-0 cursor-pointer rounded-full p-1 text-text-muted hover:text-text-primary"
        >
          <MoreHorizontal className="size-5" aria-hidden="true" />
        </button>
      </div>
      {menu && (
        <button
          type="button"
          disabled={pending}
          onClick={stop}
          className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated p-3 text-left text-sm font-semibold text-text-primary"
        >
          <XCircle className="size-4 text-text-secondary" aria-hidden="true" />
          {pending ? "Saving…" : "Not trading this anymore"}
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <ul className="flex flex-col gap-3">
        {group.people.map((person) => (
          <PersonRow key={`${person.ask.kind}-${person.ask.id}`} person={person} />
        ))}
      </ul>
    </div>
  );
}

/**
 * One person: face, name, how far, and the message icon to the right.
 * No "I have this" - the founder: "of course you have it... that's the
 * whole reason it's on your screen." The icon opens a new conversation,
 * inbox-style, with the first line already written (/local/new);
 * nothing is sent until Send. Once there is a conversation the icon is
 * filled and goes straight to it.
 */
function PersonRow({ person }: { person: NearbyMatch }) {
  const first = person.wanter.displayName.split(" ")[0];

  return (
    <li className="flex items-center gap-3">
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
        {/* Short, and no "Messaged": the filled icon already says it. */}
        <p className="flex items-center gap-1 text-xs text-text-muted">
          <MapPin className="size-3.5" aria-hidden="true" />
          {shortMiles(person.miles)}
        </p>
      </div>
      <Link
        href={
          person.threadId ? threadHref(person.threadId) : newMessageHref(person.ask)
        }
        aria-label={
          person.threadId
            ? `Open your conversation with ${first}`
            : `Message ${first} about ${person.card.cardName}`
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
      </Link>
    </li>
  );
}
