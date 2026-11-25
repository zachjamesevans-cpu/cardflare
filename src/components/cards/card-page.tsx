import Link from "next/link";
import { CardArtCarousel } from "@/components/cards/card-art-carousel";
import { FlaredArtPill } from "@/components/cards/flared-art-pill";
import type { ReactNode } from "react";
import { Crosshair, Layers, Store } from "lucide-react";

import { MessageButton } from "@/components/players/message-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge } from "@/components/ui/card";
import { isRenderableImageUrl } from "@/lib/cards/images";
import type { CardPage, CardPagePlayer } from "@/lib/cards/card-page";
import { demandLine } from "@/lib/cards/demand-copy";
import { gameShortName } from "@/lib/players/games-catalog";

/**
 * One card, on a page of its own: /cards/<cardId>, reached from a
 * search result. The app's Card screen is this page.
 *
 * Top to bottom: the card; what is true of it for you; who has it in
 * a binder up for trade, nearest first; who is hunting it; which
 * stores have it in the case or on the counter. Every row is a door:
 * a holder's profile and the Message button, a hunter's Flare or
 * hunt, a store's page. Nothing here is invented: every row comes
 * from the page object the server built, and an empty section says
 * so in words rather than drawing a sample.
 *
 * "Near you" and "nearby" are in the headings only when the viewer
 * has a postal code, because without one there is no distance to
 * sort by and the words would promise one.
 */
/**
 * "3 players have it near you": a list is shown only when it has someone
 * in it, led by how many (the founder: "i don't like all that text at the
 * bottom"). The app's card sheet says the same.
 */
function countHeading(
  count: number,
  one: string,
  many: string,
  where: string | null,
): string {
  return [String(count), count === 1 ? one : many, where].filter(Boolean).join(" ");
}

