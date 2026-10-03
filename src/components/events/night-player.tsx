import { Flame } from "lucide-react";

import { BinderList } from "@/components/binder/binder-list";
import { MatchThumbs } from "@/components/events/mutual-match";
import { SectionLabel } from "@/components/events/night-header";
import { CardRail, tileWidth } from "@/components/feed/feed-tile";
import { MessageButton } from "@/components/players/message-button";
import { PlayerAvatar } from "@/components/players/player-avatar";
import {
  ACTIVE_FLARES,
  matchesWithYouLine,
  THEY_HAVE,
  THEY_WANT,
  TRADE_BINDERS,
} from "@/lib/events/night-copy";
import type { NightPlayerView } from "@/lib/events/night-matches";

/**
 * A player, as this night sees them: trade first, then the rest.
 *
 * The founder (2026-10-03): "EVENT-FACING PLAYER PROFILE: Prioritize
 * trade information: Profile info; Matches with you; Their Flares at
 * this Night; Public Trade Binder; Message button... Do not expose
 * private binders."
 *
 * The face and the name, "{n} matches with you" in the accent, what
 * they have that you want and what they want that you have as rows of
 * thumbnails, Message, then their Flares at this night on the board's
 * own tiles and the binders they have up for trade as the profile's
 * own rows. The server hands over only for_trade binders, so a private
 * one cannot be drawn here. The app's night-player.tsx draws the same
 * sections in the same order with the same words; tests/unit/nights2
 * -parity.test.ts holds the two together.
 */
export function NightPlayer({
  view,
  imagesEnabled,
  canMessage,
}: {
  view: NightPlayerView;
  imagesEnabled: boolean;
  /** Message needs an account on both ends and not your own page. */
  canMessage: boolean;
}) {
  const { player } = view;
  const flareCards = view.flares.map((entry) => ({
    cardId: entry.cardId,
    cardName: entry.cardName,
    cardNumber: entry.cardNumber,
    imageUrl: imagesEnabled ? entry.imageUrl : null,
    match: null,
    printingId: entry.printingId,
    printingLabel: entry.printingLabel,
    quantity: entry.quantity,
  }));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-4">
        <PlayerAvatar
          displayName={player.displayName}
          seed={player.playerId}
          avatarUrl={player.avatarUrl}
          frame={player.frame}
          ring={player.ring}
          aura={player.aura}
          size="lg"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="truncate text-xl font-bold text-text-primary">
            {player.displayName}
          </h1>
          {view.matches > 0 ? (
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-accent tabular-nums">
              <Flame className="size-4" aria-hidden="true" />
              {matchesWithYouLine(view.matches)}
            </p>
          ) : (
            <p className="text-sm text-text-muted">{matchesWithYouLine(0)}</p>
          )}
        </div>
      </header>

      {view.theyHave.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="they-have">
          <SectionLabel id="they-have">{THEY_HAVE}</SectionLabel>
          <MatchThumbs
            cards={view.theyHave}
            imagesEnabled={imagesEnabled}
            direction="showcase"
            label={THEY_HAVE}
          />
        </section>
      )}

      {view.theyWant.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="they-want">
          <SectionLabel id="they-want">{THEY_WANT}</SectionLabel>
          <MatchThumbs
            cards={view.theyWant}
            imagesEnabled={imagesEnabled}
            direction="want"
            label={THEY_WANT}
          />
        </section>
      )}

      {canMessage && (
        <MessageButton
          playerId={player.playerId}
          label={`Message ${player.displayName}`}
          className="self-start"
        />
      )}

      <section
        className="flex flex-col gap-2 border-t border-border pt-4"
        aria-labelledby="active-flares"
      >
        <SectionLabel id="active-flares">{ACTIVE_FLARES}</SectionLabel>
        {flareCards.length > 0 ? (
          <CardRail cards={flareCards} size={tileWidth(flareCards.length)} />
        ) : (
          <p className="text-sm text-text-secondary">No Flares at this Night yet.</p>
        )}
      </section>

      <section
        className="flex flex-col gap-2 border-t border-border pt-4"
        aria-labelledby="trade-binders"
      >
        <SectionLabel id="trade-binders">{TRADE_BINDERS}</SectionLabel>
        {view.binders.length > 0 ? (
          <BinderList
            binders={view.binders}
            yours={false}
            base={`/p/${player.playerId}`}
          />
        ) : (
          <p className="text-sm text-text-secondary">No binders up for trade yet.</p>
        )}
      </section>
    </div>
  );
}
