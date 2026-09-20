import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Logo } from "@/components/brand/logo";
import { HuntDetail } from "@/components/players/hunt-detail";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Card } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { huntById } from "@/lib/players/hunts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Hunt",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One hunt, on a page of its own.
 *
 * The address "Share hunt" hands out and "View hunt" on a Feed post
 * opens. Anyone with the link can read a public hunt, signed in or not;
 * a private one is the owner's alone and reads as missing to everybody
 * else, which is what `huntById` already decides. The owner gets every
 * control the profile panel gives them; a visitor gets the same list
 * and the same way to say which cards they have.
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
          <Card className="flex flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-col gap-1">
              <Link
                href={`/p/${hunt.playerId}`}
                className="text-sm text-text-secondary hover:text-text-primary hover:underline"
              >
                {yours ? "Your hunt" : `${hunt.ownerName}'s hunt`}
              </Link>
              <h1 className="text-2xl leading-tight font-extrabold text-text-primary">
                {hunt.name}
              </h1>
            </div>
            <HuntDetail hunt={hunt} yours={yours} full canOffer={viewerId !== null} />
          </Card>
        </div>

        <TabBarSpacer />
      </main>

      <PlayerTabBar />
    </>
  );
}
