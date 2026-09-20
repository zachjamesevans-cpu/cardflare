import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  CalendarClock,
  Globe,
  MapPin,
  Phone,
  Store as StoreIcon,
} from "lucide-react";

import { FollowStoreButton } from "@/components/stores/follow-store-button";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { hasLocal, storeBoard } from "@/lib/players/locals";
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
 * Verified and Ultra are drawn as two separate marks because they mean
 * two different things, and the help text says which is which.
 *
 * FOLLOWING is the same row as "Your locals" - joining a room signed in
 * has always written it - with a button on the page for the player who
 * found the shop before they walked in. A guest sees a sign-in link
 * that comes back here, because a Follow that cannot work is a lie.
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

  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-4 pt-6 pb-16"
    >
      <Card className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-4">
          {/* The placeholder, deliberately. A shop's own logo is theirs. */}
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-elevated">
            <StoreIcon className="size-6 text-text-muted" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold text-text-primary">
              {store.name}
              {store.verified && (
                <BadgeCheck
                  className="size-5 text-accent"
                  aria-label="cardflare Verified"
                />
              )}
              {store.ultra && (
                <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-semibold tracking-wider text-text-secondary uppercase">
                  Ultra
                </span>
              )}
            </h1>

            {store.description && (
              <p className="mt-1 text-sm text-text-secondary">{store.description}</p>
            )}

            {store.verified ? (
              <p className="mt-1 text-xs text-text-muted">
                cardflare Verified means cardflare has confirmed that this profile is
                controlled by the listed business. It is not an endorsement or guarantee
                of the business.
              </p>
            ) : (
              <p className="mt-1 text-xs text-text-muted">Unclaimed listing</p>
            )}
          </div>
        </div>

        {/* Follow, for a signed-in player; the way to become one, for anyone else. */}
        <div className="flex flex-wrap items-center gap-3">
          {playerId ? (
            <FollowStoreButton storeId={store.storeId} initial={following} />
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(`/s/${store.storeId}`)}`}
              className={buttonStyles("secondary", "md")}
            >
              Sign in to follow
            </Link>
          )}
          <p className="text-xs text-text-muted">
            Following puts this store&rsquo;s nights in your Feed and your locals.
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
      </Card>

      {/* Attribution travels with the record. Overture Places is a mix of
          licences, so the line comes from the source row rather than from
          a constant. */}
      {store.attribution && (
        <p className="text-xs text-text-muted">Listing data: {store.attribution}</p>
      )}
    </main>
  );
}
