import Link from "next/link";
import { Crosshair, Layers, Search, Store } from "lucide-react";

import { MessageButton } from "@/components/players/message-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Badge } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { isRenderableImageUrl } from "@/lib/cards/images";
import type { CardPage, CardPagePlayer } from "@/lib/cards/card-page";
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
export function CardPageView({
  page,
  viewerId,
  imagesEnabled,
}: {
  page: CardPage;
  /** Null signed out: the You block becomes the way in. */
  viewerId: string | null;
  imagesEnabled: boolean;
}) {
  const { card, you, located, holders, hunters, stores } = page;
  const href = `/cards/${card.cardId}`;
  const art =
    imagesEnabled && isRenderableImageUrl(card.imageUrl) ? card.imageUrl : null;

  return (
    <div className="flex w-full flex-col gap-5">
      {/* The card: the art down the left, one aligned column beside it,
          the round 16b shape (88 x 123). */}
      <div className="flex items-stretch gap-3">
        <span className="block h-[7.75rem] w-[5.5rem] shrink-0 overflow-hidden rounded-[8px] border border-border bg-elevated">
          {art && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={art} alt="" className="size-full object-cover" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl leading-tight font-extrabold text-text-primary">
            {card.name}
          </h1>
          <p className="text-sm text-text-secondary">{card.number}</p>
          <p className="text-sm text-text-muted">{gameShortName(card.game)}</p>
        </div>
      </div>

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
            {(you.inTradeBinder || you.onHunt || you.wanted) && (
              <ul className="flex flex-col gap-1 text-sm text-text-secondary">
                {you.inTradeBinder && (
                  <li className="flex items-center gap-2">
                    <Layers
                      className="size-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    In your Trade binder
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
                {you.wanted && (
                  <li className="flex items-center gap-2">
                    <Search
                      className="size-4 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    You want this
                  </li>
                )}
              </ul>
            )}
            <Link href="/flare" className={buttonStyles("secondary", "sm")}>
              Post a Flare for it
            </Link>
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
      <section className="flex flex-col gap-2" aria-labelledby="card-holders">
        <h2
          id="card-holders"
          className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
        >
          {located ? "Who has it near you" : "Who has it"}
        </h2>
        {holders.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nobody with it in a binder up for trade yet.
          </p>
        ) : (
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
        )}
      </section>

      {/* Who is hunting it: an open Flare, or a card on a public hunt.
          The row opens the hunt when it is one; a Flare has no page of
          its own on the website, so its row opens the hunter's Flares. */}
      <section className="flex flex-col gap-2" aria-labelledby="card-hunters">
        <h2
          id="card-hunters"
          className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
        >
          Who is hunting it
        </h2>
        {hunters.length === 0 ? (
          <p className="text-sm text-text-muted">Nobody is hunting it yet.</p>
        ) : (
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
        )}
      </section>

      {/* In the case: stores with it on the shelf or in the counter's
          synced singles, nearest first. */}
      <section className="flex flex-col gap-2" aria-labelledby="card-stores">
        <h2
          id="card-stores"
          className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase"
        >
          {located ? "In the case nearby" : "In the case"}
        </h2>
        {stores.length === 0 ? (
          <p className="text-sm text-text-muted">No store near you has it listed.</p>
        ) : (
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
        )}
      </section>
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
