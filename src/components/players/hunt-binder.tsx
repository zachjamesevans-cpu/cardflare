"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Crosshair, Pencil } from "lucide-react";

import {
  AddPocket,
  EmptyPocket,
  POCKETS_PER_PAGE,
  PageArrow,
  PageDots,
  PocketTile,
} from "@/components/binder/pockets";
import {
  CardImageZoom,
  OfferPicksContext,
  type OfferBuild,
  type ZoomCard,
} from "@/components/cards/card-image-zoom";
import { OfferReview } from "@/components/flares/offer-review";
import {
  HuntEditForm,
  HuntOfferFooter,
  HuntProgress,
  HuntSentLine,
  UndoLine,
  useHuntOffer,
  useHuntProgress,
  type LiveHuntCard,
} from "@/components/players/hunt-detail";
import { ShareProfileButton } from "@/components/players/share-profile-button";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { wantsLine } from "@/lib/feed/offer-copy";
import { huntRowLine } from "@/lib/players/hunt-copy";
import type { HuntView } from "@/lib/players/hunts";

/**
 * A hunt, open: drawn like a binder.
 *
 * The founder: "Do you think the Hunts feature should just be binders
 * instead of lists? So it's all kinda the same language." A hunt
 * stays a hunt on the server (cards wanted, Flares posted from it,
 * offers made on it); what changed is the drawing. The crosshair and
 * the name at the top, the progress bar, and under it the binder's
 * page: three by three pockets on the binder-page background, arrows
 * at the sides, dots under. The geometry comes from pockets.tsx, the
 * same module the binder page draws from, so the two cannot drift.
 * The app's hunt-binder.tsx is the same screen.
 *
 * A pocket is a card the hunt wants. Its art fills the pocket. With
 * every copy found it dims and wears a small accent check at the top
 * right; wanting more than one copy and short of them, it wears a
 * "found/needed" chip at the bottom right; one copy wanted and still
 * open, nothing. There is no hold to move: a hunt has no order of its
 * own.
 *
 * The owner's empty pockets are "+" pockets into the Flare composer
 * with this hunt chosen, and the trailing page always has them, as on
 * a binder. A tap on a filled pocket opens Update progress for that
 * one card: the art, the facts, the one stepper, and Undo. A visitor
 * taps a pocket and gets the card large, in the same viewer every
 * other card opens in, with the Feed's "I have this card" under it;
 * the picks are this page's own and outlive the viewer, the footer
 * under the pages says how many are in the offer, and the review is
 * where the number is raised and the offer goes. A found card cannot
 * be picked. Signed out, the viewer opens and "Sign in to offer" sits
 * under the pages.
 */
