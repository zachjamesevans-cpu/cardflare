import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { SpotCheckRow } from "@/components/admin/spot-check-row";
import { Card } from "@/components/ui/card";
import { DataAttribution } from "@/components/cards/data-attribution";
import { requireAdmin } from "@/lib/auth/session";
import { spotCheck } from "@/lib/cards/spot-check";
import { verdictsFor } from "@/lib/cards/spot-check-verdicts";

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
  const verdicts = await verdictsFor(cards.map((card) => card.id));
  const checked = cards.filter((card) => verdicts.has(card.id)).length;
  const wrong = cards.filter(
    (card) => verdicts.get(card.id)?.verdict === "wrong",
  ).length;

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
          A spread of imported cards, chosen by shape rather than by name: one of each
          card type, plus a multicolour card, a card with a counter, one with a trigger,
          and one with no cost. Read each against the official card list for its game.
          Every value below came from the provider; a card is only as right as the
          verdict somebody left on it.
        </p>

        {cards.length > 0 && (
          <p className="text-sm text-text-muted tabular-nums" role="status">
            {checked} of {cards.length} checked · {wrong} wrong
          </p>
        )}
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
          <div className="flex flex-col gap-4">
            {cards.map((card) => (
              <SpotCheckRow
                key={card.id}
                card={card}
                verdict={verdicts.get(card.id) ?? null}
              />
            ))}
          </div>

          {/* The old sheet, kept for whoever still pastes it into a
              chat. Folded away: the verdict buttons are the job now. */}
          <details className="group">
            <summary className="cursor-pointer text-sm text-text-secondary hover:text-text-primary">
              Plain text, for pasting elsewhere
            </summary>
            <Card className="mt-3 flex flex-col gap-3">
              <h3 className="font-semibold text-text-primary">Copy this</h3>
              <p className="text-sm text-text-secondary">
                Plain text so it survives being pasted somewhere else.
              </p>
              {/*
               * Scrolls inside itself rather than stretching the page: long
               * effect text would otherwise force the whole console sideways.
               */}
              <pre className="max-h-[32rem] overflow-auto rounded-[var(--radius-control)] border border-border bg-canvas p-4 font-mono text-xs leading-relaxed text-text-secondary">
                {report}
              </pre>
            </Card>
          </details>

          <DataAttribution />
        </>
      )}
    </div>
  );
}
