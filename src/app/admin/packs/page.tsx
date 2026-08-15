import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CatalogBrowser } from "@/components/admin/catalog-browser";
import { PackSetBuilder } from "@/components/admin/pack-set-builder";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { CATALOG_KINDS, KIND_LABELS, catalogForConsole } from "@/lib/admin/catalog";
import { listPackSets } from "@/lib/admin/pack-sets";

export const metadata: Metadata = {
  title: "Packs and cosmetics",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** What each outcome of an art upload says when the redirect lands. */
const ART_MESSAGES: Record<string, string> = {
  saved: "Art uploaded.",
  missing: "Pick a file first.",
  "too-big": "That image is too large. Six megabytes at most.",
  failed: "That did not upload. Try again in a moment.",
};

/**
 * The room where sets get built and the catalogue gets curated.
 *
 * Two jobs on one page because they are one job in practice: the founder
 * walks the catalogue deciding what is good enough, and gathers the
 * survivors into a set with a name, a release date and its own art.
 *
 * Nothing here is visible to a player. Cosmetics stay draft until they
 * are set live one at a time; a set stays off the shop floor until it is
 * published, and even then not before its release date.
 */
export default async function AdminPacksPage({
  searchParams,
}: {
  searchParams: Promise<{ art?: string }>;
}) {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const [entries, sets] = await Promise.all([catalogForConsole(), listPackSets()]);

  const artSaid = ART_MESSAGES[(await searchParams).art ?? ""] ?? null;

  const groups = CATALOG_KINDS.map((kind) => ({
    kind,
    title: KIND_LABELS[kind]?.title ?? kind,
    blurb: KIND_LABELS[kind]?.blurb ?? "",
  }));

  /* Everything can go in a set, drafts included: putting an unreleased
     cosmetic in an unreleased set is the whole workflow. Publishing is
     what refuses drafts, and it names them when it does. */
  const choices = entries.map((entry) => ({
    slug: entry.slug,
    name: entry.name,
    kind: entry.kind,
    status: entry.status,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/admin"
          className="flex w-fit items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Console
        </Link>
        <h1 className="text-2xl font-bold text-text-primary">Packs and cosmetics</h1>
        <p className="text-sm text-text-secondary">
          Build a set, decide what goes in it and when it opens. The catalogue below is
          everything that exists, including the{" "}
          {entries.filter((e) => e.status === "draft").length} kept behind the scenes.
        </p>
      </div>

      {artSaid && (
        <Card>
          <p role="status" className="text-sm text-text-secondary">
            {artSaid}
          </p>
        </Card>
      )}

      <PackSetBuilder sets={sets} choices={choices} />

      <CatalogBrowser entries={entries} groups={groups} />
    </div>
  );
}
