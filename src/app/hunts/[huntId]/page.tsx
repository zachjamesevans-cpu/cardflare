import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { HuntBinder } from "@/components/players/hunt-binder";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { cardImagesEnabled } from "@/lib/cards/images";
import { playerForUser } from "@/lib/players/accounts";
import { huntById } from "@/lib/players/hunts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Hunt",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One hunt, on a page of its own, drawn like an open binder.
 *
 * The address "Share hunt" hands out, "View hunt" on a Feed post and
 * a row on the Hunts tab all open. Anyone with the link can read a
 * public hunt, signed in or not; a private one is the owner's alone
 * and reads as missing to everybody else, which is what `huntById`
 * already decides. The owner gets the "+" pockets, the progress sheet
 * and the pencil; a visitor gets the same pages and the viewer's way
 * to say which cards they have. The back link goes to the Hunts tab
 * the row came from.
 */
export default async function HuntPage({
  params,
}: {
  params: Promise<{ huntId: string }>;
}) {
  const { huntId } = await params;
  const viewer = await getViewer();
  const viewerId =
    viewer.kind === "player"
      ? viewer.playerId
      : viewer.kind === "anonymous"
        ? null
        : ((await playerForUser(viewer.user.id))?.id ?? null);

  const hunt = await huntById(huntId, viewerId);
  if (!hunt) notFound();

  const yours = hunt.playerId === viewerId;

  return (
    <>
      <main
        id="main"
        className="flex min-h-dvh flex-col items-center gap-5 px-4 pt-6 pb-16 sm:px-6 sm:pt-10"
      >
        {/* The Feed, not the marketing home: whoever opens a hunt is
            already inside the product. */}
        <Link href="/feed" aria-label={`${SITE.name} Feed`}>
          <Logo size={36} priority />
        </Link>

        <div className="flex w-full max-w-2xl flex-col gap-4">
          <BackLink
            href={yours ? "/profile?tab=hunts" : `/p/${hunt.playerId}?tab=hunts`}
          />

          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <HuntBinder
              hunt={hunt}
              yours={yours}
              canOffer={viewerId !== null}
              imagesEnabled={cardImagesEnabled()}
            />
          </Card>
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
