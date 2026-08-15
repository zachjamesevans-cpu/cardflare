"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { CosmeticArt } from "@/components/players/cosmetic-art";
import { Badge, Card } from "@/components/ui/card";
import { equipCosmeticAction } from "@/lib/players/equip-actions";
import type { CustomizeSection, EquipKind } from "@/lib/players/equips";
import { cn } from "@/lib/cn";

/**
 * Getting dressed, in one place - the founder's ask, verbatim: "why do
 * I have to go into the store to change my profile border?... simplify
 * the edit process - with previews of these things as you click them."
 *
 * Every tile IS its preview (the same art classes the profile wears),
 * and a click equips instantly: local state flips the tick before the
 * server round-trip, and the action revalidates the profile behind it.
 * The store keeps exactly one job now: buying.
 */

const SECTION_COPY: Record<EquipKind, { title: string; blurb: string }> = {
  ring: { title: "Profile borders", blurb: "Drawn around your profile picture." },
  border: { title: "Card borders", blurb: "Around every card in your showcase." },
  pattern: { title: "Holo patterns", blurb: "The foil across your cards." },
  animation: { title: "Card animations", blurb: "How your showcase cards move." },
  background: { title: "Showcase backgrounds", blurb: "Behind your showcase rail." },
  scene: { title: "Profile effects", blurb: "Across your whole profile page." },
  nameplate: { title: "Name styles", blurb: "How your username is drawn." },
  title: { title: "Titles", blurb: "The line under your name." },
  badge: { title: "Badges", blurb: "The mark beside your name." },
};

export function CustomizeHub({ sections }: { sections: CustomizeSection[] }) {
  /* The worn slug per kind, flipped locally the moment a tile is
     clicked so the tick never waits on the network. */
  const [worn, setWorn] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      sections.map((section) => [
        section.kind,
        section.items.find((item) => item.equipped)?.slug ?? null,
      ]),
    ),
  );
  const [, start] = useTransition();

  const wear = (kind: EquipKind, slug: string | null) => {
    setWorn((current) => ({ ...current, [kind]: slug }));
    const form = new FormData();
    form.set("kind", kind);
    form.set("slug", slug ?? "");
    start(() => void equipCosmeticAction(form));
  };

  return (
    <div className="flex flex-col gap-6">
      {sections.map((section) => (
        <Card key={section.kind} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="font-semibold text-text-primary">
              {SECTION_COPY[section.kind].title}
            </h2>
            <p className="text-sm text-text-secondary">
              {SECTION_COPY[section.kind].blurb} Tap to wear it; tap again to take it
              off.
            </p>
          </div>

          <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {section.items.map((item) => {
              const on = worn[section.kind] === item.slug;
              return (
                <li key={item.slug}>
                  <button
                    type="button"
                    disabled={!item.owned}
                    onClick={() => wear(section.kind, on ? null : item.slug)}
                    className={cn(
                      "flex w-full flex-col gap-2 rounded-[var(--radius-control)] border p-3 text-left transition-colors",
                      on
                        ? "border-accent/70 bg-accent/10"
                        : "border-border bg-elevated hover:border-border-strong",
                      !item.owned && "cursor-not-allowed opacity-45",
                    )}
                  >
                    <div className="grid min-h-24 place-items-center">
                      <CosmeticArt
                        kind={section.kind}
                        slug={item.slug}
                        className="w-full"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">
                        {item.name}
                      </span>
                      {on && <Check className="size-4 shrink-0 text-accent" />}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.status === "draft" && (
                        <Badge tone="neutral">unreleased</Badge>
                      )}
                      {!item.owned && <Badge tone="neutral">not owned yet</Badge>}
                      {on && <Badge>wearing</Badge>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
