import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, Clock, Globe, MapPin, Phone } from "lucide-react";

import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import { FollowStoreButton } from "@/components/stores/follow-store-button";
import { StorePageHeader } from "@/components/stores/store-page-header";
import { buttonStyles } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { cardImagesEnabled } from "@/lib/cards/images";
import { gameShortName } from "@/lib/players/games-catalog";
import { hasLocal, storeBoard } from "@/lib/players/locals";
import { hoursLines, openNow } from "@/lib/stores/hours";
import { publicStore } from "@/lib/stores/public-profile";

export const metadata: Metadata = {
  title: "Store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * A store, as a player sees it — claimed or not.
 *
 * The point of the directory: "I do NOT want the cardflare store
 * experience to look empty just because an LGS has not personally signed
 * up." So this renders for a shop that has never heard of cardflare, and
 * it is careful about what it says.
 *
 * FACTUAL INFORMATION ONLY on an unclaimed listing. No logo, no photos,
 * no store-written description, no reviews - none of which we have a
 * licence to reproduce. A generic mark, the address, and an honest label
 * saying nobody at the shop has claimed this yet.
 *
 * A CLAIMED store's page is the player's profile shape without the
 * cosmetics: banner, logo, name, the games it runs, its hours with
 * whether it is open right now. The header is `StorePageHeader`, the
 * same block the console's wizard previews, so what the owner saw
 * while setting it up is what a player sees here.
 *
 * FOLLOWING is the same row the Room tab lists under "Following" -
 * joining a room signed in has always written it - with a button on
 * the page for the player who found the shop before they walked in. A
 * guest's Follow is the same button as a door: it starts sign-up and
 * comes back here, because a Follow that cannot work is a lie.
 */
export default async function StoreProfilePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const store = await publicStore(storeId);

  if (!store) notFound();

  /*
   * The optional account, never required. The same rule as the room
   * page: a player viewer carries its id, and an admin or owner who
   * also holds a player row follows as that player.
   */
  const viewer = await getViewer();
  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const [following, board] = await Promise.all([
    playerId ? hasLocal(playerId, store.storeId) : Promise.resolve(false),
    storeBoard(store.storeId),
  ]);

  const nextEvent =
    board?.nextEventAt && board.nextEventName
      ? `${board.nextEventName} · ${new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: board.timeZone,
        }).format(new Date(board.nextEventAt))}`
      : null;

  const lines = store.hours ? hoursLines(store.hours) : [];
  /* The case as one shelf, so the zoom swipes along it. */
  const shelf: ZoomCard[] = store.casePicks.map((pick) => ({
    imageUrl: pick.imageUrl,
    exactName: pick.cardName,
    cardNumber: pick.cardNumber,
  }));
  const open = store.hours ? openNow(store.hours, new Date(), store.timeZone) : null;

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 pt-6 pb-16"
    >
      <StorePageHeader
        name={store.name}
        verified={store.verified}
        ultra={store.ultra}
        unclaimed={store.unclaimed}
        city={store.city}
        region={store.region}
        logoUrl={store.logoUrl}
        coverUrl={store.coverUrl}
      >
        {store.description && (
          <p className="text-sm text-text-secondary">{store.description}</p>
        )}

        {store.games.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Games">
            {store.games.map((game) => (
              <li
                key={game}
                className="rounded-full border border-border bg-elevated px-2.5 py-0.5 text-xs font-medium text-text-secondary"
              >
                {gameShortName(game)}
              </li>
            ))}
          </ul>
        )}

        {/* Follow, for a signed-in player; the same word as a door to an
            account for anyone else, the way a player's page does it. */}
        <div className="flex flex-wrap items-center gap-3">
          {playerId ? (
            <FollowStoreButton storeId={store.storeId} initial={following} />
          ) : (
            <Link
              href={`/signup?next=${encodeURIComponent(`/s/${store.storeId}`)}`}
              className={buttonStyles("primary", "sm")}
            >
              Follow
            </Link>
          )}
          <p className="text-xs text-text-muted">
            Following puts this store&rsquo;s nights in your Feed and on your Following
            list.
          </p>
        </div>

        <div className="flex flex-col gap-2 text-sm text-text-secondary">
          {(board?.liveNow || nextEvent) && (
            <p className="flex items-start gap-2">
              <CalendarClock
                className="mt-0.5 size-4 shrink-0 text-accent"
                aria-hidden
              />
              {board?.liveNow ? (
                <Link
                  href={`/e/${board.joinCode}`}
                  className="text-text-primary underline-offset-4 hover:underline"
                >
                  A room is open right now
                </Link>
              ) : (
                <span>Next: {nextEvent}</span>
              )}
            </p>
          )}

          {lines.length > 0 && (
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
              <div className="flex flex-col gap-0.5">
                <p className={open ? "font-semibold text-success" : "font-semibold"}>
                  {open ? "Open now" : "Closed now"}
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                  {lines.map((line) => (
                    <Fragment key={line.days}>
                      <dt className="text-text-primary">{line.days}</dt>
                      <dd>{line.hours}</dd>
                    </Fragment>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {store.casePicks.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-text-primary">In the case this week</p>
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {store.casePicks.map((pick, index) => (
                  <li key={pick.cardId} className="w-16 shrink-0">
                    <CardImageZoom
                      imageUrl={pick.imageUrl}
                      exactName={pick.cardName}
                      cardNumber={pick.cardNumber}
                      enabled={cardImagesEnabled()}
                      siblings={shelf}
                      position={index}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {store.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-text-muted" aria-hidden />
              {store.address}
            </p>
          )}
          {store.phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-text-muted" aria-hidden />
              {store.phone}
            </p>
          )}
          {store.website && (
            <p className="flex items-center gap-2">
              <Globe className="size-4 shrink-0 text-text-muted" aria-hidden />
              <a
                href={store.website}
                rel="noreferrer nofollow"
                target="_blank"
                className="truncate text-accent"
              >
                {store.website}
              </a>
            </p>
          )}
        </div>

        {store.unclaimed && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-elevated p-4">
            <p className="text-sm font-semibold text-text-primary">
              Own or manage this store?
            </p>
            <p className="text-xs text-text-muted">
              Claiming lets you keep the details right and run rooms from your own
              counter code. cardflare confirms ownership before anything changes.
            </p>
            <Link
              href={`/s/${store.storeId}/claim`}
              className={buttonStyles("secondary", "sm")}
            >
              Claim this store
            </Link>
          </div>
        )}
      </StorePageHeader>

      {/* Attribution travels with the record. Overture Places is a mix of
          licences, so the line comes from the source row rather than from
          a constant. */}
      {store.attribution && (
        <p className="text-xs text-text-muted">Listing data: {store.attribution}</p>
      )}
    </main>
  );
}
