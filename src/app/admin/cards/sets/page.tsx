import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SetList } from "@/components/admin/set-list";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { catalogBySet } from "@/lib/cards/health";

export const metadata: Metadata = {
  title: "Sets",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Every set the catalog holds, on its own page.
 *
 * The audit found 482 set codes scrolling inside a box on the dashboard,
 * which is a list nobody reads. The dashboard now says how many; this
 * is where the codes are, with a filter, sorted so a set is found by
 * its code rather than by scrolling.
 */
export default async function AdminSetsPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const { sets, truncated } = await catalogBySet();
  const sorted = sets.toSorted((a, b) => a.setCode.localeCompare(b.setCode));
  const total = sets.reduce((sum, set) => sum + set.cards, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to admin
        </Link>

        <h2 className="text-xl font-bold text-text-primary">Sets</h2>

        <p className="max-w-2xl text-sm text-text-secondary">
          Distinct cards per set, not printings: a card with an alternate art is one
          card in its set. Compare against the official set list before telling anyone
          the catalog is complete.
          {truncated &&
            " Counts are partial because the catalog exceeds the read limit."}
        </p>

        <p className="text-sm text-text-muted tabular-nums">
          {sets.length} {sets.length === 1 ? "set" : "sets"} · {total.toLocaleString()}{" "}
          cards
        </p>
      </div>

      {sets.length === 0 ? (
        <Card>
          <p className="text-text-secondary">
            Nothing imported yet. Run a sync from{" "}
            <Link href="/admin#sync-heading" className="text-accent hover:underline">
              Card catalog
            </Link>
            .
          </p>
        </Card>
      ) : (
        <SetList sets={sorted} />
      )}
    </div>
  );
}
