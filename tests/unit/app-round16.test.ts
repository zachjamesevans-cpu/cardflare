import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as app from "../../mobile/src/offer-copy";

/* A file that is not there yet reads as empty, so every pin on it
   fails by name instead of the whole suite failing to load. */
const read = (path: string) => {
  try {
    return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  } catch {
    return "";
  }
};

/** The source between two markers, or "" when either is missing. */
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from === -1 || to === -1 ? "" : source.slice(from, to);
};

/**
 * Round 16 in the app: the offer flow.
 *
 * The second audit (2026-10-02), verbatim where it matters: "Viewer
 * offers always send 1 copy... no stepper." "Closing the viewer
 * silently drops every picked card." "Two wordings for one action."
 * "Full list is hidden." "Review screen: no way to remove a card
 * there." "The panel also jumps about 25px when the review button
 * appears." "Ticking a card expands a stepper and pushes the rows
 * down." "'Need 2 more' reads wrong before anything is found."
 *
 * Read off the source, because the app has no renderer in the test
 * run; the copy helpers are run, because they are plain functions.
 */

const src = {
  copy: read("mobile/src/offer-copy.ts"),
  counts: read("mobile/src/flare-copy.ts"),
  zoom: read("mobile/src/ui.tsx"),
  card: read("mobile/src/flare-feed-card.tsx"),
  pager: read("mobile/src/flare-deck-pager.tsx"),
  review: read("mobile/src/offer-review-sheet.tsx"),
  sheet: read("mobile/src/flare-cards-sheet.tsx"),
  hunt: read("mobile/src/hunts-panel.tsx"),
  progress: read("mobile/src/flare-progress-sheet.tsx"),
  home: read("mobile/src/screens/home.tsx"),
};

/* The viewer's offer block alone, as rounds 13 and 14 scoped it. */
const have = between(src.zoom, "function ZoomHaveForm(", "export function CardImage(");

describe("the copy helpers say the pinned strings", () => {
  it("reviewLabel counts cards with a middle dot", () => {
    expect(app.reviewLabel(1)).toBe("Review offer · 1 card");
    expect(app.reviewLabel(3)).toBe("Review offer · 3 cards");
    expect(app.reviewLabel(0)).toBe("Review offer · 0 cards");
  });

  it("inYourOfferLine and seeAllLabel", () => {
    expect(app.inYourOfferLine(1)).toBe("1 in your offer");
    expect(app.inYourOfferLine(3)).toBe("3 in your offer");
    expect(app.seeAllLabel(4)).toBe("See all 4 cards");
    expect(app.seeAllLabel(17)).toBe("See all 17 cards");
  });

  it("selectionSummary has no 'selected', so it fits a phone", () => {
    expect(app.selectionSummary(1, 1)).toBe("1 card · 1 copy");
    expect(app.selectionSummary(2, 3)).toBe("2 cards · 3 copies");
    expect(app.selectionSummary(1, 2)).toBe("1 card · 2 copies");
  });

  it("wantsLine says Wants N until something is found", () => {
    expect(app.wantsLine(2, 2)).toBe("Wants 2");
    expect(app.wantsLine(1, 1)).toBe("Wants 1");
    expect(app.wantsLine(2, 1)).toBe("Need 1 more");
    expect(app.wantsLine(3, 2)).toBe("Need 2 more");
    expect(app.wantsLine(2, 0)).toBe("Found");
    expect(app.wantsLine(1, -1)).toBe("Found");
  });

  it("has let the retired labels go", () => {
    expect(src.copy).not.toContain("offerButtonLabel");
    expect(src.copy).not.toContain("Offer this card");
    expect(src.copy).not.toContain("`Offer ${count} cards`");
    expect(src.counts).not.toContain("needLabel");
    expect(src.counts).not.toContain("selectionLabel");
    expect(src.counts).not.toContain("selected ·");
  });
});

