import Link from "next/link";
import type { ReactNode } from "react";

import { EmberBadge } from "@/components/players/ember-badge";
import { WornNameRow } from "@/components/players/worn";
import type { Worn } from "@/components/players/worn";
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
 */
export function ProfileHeader({
  avatar,
  name,
  handle,
  worn,
  embersEarned,
  stats,
  statLinks,
  actions,
}: {
  /** The picture, already dressed; the own profile passes its editable one. */
  avatar: ReactNode;
  name: string;
  handle: string;
  worn: Worn;
  embersEarned: number;
  stats: ProfileStats;
  /** Where the followers and following numbers go, on a profile that lists them. */
  statLinks?: { followers: string; following: string };
  /** The button row: edit and share, or follow and share. */
  actions: ReactNode;
}) {
  const stat = (value: number, label: string, href?: string) => {
    const body = (
      <>
        <span className="text-lg font-bold text-text-primary tabular-nums">
          {value.toLocaleString()}
        </span>
        <span className="text-xs text-text-secondary">{label}</span>
      </>
    );
    return href ? (
      <Link href={href} className="flex flex-col items-center hover:underline">
        {body}
      </Link>
    ) : (
      <span className="flex flex-col items-center">{body}</span>
    );
  };

  return (
    <div className="relative flex w-full flex-col gap-4 text-left">
      <div className="flex items-center gap-4 sm:gap-6">
        <div className="shrink-0">{avatar}</div>
        <div className="grid flex-1 grid-cols-3 items-center">
          {stat(stats.flares, stats.flares === 1 ? "Flare" : "Flares")}
          {stat(stats.followers, "followers", statLinks?.followers)}
          {stat(stats.following, "following", statLinks?.following)}
        </div>
      </div>

      <div className="flex flex-col items-start gap-1.5">
        <div className="flex">
          <WornNameRow name={name} worn={worn} className="text-base font-bold" />
        </div>
        <p className="text-sm text-text-muted">{formatHandle(handle)}</p>
        <EmberBadge earned={embersEarned} size="sm" />
      </div>

      <div className="flex w-full items-center gap-2">{actions}</div>
    </div>
  );
}
