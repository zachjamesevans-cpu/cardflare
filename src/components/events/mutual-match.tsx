import Link from "next/link";
import { Flame } from "lucide-react";

import type { ZoomCard } from "@/components/cards/card-image-zoom";
import { FeedTile } from "@/components/feed/feed-tile";
import { MessageButton } from "@/components/players/message-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Card } from "@/components/ui/card";
import {
  MUTUAL_LINE,
  MUTUAL_MATCH,
  OTHER_PRINTING_SHORT,
  THEY_WANT,
  YOU_WANT,
} from "@/lib/events/night-copy";
import type { MatchCard, MutualMatch } from "@/lib/events/night-matches";

/**
 * A row of small card tiles, the Feed's own, each opening the zoom on
 * the whole row. "You want" and "They have" show cards on offer, so
 * the large view says so; "They want" shows what they are hunting.
 *
 * A card matched on another printing says so in one muted line under
 * the tile: "They have another printing" on their side, "You have
 * another printing" on yours. The caption on the card keeps the
 * printing the wanter named.
 */
export function MatchThumbs({
  cards,
  imagesEnabled,
  direction,
  label,
}: {
  cards: MatchCard[];
  imagesEnabled: boolean;
  direction: "want" | "showcase";
  /** The row's name for a screen reader. */
  label: string;
}) {
  const shelf: ZoomCard[] = cards.map((card) => ({
    imageUrl: imagesEnabled ? card.imageUrl : null,
    exactName: card.name,
    cardNumber: card.number,
    caption: card.printingLabel ?? "Any printing",
    anyPrinting: !card.printingLabel,
    direction,
  }));

  return (
    <ul aria-label={label} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {cards.map((card, index) => (
        <li key={card.cardId} className="flex w-14 shrink-0 flex-col gap-1">
          <FeedTile
            imageUrl={imagesEnabled ? card.imageUrl : null}
            name={card.name}
            cardNumber={card.number}
            match={null}
            size="sm"
            siblings={shelf}
            position={index}
            direction={direction}
          />
          {card.match === "other-printing" && (
            <span className="text-[10px] leading-3 text-text-muted">
              {OTHER_PRINTING_SHORT}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * 🔥 MUTUAL MATCH: the one block on the night page that is meant to pop.
 *
 * The founder (2026-10-03): "A special high-priority state '🔥 MUTUAL
 * MATCH': Player A wants something Player B owns AND Player B wants
 * something Player A owns. Visually stands out significantly more than
 * normal matches... Mutual Match should feel like one of Cardflare's
 * signature mechanics. Do NOT treat this like a normal notification."
 *
 * So it is the exception to the no-containers rule: a card with the
 * accent's border and tint, the flame, the label in capitals, their
 * face and name, the two rows of thumbnails (what you want of theirs,
 * what they want of yours), the one line that says why it matters,
 * and Message with their name on it. The app's mutual-match.tsx draws
 * the same block with the same words; tests/unit/nights2-parity.test.ts
 * holds the two together.
 */
export function MutualMatchBlock({
  match,
  code,
  imagesEnabled,
  canMessage,
}: {
  match: MutualMatch;
  code: string;
  imagesEnabled: boolean;
  /** Message needs an account on both ends; false draws no button. */
  canMessage: boolean;
}) {
  const { player } = match;

  return (
    <Card className="flex flex-col gap-3 border-accent/50 bg-accent/[0.06] p-4 shadow-[0_0_28px_-12px_var(--color-accent)]">
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-accent uppercase">
        <Flame className="size-4" aria-hidden="true" />
        {MUTUAL_MATCH}
      </p>

      <div className="flex items-center gap-3">
        <PlayerAvatar
          displayName={player.displayName}
          seed={player.playerId}
          avatarUrl={player.avatarUrl}
          frame={player.frame}
          ring={player.ring}
          aura={player.aura}
          size="md"
        />
        <Link
          href={`/e/${code}/p/${player.playerId}`}
          className="min-w-0 flex-1 truncate text-lg font-bold text-text-primary underline-offset-4 hover:underline"
        >
          {player.displayName}
        </Link>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs font-semibold text-text-secondary">{YOU_WANT}:</p>
          <MatchThumbs
            cards={match.youWant}
            imagesEnabled={imagesEnabled}
            direction="showcase"
            label={`${YOU_WANT}, from ${player.displayName}`}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs font-semibold text-text-secondary">{THEY_WANT}:</p>
          <MatchThumbs
            cards={match.theyWant}
            imagesEnabled={imagesEnabled}
            direction="want"
            label={`${THEY_WANT}, from you`}
          />
        </div>
      </div>

      <p className="text-sm text-text-secondary">{MUTUAL_LINE}</p>

      {canMessage && (
        <MessageButton
          playerId={player.playerId}
          label={`Message ${player.displayName}`}
          className="self-start"
        />
      )}
    </Card>
  );
}
