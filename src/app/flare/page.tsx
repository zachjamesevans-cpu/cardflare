import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { FlareComposer } from "@/components/flares/flare-composer";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { cardResultById } from "@/lib/cards/search";
import { viewerGames } from "@/lib/players/viewer-games";
import { playerForUser } from "@/lib/players/accounts";
import { currentRoomForSession } from "@/lib/players/current-room";
import { huntsFor } from "@/lib/players/hunts";
import { avatarPathFor, avatarSrc } from "@/lib/players/profile-image";
import { getPlayerSession } from "@/lib/players/session";
import { foundCardsFor, listWants } from "@/lib/players/wants";
import { nearbySettingsFor } from "@/lib/nearby/settings";
import { NearbyRow } from "@/components/nearby/nearby-row";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { SITE } from "@/lib/site";
import { LOCAL_ENABLED } from "@/lib/local/enabled";

export const metadata: Metadata = {
  title: "Post a Flare",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The app's centre tab, on the website: one composer for one Flare of
 * one or many cards, and the Flares underneath it. Where a new
 * Flare lands is the same three-way answer it always was:
 *
 * - in a room they have joined: onto that board;
 * - signed in with no room: to their area, and onto their account list;
 * - a guest with no room: pointed at the door, honestly. Guests have
 *   no account for a list to live on, so the hub is the payoff of
 *   signing in, never a gate.
 *
 * The Have list used to sit under the Flares. It is gone from
 * here: the cards you would trade belong to the case, and this tab is
 * for asking.
 */

/** The poster's face and name, for the preview that draws the post. */
async function composerViewer(
  playerId: string,
  fallbackName: string,
): Promise<{ id: string; displayName: string; avatarUrl: string | null }> {
  if (!isSupabaseConfigured())
    return { id: playerId, displayName: fallbackName, avatarUrl: null };
  const { data } = await getSupabaseAdmin()
    .from("players")
    .select("display_name, avatar_url, avatar_animated, tier")
    .eq("id", playerId)
    .maybeSingle();
  return {
    id: playerId,
    displayName: data?.display_name ?? fallbackName,
    avatarUrl: data ? avatarSrc(avatarPathFor(data)) : null,
  };
}

export default async function FlarePage({
  searchParams,
}: {
  /* "Add cards" on a profile hunt arrives here, so the composer opens
     with that hunt already chosen rather than asking a second time. */
  searchParams: Promise<{ hunt?: string; card?: string; printing?: string }>;
}) {
  const { hunt, card, printing } = await searchParams;
  /* "Post a Flare for it" on a card page: the card goes in first. A
     malformed or unknown id is simply no card. */
  const initialCard =
    card && /^[0-9a-f-]{36}$/i.test(card) ? await cardResultById(card) : null;
  /* The art it was flared from, when it is one of this card's printings. */
  const initialPrinting =
    initialCard &&
    printing &&
    initialCard.printings.some((entry) => entry.id === printing)
      ? printing
      : null;
  const [viewer, session] = await Promise.all([getViewer(), getPlayerSession()]);

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const images = cardImagesEnabled();
  /*
   * Everything at once. The room, the games and the six reads below
   * used to run one after another, and the audit timed "Loading your
   * draft…" at four to seven seconds: most of it was this page waiting
   * on itself. None of these needs another's answer.
   */
  const [room, games, [asked, nearby, hunts, poster, foundCards]] = await Promise.all([
    session ? currentRoomForSession(session.id) : null,
    viewerGames(),
    playerId
      ? Promise.all([
          listWants(playerId),
          /* Nearby matching is part of Local. With Local off there is no
               feed for a match to land on, so the switch is not asked for
               either: a setting nothing reads is a lie in a form field. */
          LOCAL_ENABLED ? nearbySettingsFor(playerId) : null,
          huntsFor(playerId, playerId),
          composerViewer(
            playerId,
            viewer.kind === "player" ? viewer.playerName : "You",
          ),
          foundCardsFor(playerId),
        ])
      : [null, null, [], null, new Set<string>()],
  ]);
  /*
   * The list itself is no longer drawn here: the founder (2026-11-25), "i
   * dont think a flare history is necessary on this screen". Open Flares
   * live on the profile's Flares, History at its foot. The composer
   * still hears which cards are out, for the small flame on a tile that
   * is already on your Flares.
   */
  const flared = (asked ?? [])
    .filter((want) => !foundCards.has(want.cardId))
    .map((want) => ({ cardId: want.cardId, printingId: want.printingId }));

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-5 pt-6 pb-16 sm:gap-8 sm:pt-12"
      >
        <Link href="/feed" aria-label={`${SITE.name} feed`}>
          <Logo size={40} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-5">
          {/* The one switch for nearby matching, folded to a line above
              the composer. Signed-in only, and only while Local is on:
              matching needs an account on both ends and a feed to show
              the match in. */}
          {LOCAL_ENABLED && nearby && (
            <NearbyRow enabled={nearby.enabled} postalCode={nearby.postalCode} />
          )}

          {playerId && poster ? (
            <FlareComposer
              viewer={poster}
              hunts={hunts.map((entry) => ({ id: entry.id, name: entry.name }))}
              imagesEnabled={images}
              playerGames={games}
              room={
                room ? { name: room.event.name, storeName: room.event.storeName } : null
              }
              initialHuntId={hunt ?? null}
              initialCard={initialCard}
              initialPrinting={initialPrinting}
              flared={flared}
            />
          ) : (
            <Card className="flex flex-col gap-3">
              <h1 className="text-xl font-bold text-text-primary">Post a Flare</h1>
              <p className="text-text-secondary">
                A Flare says what card you are looking for, and the people who can help
                see it: the room at a store event
                {LOCAL_ENABLED ? ", players near that store on Local," : ""} and
                everyone who follows you. Create a free account to start posting, or
                scan the code at a store&rsquo;s counter to post into tonight&rsquo;s
                event.
              </p>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href="/signup">Create your free account</ButtonLink>
                <ButtonLink href="/room" variant="secondary">
                  Enter a code
                </ButtonLink>
              </div>
            </Card>
          )}
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