export function HuntBinder({
  hunt,
  yours,
  canOffer,
  imagesEnabled,
}: {
  hunt: HuntView;
  yours: boolean;
  /** A signed-out visitor reads, and is sent to sign in to offer. */
  canOffer: boolean;
  imagesEnabled: boolean;
}) {
  const progress = useHuntProgress(hunt);
  const { cards } = progress;
  const offer = useHuntOffer(hunt, cards);
  const [at, setAt] = useState(0);
  const [editing, setEditing] = useState(false);
  /** The owner's open pocket: the request whose progress is being updated. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** What has gone this session, by request, so the viewer can say so. */
  const [sends, setSends] = useState<OfferBuild["sends"]>({});

  const perPage = POCKETS_PER_PAGE;
  /* The owner always has an empty pocket in reach: when the last page
     is full (or there are no cards), one more page of "+" pockets. */
  const pages = yours
    ? Math.floor(cards.length / perPage) + 1
    : Math.max(1, Math.ceil(cards.length / perPage));
  const page = Math.min(at, pages - 1);
  const shown = cards.slice(page * perPage, page * perPage + perPage);
  const pockets: (LiveHuntCard | null)[] = [
    ...shown,
    ...Array.from({ length: perPage - shown.length }, () => null),
  ];

  const looking = cards.filter((card) => !card.found).length;
  const neededCopies = cards.reduce((sum, card) => sum + card.needed, 0);
  const foundCopies = cards.reduce((sum, card) => sum + card.foundCopies, 0);
  const line = hunt.description || huntRowLine(cards.length, looking);

  /* The pocket the owner has open, read from the live rows so the
     numbers in the sheet move with the stepper. */
  const open = openId
    ? (cards.find((card) => card.requestId === openId) ?? null)
    : null;

  /**
   * The viewer's picks, keyed by request, as the Feed keys its by
   * Flare: the hunt page's own store, handed to every pocket's viewer
   * through the same context a post uses, so a pick survives the
   * viewer closing and reads the same from whichever card it is
   * reopened on. The review under the pages sends through the hunt's
   * offer action.
   */
  const nameOf = (requestId: string) =>
    cards.find((card) => card.requestId === requestId)?.cardName ?? requestId;
  const picks: OfferBuild = {
    picks: offer.selection.selected,
    count: offer.selection.count,
    sends,
    toggle: offer.selection.toggle,
    setQuantity: offer.selection.setQuantity,
    remove: offer.selection.remove,
    clear: offer.selection.clear,
    reviewOpen: offer.review,
    openReview: () => offer.setReview(true),
    closeReview: () => offer.setReview(false),
    lines: offer.lines,
    submit: async (message) => {
      const keys = offer.lines.map((line) => line.key);
      const outcome = await offer.submit(message);
      if (outcome.ok) {
        const refused = new Set(outcome.refused);
        const record = {
          count: keys.length - outcome.refused.length,
          notTaken: outcome.refused.map(nameOf),
        };
        setSends((current) => {
          const next = { ...current };
          for (const key of keys) if (!refused.has(key)) next[key] = record;
          return next;
        });
      }
      return outcome;
    },
  };

  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.cardName,
    cardNumber: card.cardNumber,
    caption: card.printingLabel,
    anyPrinting: !card.printingId,
    lookingFor: card.needed,
    stillNeeds: card.remaining,
    youHave: null,
    /* The pick control, for a signed-in visitor on a card still open.
       A found card cannot be picked, so it carries none. */
    have:
      !yours && canOffer && !card.found
        ? {
            postId: hunt.id,
            flareId: card.requestId,
            state: "open",
            youOffered: false,
          }
        : null,
  }));

  return (
    <div className="flex w-full flex-col gap-4">
      {/* The title row: the crosshair and the name on the left; on the
          right the owner's pencil and Share, or the owner's name and
          Share for a visitor. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Crosshair className="mt-1 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate text-xl leading-tight font-extrabold text-text-primary">
              {hunt.name}
            </h1>
            <p className="text-sm text-text-secondary">{line}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {yours ? (
            <button
              type="button"
              aria-label="Edit hunt"
              onClick={() => setEditing(true)}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
          ) : (
            <Link
              href={`/p/${hunt.playerId}`}
              className="max-w-32 truncate text-sm font-semibold text-text-secondary hover:text-text-primary hover:underline"
            >
              {hunt.ownerName}
            </Link>
          )}
          <ShareProfileButton
            url={`/hunts/${hunt.id}`}
            title={`${hunt.name} on cardflare`}
            label="Share hunt"
            className="size-9"
          />
        </div>
      </div>

      <HuntProgress found={foundCopies} needed={neededCopies} />

      {progress.error && (
        <p role="alert" className="text-sm text-danger">
          {progress.error}
        </p>
      )}
      {yours && progress.lastChange && !open && (
        <UndoLine
          label={`Updated ${progress.lastChange.cardName}`}
          onUndo={progress.undo}
        />
      )}

      {/* The page: pockets on the binder-page background, the arrows
          over its middle. The picks context wraps it so every pocket's
          viewer reads the same offer. */}
      <OfferPicksContext.Provider value={picks}>
        <div className="cfa-bg-binder-page relative overflow-hidden rounded-[var(--radius-card)] p-3 shadow-[var(--shadow-card)]">
          <ul
            className="grid grid-cols-3 gap-2"
            aria-label={`Page ${page + 1} of ${pages}`}
          >
            {pockets.map((card, index) => (
              <li
                key={card ? card.requestId : `empty-${page}-${index}`}
                className="relative rounded-[5px]"
              >
                {card ? (
                  yours ? (
                    <button
                      type="button"
                      onClick={() => setOpenId(card.requestId)}
                      aria-label={`${card.cardName}, ${card.foundCopies} of ${card.needed} found`}
                      className="block w-full cursor-pointer rounded-[5px] focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
                    >
                      <HuntPocket card={card} imagesEnabled={imagesEnabled} />
                    </button>
                  ) : (
                    <CardImageZoom
                      imageUrl={card.imageUrl}
                      exactName={card.cardName}
                      cardNumber={card.cardNumber}
                      caption={card.printingLabel}
                      anyPrinting={!card.printingId}
                      lookingFor={card.needed}
                      stillNeeds={card.remaining}
                      enabled={imagesEnabled}
                      siblings={shelf}
                      position={cards.indexOf(card)}
                      thumbClassName="w-full"
                      thumb={<HuntPocket card={card} imagesEnabled={imagesEnabled} />}
                    />
                  )
                ) : yours ? (
                  <AddPocket href={`/flare?hunt=${encodeURIComponent(hunt.id)}`} />
                ) : (
                  <EmptyPocket />
                )}
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <>
              <PageArrow
                side="prev"
                disabled={page === 0}
                onClick={() => setAt(page - 1)}
              />
              <PageArrow
                side="next"
                disabled={page === pages - 1}
                onClick={() => setAt(page + 1)}
              />
            </>
          )}
        </div>
      </OfferPicksContext.Provider>

      {pages > 1 && <PageDots pages={pages} page={page} onPick={setAt} />}

      {cards.length === 0 && (
        <p className="text-center text-sm text-text-muted">
          No cards on this hunt yet.
        </p>
      )}

      {!yours && !canOffer && looking > 0 && (
        <Link
          href={`/login?next=${encodeURIComponent(`/hunts/${hunt.id}`)}`}
          className="text-center text-sm font-semibold text-accent hover:underline"
        >
          Sign in to offer
        </Link>
      )}

      {!yours && offer.selection.count > 0 && (
        <HuntOfferFooter
          cards={offer.selection.count}
          copies={offer.selection.copies}
          onContinue={() => offer.setReview(true)}
        />
      )}
      {!yours && offer.sent && (
        <HuntSentLine outcome={offer.sent} ownerName={hunt.ownerName} />
      )}
      {!yours && (
        <OfferReview
          key={offer.reviewKey}
          open={offer.review}
          onClose={() => offer.setReview(false)}
          lines={offer.lines}
          onQuantity={offer.selection.setQuantity}
          onRemove={offer.selection.remove}
          onSubmit={picks.submit}
          onSent={offer.onSent}
        />
      )}

      {yours && (
        <>
          <Sheet open={editing} onClose={() => setEditing(false)} title="Edit hunt">
            <HuntEditForm hunt={hunt} onDone={() => setEditing(false)} />
          </Sheet>
          <Sheet
            open={open !== null}
            onClose={() => setOpenId(null)}
            title="Update progress"
          >
            {open && (
              <ProgressSheet
                card={open}
                pending={progress.pending}
                onChange={(value) => progress.write(open, value)}
                undoLabel={
                  progress.lastChange?.requestId === open.requestId
                    ? `Updated ${progress.lastChange.cardName}`
                    : null
                }
                onUndo={progress.undo}
              />
            )}
          </Sheet>
        </>
      )}
    </div>
  );
}

