import type { ReactNode } from "react";

import { EmberBadge } from "@/components/players/ember-badge";
import { PeopleDialog } from "@/components/players/people-dialog";
import { WornNameRow, WornTitleChip } from "@/components/players/worn";
import type { Worn } from "@/components/players/worn";
import { cn } from "@/lib/cn";
import { formatHandle } from "@/lib/players/handle";
import type { ProfileStats } from "@/lib/players/stats";

/**
 * The top of a profile, laid out the way Instagram lays one out.
 *
 * The founder: "as close to Instagram as possible. Followers,
 * following, Flares instead of post count, with the same buttons for
 * edit profile and share profile." So: the picture on the left with
 * the three numbers beside it, the name and handle under, then a row
 * of buttons the full width of the card. The same block for your own
 * profile and for anybody else's; only the buttons differ.
 *
 * Second pass, the founder again: the numbers want "blocks or
 * separation... so they're not just floating", and the name, badge
 * and title were "sporadic". So each number is a tile, and the name
 * block is three ruled lines: name with its badge, the handle, then
 * the title chip and the Embers pill together on one row.
 */

const TILE =
  "flex flex-col items-center justify-center gap-0.5 rounded-[var(--radius-control)] border border-border bg-elevated/60 px-1 py-2";

export function ProfileHeader({
  avatar,
  name,
  handle,
  worn,
  embersEarned,
  stats,
  people,
  actions,
}: {
  /** The picture, already dressed; the own profile passes its editable one. */
  avatar: ReactNode;
  name: string;
  handle: string;
  worn: Worn;
  embersEarned: number;
  stats: ProfileStats;
  /** The lists behind the followers and following tiles, on a profile that opens them. */
  people?: { followers: ReactNode; following: ReactNode };
  /** The button row: edit and share, or follow and share. */
  actions: ReactNode;
}) {
  const tile = (value: number, label: string) => (
    <span className={TILE}>
      <span className="text-lg font-bold text-text-primary tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="text-xs text-text-secondary">{label}</span>
    </span>
  );

  return (
    <div className="relative flex w-full flex-col gap-4 text-left">
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="shrink-0">{avatar}</div>
        <div className="grid flex-1 grid-cols-3 gap-2">
          {tile(stats.flares, stats.flares === 1 ? "Flare" : "Flares")}
          {people ? (
            <PeopleDialog
              value={stats.followers}
              label="followers"
              title="Followers"
              className={cn(TILE, "cursor-pointer hover:border-border-strong")}
            >
              {people.followers}
            </PeopleDialog>
          ) : (
            tile(stats.followers, "followers")
          )}
          {people ? (
            <PeopleDialog
              value={stats.following}
              label="following"
              title="Following"
              className={cn(TILE, "cursor-pointer hover:border-border-strong")}
            >
              {people.following}
            </PeopleDialog>
          ) : (
            tile(stats.following, "following")
          )}
        </div>
      </div>

      <div className="flex flex-col items-start gap-1.5">
        <WornNameRow
          name={name}
          worn={worn}
          withTitle={false}
          className="items-start text-base font-bold"
        />
        <p className="text-sm text-text-muted">{formatHandle(handle)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <WornTitleChip worn={worn} />
          <EmberBadge earned={embersEarned} size="sm" />
        </div>
      </div>

      <div className="flex w-full items-center gap-2">{actions}</div>
    </div>
  );
}
