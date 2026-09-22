import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The app's card picker, after the founder's two asks on it: "Should
 * have a way to click the alt arts from this screen", and "there should
 * be a green loading icon or something that shows it's searching".
 */
describe("the app card picker", () => {
  const composer = read("mobile/src/screens/flare-composer.tsx");

  it("fans a card's printings out under its row and adds the exact one tapped", () => {
    expect(composer).toContain(
      "const [fanned, setFanned] = useState<string | null>(null);",
    );
    expect(composer).toContain(
      "const pick = (hit: CardHit, printingId: string | null = null)",
    );
    expect(composer).toContain("onPress={() => pick(hit, printing.id)}");
    expect(composer).toContain('{printing.label ?? "Standard"}');
    /* The count is the door, in the accent, with a chevron that says so. */
    expect(composer).toContain(
      "`Show the ${hit.printings.length} printings of ${hit.name}`",
    );
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
    expect(read("src/components/cards/card-search.tsx")).toContain(
      'className="size-4 shrink-0 animate-spin text-accent"',
    );
  });
});
