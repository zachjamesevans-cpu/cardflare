"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Crosshair, Layers, Plus } from "lucide-react";

import { HuntDetail } from "@/components/players/hunt-detail";
import { Button, buttonStyles } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { remainingLabel } from "@/lib/flares/draft-rules";
import { createHuntAction } from "@/lib/players/hunt-actions";
import type { Hunt } from "@/lib/players/hunts";

/**
 * Somebody's hunts, on their profile.
 *
 * A hunt is a persistent named list: "Green Zoro", "Wishlist upgrades".
 * Each row is closed by default and says the one thing worth reading
 * shut - what is left - and opens onto the full list with its progress.
 * Three rows at most, so a profile with a dozen hunts is still a
 * profile; the rest are one press away, and every hunt has a page of
 * its own at /hunts/<id> for sharing.
 *
 * The owner starts a hunt here, edits it here and ticks copies off
 * here. A visitor picks the cards they have and offers them, on the
 * posts those cards were flared in. Neither sees the other's controls.
 */

/** How many rows the profile shows before "See all". */
const SHOWN = 3;

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
  /* One open at a time: two open hunts are two lists and a scroll. The
     first opens itself so the panel is never a row of closed lids. */
  /*
   * CLOSED UNTIL ASKED.
   *
   * The first folder used to open itself, on the argument that a panel
   * of closed lids shows nothing. The founder, opening somebody else's
   * profile: "it immediately unnests their top hunt holder. dont do
   * that."
   *
   * Right - a profile is a thing you glance at, and the top hunt
   * springing open makes one arbitrary folder the loudest thing on
   * somebody's page. Closed is also the only state that reads the same
   * whoever is looking.
   */
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [creating, setCreating] = useState(false);

  const atLimit = limit !== undefined && hunts.length >= limit;
  const shown = showAll ? hunts : hunts.slice(0, SHOWN);
  const hidden = hunts.length - shown.length;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-semibold text-text-primary">
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
            if (huntId) setOpen(huntId);
          }}
        />
      )}

      {hunts.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {yours
            ? "Start a hunt and add the cards you are after. Post a Flare into it and the whole list follows you, with what is found and what is left."
            : "No hunts yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((hunt) => (
            <HuntRow
              key={hunt.id}
              hunt={hunt}
              open={open === hunt.id}
              onToggle={() => setOpen(open === hunt.id ? null : hunt.id)}
              yours={Boolean(yours)}
            />
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={buttonStyles("ghost", "sm")}
        >
          See all {hunts.length} hunts
        </button>
      )}
      {showAll && hunts.length > SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className={buttonStyles("ghost", "sm")}
        >
          Show fewer
        </button>
      )}
    </section>
  );
}

/**
 * "5 copies left · 2 cards", or "All found". Copies and cards are two
 * numbers and both are said, because a hunt for one card in four copies
 * and a hunt for four cards are different amounts of help to give.
 */
export function lookingLabel(hunt: Hunt): string {
  if (hunt.cards.length === 0) return "No cards yet";
  return remainingLabel(hunt.cards);
}

/** One hunt, shut or open. Shut is a lid; open is the whole list. */
function HuntRow({
  hunt,
  open,
  onToggle,
  yours,
}: {
  hunt: Hunt;
  open: boolean;
  onToggle: () => void;
  yours: boolean;
}) {
  const previews = hunt.cards.slice(0, 3);
  const finished = hunt.cards.length > 0 && hunt.lookingCopies === 0;

  return (
    <li
      className={cn(
        "rounded-[var(--radius-control)] border bg-elevated",
        open ? "border-accent" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-control)] px-3 py-2.5 text-left transition-colors hover:bg-surface/60"
      >
        {previews.length > 0 ? (
          <span className="flex shrink-0 -space-x-3" aria-hidden="true">
            {previews.map((card) => (
              <span
                key={card.requestId}
                className="block h-10 w-7 overflow-hidden rounded-[4px] border border-border bg-surface ring-1 ring-surface"
              >
                {card.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={card.imageUrl} alt="" className="size-full object-cover" />
                )}
              </span>
            ))}
          </span>
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface">
            <Layers className="size-4 text-text-muted" aria-hidden="true" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-text-primary">{hunt.name}</span>
          <span
            className={cn(
              "truncate text-xs tabular-nums",
              finished ? "text-text-muted" : "text-accent",
            )}
          >
            {lookingLabel(hunt)}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-text-muted transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 pt-3 pb-3">
          <HuntDetail hunt={hunt} yours={yours} />
        </div>
      )}
    </li>
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
