import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Card } from "@/components/ui/card";
import { DataAttribution } from "@/components/cards/data-attribution";
import { requireAdmin } from "@/lib/auth/session";
import { spotCheck } from "@/lib/cards/spot-check";

export const metadata: Metadata = {
  title: "Spot check",
  robots: { index: false, follow: false },
};

/** Privileged and per-request, like the rest of the console. */
export const dynamic = "force-dynamic";

/**
 * A spread of imported cards, laid out to be read against the real thing.
 *
 * The catalog reaching zero rejections proves every record parsed. It proves
 * nothing about whether the values are right — OP10-042 arrived with a power
 * in its life field and was only caught because that blew a range check. A
 * shift between two fields of the same type would have imported silently.
 * This page is the part a machine cannot do.
 */
export default async function SpotCheckPage() {
  // The layout guards too. Duplicated deliberately: a layout is not a
  // security boundary on its own.
  await requireAdmin();

  const { report, cards } = await spotCheck();

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

        <h2 className="text-xl font-bold text-text-primary">Spot check</h2>

        <p className="max-w-2xl text-sm text-text-secondary">
          A spread of imported cards, chosen by shape rather than by name — one of each
          card type, plus a multicolour card, a card with a counter, one with a trigger,
          and one with no cost. Read each against the official One Piece card list.
          Every value below came from the provider; none of it has been checked by
          anyone.
        </p>
      </div>

      {cards.length === 0 ? (
        <Card>
          <p className="text-text-secondary">
            Nothing to check yet. Run a sync from{" "}
            <Link href="/admin" className="text-accent hover:underline">
              Card catalog
            </Link>
            .
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col gap-3">
            <h3 className="font-semibold text-text-primary">Copy this</h3>
            <p className="text-sm text-text-secondary">
              Plain text so it survives being pasted somewhere else.
            </p>
            {/*
             * Scrolls inside itself rather than stretching the page — long
             * effect text would otherwise force the whole console sideways.
             */}
            <pre className="max-h-[32rem] overflow-auto rounded-[var(--radius-control)] border border-border bg-canvas p-4 font-mono text-xs leading-relaxed text-text-secondary">
              {report}
            </pre>
          </Card>

          <DataAttribution />
        </>
      )}
    </div>
  );
}