describe("the helpers match the website's, body for body", () => {
  const webPath = resolve(import.meta.dirname, "../../src/lib/feed/offer-copy.ts");
  const webSource = existsSync(webPath) ? readFileSync(webPath, "utf8") : "";
  const landed = webSource.includes("export function wantsLine(");
  const NAMES = [
    "reviewLabel",
    "inYourOfferLine",
    "seeAllLabel",
    "selectionSummary",
    "wantsLine",
  ] as const;

  /** A function's body from `export function name(` to its closing brace. */
  const body = (source: string, name: string) => {
    const from = source.indexOf(`export function ${name}(`);
    if (from === -1) return "";
    const to = source.indexOf("\n}\n", from);
    return source.slice(from, to + 3);
  };

  it.skipIf(!landed)("has identical bodies", () => {
    for (const name of NAMES) {
      expect(body(src.copy, name), name).toBe(body(webSource, name));
    }
  });

  it.skipIf(!landed)("gives identical answers", async () => {
    const web = (await import("../../src/lib/feed/offer-copy")) as typeof app;
    for (const n of [0, 1, 2, 3, 7, 17]) {
      expect(app.reviewLabel(n)).toBe(web.reviewLabel(n));
      expect(app.inYourOfferLine(n)).toBe(web.inYourOfferLine(n));
      expect(app.seeAllLabel(n)).toBe(web.seeAllLabel(n));
      for (const copies of [0, 1, 2, 5]) {
        expect(app.selectionSummary(n, copies)).toBe(web.selectionSummary(n, copies));
        expect(app.wantsLine(n, copies)).toBe(web.wantsLine(n, copies));
      }
    }
  });
});

describe("the picks live on the post, not in the viewer", () => {
  it("the Feed card owns them as quantities and hands them down", () => {
    expect(src.card).toContain("const [picks, setPicks] = useState<ZoomPicks>({});");
    expect(src.zoom).toContain("export type ZoomPicks = Record<string, number>;");
    /* Both the single-card row and the carousel carry them to the zoom. */
    expect(src.card.match(/picks=\{picks\}/g)?.length).toBe(2);
    expect(src.card.match(/onPicks=\{setPicks\}/g)?.length).toBe(2);
    expect(src.pager).toContain("picks?: ZoomPicks;");
    expect(src.pager.match(/picks=\{picks\}/g)?.length).toBe(2);
  });

  it("the zoom takes them as props and keeps them through a close", () => {
    expect(src.zoom).toContain("picks?: ZoomPicks;");
    expect(src.zoom).toContain("onPicks?: (picks: ZoomPicks) => void;");
    expect(src.zoom).toContain("const owned = Boolean(givenPicks && onPicks);");
    /* The close used to drop every pick; now only the zoom's own go. */
    expect(src.zoom).toContain("if (!owned) setOwnPicks({});");
    expect(src.zoom).not.toMatch(/setOpen\(false\);\s*setPicks\(\{\}\);/);
    /* In at one copy; the review is where the number is raised. */
    expect(have).toContain("else cards[have.flareId] = 1;");
    /* Nothing is stored: the page's life is the rule. */
    expect(src.card).not.toContain("AsyncStorage");
  });

  it("says N in your offer with a Review door while the viewer is closed", () => {
    expect(src.card).toContain("{inYourOfferLine(inOffer)}");
    expect(src.card).toContain("const inOffer = Object.keys(picks).length;");
    expect(src.card).toContain("{inOffer > 0 ? (");
    expect(src.card).toMatch(/>\s*Review\s*<\/Text>/);
    expect(src.card).toContain('accessibilityLabel="Review your offer"');
    expect(src.card).toContain("onPress={() => setReviewing(true)}");
    /* The door opens the one review sheet, through the post's own send. */
    expect(src.card).toContain("<OfferReviewSheet");
    expect(src.card).toContain("await post.offer(items, note)");
    /* Sending clears the line. */
    expect(src.card).toContain("onSent={() => setPicks({})}");
  });
});

