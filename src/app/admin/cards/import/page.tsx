import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { DeleteImportedSet } from "@/components/admin/delete-imported-set";
import { SetImport } from "@/components/admin/set-import";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/session";
import { listImportedSets } from "@/lib/cards/imported-sets";

export const metadata: Metadata = {
  title: "Import a set",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Bringing in a set no provider carries yet.
 *
 * OP-17 existed as spoilers on fan sites months before any API had it,
 * and the official Bandai card list publishes every set weeks ahead of
 * the providers — a board with no artwork for the set everybody is
 * actually hunting is a board nobody opens. This is the door for both,
 * and the page is honest about what comes through it: exactly what the
 * manifest's source stated, nothing guessed. The review screen behind
 * each set is where a person classifies alt arts and fills what the
 * source could not say.
 */
export default async function ImportSetPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const imported = await listImportedSets();

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

        <h2 className="text-xl font-bold text-text-primary">Import a set</h2>
        <p className="max-w-2xl text-sm text-text-secondary">
          For sets no provider carries yet. Cards land with whatever the manifest can
          honestly state: the official Bandai card list brings full stats and effects, a
          spoiler scrape brings a number and a picture. Nothing is ever guessed to fill
          a gap &mdash; open a set below to classify alt arts and finish any missing
          stats by hand.
        </p>
      </div>

      <section className="flex flex-col gap-5" aria-labelledby="import-heading">
        <h3 id="import-heading" className="text-lg font-bold text-text-primary">
          Manifest and pictures
        </h3>
        <Card>
          <SetImport />
        </Card>
      </section>

      <section className="flex flex-col gap-5" aria-labelledby="imported-heading">
        <h3 id="imported-heading" className="text-lg font-bold text-text-primary">
          Already imported
        </h3>

        {imported.length === 0 ? (
          <Card className="py-10 text-center">
            <p className="text-text-secondary">
              Nothing imported by hand yet. Everything in the catalogue came from a
              provider.
            </p>
          </Card>
        ) : (
          <Card className="flex flex-col gap-4">
            <ul className="flex flex-col">
              {imported.map((set) => (
                <li
                  key={`${set.providerKey}-${set.setCode}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-3 first:border-t-0 first:pt-0"
                >
                  <span className="font-semibold text-text-primary">{set.setCode}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">
                    {set.setName ?? "Unnamed set"}
                  </span>
                  <span
                    className={`text-xs tabular-nums ${
                      set.withArt < set.printings ? "text-danger" : "text-text-muted"
                    }`}
                  >
                    {set.printings} printing{set.printings === 1 ? "" : "s"} ·{" "}
                    {set.withArt} with art
                  </span>
                  <Link
                    href={`/admin/cards/import/${set.providerKey}/${encodeURIComponent(set.setCode)}`}
                    className="text-sm font-semibold text-accent hover:text-accent-hover"
                  >
                    Review
                  </Link>
                  <DeleteImportedSet
                    provider={set.providerKey}
                    setCode={set.setCode}
                    printings={set.printings}
                  />
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-border bg-elevated p-4">
              <p className="text-sm font-semibold text-text-primary">
                What Remove does
              </p>
              <p className="text-sm text-text-secondary">
                Deletes the set&rsquo;s printings and its stored pictures. Card rows go
                too, but only the ones nothing else is pointing at &mdash; once a real
                provider carries a card, that card belongs to the provider and removing
                this import leaves it alone.
              </p>
              <p className="text-sm text-text-secondary">
                So the day a provider ships the set: sync it first, then Remove. The
                placeholders disappear and the provider&rsquo;s own artwork stays.
              </p>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
