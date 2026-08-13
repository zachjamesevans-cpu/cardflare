import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Flame } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { CosmeticShop } from "@/components/players/cosmetic-shop";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { Card } from "@/components/ui/card";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { wardrobeFor } from "@/lib/players/cosmetics";
import { needsSetup, ownProfile } from "@/lib/players/profile";

export const metadata: Metadata = {
  title: "Embers store",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * The Embers store, on its own page.
 *
 * It used to live at the bottom of the profile, and the founder's read
 * was right: three full shelves of merchandise WERE the profile, and the
 * parts that are actually about the player — the picture, the badge, the
 * showcase — were buried under them. The profile now links here instead,
 * and this page is nothing but the shop.
 *
 * Same guards as the profile, because it is the same viewer: signed in,
 * a player account, setup finished.
 */
export default async function EmberStorePage() {
  const viewer = await getViewer();

  if (viewer.kind === "anonymous") redirect("/login?next=/profile/store");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);

  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome/username");

  const profile = await ownProfile(playerId);
  if (!profile) redirect("/profile/settings");

  const [wardrobe, areas] = await Promise.all([
    wardrobeFor(
      playerId,
      { earned: profile.embersEarned, balance: profile.embersBalance },
      profile.equipped,
    ),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
  ]);

  const currentArea = areas.some((area) => area.href === "/profile")
    ? "/profile"
    : undefined;

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Embers store"
        description="Spend what you earned trading. Everything you buy is yours for good."
        areas={areas}
        currentArea={currentArea}
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/profile"
              className="inline-flex items-center gap-1.5 text-sm text-text-secondary underline-offset-4 transition-colors hover:text-text-primary hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to your profile
            </Link>

            {/*
             * Deliberately NOT an EmberBadge. That component says
             * "earned" in its title and its screen-reader text, and
             * this is the balance — the one number that must never be
             * mistaken for the badge.
             */}
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-elevated px-3 py-1 text-sm font-semibold text-accent tabular-nums">
              <Flame className="size-4" aria-hidden="true" />
              {profile.embersBalance.toLocaleString()}
              <span className="font-medium text-text-muted">to spend</span>
            </span>
          </div>

          <Card className="flex flex-col gap-6">
            <CosmeticShop
              title="Profile borders"
              blurb="The ring around your profile picture, in every room you join. Separate from your cards. Buying a border once unlocks it for both."
              items={wardrobe.avatarFrames}
              balance={profile.embersBalance}
              slot="avatarFrame"
            />
            <CosmeticShop
              title="Card borders"
              blurb="The border your showcase cards wear unless you dress one differently. Tap a card on your profile to dress it on its own."
              items={wardrobe.cardFrames}
              balance={profile.embersBalance}
              slot="cardFrame"
            />
            <CosmeticShop
              title="Holo patterns"
              blurb="How the light sits on the artwork. This is the default; each card can wear its own."
              items={wardrobe.holos}
              balance={profile.embersBalance}
              slot="holo"
            />
            <CosmeticShop
              title="Effects"
              blurb="What moves, and how often. Worn by every card on your shelf."
              items={wardrobe.effects}
              balance={profile.embersBalance}
              slot="effect"
            />
          </Card>

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
