import Link from "next/link";

import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { removeLocalAction, rsvpAction } from "@/lib/players/account-actions";
import type { LocalStore } from "@/lib/players/locals";

/**
 * The stores a player follows, in their one home: under the code box
 * on the Room tab, where "which room?" is the question being asked.
 * Each row opens the store page; a night whose board is already open
 * gets the RSVP, which posts the saved requests along with the tap.
 * Nothing renders when the list is empty.
 */
export function FollowingCard({
  locals,
  wantCount,
}: {
  locals: LocalStore[];
  wantCount: number;
}) {
  if (locals.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text-primary">Following</h2>
        <p className="text-sm text-text-secondary">
          Stores you follow. Joining a room follows the store too.
        </p>
      </div>
      <ul className="flex flex-col">
        {locals.map((local) => {
          const where = [local.city, local.region].filter(Boolean).join(", ");
          return (
            <li
              key={local.storeId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 flex-1 basis-48 flex-col">
                <Link
                  href={`/s/${local.storeId}`}
                  className="truncate font-semibold text-text-primary underline-offset-4 hover:underline"
                >
                  {local.name}
                </Link>
                <span className="text-xs text-text-muted">
                  {local.liveNow
                    ? "A room is open right now"
                    : local.nextEventAt
                      ? `Next: ${local.nextEventName} · ${new Intl.DateTimeFormat(
                          "en-US",
                          { weekday: "short", month: "short", day: "numeric" },
                        ).format(new Date(local.nextEventAt))}`
                      : where}
                </span>
              </div>
              {/* One tap: onto the board, Flares and all, from the
                moment the board opens. The button carries the
                count so the tap never posts more than it said. */}
              {local.earlyOpen && local.nextEventCode && (
                <form action={rsvpAction}>
                  <input type="hidden" name="code" value={local.nextEventCode} />
                  <SubmitButton
                    variant="secondary"
                    size="sm"
                    pendingLabel="Posting…"
                    label={
                      wantCount > 0
                        ? `I'll be there. Post my ${wantCount} ${
                            wantCount === 1 ? "Flare" : "Flares"
                          }`
                        : "I'll be there"
                    }
                  />
                </form>
              )}
              <form action={removeLocalAction}>
                <input type="hidden" name="storeId" value={local.storeId} />
                <SubmitButton
                  variant="ghost"
                  size="sm"
                  pendingLabel="Unfollowing…"
                  label="Unfollow"
                />
              </form>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
