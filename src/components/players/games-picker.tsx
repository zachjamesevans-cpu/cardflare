"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TCG_GAMES } from "@/lib/players/games-catalog";
import { cn } from "@/lib/cn";

function SaveButton({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {pending
        ? "Saving…"
        : count === 0
          ? "None of these yet"
          : `Save my ${count === 1 ? "game" : `${count} games`}`}
    </Button>
  );
}

/**
 * The games question: big tappable tiles, pick any number.
 *
 * Checkboxes under the hood so the form posts plain `games` values and
 * works exactly like every other form here - the tile look is styling
 * on a label, not a reinvented control. The button counts the picks so
 * the empty answer is a deliberate one, never a missed tap.
 */
export function GamesPicker({
  action,
  mine = [],
}: {
  action: (formData: FormData) => void | Promise<void>;
  mine?: string[];
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set(mine));

  const toggle = (slug: string) => {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  return (
    <form action={action} className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {TCG_GAMES.map((game) => {
          const on = picked.has(game.slug);
          return (
            <li key={game.slug}>
              <label
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-control)] border px-4 py-3.5 transition-colors",
                  on
                    ? "border-accent/60 bg-accent/10 text-text-primary"
                    : "border-border bg-elevated text-text-secondary hover:border-border-strong",
                )}
              >
                <input
                  type="checkbox"
                  name="games"
                  value={game.slug}
                  checked={on}
                  onChange={() => toggle(game.slug)}
                  className="sr-only"
                />
                <span className="font-semibold">{game.label}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full border",
                    on ? "border-accent bg-accent" : "border-border-strong",
                  )}
                >
                  {on && <Check className="size-3.5 text-accent-contrast" />}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <SaveButton count={picked.size} />
    </form>
  );
}
