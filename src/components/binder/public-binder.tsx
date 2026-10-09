import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { BinderView } from "@/components/binder/binder-page";
import { BlockControls, BlockProvider } from "@/components/players/block-controls";
import { MessageButton } from "@/components/players/message-button";
import { TabPageShell } from "@/components/players/tab-page-shell";
import { getViewer } from "@/lib/auth/session";
import { readBinder } from "@/lib/binder/binder";
import { cardImagesEnabled } from "@/lib/cards/images";
import { readNightBinder } from "@/lib/events/night-binders";
import { playerForUser } from "@/lib/players/accounts";
import { listPlayerGames } from "@/lib/players/games";
import { blockState } from "@/lib/players/safety";

/**
 * Somebody's binder, open, by its id: the page behind both
 * /p/<owner>/binders/<id> and the share link /b/<id>.
 *
 * Only what they chose to show: `readBinder` answers null for a
 * binder that is not up for trade unless the viewer is its owner,
 * and null here is a 404, the same door a profile that does not
 * exist gets. A visitor sees the pockets, the "On your hunts" chip
 * when any card is one they are hunting, and the message door. The
 * owner, arriving by their own public link, gets their tools, the
 * same as /profile/binders/<id>. Nobody needs to be signed in to look;
 * making an offer on the cards asks them to (`offerAs`).
 */
export async function PublicBinder({
  playerId,
  binderId,
  nightId = null,
}: {
  playerId: string;
  binderId: string;
  /**
   * Opened from a night's attendee page: a binder the owner is bringing
   * there, which may be private and shown to that night's attendees by
   * their choice. night-binders.ts decides; nothing else changes.
   */
  nightId?: string | null;
}) {
  const viewer = await getViewer();

  const me =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const binder =
    (await readBinder(playerId, me, binderId)) ??
    (nightId ? await readNightBinder(nightId, playerId, binderId, me) : null);
  if (!binder) notFound();

  const other = Boolean(me && me !== playerId);
  const [games, block] = await Promise.all([
    binder.yours ? listPlayerGames(playerId) : [],
    blockState(me, playerId),
  ]);

  /*
   * Who may make an offer on the cards: somebody signed in who is not
   * the owner and is not blocked either way; somebody signed out is
   * shown the way in. The binder itself decides whether it is up for
   * trade.
   */
  const offerAs = binder.yours
    ? null
    : other
      ? block.blocked || block.blockedBy
        ? null
        : "player"
      : viewer.kind === "anonymous"
        ? "guest"
        : null;

  /* The name for the owner; "<Name>'s <binder name>" for anyone else. */
  const name = binder.yours ? binder.name : `${binder.ownerName}'s ${binder.name}`;

  return (
    <TabPageShell title={name}>
      <Link
        href={`/p/${playerId}?tab=binders`}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {binder.yours ? "your binders" : `${binder.ownerName}'s binders`}
      </Link>

      <BinderView
        binder={binder}
        imagesEnabled={cardImagesEnabled()}
        playerGames={games}
        title={name}
        offerAs={offerAs}
        nightId={nightId}
        footer={
          other ? (
            /* The message door, under the same block rule as the
               profile's: gone when either side blocked the other. */
            <BlockProvider initial={block}>
              <BlockControls playerId={playerId}>
                <MessageButton
                  playerId={playerId}
                  className="w-fit"
                  label={`Message ${binder.ownerName}`}
                />
              </BlockControls>
            </BlockProvider>
          ) : null
        }
      />
    </TabPageShell>
  );
}
