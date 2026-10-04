"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Crosshair, Plus } from "lucide-react";

import { BinderCover } from "@/components/binder/binder-cover";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { huntCover } from "@/lib/binder/covers";
import { createHuntAction } from "@/lib/players/hunt-actions";
import { huntRowLine } from "@/lib/players/hunt-copy";
import type { Hunt } from "@/lib/players/hunts";

/**
 * Somebody's hunts, on their profile.
 *
 * A hunt is a persistent named want: "Green Zoro", "Wishlist
 * upgrades". Drawn like a binder now (the founder: "Do you think the
 * Hunts feature should just be binders instead of lists? So it's all
 * kinda the same language."): one row per hunt, the binder row
 * exactly, the small cover with the hunt's name embossed on it, the
 * name, the line that says how many cards and how many are left, and
 * a chevron. A tap opens the hunt's own page at /hunts/<id>; nothing
 * expands in place any more. The cover's colour comes from the hunt's
 * id, so the same hunt wears the same colour on the website and in
 * the app. The app's hunts-panel.tsx draws the same rows.
 *
 * The panel used to sit on the profile, capped at three rows with a
 * "See all" under them. The profile IA round moved it behind the Hunts
 * door in the profile's icon row, onto a page of its own, and a page
 * that is nothing but the hunts has no reason to hide any: every row
 * is drawn.
 *
 * The owner starts a hunt here. Everything else, editing, ticking
 * copies off, a visitor's offer, happens on the hunt's page.
 */

export function HuntsPanel({
  hunts,
  limit,
  yours,
}: {
  hunts: Hunt[];
  /** How many they may keep, when it is worth saying. */
  limit?: number;
  yours?: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  const atLimit = limit !== undefined && hunts.length >= limit;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-text-primary">
          {/* The crosshair: the hunts icon everywhere, the tab's included. */}
          <Crosshair className="size-4 text-accent" aria-hidden="true" />
          Hunts
        </p>
        <div className="flex items-center gap-2">
          {limit ? (
            <p className="text-xs text-text-muted tabular-nums">
              {hunts.length} of {limit}
            </p>
          ) : null}
          {yours && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={atLimit}
              title={
                atLimit ? "You are keeping the most hunts your plan allows." : undefined
              }
              onClick={() => setCreating((value) => !value)}
            >
              <Plus className="size-4" aria-hidden="true" />
              New hunt
            </Button>
          )}
        </div>
      </div>
      {yours && atLimit && (
        <p className="text-xs text-text-muted">
          You are keeping {hunts.length} hunts, the limit on your plan. Finish one to
          start another.
        </p>
      )}

      {yours && creating && !atLimit && (
        <NewHuntForm
          onDone={(huntId) => {
            setCreating(false);
            /* Straight onto the new hunt's page, where the "+" pockets
               are: the same step a new binder takes. */
            if (huntId) router.push(`/hunts/${huntId}`);
          }}
        />
      )}

      {hunts.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {yours
            ? "Start a hunt and add the cards you are after. Post a Flare into it and the whole hunt follows you, with what is found and what is left."
            : "No hunts yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {hunts.map((hunt) => (
            <li key={hunt.id}>
              <Link
                href={`/hunts/${hunt.id}`}
                className="flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 transition-colors hover:border-border-strong"
              >
                <BinderCover cover={huntCover(hunt.id)} label={hunt.name} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate font-bold text-text-primary">
                    {hunt.name}
                  </span>
                  {/* The chip rides the count line, so the name keeps the row's width. */}
                  <span className="flex items-center gap-2 text-sm text-text-secondary">
                    {huntRowLine(hunt.cards.length, hunt.looking)}
                    {yours && hunt.visibility === "private" && (
                      <span className="shrink-0 text-xs text-text-muted">Private</span>
                    )}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A name, and the hunt exists. Everything else is edited once it does. */
function NewHuntForm({ onDone }: { onDone: (huntId: string | null) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || name.trim().length === 0) return;
        setError(null);
        start(async () => {
          const result = await createHuntAction({ name });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onDone(result.huntId ?? null);
        });
      }}
      className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Hunt name</span>
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          placeholder="Green Zoro"
          autoFocus
          required
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || name.trim().length === 0}>
          {pending ? "Starting…" : "Start hunt"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
