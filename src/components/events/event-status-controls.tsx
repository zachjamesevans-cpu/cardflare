import { Button } from "@/components/ui/button";
import { setEventStatusAction } from "@/lib/events/actions";
import { formatEventMoment } from "@/lib/events/format";
import type { EventStatus } from "@/lib/events/schema";

/**
 * What each status means, in the store's terms rather than the schema's.
 *
 * A store owner does not care about an enum; they care whether players
 * scanning the code right now get in.
 */
const EXPLANATION: Record<Exclude<EventStatus, "draft">, string> = {
  open: "Players who scan the code join the room.",
  closed: "The room is finished. Scanning the code no longer lets anyone in.",
};

/**
 * A draft's explanation has to tell the truth about the early board.
 *
 * It used to say "Not accepting players yet" on every draft, while the
 * board had been taking Flares from home since midnight. Three honest
 * answers: the early window is open now, it opens at a known moment, or
 * the store has early boards off and the code is all there is.
 */
function draftExplanation({
  startsAt,
  earlyOpensAt,
  earlyOpen,
  timeZone,
}: {
  startsAt: string;
  earlyOpensAt: string | null;
  earlyOpen: boolean;
  timeZone: string;
}): string {
  if (earlyOpensAt === null) {
    return "Not accepting players yet. Print the code now and open the room when doors open.";
  }
  if (earlyOpen) {
    return `Players can already post to this board from home. Doors open ${formatEventMoment(startsAt, timeZone)}. Open the room when they do.`;
  }
  return `Not accepting players yet. The board opens early on ${formatEventMoment(earlyOpensAt, timeZone)}, then the room when doors open.`;
}

/** Which moves are offered from each status, and what to call them. */
const TRANSITIONS: Record<EventStatus, { to: EventStatus; label: string }[]> = {
  draft: [{ to: "open", label: "Open the room" }],
  open: [
    { to: "closed", label: "Close the room" },
    { to: "draft", label: "Back to draft" },
  ],
  closed: [{ to: "open", label: "Reopen the room" }],
};

/**
 * Server Component: each button is its own form posting to a Server Action,
 * so this needs no client JavaScript and works before hydration.
 */
export function EventStatusControls({
  eventId,
  status,
  startsAt,
  earlyOpensAt,
  earlyOpen,
  timeZone,
  cancelledAt,
}: {
  eventId: string;
  status: EventStatus;
  /** When doors open, as an instant. */
  startsAt: string;
  /** When the board starts taking Flares, or null when early boards are off. */
  earlyOpensAt: string | null;
  /** Whether that moment has passed, decided by the page. */
  earlyOpen: boolean;
  /** The store's zone, for every time in the sentence. */
  timeZone: string;
  /** Set when the store cancelled the night; nothing is offered then. */
  cancelledAt?: string | null;
}) {
  /* A cancelled night is closed for good. Reopening it would bring back
     a room the store told its players was off, so no move is offered. */
  if (cancelledAt) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-text-secondary">
          Cancelled. Players who joined see it closed, and next week does not appear
          from it.
        </p>
      </div>
    );
  }

  const explanation =
    status === "draft"
      ? draftExplanation({ startsAt, earlyOpensAt, earlyOpen, timeZone })
      : EXPLANATION[status];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary">{explanation}</p>

      <div className="flex flex-wrap gap-3">
        {TRANSITIONS[status].map(({ to, label }, index) => (
          <form key={to} action={setEventStatusAction}>
            <input type="hidden" name="eventId" value={eventId} />
            <input type="hidden" name="status" value={to} />
            <Button type="submit" variant={index === 0 ? "primary" : "secondary"}>
              {label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
