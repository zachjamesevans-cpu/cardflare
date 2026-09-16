"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Globe, Lock, Pencil, Undo2 } from "lucide-react";

import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import {
  OfferReview,
  selectionSummary,
  useSelection,
  type OfferLine,
} from "@/components/flares/offer-review";
import { ShareProfileButton } from "@/components/players/share-profile-button";
import { Button, buttonStyles } from "@/components/ui/button";
import { Select, TextInput, Textarea } from "@/components/ui/controls";
import { Stepper } from "@/components/ui/stepper";
import { cardImagesEnabled } from "@/lib/cards/images";
import { cn } from "@/lib/cn";
import { setRequestFoundAction, updateHuntAction } from "@/lib/players/hunt-actions";
import { offerOnHuntAction } from "@/lib/players/hunt-offer-actions";
import type { Hunt, HuntCard } from "@/lib/players/hunts";

/**
 * A hunt, open: the description, the progress, and one row per card.
 *
 * The owner ticks copies off here, one at a time or several at once,
 * and can take the last change back for a few seconds. A visitor picks
 * the cards they have and how many, and the offer goes on the posts
 * those cards were flared in. The two never share a control: nothing
 * an owner can press is drawn for anyone else, and the server refuses
 * it anyway.
 *
 * Progress is COPIES; the rows are CARDS. "5 of 10 copies collected"
 * across "3 cards" - the words never swap.
 */

/* The same caps as lib/players/hunts.ts, which is server-only and so
   cannot be imported here. The server clamps regardless. */
const NAME_MAX = 60;
const DESCRIPTION_MAX = 200;
/** How long Undo stays on offer after a change. */
const UNDO_MS = 6000;