/**
 * "Update progress" for one card, the owner's tap on a pocket: the
 * art on the left (the round 16b shape, 88 x 123), the name, the
 * number and printing, how many are found, and the one Stepper,
 * writing through the hunt's existing progress write with the Undo
 * line under it. There is no "Remove from hunt" here because the
 * server has no such action; nothing is invented for it.
 */
function ProgressSheet({
  card,
  pending,
  onChange,
  undoLabel,
  onUndo,
}: {
  card: LiveHuntCard;
  pending: boolean;
  onChange: (value: number) => void;
  undoLabel: string | null;
  onUndo: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-stretch gap-3">
        {/* The art down the left, one aligned column beside it. */}
        <span className="block h-[7.75rem] w-[5.5rem] shrink-0 overflow-hidden rounded-[8px] border border-border bg-elevated">
          {card.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={card.imageUrl} alt="" className="size-full object-cover" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="truncate text-sm font-semibold text-text-primary">
            {card.cardName}
          </p>
          <p className="truncate text-xs text-text-muted">
            {card.cardNumber} · {card.printingLabel ?? "Any printing"}
          </p>
          <p className="text-xs text-text-muted">
            <span className="text-text-secondary tabular-nums">
              {card.foundCopies} of {card.needed} found
            </span>
            <span aria-hidden="true"> · </span>
            <span className="font-semibold text-accent tabular-nums">
              {wantsLine(card.needed, card.remaining)}
            </span>
          </p>
          {/* The stepper is the one control: the audit of 2026-10-03
              found the plus-one button beside its plus to be the same
              button twice, so it went. */}
          <Stepper
            value={card.foundCopies}
            min={card.tradedCopies}
            max={card.needed}
            disabled={pending}
            label={`copies of ${card.cardName} found`}
            onChange={onChange}
          />
          {card.tradedAway && <span className="text-xs text-text-muted">Traded</span>}
        </div>
      </div>
      {undoLabel && <UndoLine label={undoLabel} onUndo={onUndo} />}
    </div>
  );
}

/**
 * One pocket of the hunt: the card's art, and what the hunt knows
 * about it. Found: dimmed, with the check. Wanting more than one and
 * short: the "found/needed" chip. One wanted and open: nothing.
 */
function HuntPocket({
  card,
  imagesEnabled,
}: {
  card: LiveHuntCard;
  imagesEnabled: boolean;
}) {
  return (
    <PocketTile
      card={{ name: card.cardName, number: card.cardNumber, imageUrl: card.imageUrl }}
      imagesEnabled={imagesEnabled}
      dim={card.found}
    >
      {card.found ? (
        <span
          aria-label="Found"
          className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-accent text-accent-contrast ring-1 ring-canvas/60"
        >
          <Check className="size-3" aria-hidden="true" />
        </span>
      ) : card.needed > 1 ? (
        <span className="absolute right-1 bottom-1 rounded-full bg-canvas/85 px-1.5 py-px text-[9px] font-bold text-text-primary tabular-nums ring-1 ring-border-strong">
          {card.foundCopies}/{card.needed}
        </span>
      ) : null}
    </PocketTile>
  );
}
