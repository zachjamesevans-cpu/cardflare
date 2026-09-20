import { PlayerAvatar } from "@/components/players/player-avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { formatHandle } from "@/lib/players/handle";
import { removeOrganizerAction } from "@/lib/stores/staff-actions";
import type { StaffMember } from "@/lib/stores/staff";

/**
 * What an organizer is, in the one sentence every surface uses.
 *
 * The Organizers tab and the wizard's team step both say it, and the
 * app's copy has to match, so it is a string here and nowhere else.
 */
export const ORGANIZER_DESCRIPTION =
  "Organizers get FlareCast, the timers and the remote, plus events, posts and the case. They cannot see billing, singles or settings.";

/**
 * The people on a store, one row each.
 *
 * The Organizers tab lists everybody, owner first; the wizard's team
 * step lists the organizers alone. Both draw the same row, so a face
 * and a badge look the same wherever an owner meets them. An organizer
 * row carries a Remove form; the action re-checks on the server that
 * the caller owns the store, and never deletes an owner row.
 */
export function OrganizerList({
  storeId,
  members,
}: {
  storeId: string;
  members: StaffMember[];
}) {
  return (
    <ul className="flex flex-col">
      {members.map((member) => (
        <li
          key={member.userId}
          className="flex items-center gap-3 border-t border-border py-3 first:border-t-0"
        >
          <PlayerAvatar
            displayName={member.displayName}
            seed={member.playerId ?? member.userId}
            avatarUrl={member.avatarUrl}
            size="sm"
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold text-text-primary">
                {member.displayName}
              </span>
              {member.role === "owner" ? (
                <Badge tone="neutral">Owner</Badge>
              ) : (
                <Badge>
                  <span className="font-bold tracking-wide">TO</span>
                  Organizer
                </Badge>
              )}
            </span>
            {member.handle && (
              <span className="truncate text-xs text-text-muted">
                {formatHandle(member.handle)}
              </span>
            )}
          </span>
          {member.role === "staff" && (
            <form action={removeOrganizerAction}>
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="userId" value={member.userId} />
              <Button type="submit" size="sm" variant="ghost">
                Remove
              </Button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
