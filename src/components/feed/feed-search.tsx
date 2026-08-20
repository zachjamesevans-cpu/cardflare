"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";

import { PlayerSearch } from "@/components/players/player-search";

/**
 * Finding somebody, from the screen you already have open.
 *
 * The founder: "the social features should be a litle more front and
 * center. for example, having the abilty to search for someone outside
 * of having to go all thew ay to the bottom of my profile would be
 * nice... let's make a search icon in the top right of the main feed."
 *
 * A button rather than a permanent field, because the Feed is a reading
 * screen: a search box pinned above it would take the top of every
 * render for something used occasionally. Closed it costs one icon; open
 * it is the same search that already lives on the profile, so there is
 * one way to find a player and not two that can disagree.
 */
export function FeedSearch() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? "Close player search" : "Find a player"}
        className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
      >
        {open ? (
          <X className="size-4" aria-hidden="true" />
        ) : (
          <Search className="size-4" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div className="w-full">
          <PlayerSearch />
        </div>
      )}
    </>
  );
}
