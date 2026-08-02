import { Button } from "@/components/ui/button";
import { endWalkInSessionAction } from "@/lib/events/actions";
import type { EventStatus } from "@/lib/events/schema";

/**
 * What a store sees instead of the draft/open/closed controls.
 *
 * A walk-in room is not something a store opens and closes — it appears when
 * somebody scans the counter code and ends itself when trading stops. Offering
 * the usual lifecycle buttons here would be offering controls that do not mean
 * what they say: "reopen" on a finished session would produce a second room
 * competing with whichever one the counter code is currently opening.
 *
 * Ending it by hand is real and does belong here, so it is the one control
 * offered, and the copy says exactly what happens next.
 */
export function WalkInSession({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  if (status !== "open") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-text-secondary">
          This walk-in session has finished. Its Flares stayed with it, so the next
          person to scan your counter code starts a fresh room.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-text-secondary">
        Players are trading here now. Nobody has to open or close this — it ends by
        itself once the room has been quiet for a few hours.
      </p>

      <form action={endWalkInSessionAction}>
        <input type="hidden" name="eventId" value={eventId} />
        <Button type="submit" variant="secondary">
          End this session now
        </Button>
      </form>

      <p className="text-sm text-text-muted">
        Ending it clears the board. Your counter code keeps working, and the next person
        to scan starts a new session.
      </p>
    </div>
  );
}
