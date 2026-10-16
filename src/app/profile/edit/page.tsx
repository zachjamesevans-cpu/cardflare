import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { AvatarForm } from "@/components/players/avatar-form";
import { CoverForm } from "@/components/players/cover-form";
import { EditProfileRows } from "@/components/players/edit-profile-rows";
import { PictureDoor } from "@/components/players/picture-door";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { PlayerTabBar, TabBarSpacer } from "@/components/players/player-tab-bar";
import { BackLink } from "@/components/ui/back-link";
import { Card } from "@/components/ui/card";
import { areasForUser } from "@/lib/auth/areas";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { resolveEquipped } from "@/lib/players/cosmetics";
import {
  customizeSections,
  dressedEquipsFor,
  EQUIP_AREAS,
  wornArtFor,
} from "@/lib/players/equips";
import { CustomizeHub } from "@/components/players/customize-hub";
import { ProMark } from "@/components/stores/ultra-mark";
import { cn } from "@/lib/cn";
import { needsSetup, ownProfile } from "@/lib/players/profile";
import { tierAllows } from "@/lib/tiers";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Edit profile, laid out the way Instagram lays it out.
 *
 * The founder: "match the edit profile screen to this. Add bio,
 * pronouns, username editing, name changing, into a menu that looks
 * like this. The avatar effects should also be here." So: the picture
 * beside the avatar effects with one link under them, then a list of
 * four rows, Name, Username, Pronouns, Bio, each opening in place.
 * Name and username used to live in settings; they are here now, and
 * settings points here. The app draws the same screen
 * (mobile/src/screens/edit-profile.tsx).
 */
/** The three tabs, the app's (mobile/src/screens/edit-profile.tsx). */
const TABS = [
  { key: "profile", label: "Profile" },
  { key: "look", label: "Look" },
  { key: "showcase", label: "Showcase" },
] as const;
type EditTab = (typeof TABS)[number]["key"];

/**
 * Edit profile and Customize, one page. The founder: "move the edit
 * profile button into the wand, they do the exact same thing basically.
 * like combine them". Profile is the picture and the four rows; Look and
 * Showcase are what you and your cards wear (CustomizeHub).
 */
export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const asked = (await searchParams).tab;
  const tab: EditTab = asked === "look" || asked === "showcase" ? asked : "profile";
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/profile/edit");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");
  if (await needsSetup(playerId)) redirect("/welcome");

  const profile = await ownProfile(playerId);
  if (!profile) redirect("/profile/settings");

  const [worn, dressed, areas, wardrobe] = await Promise.all([
    resolveEquipped(profile.equipped),
    dressedEquipsFor(playerId),
    areasForUser(viewer.user.id, viewer.kind === "admin"),
    tab === "profile" ? null : customizeSections(playerId),
  ]);
  const dressedArt = await wornArtFor(dressed);

  return (
    <>
      <AppShell
        area="Profile"
        email={viewer.user.email ?? ""}
        title="Edit profile"
        description="Your picture, your name and the lines under it."
        areas={areas}
        currentArea={
          areas.some((area) => area.href === "/profile") ? "/profile" : undefined
        }
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          <BackLink href="/profile" />

          {/* The tabs. */}
          <nav
            aria-label="Edit profile"
            className="flex rounded-full border border-border bg-elevated p-[3px]"
          >
            {TABS.map((entry) => (
              <Link
                key={entry.key}
                href={
                  entry.key === "profile"
                    ? "/profile/edit"
                    : `/profile/edit?tab=${entry.key}`
                }
                aria-current={entry.key === tab ? "page" : undefined}
                className={cn(
                  "flex-1 rounded-full py-2 text-center text-sm font-bold transition-colors",
                  entry.key === tab
                    ? "bg-accent text-accent-contrast"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {entry.label}
              </Link>
            ))}
          </nav>

          {wardrobe ? (
            <>
              {/* Honest before anything is tapped: browsing is free,
                  wearing is Pro. */}
              {!wardrobe.customizationAllowed && (
                <p className="rounded-[var(--radius-control)] border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
                  Wearing cosmetics is a cardflare <ProMark /> feature.{" "}
                  <Link href="/pro" className="underline underline-offset-4">
                    Get <ProMark />
                  </Link>
                  , and everything you equip shows here too.
                </p>
              )}
              <CustomizeHub
                key={tab}
                area={tab === "look" ? "profile" : "showcase"}
                sections={wardrobe.sections.filter((section) =>
                  (
                    EQUIP_AREAS[
                      tab === "look" ? "profile" : "showcase"
                    ] as readonly string[]
                  ).includes(section.kind),
                )}
                owner={{
                  playerId: profile.playerId,
                  displayName: profile.displayName,
                  avatarUrl: profile.avatarUrl,
                  frame: worn.avatarFrame,
                  cardImage: profile.showcase[0]?.imageUrl ?? null,
                }}
              />
            </>
          ) : (
            <>
              {/* The picture, dressed as the profile draws it, beside the
              door to the avatar effects. "Edit picture or avatar" under
              them opens the picture and cover controls. */}
              <Card>
                <PictureDoor
                  picture={
                    <PlayerAvatar
                      displayName={profile.displayName}
                      seed={profile.playerId}
                      avatarUrl={profile.avatarUrl}
                      frame={worn.avatarFrame}
                      ring={dressed.ring}
                      aura={dressed.aura}
                      ringArt={dressedArt.ring}
                      auraArt={dressedArt.aura}
                      className="size-24 text-2xl"
                    />
                  }
                  editor={
                    <AvatarForm
                      displayName={profile.displayName}
                      seed={profile.playerId}
                      avatarUrl={profile.avatarUrl}
                      frame={worn.avatarFrame}
                      ring={dressed.ring}
                      aura={dressed.aura}
                      ringArt={dressedArt.ring}
                      auraArt={dressedArt.aura}
                      animatedAllowed={tierAllows(profile.tier, "animatedAvatar")}
                    />
                  }
                  cover={<CoverForm coverUrl={profile.coverUrl} />}
                />
              </Card>

              {/* The four rows. The list is the card's whole inside, so the
              hairlines run edge to edge. */}
              <Card className="overflow-hidden p-0">
                <EditProfileRows
                  displayName={profile.displayName}
                  handle={profile.handle}
                  pronouns={profile.pronouns}
                  bio={profile.bio}
                />
              </Card>
            </>
          )}

          <TabBarSpacer />
        </div>
      </AppShell>

      <PlayerTabBar />
    </>
  );
}
