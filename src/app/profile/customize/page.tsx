import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShoppingBag } from "lucide-react";

import { CustomizeHub } from "@/components/players/customize-hub";
import { getViewer } from "@/lib/auth/session";
import { playerForUser } from "@/lib/players/accounts";
import { customizeSections } from "@/lib/players/equips";

export const metadata: Metadata = {
  title: "Customize",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Getting dressed lives HERE now, not in the store. The store sells;
 * this wears. Unreleased cosmetics appear only for an account whose
 * admin grant reaches them - the founder's rule - and wear exactly like
 * live ones so they can be judged on a real profile.
 */
export default async function CustomizePage() {
  const viewer = await getViewer();
  if (viewer.kind === "anonymous") redirect("/login?next=/profile/customize");

  const playerId =
    viewer.kind === "player"
      ? viewer.playerId
      : ((await playerForUser(viewer.user.id))?.id ?? null);
  if (!playerId) redirect("/profile/settings");

  const { sections } = await customizeSections(playerId);

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
          <h1 className="text-2xl font-bold text-text-primary">Customize</h1>
          <p className="text-sm text-text-secondary">
            Everything you own, wearable from one place. Changes land on your profile
            the moment you tap them.
          </p>
        </div>
        <Link
          href="/profile/store"
          className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong"
        >
          <ShoppingBag className="size-4" aria-hidden="true" />
          Embers store
        </Link>
      </div>

      <CustomizeHub sections={sections} />
    </main>
  );
}