describe("the review has a stepper and a Remove on every line", () => {
  it("steps each line, capped at what the line allows", () => {
    expect(src.review).toContain('import { Stepper } from "./stepper";');
    expect(src.review).toContain("max: number;");
    expect(src.review).toContain("max={Math.max(1, line.max)}");
    expect(src.review).toContain("onChange={(value) => onChange(line.flareId, value)}");
    expect(src.review).toContain(
      "onChange: (flareId: string, quantity: number) => void;",
    );
    /* The cap is the post's remaining, on every door into the review. */
    expect(src.card).toContain("max: card ? remainingOf(card) : 1,");
    expect(src.sheet).toContain("max: remainingOf(card),");
    expect(src.zoom).toContain("max: haveOf(flareId)?.remaining ?? 1,");
    expect(src.pager).toContain("remaining: remainingOf(card)");
    expect(src.zoom).toContain("remaining?: number;");
  });

  it("removes a line by name and closes on the last one", () => {
    expect(src.review).toContain("accessibilityLabel={`Remove ${line.name}`}");
    expect(src.review).toMatch(/>\s*Remove\s*<\/Text>/);
    expect(src.review).toContain("if (lines.length === 1) (onBack ?? onClose)();");
  });

  it("sums up as N cards · M copies", () => {
    expect(src.review).toContain("{selectionSummary(lines.length, copies)}");
    expect(src.review).not.toContain("copiesLabel(line.quantity)");
  });

  it("every caller answers onChange by editing its own picks", () => {
    for (const [name, source] of [
      ["card", src.card],
      ["sheet", src.sheet],
      ["zoom", src.zoom],
    ] as const) {
      expect(source, name).toContain("onChange={(flareId, quantity) =>");
      expect(source, name).toContain("if (quantity <= 0) delete next[flareId];");
    }
  });
});

describe("one set of words wherever a card can be offered", () => {
  const TOGGLE = ["I have this card", "Added to your offer"];
  const GONE = ["Offer this card", "Continue to offer", "Unselect ", "`Offer ${card"];

  it("the viewer, the full list and the hunt page say the same thing", () => {
    for (const [name, source] of [
      ["zoom", have],
      ["sheet", src.sheet],
      ["hunt", src.hunt],
    ] as const) {
      for (const word of TOGGLE) expect(source, name).toContain(word);
      for (const word of GONE) expect(source, name).not.toContain(word);
      /* The check is an icon before the words, never a typed character. */
      expect(source, name).toContain('name="checkmark"');
      expect(source, name).not.toContain("✓");
    }
    /* The toggle names the card for a screen reader, in and out. */
    for (const source of [src.sheet, src.hunt]) {
      expect(source).toContain("`Add ${card.cardName} to your offer`");
      expect(source).toContain("`Remove ${card.cardName} from your offer`");
    }
  });

  it("the continue control is Review offer · N cards everywhere", () => {
    expect(have).toContain("const tray = reviewLabel(count);");
    expect(have).toContain("label={tray}");
    expect(src.sheet).toContain("label={reviewLabel(chosen.length)}");
    expect(src.hunt).toContain("label={reviewLabel(cards)}");
    expect(src.hunt).toContain("{selectionSummary(cards, copies)}");
    expect(src.sheet).toContain("selectionSummary(chosen.length, copies)");
    for (const source of Object.values(src)) {
      expect(source).not.toContain("Continue to offer");
      expect(source).not.toContain("offerButtonLabel");
    }
  });
});

