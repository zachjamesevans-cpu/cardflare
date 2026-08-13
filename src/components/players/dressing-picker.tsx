"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { Rail } from "@/components/lists/rail";

/**
 * Choosing a border and a holo for one card, out of what is owned.
 *
 * The same carousel language as everywhere else — a Rail of card tiles
 * at the board's width — with one difference that earns its keep: every
 * option is previewed on THIS card's own artwork, not on a placeholder.
 * "How would my Luffy look in Galaxy?" is the actual question, and a
 * generic silhouette cannot answer it.
 *
 * Owned items only. This is a dressing room, not the shop: the store is
 * where things are bought, and a locked tile here would be a dead end
 * two taps from where it could be resolved.
 */

export interface DressingOption {
  slug: string;
  name: string;
}

export function DressingPicker({
  imageUrl,
  name,
  number,
  imagesEnabled,
  frames,
  holos,
  frame,
  holo,
  effect,
  onPick,
}: {
  imageUrl: string | null;
  name: string;
  number: string;
  imagesEnabled: boolean;
  /** Owned frames, the free one included. */
  frames: DressingOption[];
  /** Owned holos, the free one included. */
  holos: DressingOption[];
  /** The currently chosen pair, always concrete slugs. */
  frame: string | null;
  holo: string | null;
  /** The profile-wide effect, worn in every preview so it stays honest. */
  effect: string | null;
  onPick: (next: { frame: string | null; holo: string | null }) => void;
}) {
  const optionTile = (
    kind: "frame" | "holo",
    option: DressingOption,
    selected: boolean,
  ) => (
    <li key={option.slug} className="w-14 shrink-0">
      <button
        type="button"
        onClick={() =>
          onPick(
            kind === "frame"
              ? { frame: option.slug, holo }
              : { frame, holo: option.slug },
          )
        }
        aria-pressed={selected}
        className="flex w-full cursor-pointer flex-col gap-1 rounded-[7px] text-left transition-transform hover:ring-2 hover:ring-accent/60 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none active:scale-95"
      >
        <span
          className={cn(
            "relative block w-full rounded-[7px]",
            selected ? "ring-2 ring-accent" : "",
          )}
        >
          <CosmeticCard
            imageUrl={imageUrl}
            name={name}
            number={number}
            imagesEnabled={imagesEnabled}
            frame={kind === "frame" ? option.slug : frame}
            holo={kind === "holo" ? option.slug : holo}
            effect={effect}
            className="w-full"
          />
          {selected && (
            <span className="absolute right-0.5 bottom-0.5 z-10 rounded-full bg-accent p-0.5">
              <Check className="size-3 text-accent-contrast" aria-hidden="true" />
            </span>
          )}
        </span>
        <span className="w-full truncate text-[11px] text-text-secondary">
          {option.name}
        </span>
      </button>
    </li>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-text-primary">Border</p>
        <Rail ariaLabel="Border choices">
          {frames.map((option) => optionTile("frame", option, option.slug === frame))}
        </Rail>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold text-text-primary">Holo pattern</p>
        <Rail ariaLabel="Holo choices">
          {holos.map((option) => optionTile("holo", option, option.slug === holo))}
        </Rail>
      </div>
    </div>
  );
}
