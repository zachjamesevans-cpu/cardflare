import Image from "next/image";
import Link from "next/link";

import type { GameHub, HubCard } from "@/lib/cards/game-hub";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { cn } from "@/lib/cn";

/**
 * A game's hub on the website (src/lib/cards/game-hub.ts): the game's
 * logo, then Most hunted, Price moves this week and Most searched, each a
 * row of cards that opens the card. A list with nothing in it is not
 * drawn. The app's GameHubScreen is the same.
 */
export function GameHubView({
  hub,
  name,
  imagesEnabled,
}: {
  hub: GameHub;
  name: string;
  imagesEnabled: boolean;
}) {
  const sections = [
    { title: "Most hunted", cards: hub.hunted },
    { title: "Price moves this week", cards: hub.movers },
    { title: "Most searched", cards: hub.searched },
  ].filter((section) => section.cards.length > 0);

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col items-center gap-4">
        <Image
          src={`/games/${hub.game}.png`}
          alt={name}
          width={600}
          height={260}
          className="h-auto w-56"
          priority
        />
        <Link
          href={`/search?game=${hub.game}`}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-contrast"
        >
          Search {name}
        </Link>
      </div>

      {sections.length === 0 ? (
        <p className="text-center text-sm text-text-muted">
          Nothing to rank yet. As players hunt and look up {name} cards, the most hunted
          and most searched show up here.
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
              {section.title}
            </h2>
            <ol className="-mx-4 flex snap-x [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 [&::-webkit-scrollbar]:hidden">
              {section.cards.map((card, index) => (
                <HubTile
                  key={card.cardId}
                  card={card}
                  rank={index + 1}
                  imagesEnabled={imagesEnabled}
                />
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}

function HubTile({
  card,
  rank,
  imagesEnabled,
}: {
  card: HubCard;
  rank: number;
  imagesEnabled: boolean;
}) {
  const art =
    imagesEnabled && isRenderableImageUrl(card.imageUrl) ? card.imageUrl : null;
  return (
    <li className="w-28 shrink-0 snap-start">
      <Link href={`/cards/${card.cardId}`} className="flex flex-col gap-1">
        <span className="relative block aspect-[63/88] w-full overflow-hidden rounded-[8px] border border-border bg-elevated">
          {art && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={art} alt="" loading="lazy" className="size-full object-cover" />
          )}
          <span className="absolute top-1 left-1 rounded-[6px] bg-canvas/80 px-1.5 py-0.5 text-[11px] font-extrabold text-text-primary">
            {rank}
          </span>
        </span>
        <span className="truncate text-sm font-semibold text-text-primary">
          {card.name}
        </span>
        <span
          className={cn(
            "truncate text-xs font-semibold",
            card.up === true
              ? "text-accent"
              : card.up === false
                ? "text-danger"
                : "text-text-muted",
          )}
        >
          {card.stat}
        </span>
      </Link>
    </li>
  );
}