export function CardPageView({
  page,
  viewerId,
  imagesEnabled,
  prices,
}: {
  page: CardPage;
  /** Market prices, streamed in under the card (card-prices-section.tsx). */
  prices?: ReactNode;
  /** Null signed out: the You block becomes the way in. */
  viewerId: string | null;
  imagesEnabled: boolean;
}) {
  const { card, you, located, holders, hunters, stores } = page;
  const standing = demandLine(page.demand);
  const href = `/cards/${card.cardId}`;
  /* Only arts this site may draw (the image allow-list). */
  const arts = (card.arts ?? []).filter((entry) =>
    isRenderableImageUrl(entry.imageUrl),
  );

  return (
    <div className="flex w-full flex-col gap-5">
      {/* The card: every art of it, swiped (card-art-carousel.tsx), then
          the name, number and game centred under it - the app's sheet. */}
      <div className="flex flex-col items-center gap-3">
        <CardArtCarousel arts={imagesEnabled ? arts : []} name={card.name} />
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-xl leading-tight font-extrabold text-text-primary">
            {card.name}
          </h1>
          {/* The art on show is on your Flares: a "Flared" tag on the
              number's own line, so swiping between arts never moves what
              is below (the founder: "the height changes on the market
              price"). The app's sheet is the same. */}
          <p className="flex min-h-5 items-center gap-2 text-sm text-text-secondary">
            {card.number} · {gameShortName(card.game)}
            {you && you.wantedPrintings.length > 0 && (
              <FlaredArtPill
                wantedPrintings={you.wantedPrintings}
                firstArt={arts[0]?.printingIds ?? []}
              />
            )}
          </p>
          {standing && (
            <p className="text-sm font-semibold text-text-secondary">{standing}</p>
          )}
        </div>
      </div>

      {prices}

      {/* You: one line per true fact, then the one control. Signed out,
          the way in, back to this page. */}
      <section className="flex flex-col gap-2" aria-labelledby="card-you">
        <h2
          id="card-you"
          className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
        >
          You
        </h2>
        {you ? (
          <>
            {(you.inTradeBinder || you.onHunt) && (
              <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                {you.inTradeBinder && (
                  <li className="flex items-center gap-2">
                    <Layers
                      className="size-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    In your trade binder
                  </li>
                )}
                {you.onHunt && (
                  <li className="flex items-center gap-2">
                    <Crosshair
                      className="size-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <Link
                      href={`/hunts/${you.onHunt.huntId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      On your hunt: {you.onHunt.name}
                    </Link>
                  </li>
                )}
              </ul>
            )}
          </>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(href)}`}
            className="text-sm font-semibold text-accent hover:underline"
          >
            Sign in to see what you have
          </Link>
        )}
      </section>

      {/* Who has it: binders up for trade, nearest first. */}
      {holders.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="card-holders">
          <h2
            id="card-holders"
            className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
          >
            {countHeading(
              holders.length,
              "player has it",
              "players have it",
              located ? "near you" : null,
            )}
          </h2>
          {
            <ul className="flex flex-col">
              {holders.map(({ player, milesLabel }) => (
                <li
                  key={player.playerId}
                  className="flex items-center gap-3 border-t border-border first:border-t-0"
                >
                  <PlayerRow player={player} line={milesLabel} />
                  {viewerId && viewerId !== player.playerId && (
                    <MessageButton playerId={player.playerId} className="shrink-0" />
                  )}
                </li>
              ))}
            </ul>
          }
        </section>
      )}

      {/* Who is hunting it: an open Flare, or a card on a public hunt.
          The row opens the hunt when it is one; a Flare has no page of
          its own on the website, so its row opens the hunter's Flares. */}
      {hunters.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="card-hunters">
          <h2
            id="card-hunters"
            className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
          >
            {countHeading(
              hunters.length,
              "player hunting it",
              "players hunting it",
              null,
            )}
          </h2>
          {
            <ul className="flex flex-col">
              {hunters.map((row) => {
                const to = row.huntId
                  ? `/hunts/${row.huntId}`
                  : `/p/${row.player.playerId}?tab=flares`;
                const facts = [
                  row.milesLabel,
                  `Wants ${row.quantity}`,
                  row.printingLabel,
                ].filter((fact): fact is string => Boolean(fact));
                return (
                  <li
                    key={row.postId ?? row.huntId ?? row.player.playerId}
                    className="border-t border-border first:border-t-0"
                  >
                    <PlayerRow player={row.player} line={facts.join(" · ")} href={to} />
                  </li>
                );
              })}
            </ul>
          }
        </section>
      )}

      {/* In the case: stores with it on the shelf or in the counter's
          synced singles, nearest first. */}
      {stores.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="card-stores">
          <h2
            id="card-stores"
            className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
          >
            {countHeading(
              stores.length,
              "store has it",
              "stores have it",
              located ? "nearby" : null,
            )}
          </h2>
          {
            <ul className="flex flex-col">
              {stores.map((store) => {
                const where = [
                  store.city,
                  store.miles !== null
                    ? `About ${Math.max(1, Math.round(store.miles))} mi`
                    : null,
                ].filter((fact): fact is string => Boolean(fact));
                return (
                  <li
                    key={store.storeId}
                    className="flex items-center gap-3 border-t border-border py-2.5 first:border-t-0"
                  >
                    <Store
                      className="size-5 shrink-0 text-text-muted"
                      aria-hidden="true"
                    />
                    <Link
                      href={`/s/${store.storeId}`}
                      className="flex min-w-0 flex-1 flex-col underline-offset-4 hover:underline"
                    >
                      <span className="truncate font-semibold text-text-primary">
                        {store.name}
                      </span>
                      {where.length > 0 && (
                        <span className="truncate text-xs text-text-muted">
                          {where.join(" · ")}
                        </span>
                      )}
                    </Link>
                    <Badge
                      tone={store.inCase ? "accent" : "neutral"}
                      className="shrink-0"
                    >
                      {store.inCase ? "In the case" : "Counter has it"}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          }
        </section>
      )}
    </div>
  );
}

/**
 * A player on this page: face, name, and the one line under it. The
 * row is a link to their profile unless the caller says where else
 * it goes.
 */
function PlayerRow({
  player,
  line,
  href,
}: {
  player: CardPagePlayer;
  line: string | null;
  href?: string;
}) {
  return (
    <Link
      href={href ?? `/p/${player.playerId}`}
      className="flex min-w-0 flex-1 items-center gap-3 py-2.5 underline-offset-4 hover:underline"
    >
      <PlayerAvatar
        displayName={player.displayName}
        seed={player.playerId}
        avatarUrl={player.avatarUrl}
        frame={player.frame}
        ring={player.ring}
        aura={player.aura}
        size="sm"
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold text-text-primary">
          {player.displayName}
        </span>
        {line && <span className="truncate text-xs text-text-muted">{line}</span>}
      </span>
    </Link>
  );
}
