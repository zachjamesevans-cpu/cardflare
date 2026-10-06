"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

import { EverythingSearch } from "@/components/feed/everything-search";

/**
 * Finding anything, from the screen you already have open.
 *
 * The founder: "the social features should be a litle more front and
 * center. for example, having the abilty to search for someone outside
 * of having to go all thew ay to the bottom of my profile would be
 * nice... let's make a search icon in the top right of the main feed."
 *
 * A button rather than a permanent field, because the Feed is a reading
 * screen: a search box pinned above it would take the top of every
 * render for something used occasionally. Closed it costs one icon;
 * open it is one search for everything: cards, players and stores,
 * in that order, each a door to its page. The profile keeps its own
 * player search, because somebody managing who they follow is
 * already standing there. The app's header icon opens its Search
 * screen, the same search.
 *
 * The bell sits beside it, at the far right: notifications moved out
 * of the tab bar and into the Feed's corner (round 16), the way
 * Instagram keeps its heart up there.
 */
export function FeedSearch({
  account = null,
  bell,
}: {
  /** Whose recent searches to show: the player, or null for a guest. */
  account?: string | null;
  /** The notifications bell, drawn to the right of the search icon. */
  bell?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* The icons as one group, so the panel below wraps under the
          whole header row rather than between the two. */}
      <span className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={open ? "Close search" : "Search"}
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          {open ? (
            <X className="size-4" aria-hidden="true" />
          ) : (
            <Search className="size-4" aria-hidden="true" />
          )}
        </button>
        {bell}
      </span>

      {open && (
        <div className="w-full">
          <EverythingSearch account={account} />
        </div>
      )}
    </>
  );
}
