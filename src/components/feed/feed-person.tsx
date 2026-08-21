import Link from "next/link";

import { PlayerAvatar } from "@/components/players/player-avatar";

/**
 * A person on the Feed: their face, their name, and where it leads.
 *
 * One component because the Feed shows a person five different ways and
 * every one of them had its own copy of the avatar-and-name pair. The
 * founder asked for two things the copies made expensive to add at all:
 * "make sure that we are able in the feed to click on profiles", and
 * "if someone joins a room as a guest, it should have 'guest' written
 * after their profile guest name".
 *
 * BOTH ANSWERS COME FROM `playerId` BEING NULL OR NOT. A session with an
 * account behind it has a profile worth opening, so the whole row is a
 * link. A session without one is a guest — somebody who scanned the
 * counter code, typed a name and never signed up — and there is nothing
 * to open, so it says "Guest" and stays flat. A link that goes nowhere
 * is worse than no link, and an unexplained non-link is worse still.
 */
export function FeedPerson({
  playerId,
  displayName,
  avatarUrl,
  frame,
  ring,
  aura,
  detail,
  size = "md",
}: {
  playerId: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura?: string | null;
  /** The quiet line under the name. */
  detail: string;
  size?: "sm" | "md";
}) {
  /* A guest who never typed a name is still a person in the room. */
  const name = displayName ?? "A player";

  const face = (
    <>
      <PlayerAvatar
        displayName={name}
        seed={playerId ?? name}
        avatarUrl={avatarUrl}
        frame={frame}
        ring={ring}
        aura={aura ?? null}
        size={size}
      />
      <div className="flex min-w-0 flex-col">
        <p className="flex items-center gap-1.5 truncate font-semibold text-text-primary">
          <span className="truncate">{name}</span>
          {!playerId && <GuestChip />}
        </p>
        <p className="truncate text-xs text-text-muted">{detail}</p>
      </div>
    </>
  );

  return <PersonLink playerId={playerId}>{face}</PersonLink>;
}

/**
 * The "Guest" mark.
 *
 * A guest is a real person who walked into a shop, not a lesser kind of
 * user — so this is drawn in the metadata colour as a fact, never as a
 * warning. It exists to explain why their name does not open anything.
 */
export function GuestChip() {
  return (
    <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-text-muted uppercase">
      Guest
    </span>
  );
}

/**
 * Wraps a row in a link to a profile, or leaves it flat for a guest.
 *
 * For the rows that keep their own layout because something other than
 * the person is the headline. A link that goes nowhere is worse than no
 * link, so a guest gets a plain div and the GuestChip says why.
 */
export function PersonLink({
  playerId,
  children,
}: {
  playerId: string | null;
  children: React.ReactNode;
}) {
  if (!playerId) {
    return <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>;
  }

  return (
    <Link
      href={`/p/${playerId}`}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-[var(--radius-control)] transition-colors hover:bg-elevated/60"
    >
      {children}
    </Link>
  );
}
