import { Handshake, MapPin } from "lucide-react";

import { PlayerAvatar } from "@/components/players/player-avatar";
import { Button } from "@/components/ui/button";
import { offerTradeAction, withdrawOfferAction } from "@/lib/matching/actions";
import { MAX_OFFER_MESSAGE, type Offer } from "@/lib/matching/schema";
import { confirmTradeAction } from "@/lib/trades/actions";

/**
 * The two sides of an offer, rendered inside a Flare row.
 *
 * Server Components throughout: the forms post to Server Actions, so a board
 * of forty rows still ships no JavaScript for any of this. The message field
 * lives behind a native `<details>` for the same reason — the closed state
 * costs nothing and opening it needs no hydration.
 */

/** What the holder sees on a Flare they can answer. */
export function OfferPanel({
  code,
  flareId,
  ownOffer,
}: {
  code: string;
  flareId: string;
  /** The viewer's own standing offer on this Flare, when they have one. */
  ownOffer?: Offer;
}) {
  if (ownOffer) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-3 py-2">
        <p className="min-w-0 flex-1 basis-40 text-sm text-text-secondary">
          <span className="font-medium text-accent">You offered.</span>{" "}
          {ownOffer.message
            ? `They were told: “${ownOffer.message}”`
            : "They can see your name, so keep an eye out."}
        </p>

        <form action={withdrawOfferAction} className="shrink-0">
          <input type="hidden" name="code" value={code} />
          <input type="hidden" name="flareId" value={flareId} />
          <Button type="submit" variant="ghost" size="sm">
            Withdraw
          </Button>
        </form>
      </div>
    );
  }

  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
        <Handshake className="size-4" aria-hidden="true" />
        Offer to trade
      </summary>

      <form
        action={offerTradeAction}
        className="mt-2 flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="flareId" value={flareId} />
        {/*
         * Optional on purpose, and the placeholder is the whole instruction.
         * A full labelled Field is heavier than this deserves — it is one
         * throwaway line inside a row, not a form of record.
         */}
        <input
          type="text"
          name="message"
          maxLength={MAX_OFFER_MESSAGE}
          placeholder="Where to find you? (optional)"
          aria-label="Where can they find you?"
          className="w-full min-w-0 flex-1 basis-52 rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-border-strong focus:border-accent focus:outline-none sm:w-auto"
        />
        <Button type="submit" size="sm" className="shrink-0">
          Offer
        </Button>
      </form>
    </details>
  );
}

/**
 * What the Flare's author sees once somebody has raised a hand — and the
 * button that closes the loop. "We traded" writes the trade with this
 * partner and closes the Flare; the offer row is the proof they said "I
 * have this", which is what entitles them to appear in the history.
 */
export function OfferList({
  offers,
  code,
  flareId,
}: {
  offers: Offer[];
  code: string;
  flareId: string;
}) {
  return (
    <ul className="mt-2 flex flex-col gap-1.5">
      {offers.map((offer) => (
        <li
          key={offer.responderSessionId}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-3 py-2 text-sm"
        >
          <PlayerAvatar
            displayName={offer.displayName ?? "?"}
            seed={offer.responderSessionId}
            size="sm"
          />
          <span className="font-semibold text-text-primary">
            {offer.displayName ?? "A player"}
          </span>
          <span className="text-text-secondary">has this. Go find them.</span>

          {offer.message && (
            <span className="flex min-w-0 items-center gap-1 text-text-secondary">
              <MapPin className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
              <span className="truncate italic">{offer.message}</span>
            </span>
          )}

          {!offer.present && (
            <span className="text-xs text-text-muted">away right now</span>
          )}

          <form action={confirmTradeAction} className="ml-auto shrink-0">
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="flareId" value={flareId} />
            <input
              type="hidden"
              name="partnerSessionId"
              value={offer.responderSessionId}
            />
            <Button type="submit" variant="secondary" size="sm">
              We traded
            </Button>
          </form>
        </li>
      ))}
    </ul>
  );
}

/**
 * The tally for a trade that happened without an offer — somebody read the
 * board and just walked over, which is the core loop working as designed.
 * Quiet on purpose: it closes the Flare, so it should never look like the
 * row's main action.
 */
export function MarkTraded({ code, flareId }: { code: string; flareId: string }) {
  return (
    <form action={confirmTradeAction} className="mt-1.5">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="flareId" value={flareId} />
      <button
        type="submit"
        className="text-sm text-text-muted underline underline-offset-4 transition-colors hover:text-text-secondary"
      >
        Traded it? Mark it done
      </button>
    </form>
  );
}
