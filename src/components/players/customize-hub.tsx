"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, Check, ChevronRight, Store } from "lucide-react";

import { CosmeticArt } from "@/components/players/cosmetic-art";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { WornCardShell, WornNameRow, WornTitleChip } from "@/components/players/worn";
import { Card } from "@/components/ui/card";
import { useLookDraft } from "@/components/players/look-draft";
import type { CustomizeSection, EquipKind } from "@/lib/players/equips";
import { cn } from "@/lib/cn";

/**
 * The Look and Showcase tabs of Edit profile: what you own, one category
 * at a time, worn with a click.
 *
 * It was its own page, every category stacked down it - the founder:
 * "take a look at the customize your look screen. it's just a long
 * scrolling list of different types of cosmetics", then "build it go" on
 * the plan, which the app's Wardrobe (mobile/src/screens/customize.tsx)
 * draws the same way:
 *
 * - A live preview on top: you, or one of your cards, wearing it.
 * - Chips for the categories: one on screen at a time.
 * - What you own, art first, with None to take a category off.
 * - "More in the Embers shop": buying stays in the shop.
 *
 * A click picks; Edit profile's Done saves (look-draft.tsx), so a
 * look can be tried on and left without a trace.
 */

const SECTION_COPY: Record<EquipKind, { title: string; blurb: string }> = {
  ring: { title: "Profile borders", blurb: "Drawn around your profile picture." },
  aura: {
    title: "Avatar effects",
    blurb: "Animations floating around your picture. Mix with any border.",
  },
  border: { title: "Card borders", blurb: "Around every card in your showcase." },
  pattern: { title: "Holo patterns", blurb: "The foil across your cards." },
  animation: { title: "Card animations", blurb: "How your showcase cards move." },
  background: { title: "Showcase backgrounds", blurb: "Behind your showcase rail." },
  scene: { title: "Profile effects", blurb: "Across your whole profile page." },
  nameplate: { title: "Name styles", blurb: "How your username is drawn." },
  title: { title: "Titles", blurb: "The line under your name." },
  badge: { title: "Badges", blurb: "The mark beside your name." },
};

/** Who the preview is. */
export interface HubOwner {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  /** A card of theirs to dress in the Showcase preview, if they have one. */
  cardImage: string | null;
}

export function CustomizeHub({
  sections,
  area,
  owner,
}: {
  sections: CustomizeSection[];
  area: "profile" | "showcase";
  owner: HubOwner;
}) {
  /* What is saved, as the server read it; picks sit over it until Done. */
  const saved: Record<string, string | null> = Object.fromEntries(
    sections.map((section) => [
      section.kind,
      section.items.find((item) => item.equipped)?.slug ?? null,
    ]),
  );
  const { draft, pick } = useLookDraft();
  const worn: Record<string, string | null> = { ...saved, ...draft };
  const [kind, setKind] = useState<EquipKind | null>(sections[0]?.kind ?? null);

  const wear = (on: EquipKind, slug: string | null) =>
    pick(on, slug, saved[on] ?? null);

  const section = sections.find((entry) => entry.kind === kind) ?? sections[0];
  const owned = section ? section.items.filter((item) => item.owned) : [];
  const wide = section && (section.kind === "scene" || section.kind === "background");
  const current = section ? (worn[section.kind] ?? null) : null;
  /* A dropped-in ring or aura is a file, not a slug the avatar knows:
     hand the preview the worn item's art, as the profile does. */
  const artOf = (on: EquipKind) =>
    sections
      .find((entry) => entry.kind === on)
      ?.items.find((item) => item.slug === worn[on])?.art ?? null;

  return (
    <div className="flex flex-col gap-5">
      {/* THE PREVIEW: what you are wearing, as it will be seen. */}
      <Card className="flex flex-col items-center gap-3 py-6">
        {area === "profile" ? (
          <>
            <PlayerAvatar
              displayName={owner.displayName}
              seed={owner.playerId}
              avatarUrl={owner.avatarUrl}
              frame={owner.frame}
              ring={worn.ring ?? null}
              aura={worn.aura ?? null}
              ringArt={artOf("ring")}
              auraArt={artOf("aura")}
              className="size-24 text-2xl"
            />
            <WornNameRow
              name={owner.displayName}
              worn={worn}
              withTitle={false}
              className="items-center text-xl font-extrabold"
            />
            <WornTitleChip worn={worn} />
          </>
        ) : (
          <div className="relative flex h-44 w-52 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-canvas">
            {worn.background && (
              <CosmeticArt
                kind="background"
                slug={worn.background}
                className="absolute inset-0 size-full"
              />
            )}
            <WornCardShell worn={worn} className="relative w-24">
              {owner.cardImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={owner.cardImage}
                  alt=""
                  className="aspect-[63/88] w-full rounded-[5px] object-cover"
                />
              ) : (
                <div className="aspect-[63/88] w-full rounded-[5px] bg-elevated" />
              )}
            </WornCardShell>
          </div>
        )}
      </Card>

      {/* THE CHIPS: one category at a time. */}
      <div className="-mx-1 flex [scrollbar-width:none] gap-2 overflow-x-auto px-1 pb-1">
        {sections.map((entry) => {
          const on = entry.kind === section?.kind;
          return (
            <button
              key={entry.kind}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(entry.kind)}
              className={cn(
                "shrink-0 cursor-pointer rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors",
                on
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-elevated text-text-secondary hover:text-text-primary",
              )}
            >
              {SECTION_COPY[entry.kind].title}
            </button>
          );
        })}
      </div>

      {section && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {SECTION_COPY[section.kind].blurb}
          </p>
          <ul
            className={cn(
              "grid gap-2",
              wide ? "grid-cols-2" : "grid-cols-3 sm:grid-cols-4",
            )}
          >
            <li>
              <Tile
                label="None"
                on={current === null}
                onClick={() => wear(section.kind, null)}
              >
                <Ban className="size-7 text-text-muted" aria-hidden="true" />
              </Tile>
            </li>
            {owned.map((item) => (
              <li key={item.slug}>
                <Tile
                  label={item.name}
                  on={current === item.slug}
                  onClick={() =>
                    wear(section.kind, current === item.slug ? null : item.slug)
                  }
                >
                  <CosmeticArt
                    kind={section.kind}
                    slug={item.slug}
                    art={item.art}
                    className="w-full"
                  />
                </Tile>
              </li>
            ))}
          </ul>
          {owned.length === 0 && (
            <p className="text-sm text-text-muted">
              Nothing here yet. Find some in the Embers shop.
            </p>
          )}
          {/* Buying stays in the shop: this is the door to it. */}
          <Link
            href="/profile/store"
            className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated p-3 text-sm font-semibold text-text-primary hover:border-border-strong"
          >
            <Store className="size-4 text-accent" aria-hidden="true" />
            <span className="flex-1">More in the Embers shop</span>
            <ChevronRight className="size-4 text-text-muted" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}

/** One square: the art, the name, a ring when worn. */
function Tile({
  label,
  on,
  onClick,
  children,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-control)] p-2 text-center transition-colors",
        on
          ? "border-2 border-accent bg-accent/10"
          : "border border-border bg-elevated hover:border-border-strong",
      )}
    >
      <span className="grid min-h-16 w-full place-items-center">{children}</span>
      <span
        className={cn(
          "line-clamp-2 text-xs",
          on ? "font-bold text-text-primary" : "font-medium text-text-secondary",
        )}
      >
        {label}
        {on && <Check className="ml-1 inline size-3 text-accent" aria-hidden="true" />}
      </span>
    </button>
  );
}
