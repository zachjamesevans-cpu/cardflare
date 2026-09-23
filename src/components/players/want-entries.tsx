import Link from "next/link";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import type { PostedWhere } from "@/lib/players/wants";
import { WantNudge, WantRemove } from "@/components/players/want-controls";

/** One outstanding ask, as the room page resolves it. */
export interface OutstandingWant {
  id: string;
  cardId: string;
  /** Looking for it, or offering it. Both live on this list. */
  direction?: "want" | "offering";
  cardName: string;
  cardNumber: string;
  printingLabel: string | null;
  imageUrl: string | null;
  quantity: number;
  note: string | null;
  deckLabel: string | null;
  /**
   * The store this card is live at, or null when it is only saved.
   *
   * The list's two states. "The 'saved wants' section in the settings is
   * kinda redundant, since it's just the flare section, jsut elsewhere" -
   * so there is one list now, the Flare tab's "Flares", and
   * settings has no list at all. This is what makes one enough: a card
   * saved at home and a card on a board tonight are the same row and
   * completely different news.
   */
  /* Where it is up, and how to walk in. See lib/players/wants.ts. */
  postedWhere?: PostedWhere[] | null;
}

/**
 * The rows inside "Still hunting these?", as Server Components.
 *
 * Line for line the stacked Flare row's anatomy — same thumbnail size,
 * same name-and-Remove baseline line, same mono number and printing
 * line, same italic note — because the founder's spec is that opening
 * this panel should read as the stacked view everyone already knows.
 * Being built in the same terms on the same server path as the board
 * is also what keeps the two from drifting apart again: the previous
 * cut re-drew this list client-side and shipped a browser rendering
 * the rows with their text missing.
 *
 * The one addition is the pair of verbs a *saved* ask needs and a
 * room's Flare does not: a plus/minus on the quantity, and a Remove
 * that drops the want from the account for good. Both are plain forms
 * posting to Server Actions, so the list ships no JavaScript and every
 * number on screen is the database's.
 */
export function WantEntries({
  code,
  wants,
  imagesEnabled,
}: {
  code: string;
  wants: OutstandingWant[];
  /** Resolved on the server from NEXT_PUBLIC_ENABLE_CARD_IMAGES. */
  imagesEnabled: boolean;
}) {
  return (
    <ul className="flex flex-col pt-4">
      {wants.map((want) => (
        /* `relative` anchors the controls' pending veil to the row. */
        <li
          key={want.id}
          className="relative flex flex-col border-t border-border py-3 first:border-t-0 first:pt-0"
        >
          <div className="flex items-start gap-3">
            <CardImageZoom
              imageUrl={want.imageUrl}
              exactName={want.cardName}
              cardNumber={want.cardNumber}
              enabled={imagesEnabled}
              anyPrinting={!want.printingLabel}
              caption={want.printingLabel ?? "Any printing"}
              note={want.note}
              lookingFor={want.quantity}
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {/* Name and Remove share one baseline, the board's rule. */}
              <div className="flex items-baseline gap-x-2">
                <p className="min-w-0 font-semibold text-text-primary">
                  {want.cardName}
                </p>
                {want.direction === "offering" && (
                  <span className="shrink-0 rounded-full border border-accent/60 px-2 py-0.5 text-[11px] font-bold text-accent">
                    Offering
                  </span>
                )}
                <WantRemove
                  code={code}
                  target={{
                    wantId: want.id,
                    cardId: want.cardId,
                    direction: want.direction ?? "want",
                  }}
                />
              </div>

              <p className="flex flex-wrap items-center gap-x-2 font-mono text-xs text-text-muted">
                <span>{want.cardNumber}</span>
                <span className="font-sans">
                  {want.printingLabel ?? "Any printing"}
                </span>
                {want.deckLabel && <span className="font-sans">{want.deckLabel}</span>}
                {/* Only a board at a shop is named, tappable, one per
                    shop: "make label tappable so it opens the rooms." A
                    card that is not on a board says nothing here; it is
                    on the list, which is the whole statement. */}
                {want.postedWhere && want.postedWhere.length > 0 && (
                  <span className="font-sans font-semibold text-accent">
                    {want.postedWhere.map((where) =>
                      where.code ? (
                        <Link
                          key={where.name}
                          href={`/e/${where.code}`}
                          className="underline underline-offset-2 hover:text-accent-hover"
                        >
                          Live at {where.name}
                        </Link>
                      ) : (
                        <span key={where.name}>Live at {where.name}</span>
                      ),
                    )}
                  </span>
                )}
              </p>

              {want.note && (
                <p className="text-sm text-text-secondary italic">{want.note}</p>
              )}

              {/*
               * The quantity, shown once, where it can be changed. The
               * board writes ×4 beside the name; here that number is a
               * setting rather than a fact, so it sits between the two
               * buttons that move it. Minus counts all the way down —
               * at one it removes the card outright, the founder's
               * call, so the stepper is never a dead end.
               */}
              <div className="mt-1 flex items-center gap-1.5">
                <WantNudge
                  code={code}
                  target={{
                    wantId: want.id,
                    cardId: want.cardId,
                    direction: want.direction ?? "want",
                  }}
                  delta={-1}
                  quantity={want.quantity}
                  cardName={want.cardName}
                />
                <span className="w-7 text-center text-sm font-semibold text-text-primary tabular-nums">
                  {want.quantity}
                </span>
                <WantNudge
                  code={code}
                  target={{
                    wantId: want.id,
                    cardId: want.cardId,
                    direction: want.direction ?? "want",
                  }}
                  delta={1}
                  quantity={want.quantity}
                  cardName={want.cardName}
                />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
