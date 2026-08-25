import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { SetReview } from "@/components/admin/set-review";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { IMPORT_PROVIDERS } from "@/lib/cards/import-schema";
import { listSetForReview } from "@/lib/cards/imported-sets";

export const metadata: Metadata = {
  title: "Review an imported set",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * One imported set, printing by printing, for human eyes.
 *
 * The import brings in what its source states; this page is for what a
 * source cannot state. The official card list marks that a parallel
 * exists but never whether it is the manga art, and a spoiler scrape
 * has no gameplay data at all — both gaps close here, in the same
 * vocabulary the provider sync writes, so a card finished on this page
 * behaves identically to a synced one in every search.
 */
export default async function ReviewImportedSetPage({
  params,
}: {
  params: Promise<{ provider: string; setCode: string }>;
}) {
  await requireAdmin();

  const { provider, setCode } = await params;
  const set = decodeURIComponent(setCode).toUpperCase();

  if (!(IMPORT_PROVIDERS as readonly string[]).includes(provider)) notFound();

  const printings = await listSetForReview(provider, set);
  if (printings.length === 0) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/admin/cards/import"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to imports
        </Link>

        <h2 className="text-xl font-bold text-text-primary">
          {set}: {printings.length} printing{printings.length === 1 ? "" : "s"}
        </h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          Classify each picture, and open a card to fix its stats. Every change saves
          against this import only &mdash; the day a real provider ships the set, its
          sync takes over and these rows step aside.
        </p>
      </div>

      <Card>
        <SetReview printings={printings} />
      </Card>
    </div>
  );
}
