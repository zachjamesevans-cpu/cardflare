"use client";

import { LocateFixed, Plus } from "lucide-react";

import { FlareFeedCard } from "@/components/feed/flare-feed-card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { chosenPrinting, type Draft, type HuntChoice } from "@/components/flares/draft";
import { cn } from "@/lib/cn";
import { printingLabel } from "@/lib/cards/schema";
import type { FeedCard, HuntItem } from "@/lib/feed/repository";

/**
 * The post, before it is one.
 *
 * Built into the exact shape the Feed reads and drawn by the exact
 * component the Feed draws, so what is previewed is what goes up. Back
 * returns to the composer with the draft untouched; "Post flare" is
 * the one button that writes anything.
 */
export function FlareComposerPreview({
  draft,
  viewer,
  huntName,
  hunts,
  onHunt,
  onBack,
  onPost,
  pending,
  error,
}: {
  draft: Draft;
  viewer: { id: string; displayName: string; avatarUrl: string | null };
  huntName: string | null;
  /** Their hunts, for "Add to a hunt"; null when the post is an offer. */
  hunts: { id: string; name: string }[] | null;
  onHunt: (hunt: HuntChoice) => void;
  onBack: () => void;
  onPost: () => void;
  pending: boolean;
  error: string | null;
}) {
  const cards: FeedCard[] = draft.cards.map((item) => {
    const printing = item.printingId ? chosenPrinting(item) : null;
    const art = chosenPrinting(item);
    return {
      cardId: item.card.id,
      cardName: item.card.exactName,
      cardNumber: item.card.canonicalCardNumber,
      imageUrl: art?.imageUrl ?? null,
      match: null,
      state: "open",
      youOffered: false,
      printingId: item.printingId,
      printingLabel: printing ? printingLabel(printing, item.card.exactName) : null,
      quantity: item.quantity,
      remaining: item.quantity,
      huntRequestId: null,
    };
  });
  const copies = cards.reduce((sum, card) => sum + (card.quantity ?? 1), 0);
  const hunt =
    draft.intent === "want" && huntName ? { id: "preview", name: huntName } : null;

  const item: HuntItem = {
    kind: "hunt",
    postId: "preview",
    likes: 0,
    comments: 0,
    liked: false,
    code: null,
    storeName: null,
    eventName: null,
    playerId: viewer.id,
    displayName: viewer.displayName,
    avatarUrl: viewer.avatarUrl,
    frame: null,
    ring: null,
    direction: draft.intent,
    deckLabel: huntName,
    postedAt: new Date().toISOString(),
    milesAway: null,
    storeId: null,
    acceptsTrade: draft.acceptsTrade,
    acceptsCash: draft.acceptsCash,
    note: draft.caption.trim() || null,
    offers: 0,
    hunt,
    remainingCopies: copies,
    completed: false,
    cards,
    total: cards.length,
    youCanAnswer: 0,
    yours: true,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-text-primary">Preview</h2>
        <p className="text-sm text-text-secondary">
          This is how it will read in the Feed.
        </p>
      </div>

      <FlareFeedCard item={item} preview />

      {hunts && <HuntPicker hunts={hunts} value={draft.hunt} onChange={onHunt} />}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onBack} disabled={pending}>
          Back
        </Button>
        <Button type="button" onClick={onPost} disabled={pending} className="flex-1">
          {pending ? "Posting…" : "Post flare"}
        </Button>
      </div>
    </div>
  );
}

/**
 * "Add to a hunt", on the preview: no hunt, one of theirs, or a new one
 * by name. It used to be a dropdown in the middle of the compose step;
 * the founder: "a bit small and kinda sticks out... maybe it gets moved
 * somewhere to the preview screen." Here it sits under the post it
 * changes, and the post above shows the hunt line as soon as one is
 * picked. The app's preview draws the same panel.
 */
function HuntPicker({
  hunts,
  value,
  onChange,
}: {
  hunts: { id: string; name: string }[];
  value: HuntChoice;
  onChange: (hunt: HuntChoice) => void;
}) {
  const chip = (on: boolean) =>
    cn(
      "cursor-pointer rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors",
      on
        ? "border-accent bg-accent text-accent-contrast"
        : "border-border-strong text-text-secondary hover:text-text-primary",
    );

  return (
    <fieldset className="flex flex-col gap-2.5 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
      <legend className="sr-only">Add to a hunt</legend>
      <div className="flex items-center gap-2">
        <LocateFixed className="size-[18px] shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-text-primary">Add to a hunt</span>
          <span className="text-xs text-text-muted">
            Building a deck? Keep these cards together with what is found.
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={value.kind === "none"}
          onClick={() => onChange({ kind: "none" })}
          className={chip(value.kind === "none")}
        >
          No hunt
        </button>
        {hunts.map((hunt) => {
          const on = value.kind === "existing" && value.id === hunt.id;
          return (
            <button
              key={hunt.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange({ kind: "existing", id: hunt.id })}
              className={chip(on)}
            >
              {hunt.name}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={value.kind === "new"}
          onClick={() =>
            onChange({ kind: "new", name: value.kind === "new" ? value.name : "" })
          }
          className={cn(
            chip(false),
            "flex items-center gap-1 border-dashed",
            value.kind === "new" && "border-accent",
          )}
        >
          <Plus className="size-3.5 text-accent" aria-hidden="true" />
          New hunt
        </button>
      </div>
      {value.kind === "new" && (
        <TextInput
          value={value.name}
          onChange={(event) =>
            onChange({ kind: "new", name: event.target.value.slice(0, 60) })
          }
          maxLength={60}
          placeholder="Hunt name, like Green Zoro"
          aria-label="Hunt name"
          autoFocus
        />
      )}
      {value.kind === "existing" && (
        <p className="text-xs text-text-muted">
          Cards already on the hunt keep their copies; new cards are added.
        </p>
      )}
    </fieldset>
  );
}
