import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The app's card picker, after the founder's asks on it: "Should have
 * a way to click the alt arts from this screen", then "make app
 * function closer to the second image" (the website's versions list),
 * and "there should be a green loading icon or something that shows
 * it's searching".
 */
describe("the app card picker", () => {
  const composer = read("mobile/src/screens/flare-composer.tsx");
  const web = read("src/components/cards/card-search.tsx");

  it("lists a card's versions under its row with the website's bar and words", () => {
    expect(composer).toContain(
      "const [fanned, setFanned] = useState<string | null>(null);",
    );
    expect(composer).toContain(
      "`${hit.printings.length} versions, alt arts and promos`",
    );
    expect(web).toContain("versions, alt arts and promos");
    expect(composer).toContain(
      "Tap a version to ask for that exact one, or the card above to",
    );
    expect(web).toContain(
      "Tap a version to ask for that exact one, or the card above to take any",
    );
  });

  it("adds the exact version tapped and badges that version, not the card above it", () => {
    expect(composer).toContain(
      "const pick = (hit: CardHit, printingId: string | null = null)",
    );
    expect(composer).toContain("onPress={() => pick(hit, printing.id)}");
    /* The card row badges the any-printing line; a version badges its own. */
    expect(composer).toContain("{anyLine ? (");
    expect(composer).toContain("{line ? (");
    expect(composer).toContain("onLess={() => unpick(hit, printing.id)}");
  });

  it("shows the accent ring from the keystroke until the answer lands", () => {
    expect(composer).toContain("const [searching, setSearching] = useState(false);");
    expect(composer).toContain("setSearching(true);");
    expect(composer).toContain("if (!stale) setSearching(false);");
    expect(composer).toContain(
      "{search.searching && search.hits.length === 0 ? <Loading /> : null}",
    );
  });

  it("tints the website's search loader the same accent", () => {
    expect(web).toContain('className="size-4 shrink-0 animate-spin text-accent"');
  });
});

describe("how many copies, and one fewer", () => {
  it("badges the copies count alone and puts a minus beside it, on both platforms", () => {
    const composer = read("mobile/src/screens/flare-composer.tsx");
    expect(composer).toContain("function PickCount({");
    expect(composer).toContain("accessibilityLabel={`One fewer ${name}`}");
    expect(composer).not.toContain("`x${chosen.quantity}`");
    expect(composer).not.toContain("`${index + 1} x${chosen.quantity}`");

    const picker = read("src/components/flares/card-picker.tsx");
    expect(picker).toContain(
      "function markText(quantity: number): string {\n  return `${quantity}`;",
    );
    expect(picker).toContain("onLess(lineKey(card.id, printing?.id ?? null))");

    const search = read("src/components/cards/card-search.tsx");
    expect(search).toContain('aria-label="One fewer"');
    expect(search).toContain(
      "{mark && onUnpick && <UnpickButton onClick={() => onUnpick(card)} />}",
    );

    const draft = read("src/components/flares/draft.ts");
    expect(draft).toContain("export function lessCard(");
  });
});