describe("the next step stands out and nothing jumps", () => {
  it("the viewer's tray is the accent, drawn from the start", () => {
    /* Primary (no variant), disabled and dimmed until a card is in. */
    expect(have).toContain(
      "<Button label={tray} disabled={count === 0} onPress={onReview} />",
    );
    expect(have).toContain("opacity: count > 0 ? 1 : 0.45");
    expect(have).not.toContain('label={tray} variant="secondary"');
    expect(have).not.toMatch(/\{count > 0 \? \(\s*<Button label=\{tray\}/);
    /* "Added to your offer" stays secondary. */
    expect(have).toContain("style={[styles.button, added && styles.buttonSecondary]}");
  });

  it("the full list's review button is the accent with its space reserved", () => {
    expect(src.sheet).toContain("opacity: chosen.length > 0 ? 1 : 0.45");
    expect(src.sheet).toContain("disabled={chosen.length === 0}");
    expect(src.sheet).not.toContain(
      'variant="secondary"\n                      onPress={() => setReviewing(true)}',
    );
  });

  it("every row reserves its stepper's space, disabled until ticked", () => {
    expect(src.sheet).toContain("disabled={count === 0}");
    expect(src.sheet).toContain("value={count > 0 ? count : 1}");
    expect(src.sheet).not.toMatch(/\{count > 0 \? \(\s*<Stepper/);
    expect(src.hunt).toContain("disabled={!selected}");
    expect(src.hunt).toContain("value={selected ? visitor.picked : 1}");
    expect(src.hunt).not.toMatch(/\{selected \? \(\s*<Stepper/);
  });
});

describe("the full list is one tap from the carousel", () => {
  it("draws See all N cards on the dots row, for more than one card", () => {
    expect(src.pager).toContain("{seeAllLabel(cards.length)}");
    expect(src.pager).toContain("accessibilityLabel={seeAllLabel(cards.length)}");
    expect(src.pager).toContain("{onSeeAll && cards.length > 1 ? (");
    expect(src.pager).toContain('justifyContent: "space-between"');
    /* The same sheet the menu opens; the menu entry stays. */
    expect(src.card).toContain("onSeeAll={onViewAll}");
    expect(src.card).toContain("View all ${total} cards");
  });
});

describe("Wants N until something is found", () => {
  it("every place that printed Need N more goes through wantsLine", () => {
    expect(src.pager).toContain("wantsLine(copiesOf(card), remaining)");
    expect(src.sheet).toContain("wantsLine(copiesOf(card), remaining)");
    expect(src.hunt).toContain("wantsLine(needed, remaining)");
    expect(src.progress).toContain("wantsLine(total, left)");
  });

  it("nothing in the app spells Need N more by hand", () => {
    const root = resolve(import.meta.dirname, "../../mobile/src");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
      );
    const offenders = walk(root).filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !file.endsWith("offer-copy.ts") &&
        /Need \$\{|needLabel\(/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("take down leaves the list at once", () => {
  it("hides the post by id the moment the server says ok, and undo unhides", () => {
    const takeDown = between(
      src.home,
      "const takeDown = async (postId: string)",
      "const follow",
    );
    expect(takeDown.length).toBeGreaterThan(0);
    expect(src.home).toContain("useState<ReadonlySet<string>>(() => new Set())");
    expect(src.home).toContain('!(item.kind === "hunt" && hidden.has(item.postId))');
    expect(takeDown).toContain("setHidden((current) => new Set(current).add(postId));");
    /* Hidden before the stale mark, so the reload behind only confirms. */
    expect(takeDown.indexOf("setHidden(")).toBeLessThan(
      takeDown.indexOf("markFeedStale()"),
    );
    expect(takeDown.indexOf("if (!result.ok) return;")).toBeLessThan(
      takeDown.indexOf("setHidden("),
    );
    const undo = between(takeDown, "onUndo: async () => {", "await load(");
    expect(undo).toContain("next.delete(postId);");
    expect(undo.indexOf("next.delete(postId)")).toBeLessThan(
      undo.indexOf("restorePost("),
    );
  });
});

/**
 * Round 16b: every row that lists a card with a control is one shape.
 *
 * The founder, on the full list after round 16 (2026-10-03): "There's
 * a card in top left, then it like stair steps down until there's the
 * quantity amount listed bottom right. Ideally, the card would be
 * larger in view, and take up the whole left side of the panel. No
 * text below it, and only text to the right and everything aligned."
 * So: the art 88 x 123 down the left, one left-aligned column beside
 * it, in a fixed order, and nothing stacked on the right.
 */
describe("the offer rows are one shape: art left, one column right", () => {
  const sheetRow = between(src.sheet, "{open.cards.map((card) => {", "</ScrollView>");
  const reviewLine = between(src.review, "{lines.map((line) => (", "</ScrollView>");
  const huntRow = between(
    src.hunt,
    "export function HuntCardRow(",
    "export function HuntOfferFooter(",
  );

  /** Each marker's position, in the order given; every one must exist. */
  const order = (source: string, markers: string[]) =>
    markers.map((marker) => {
      const at = source.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      return at;
    });
  const ascending = (positions: number[]) =>
    positions.every((at, index) => index === 0 || at > positions[index - 1]);

  it("draws the art 88 x 123 on the left of every row", () => {
    for (const [name, source] of [
      ["sheet", sheetRow],
      ["review", reviewLine],
    ] as const) {
      expect(source, name).toContain("width: 88,");
      expect(source, name).toContain("height: 123,");
      expect(source, name).toContain("<RemoteImage");
      /* The art is the first thing in the row, before the column. */
      expect(source.indexOf("width: 88,"), name).toBeLessThan(
        source.indexOf("flex: 1, minWidth: 0"),
      );
    }
    /* The hunt page keeps the viewer on tap: CardImage, at 88 wide,
       draws the same 88 x 123 frame (round(88 * 88 / 63) = 123). */
    expect(huntRow).toContain("<CardImage");
    expect(huntRow).toContain("width={88}");
    expect(huntRow).not.toContain("width={44}");
    expect(src.zoom).toContain("height: Math.round((width * 88) / 63),");
    expect(huntRow.indexOf("width={88}")).toBeLessThan(
      huntRow.indexOf("flex: 1, minWidth: 0"),
    );
  });

  it("the full list's column reads name, meta, toggle, stepper", () => {
    expect(
      ascending(
        order(sheetRow, [
          "{card.cardName}",
          "printingLabel(card.printingLabel)",
          '{" · "}',
          "wantsLine(copiesOf(card), remaining)",
          "You offered this",
          "I have this card",
          '<View style={{ alignSelf: "flex-start" }}>',
          "<Stepper",
        ]),
      ),
    ).toBe(true);
    /* The toggle spans the column; nothing stacks on the right. */
    expect(sheetRow).toContain('alignSelf: "stretch"');
    expect(sheetRow).not.toContain('alignItems: "flex-end"');
    /* The art and the column are side by side, top and bottom aligned. */
    expect(sheetRow).toContain('alignItems: "stretch"');
    expect(sheetRow).toContain("gap: spacing(3)");
    expect(sheetRow).toContain("gap: spacing(1.5)");
  });

  it("the review's line is the same row, stepper and Remove together", () => {
    expect(src.review).toContain("imageUrl?: string | null;");
    expect(src.review).toContain("printingLabel?: string | null;");
    expect(src.sheet).toContain("imageUrl: card.imageUrl,");
    expect(src.sheet).toContain("printingLabel: card.printingLabel,");
    expect(
      ascending(
        order(reviewLine, [
          "width: 88,",
          "{line.name}",
          "printingLabel(line.printingLabel)",
          'marginTop: "auto"',
          'justifyContent: "space-between"',
          "<Stepper",
          "Remove ${line.name}",
        ]),
      ),
    ).toBe(true);
    expect(reviewLine).toContain('alignItems: "stretch"');
    expect(reviewLine).toContain("gap: spacing(1.5)");
  });

  it("the hunt page's rows, owner's and visitor's, share the shape", () => {
    expect(
      ascending(
        order(huntRow, [
          "width={88}",
          "{card.cardName}",
          "printingLabel(card.printingLabel)",
          '{" · "}',
          "wantsLine(needed, remaining)",
          "+1 found",
          "I have this card",
          '<View style={{ alignSelf: "flex-start" }}>',
          "disabled={!selected}",
        ]),
      ),
    ).toBe(true);
    /* Both controls live in the column: nothing stacks on the right. */
    expect(huntRow).not.toContain('alignItems: "flex-end"');
    expect(huntRow).toContain('alignSelf: "stretch"');
    expect(huntRow).toContain('alignItems: "stretch"');
    expect(huntRow).toContain("gap: spacing(1.5)");
    /* The owner's +1 found and stepper sit on one row. */
    const owner = between(
      huntRow,
      "{owner?.onSet && !done ? (",
      "{owner?.onReopen ? (",
    );
    expect(owner).toContain('flexDirection: "row"');
    expect(owner).toContain("<Stepper");
  });
});
