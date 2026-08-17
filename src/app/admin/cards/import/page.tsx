import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
 * OP-17 exists as spoilers on fan sites months before any API has it,
 * and a board with no artwork for the set everybody is actually hunting
 * is a board nobody opens. This is the door for that, and the page is
 * honest about what comes through it: a picture and a number, with every
 * gameplay field left empty until a provider supplies one.
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
          For sets no provider carries yet. Cards land with a number, a name and a
          picture; cost, power, colours and effect stay empty until a real provider
          ships the set, because a guessed value is indistinguishable from a fact once
          it is in the catalogue.
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
                  <span className="text-xs text-text-muted tabular-nums">
                    {set.printings} printing{set.printings === 1 ? "" : "s"} ·{" "}
                    {set.withArt} with art
                  </span>
                </li>
              ))}
            </ul>

            {/*
             * The exit, written down where somebody standing in front of
             * the mess will look for it. Deliberately not a button: it
             * deletes a whole set, and the moment to do it is after a
             * provider sync has already landed, which is not something
             * this page can check.
             */}
            <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-border bg-elevated p-4">
              <p className="text-sm font-semibold text-text-primary">
                Retiring an imported set
              </p>
              <p className="text-sm text-text-secondary">
                Once a provider carries the set, sync it and then delete these
                printings. The card rows need no cleanup: they are keyed on the card
                number, so the sync updates them in place on the way past.
              </p>
              <code className="mt-1 block overflow-x-auto rounded-[var(--radius-control)] bg-canvas p-3 font-mono text-xs text-text-secondary">
                delete from public.card_printings where provider_key =
                &apos;kaizoku&apos; and set_code = &apos;OP17&apos;;
              </code>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
