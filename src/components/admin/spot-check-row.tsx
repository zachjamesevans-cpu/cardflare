import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { spotCheckVerdictAction } from "@/lib/admin/spot-check-actions";
import { printingLabel, type CardResult } from "@/lib/cards/schema";
import type { SpotVerdict } from "@/lib/cards/spot-check-verdicts";
import { gameShortName } from "@/lib/players/games-catalog";

/**
 * One card of the spread, laid out to be read against the real one,
 * with a place to say what was found.
 *
 * The verdict is the point. The old page was a sheet to copy somewhere
 * else, and nothing on the site remembered the answer; now "Looks
 * right" and "Wrong" post straight back, and a wrong card stays red on
 * the dashboard until somebody fixes the data and checks again.
 *
 * A Server Component: the forms post a Server Action and the page
 * revalidates, so there is nothing here that needs the browser.
 */
export function SpotCheckRow({
  card,
  verdict,
}: {
  card: CardResult & { because: string; game: string };
  verdict: SpotVerdict | null;
}) {
  const dash = (value: unknown) =>
    value === null || value === undefined || value === "" ? "-" : String(value);

  /*
   * The card shape is One Piece's, because that is the catalogue the
   * sync builds. Counter, Life and Trigger mean nothing on a Magic or a
   * Pokémon card, and a row of dashes under those labels reads as a
   * broken import rather than as a different game. The other fields
   * have a meaning in every game, and show a dash honestly when the
   * provider sent nothing.
   */
  const onePiece = card.game === "one-piece";
  const facts: [string, string][] = [
    ["Type", dash(card.cardType)],
    ["Colors", dash(card.colors.join(", "))],
    ["Traits", dash(card.traits.join(" | "))],
    ["Cost", dash(card.cost)],
    ["Power", dash(card.power)],
    ...(onePiece
      ? ([
          ["Counter", dash(card.counter)],
          ["Life", dash(card.life)],
        ] as [string, string][])
      : []),
    ["Rarity", dash(card.rarity)],
    ["Effect", dash(card.effectText?.replace(/\s+/g, " "))],
    ...(onePiece
      ? ([["Trigger", dash(card.triggerText?.replace(/\s+/g, " "))]] as [
          string,
          string,
        ][])
      : []),
    [
      "Printings",
      dash(
        card.printings
          .map((printing) => printingLabel(printing, card.exactName) ?? "-")
          .join(" / "),
      ),
    ],
    ["Images", String(card.printings.filter((printing) => printing.imageUrl).length)],
  ];

  return (
    <Card as="article" className="flex flex-col gap-4">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-text-primary">
            <span className="font-mono">{card.canonicalCardNumber}</span> ·{" "}
            {card.exactName}
          </h3>
          <Badge tone="neutral">{gameShortName(card.game)}</Badge>
        </div>
        <p className="text-xs text-text-muted">picked: {card.because}</p>
      </header>

      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8rem_1fr]">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-muted">{label}</dt>
            <dd className="min-w-0 break-words text-text-secondary">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {verdict &&
          (verdict.verdict === "ok" ? (
            <Badge className="w-fit">Checked, looks right</Badge>
          ) : (
            <p className="text-sm font-semibold text-danger" role="status">
              Marked wrong{verdict.note ? `: ${verdict.note}` : ""}
            </p>
          ))}

        <div className="flex flex-wrap items-center gap-2">
          <form
            action={spotCheckVerdictAction}
            className="flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="cardId" value={card.id} readOnly />
            <Button
              type="submit"
              name="verdict"
              value="ok"
              variant="secondary"
              size="sm"
            >
              Looks right
            </Button>
            <Button
              type="submit"
              name="verdict"
              value="wrong"
              variant="danger"
              size="sm"
            >
              Wrong
            </Button>
            <TextInput
              name="note"
              maxLength={200}
              placeholder="What is off"
              aria-label={`What is off about ${card.exactName}`}
              className="min-w-0 flex-1 basis-56 py-1.5 text-sm"
            />
          </form>

          {verdict && (
            <form action={spotCheckVerdictAction}>
              <input type="hidden" name="cardId" value={card.id} readOnly />
              <input type="hidden" name="verdict" value="clear" readOnly />
              <Button type="submit" variant="ghost" size="sm">
                Check again
              </Button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}
