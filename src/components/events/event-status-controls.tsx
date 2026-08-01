import { Button } from "@/components/ui/button";
import { setEventStatusAction } from "@/lib/events/actions";
import type { EventStatus } from "@/lib/events/schema";

/**
 * What each status means, in the store's terms rather than the schema's.
 *
 * A store owner does not care about an enum; they care whether players
 * scanning the code right now get in.
 */
const EXPLANATION: Record<EventStatus, string> = {
  draft:
    "Not accepting players yet. Print the code now and open the room when doors open.",
  open: "Players who scan the code join the room.",
  closed: "The room is finished. Scanning the code no longer lets anyone in.",
};

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
}: {
  eventId: string;
  status: EventStatus;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary">{EXPLANATION[status]}</p>

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