export function HuntDetail({
  hunt,
  yours,
  full = false,
  canOffer = true,
}: {
  hunt: Hunt;
  yours: boolean;
  /** On the hunt's own page: no link back to itself. */
  full?: boolean;
  /** A signed-out visitor reads, and is sent to sign in to offer. */
  canOffer?: boolean;
}) {
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [lastChange, setLastChange] = useState<{
    requestId: string;
    previous: number;
    cardName: string;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [collectedOpen, setCollectedOpen] = useState(false);
  const [review, setReview] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  /* The rows, with whatever this screen has written on top of what the
     server sent. Found and remaining follow from the one number. */
  const cards = hunt.cards.map((card) => {
    const foundCopies = overrides[card.requestId] ?? card.foundCopies;
    const remaining = card.needed - foundCopies;
    return { ...card, foundCopies, remaining, found: remaining === 0 };
  });
  const open = cards.filter((card) => !card.found);
  const collected = cards.filter((card) => card.found);
  const ordered = [...open, ...collected];
  const neededCopies = cards.reduce((sum, card) => sum + card.needed, 0);
  const foundCopies = cards.reduce((sum, card) => sum + card.foundCopies, 0);

  const shelf: ZoomCard[] = ordered.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.cardName,
    cardNumber: card.cardNumber,
    caption: card.printingLabel,
    anyPrinting: !card.printingId,
    lookingFor: card.needed,
    stillNeeds: card.remaining,
    youHave: null,
    have: null,
  }));

  const write = (card: HuntCard, value: number, record = true) => {
    const previous = overrides[card.requestId] ?? card.foundCopies;
    const next = Math.max(card.tradedCopies, Math.min(card.needed, Math.round(value)));
    if (next === previous) return;
    setOverrides((current) => ({ ...current, [card.requestId]: next }));
    setError(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (record) {
      setLastChange({ requestId: card.requestId, previous, cardName: card.cardName });
      undoTimer.current = setTimeout(() => setLastChange(null), UNDO_MS);
    } else {
      setLastChange(null);
    }
    start(async () => {
      const result = await setRequestFoundAction(card.requestId, next);
      if (!result.ok) {
        setOverrides((current) => ({ ...current, [card.requestId]: previous }));
        setError(result.error);
        setLastChange(null);
        return;
      }
      if (typeof result.found === "number") {
        const found = result.found;
        setOverrides((current) => ({ ...current, [card.requestId]: found }));
      }
    });
  };

  const undo = () => {
    if (!lastChange) return;
    const card = hunt.cards.find((row) => row.requestId === lastChange.requestId);
    if (card) write(card, lastChange.previous, false);
  };

  /* A visitor's pick: keyed by the Flare, since that is what an offer
     is made on. A card with no open Flare has no key and no box. */
  const remainingFor = (flareId: string) =>
    cards.find((card) => card.flareId === flareId)?.remaining ?? 0;
  const selection = useSelection(remainingFor);
  const lines: OfferLine[] = Object.entries(selection.selected).flatMap(
    ([flareId, quantity]) => {
      const card = cards.find((row) => row.flareId === flareId);
      return card
        ? [
            {
              key: flareId,
              name: card.cardName,
              imageUrl: card.imageUrl,
              printingLabel: card.printingLabel,
              quantity,
            },
          ]
        : [];
    },
  );

  return (
    <div className="flex flex-col gap-3">
      {editing ? (
        <HuntEditForm hunt={hunt} onDone={() => setEditing(false)} />
      ) : (
        <>
          {hunt.description && (
            <p className="text-sm leading-relaxed text-text-secondary">
              {hunt.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <VisibilityChip visibility={hunt.visibility} />
            {yours && (
              <>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={buttonStyles("ghost", "sm")}
                >
                  <Pencil className="size-3.5" aria-hidden="true" />
                  Edit
                </button>
                <Link
                  /* Into the composer with this hunt already chosen, so
                     the cards land on THIS hunt and not a namesake. */
                  href={`/flare?hunt=${encodeURIComponent(hunt.id)}`}
                  className={buttonStyles("secondary", "sm")}
                >
                  Add cards
                </Link>
              </>
            )}
            {(yours || !full) && (
              /* The two "elsewhere" controls travel together, so a narrow
                 screen wraps them as a pair instead of stranding the icon. */
              <span className="ml-auto flex items-center gap-2">
                {yours && (
                  <ShareProfileButton
                    url={`/hunts/${hunt.id}`}
                    title={`${hunt.name} on cardflare`}
                    label="Share hunt"
                    className="size-9"
                  />
                )}
                {!full && (
                  <Link
                    href={`/hunts/${hunt.id}`}
                    className={buttonStyles("ghost", "sm")}
                  >
                    Open
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </span>
            )}
          </div>
        </>
      )}

      <HuntProgress found={foundCopies} needed={neededCopies} />

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {yours && lastChange && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated px-3 py-2 text-sm">
          <span className="min-w-0 truncate text-text-secondary">
            Updated {lastChange.cardName}
          </span>
          <button
            type="button"
            onClick={undo}
            className="flex shrink-0 cursor-pointer items-center gap-1 font-semibold text-accent hover:underline"
          >
            <Undo2 className="size-4" aria-hidden="true" />
            Undo
          </button>
        </div>
      )}

      {cards.length === 0 ? (
        <p className="text-sm text-text-muted">No cards on this hunt yet.</p>
      ) : open.length === 0 ? (
        <p className="text-sm font-semibold text-accent">All found</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {open.map((card, index) => (
            <HuntCardRow
              key={card.requestId}
              card={card}
              shelf={shelf}
              position={index}
              control={
                yours ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => write(card, card.foundCopies + 1)}
                    >
                      +1 found
                    </Button>
                    <Stepper
                      value={card.foundCopies}
                      min={card.tradedCopies}
                      max={card.needed}
                      disabled={pending}
                      label={`copies of ${card.cardName} found`}
                      onChange={(value) => write(card, value)}
                    />
                  </div>
                ) : !card.flareId ? (
                  <span className="text-xs text-text-muted">Not posted yet</span>
                ) : !canOffer ? (
                  <Link
                    href={`/login?next=${encodeURIComponent(`/hunts/${hunt.id}`)}`}
                    className="text-xs font-semibold text-accent hover:underline"
                  >
                    Sign in to offer
                  </Link>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text-primary">
                      <input
                        type="checkbox"
                        checked={selection.has(card.flareId)}
                        onChange={() => selection.toggle(card.flareId as string)}
                        className="size-5 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
                      />
                      I have this
                    </label>
                    {selection.has(card.flareId) && (
                      <Stepper
                        value={selection.quantity(card.flareId)}
                        min={1}
                        max={card.remaining}
                        label={`copies of ${card.cardName} you have`}
                        onChange={(value) =>
                          selection.setQuantity(card.flareId as string, value)
                        }
                      />
                    )}
                  </div>
                )
              }
            />
          ))}
        </ul>
      )}

      {collected.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setCollectedOpen((value) => !value)}
            aria-expanded={collectedOpen}
            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border px-3 py-2 text-left text-sm font-semibold text-text-secondary transition-colors hover:text-text-primary"
          >
            Collected ({collected.length})
            <ChevronDown
              className={cn(
                "size-4 text-text-muted transition-transform",
                collectedOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
          {collectedOpen && (
            <ul className="flex flex-col gap-2">
              {collected.map((card, index) => (
                <HuntCardRow
                  key={card.requestId}
                  card={card}
                  shelf={shelf}
                  position={open.length + index}
                  control={
                    yours ? (
                      card.tradedAway ? (
                        <span className="text-xs text-text-muted">Traded</span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          /* One copy short again: the row goes back to
                             the open list with everything else intact. */
                          onClick={() => write(card, card.needed - 1)}
                        >
                          Reopen
                        </Button>
                      )
                    ) : null
                  }
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {!yours && selection.count > 0 && (
        <HuntOfferFooter
          cards={selection.count}
          copies={selection.copies}
          onContinue={() => setReview(true)}
        />
      )}
      {!yours && (
        <OfferReview
          open={review}
          onClose={() => setReview(false)}
          lines={lines}
          onSubmit={(message) =>
            offerOnHuntAction(
              hunt.id,
              lines.map((line) => ({ flareId: line.key, quantity: line.quantity })),
              message,
            )
          }
          onSent={selection.clear}
        />
      )}
    </div>
  );
}

/** "5 of 10 copies collected", and the bar that says the same. */
export function HuntProgress({ found, needed }: { found: number; needed: number }) {
  const percent = needed > 0 ? Math.round((found / needed) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold text-text-secondary tabular-nums">
        {found} of {needed} {needed === 1 ? "copy" : "copies"} collected
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={found}
        aria-label="Copies collected"
        className="h-1.5 w-full overflow-hidden rounded-full bg-elevated"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function VisibilityChip({ visibility }: { visibility: "public" | "private" }) {
  const Icon = visibility === "public" ? Globe : Lock;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-text-muted">
      <Icon className="size-3" aria-hidden="true" />
      {visibility === "public" ? "Public" : "Private"}
    </span>
  );
}

/**
 * One card of the hunt: the picture, the name, which printing, and the
 * two numbers. Whatever can be pressed on it arrives as `control`, so
 * the row itself never knows whose screen it is on.
 */
export function HuntCardRow({
  card,
  shelf,
  position,
  control,
}: {
  card: HuntCard;
  shelf: ZoomCard[];
  position: number;
  control: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-2.5",
        card.found && "opacity-80",
      )}
    >
      <div className="flex items-start gap-3">
        <CardImageZoom
          imageUrl={card.imageUrl}
          exactName={card.cardName}
          cardNumber={card.cardNumber}
          enabled={cardImagesEnabled()}
          caption={card.printingLabel}
          anyPrinting={!card.printingId}
          lookingFor={card.needed}
          stillNeeds={card.remaining}
          siblings={shelf}
          position={position}
          thumb={
            <span className="block h-14 w-10 overflow-hidden rounded-[6px] border border-border bg-elevated">
              {card.imageUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={card.imageUrl} alt="" className="size-full object-cover" />
              )}
            </span>
          }
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-sm font-semibold text-text-primary">
            {card.cardName}
          </p>
          <p className="truncate text-xs text-text-muted">
            {card.printingLabel ?? "Any printing"}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums">
            <span className="text-text-secondary">
              {card.foundCopies} of {card.needed} found
            </span>
            {card.found ? (
              <span className="font-semibold text-accent">Found</span>
            ) : (
              <span className="font-semibold text-accent">
                Need {card.remaining} more
              </span>
            )}
          </p>
        </div>
      </div>
      {control && <div className="pl-[3.25rem]">{control}</div>}
    </li>
  );
}

/** The bar at the foot of a visitor's pick: what is chosen, and the way on. */
export function HuntOfferFooter({
  cards,
  copies,
  onContinue,
}: {
  cards: number;
  copies: number;
  onContinue: () => void;
}) {
  return (
    <div className="sticky bottom-24 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-accent/40 bg-surface/95 p-3 shadow-[var(--shadow-card)] backdrop-blur">
      <p className="min-w-0 text-sm font-semibold text-text-primary tabular-nums">
        {selectionSummary(cards, copies)}
      </p>
      <Button type="button" size="sm" onClick={onContinue} className="shrink-0">
        Continue to offer
      </Button>
    </div>
  );
}

/** Name, description and who can see it. The owner only. */
function HuntEditForm({ hunt, onDone }: { hunt: Hunt; onDone: () => void }) {
  const [name, setName] = useState(hunt.name);
  const [description, setDescription] = useState(hunt.description ?? "");
  const [visibility, setVisibility] = useState(hunt.visibility);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        setError(null);
        start(async () => {
          const result = await updateHuntAction(hunt.id, {
            name,
            description: description || null,
            visibility,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onDone();
        });
      }}
      className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-3"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Name</span>
        <TextInput
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          required
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">
          Description <span className="font-normal text-text-muted">Optional</span>
        </span>
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={2}
          className="min-h-0"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Who can see it</span>
        <Select
          value={visibility}
          onChange={(event) =>
            setVisibility(event.target.value === "private" ? "private" : "public")
          }
        >
          <option value="public">Public</option>
          <option value="private">Private</option>
        </Select>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || name.trim().length === 0}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
