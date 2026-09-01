import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShoppingBag, Wand2 } from "lucide-react";

import { CustomizeHub } from "@/components/players/customize-hub";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { customizeSections, equipArea, EQUIP_AREAS } from "@/lib/players/equips";

export const metadata: Metadata = {
  title: "Customize",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const AREA_COPY = {
  profile: {
    title: "Customize profile",
    blurb:
      "Everything worn on you: your border, name style, title, badge and page effect. Changes land the moment you tap them.",
    other: { area: "showcase", label: "Showcase cosmetics" },
  },
  showcase: {
    title: "Customize showcase",
    blurb:
      "Everything worn on your cards: borders, foils, motion and the shelf behind them. Changes land the moment you tap them.",
    other: { area: "profile", label: "Profile cosmetics" },
  },
} as const;

/**
 * Getting dressed lives HERE now, not in the store. The store sells;
 * this wears. Split into two menus behind two wands - the founder's
 * call: "have a magic wand that edits profile stuff... a separate one
 * for showcase so the menu isn't too crowded." Unreleased cosmetics
 * appear only for an account whose admin grant reaches them, and wear
 * exactly like live ones so they can be judged on a real profile.
 */
export default async function CustomizePage({
  searchParams,
}: {
  searchParams: Promise<{ area?: string }>;
}) {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/profile/customize");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");

  const area = equipArea((await searchParams).area);
  const copy = AREA_COPY[area];
  const kinds = EQUIP_AREAS[area];

  const { sections, customizationAllowed } = await customizeSections(playerId);
  const shown = sections.filter((section) =>
    (kinds as readonly string[]).includes(section.kind),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Link
            href="/profile"
            className="flex w-fit items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-secondary"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Profile
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">{copy.title}</h1>
          <p className="text-sm text-text-secondary">{copy.blurb}</p>
          {/* Honest before anything is tapped: browsing is free, wearing
              is Pro. No buy button here — Pro is sold in the app. */}
          {!customizationAllowed && (
            <p className="rounded-[var(--radius-control)] border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent">
              Wearing cosmetics is a cardflare Pro feature. Get Pro in the cardflare
              app, and everything you equip shows here too.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/profile/customize?area=${copy.other.area}`}
            className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong"
          >
            <Wand2 className="size-4" aria-hidden="true" />
            {copy.other.label}
          </Link>
          <Link
            href="/profile/store"
            className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong"
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
            Embers store
          </Link>
        </div>
      </div>

      <CustomizeHub sections={shown} />
    </main>
  );
}
