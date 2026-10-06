import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { BINDER_COVERS, huntCover } from "../../mobile/src/binder-covers";
import { huntRowLine } from "../../mobile/src/hunt-copy";

/* A file that is not there reads as empty, so every pin on it fails
   by name instead of the whole suite failing to load. */
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
 * "Hunts drawn like binders", the app's half.
 *
 * The founder: "Do you think the Hunts feature should just be binders
 * instead of lists? So it's all kinda the same language." A hunt
 * stays a hunt on the server; what changed is how it is drawn. On the
 * Hunts tab it is the binder's row, the small cover with its name on
 * it. Open, it is pages of nine pockets, the binder's own, minus hold
 * to move. The page frame, the pocket, the "+" pocket and the dots
 * moved out of the binder screen into pockets.tsx so both draw the
 * same thing, and the binder behaves exactly as before.
 *
 * Read off the source, because the app has no renderer in the test
 * run; the copy helpers and the cover rule are run, because they are
 * plain functions. The website's half is tests/unit/hunts-binder-
 * parity.test.ts, which runs both platforms' helpers on the same
 * inputs.
 */
const src = {
  covers: read("mobile/src/binder-covers.ts"),
  copy: read("mobile/src/hunt-copy.ts"),
  pockets: read("mobile/src/pockets.tsx"),
  binder: read("mobile/src/screens/binder.tsx"),
  binderList: read("mobile/src/binder-list.tsx"),
  panel: read("mobile/src/hunts-panel.tsx"),
  page: read("mobile/src/hunt-binder.tsx"),
  huntScreen: read("mobile/src/screens/hunt.tsx"),
  huntsScreen: read("mobile/src/screens/hunts.tsx"),
  profile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  app: read("mobile/App.tsx"),
};

describe("the hunt's cover and the line under its name", () => {
  it("huntRowLine says the cards and what is left, with a middle dot", () => {
    expect(huntRowLine(0, 0)).toBe("No cards yet");
    expect(huntRowLine(1, 1)).toBe("1 card · 1 left");
    expect(huntRowLine(3, 0)).toBe("3 cards · All found");
    expect(huntRowLine(4, 2)).toBe("4 cards · 2 left");
    expect(huntRowLine(1, 0)).toBe("1 card · All found");
    /* U+00B7, never a hyphen or a bullet. */
    expect(huntRowLine(2, 1)).toContain("·");
  });

  it("huntCover is one of the six, never charcoal, by the id's char codes", () => {
    const six = ["lime", "ember", "frost", "rose", "galaxy", "gold"] as const;
    /* Single characters land on the sum itself. */
    expect(huntCover("")).toBe("lime");
    expect(huntCover("a")).toBe("ember"); // 97 % 6 = 1
    expect(huntCover("b")).toBe("frost"); // 98 % 6 = 2
    expect(huntCover("c")).toBe("rose"); // 99 % 6 = 3
    expect(huntCover("d")).toBe("galaxy"); // 100 % 6 = 4
    expect(huntCover("e")).toBe("gold"); // 101 % 6 = 5
    expect(huntCover("f")).toBe("lime"); // 102 % 6 = 0
    /* A uuid-shaped id: the sum, modulo six, in that order. */
    const id = "3f2a9c40-1b7e-4d8a-9e21-6c0f5a7b8d9e";
    const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
    expect(huntCover(id)).toBe(six[sum % 6]);
    /* Stable, and never the default grey. */
    for (const sample of ["Sabo", "Red Luffy", id, "x".repeat(40)]) {
      expect(huntCover(sample)).toBe(huntCover(sample));
      expect(huntCover(sample)).not.toBe("charcoal");
      expect(BINDER_COVERS.some((cover) => cover.id === huntCover(sample))).toBe(true);
    }
    /* The body, as the website's half must have it. */
    expect(src.covers).toContain(
      'const HUNT_COVERS: readonly BinderCoverId[] = [\n  "lime",\n  "ember",\n  "frost",\n  "rose",\n  "galaxy",\n  "gold",\n];',
    );
    expect(src.covers).toContain("sum += huntId.charCodeAt(index);");
    expect(src.covers).toContain("return HUNT_COVERS[sum % HUNT_COVERS.length]");
  });

  it("the copy module is plain, with the pinned body", () => {
    expect(src.copy).toContain(
      'if (cards === 0) return "No cards yet";\n  return `${cards} ${cards === 1 ? "card" : "cards"} · ${left === 0 ? "All found" : `${left} left`}`;',
    );
    expect(src.copy).not.toContain("import ");
  });
});

describe("the Hunts tab: one binder row per hunt", () => {
  it("draws the binder row exactly: the small cover with the name, the line, a chevron", () => {
    expect(src.panel).toContain('import { BinderCover } from "./binder-cover";');
    expect(src.panel).toContain('import { huntCover } from "./binder-covers";');
    expect(src.panel).toContain('import { huntRowLine } from "./hunt-copy";');
    expect(src.panel).toMatch(
      /<BinderCover\s+cover=\{huntCover\(hunt\.id \?\? hunt\.name\)\}\s+label=\{hunt\.name\}\s+size="sm"\s*\/>/,
    );
    expect(src.panel).toContain("const cards = hunt.looking + hunt.found;");
    expect(src.panel).toContain("{huntRowLine(cards, hunt.looking)}");
    expect(src.panel).toContain(
      '<Ionicons name="chevron-forward" size={18} color={colors.textMuted} />',
    );
    /* The row's bones are the binder list's bones. */
    for (const bone of [
      'flexDirection: "row"',
      "gap: spacing(3)",
      "borderRadius: radius.card",
      "backgroundColor: colors.surface",
      "padding: spacing(3)",
      'style={{ color: colors.textPrimary, fontWeight: "700", fontSize: 15 }}',
      "<Text style={{ color: colors.textSecondary, fontSize: 13 }}>",
    ]) {
      expect(src.binderList, bone).toContain(bone);
      expect(src.panel, bone).toContain(bone);
    }
  });

  it("marks the owner's private hunt the way a private binder is marked", () => {
    expect(src.panel).toContain(
      '{yours && hunt.visibility === "private" ? (\n            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Private</Text>\n          ) : null}',
    );
    expect(src.binderList).toContain(
      "<Text style={{ color: colors.textMuted, fontSize: 12 }}>Private</Text>",
    );
    /* No chip on a public hunt, and no Public / Private pill on the row. */
    const row = between(src.panel, "function HuntRow(", "export const neededOf");
    expect(row.length).toBeGreaterThan(0);
    expect(row).not.toContain("Public");
    expect(row).not.toContain("earth-outline");
    expect(row).not.toContain("lock-closed-outline");
  });

  it("opens the hunt's own screen on tap, nothing in place", () => {
    expect(src.panel).toContain("onOpen?: (huntId: string) => void;");
    expect(src.panel).toContain("if (hunt.id) onOpen?.(hunt.id);");
    for (const gone of [
      "HuntExpanded",
      "HuntCardRow",
      "chevron-up",
      "chevron-down",
      "onToggle",
      "setOpen(",
      "See all",
      "ROWS_ON_PROFILE",
      "layers-outline",
    ]) {
      expect(src.panel, gone).not.toContain(gone);
    }
    const wire = 'onOpen={(id) => navigation.navigate("Hunt", { huntId: id })}';
    for (const [name, screen] of [
      ["hunts", src.huntsScreen],
      ["profile", src.profile],
      ["player profile", src.playerProfile],
    ] as const) {
      expect(screen, name).toContain(wire);
    }
    /* The visitor's screen wires it too: both HuntsPanel calls on hunts.tsx. */
    expect(
      src.huntsScreen.match(/onOpen=\{\(id\) => navigation\.navigate\("Hunt"/g)?.length,
    ).toBe(2);
    expect(src.app).toContain("Hunt: { huntId: string };");
  });

  it("keeps New hunt and the limit line, says the new empty line, wears the crosshair", () => {
    expect(src.panel).toContain('label="New hunt"');
    expect(src.panel).toContain(
      "`You are at ${limit} hunts. Finish or remove one to start another.`",
    );
    expect(src.panel).toContain("{hunts.length} of {limit}");
    /* New hunt comes before the rows, as New binder does on the binders tab. */
    expect(src.panel.indexOf('label="New hunt"')).toBeLessThan(
      src.panel.indexOf("{hunts.map((hunt) => ("),
    );
    expect(src.panel).toContain(
      '"Start a hunt and add the cards you are after. Post a Flare into it and the whole hunt follows you, with what is found and what is left."',
    );
    expect(src.panel).toContain('"No hunts yet."');
    expect(src.panel).toContain(
      '<Ionicons name="locate-outline" size={16} color={colors.accent} />',
    );
    for (const source of [src.panel, src.page, src.huntScreen, src.huntsScreen]) {
      expect(source).not.toContain("format-list-checks");
      expect(source).not.toContain("MaterialCommunityIcons");
    }
  });
});

describe("the hunt page is the open binder, minus hold to move", () => {
  it("the Hunt screen draws HuntBinder and nothing of the old rows", () => {
    expect(src.huntScreen).toContain('import { HuntBinder } from "../hunt-binder";');
    expect(src.huntScreen).toContain("<HuntBinder");
    expect(src.huntScreen).toContain("yours={hunt.yours}");
    expect(src.huntScreen).toContain(
      'navigation.navigate("Tabs", { screen: "Flare", params: { hunt: id } })',
    );
    expect(src.huntScreen).toContain(
      'onOwner={() =>\n          navigation.navigate("PlayerProfile", { playerId: hunt.playerId })\n        }',
    );
    expect(src.huntScreen).not.toContain("HuntExpanded");
  });

  it("heads with the crosshair, the name, the description or the row's line, and the owner's controls", () => {
    expect(src.page).toContain('name="locate-outline"');
    expect(src.page).toContain("<Title>{hunt.name}</Title>");
    expect(src.page).toContain("{hunt.description}");
    expect(src.page).toContain(
      "{huntRowLine(hunt.looking + hunt.found, hunt.looking)}",
    );
    /* The pencil opens the existing edit form; Share is beside it. */
    expect(src.page).toContain('accessibilityLabel={editing ? "Cancel" : "Edit hunt"}');
    expect(src.page).toContain('name={editing ? "close-outline" : "pencil-outline"}');
    expect(src.page).toContain('accessibilityLabel="Share hunt"');
    expect(src.page).toContain("<HuntEditForm");
    expect(src.page).toContain("huntUrl(hunt.id)");
    /* A visitor sees the owner's name, a link to their profile. */
    expect(src.page).toContain("accessibilityLabel={`${owner}'s profile`}");
    expect(src.page).toContain('{"\'s hunt"}');
    /* The progress bar stays, above the pages. */
    expect(src.page).toContain(
      "<HuntProgress found={totalFound} needed={totalNeeded} />",
    );
    expect(src.page.indexOf("<HuntProgress")).toBeLessThan(
      src.page.indexOf("<PageFrame"),
    );
  });

  it("draws the binder's pages: the shared frame, nine pockets, the dots", () => {
    expect(src.page).toContain('} from "./pockets";');
    expect(src.page).toContain("<PageFrame key={index} geometry={geometry}>");
    expect(src.page).toContain("Array.from({ length: per }, (_, slot) => {");
    expect(src.page).toContain("const per = POCKETS_PER_PAGE;");
    expect(src.page).toContain("<PageDots at={at} of={pageCount} />");
    expect(src.page).toContain(
      "const geometry = useMemo(() => geometryFor(pageWidth), [pageWidth]);",
    );
    /* Measured, never guessed, like the binder. */
    expect(src.page).toContain("onLayout={onFrameLayout}");
    expect(src.page).toContain("event.nativeEvent.layout.width");
    expect(src.page).not.toContain("useWindowDimensions");
    /* The owner's trailing page of "+" pockets; a visitor never sees it. */
    expect(src.page).toContain(
      "const pageCount = yours\n    ? Math.ceil((cards.length + 1) / per)\n    : Math.max(1, Math.ceil(cards.length / per));",
    );
    /* No hold to move: a hunt has no order of its own. */
    for (const gone of [
      "useHoldToMove",
      "PanResponder",
      "onLongPress",
      "RemoveZone",
      "HeldPocket",
      "reorder",
      "LayoutAnimation",
    ]) {
      expect(src.page, gone).not.toContain(gone);
    }
  });

  it("gives the owner + pockets into the Add flow, and a visitor empty ones", () => {
    expect(src.page).toMatch(/return yours \? \(\s*<AddPocket/);
    expect(src.page).toMatch(/\) : \(\s*<EmptyPocket/);
    const add = between(src.page, "<AddPocket", "/>");
    expect(add).toContain("if (hunt.id) onAdd?.(hunt.id);");
    /* The same door the hunt has today: the composer with the hunt chosen. */
    expect(src.huntScreen).toContain("params: { hunt: id }");
    /* No Add cards button under the pages any more. */
    expect(src.page).not.toContain('label="Add cards"');
  });

  it("dims a found pocket with a check, chips a partly found one, leaves the rest bare", () => {
    const pocket = between(
      src.page,
      "function HuntPocket(",
      "function HuntPocketSheet(",
    );
    expect(pocket).toContain("const done = found >= needed;");
    expect(pocket).toContain("dimmed={done}");
    expect(src.pockets).toContain("opacity: dimmed ? 0.5 : 1");
    /* The check: accent, top right, only when done. */
    const check = between(pocket, "{done ? (", ") : null}");
    expect(check).toContain('accessibilityLabel="All found"');
    expect(check).toContain("top: 4,");
    expect(check).toContain("right: 4,");
    expect(check).toContain("backgroundColor: colors.accent");
    expect(check).toContain(
      '<Ionicons name="checkmark" size={12} color={colors.accentContrast} />',
    );
    /* The chip: found over needed, bottom right, only when more than one
       is wanted and not all are found. */
    const chip = between(pocket, "{!done && needed > 1 ? (", ") : null}");
    expect(chip).toContain("bottom: 4,");
    expect(chip).toContain("right: 4,");
    expect(chip).toContain("{`${found}/${needed}`}");
    /* One copy wanted and still open: nothing. */
    expect(pocket).not.toContain("ON YOUR HUNT");
    expect(pocket).not.toContain("<Copies");
    /* The art fills the pocket, inside the ring. */
    expect(pocket).toContain("const inner = geometry.pocketWidth - 2 * POCKET_RING;");
    expect(pocket).toContain("width={inner}");
  });

  it("the owner's tap is Update progress for that card, with the one stepper and Undo", () => {
    const pocket = between(
      src.page,
      "function HuntPocket(",
      "function HuntPocketSheet(",
    );
    expect(pocket).toContain(
      "accessibilityLabel={`Update progress on ${card.cardName}`}",
    );
    expect(src.page).toContain("owner={yours ? () => setOpen(card) : undefined}");
    const sheet = src.page.slice(src.page.indexOf("function HuntPocketSheet("));
    expect(sheet).toContain('<Title>{done ? "All found" : "Update progress"}</Title>');
    expect(sheet).toContain("<SheetBackdrop />");
    expect(sheet).toContain("width={88}");
    expect(sheet).toContain("{card.cardName}");
    expect(sheet).toContain(
      "{`${card.cardNumber} · ${printingLabel(card.printingLabel)}`}",
    );
    expect(sheet).toContain("{`${found} of ${needed} found`}");
    expect(sheet).toContain("{wantsLine(needed, remaining)}");
    expect(sheet.match(/<Stepper/g)?.length).toBe(1);
    expect(sheet).toContain("onChange={(value) => onSet(value)}");
    expect(sheet).toContain(
      "{undoLabel ? <UndoLine label={undoLabel} onUndo={onUndo} /> : null}",
    );
    /* Writing through the hunt's own progress call, as the rows did. */
    expect(src.page).toContain("? setRequestFound(card.requestId, next)");
    expect(src.page).toContain("? setFlareFound(card.flareId, next)");
    expect(src.page).toContain("useCopiesFound({ reset: hunt, onChanged })");
    /* "Remove from hunt" lives under the stepper now, through the
       server's remove-card action; tests/unit/app-search.test.ts pins
       the words and the flow. */
    expect(sheet).toContain("Remove from hunt");
    expect(read("mobile/src/api.ts")).toContain('action: "remove-card"');
    expect(read("mobile/src/api.ts")).toContain("export const removeHuntCard");
  });

  it("a visitor's tap is the viewer with the Feed's picks; a found card cannot be picked", () => {
    const pocket = between(
      src.page,
      "function HuntPocket(",
      "function HuntPocketSheet(",
    );
    expect(pocket).toContain("<CardImage");
    expect(pocket).toContain("siblings={shelf}");
    expect(pocket).toContain("have={shelf[position]?.have ?? null}");
    expect(pocket).toContain("picks={picks}");
    expect(pocket).toContain("onPicks={onPicks}");
    /* The picks are the page's own store, by request, a quantity each. */
    expect(src.page).toContain("const [picked, setPicked] = useState<ZoomPicks>({});");
    expect(src.page).toContain("if (quantity <= 0) delete next[requestId];");
    expect(src.page).toContain(
      "have: yours || done || !card.requestId || !hunt.id ? null : haveFor(card),",
    );
    /* The viewer's own review sends by request through the hunt's door. */
    expect(src.page).toContain("requestId: item.flareId");
    expect(src.page).toContain("offerOnHunt(");
    expect(src.page).not.toContain("offerItemsOnPost");
    /* Under the pages: the existing footer and the existing review. */
    expect(src.page).toContain("<HuntOfferFooter");
    expect(src.page).toContain("<HuntOfferReview");
    expect(src.page).toContain("onChange={setPick}");
    expect(src.panel).toContain("label={reviewLabel(cards)}");
    expect(src.panel).toContain("export function HuntOfferReview(");
    const review = between(
      src.panel,
      "export function HuntOfferReview(",
      "export function huntOfferSentLine(",
    );
    expect(review).toContain("<Stepper");
    expect(review).toContain("max={remaining}");
    expect(review).toMatch(/>\s*Remove\s*</);
    expect(review).toContain("offerOnHunt(hunt.id, lines, message.trim())");
    /* Where it went, as before. */
    expect(src.page).toContain("Open in Messages");
    expect(src.panel).toContain("`Sent to ${ownerName} in Messages.`");
  });
});

describe("the binder draws from the shared pockets and behaves as before", () => {
  it("pockets.tsx owns the frame, the pocket, the + pocket, the empty pocket and the dots", () => {
    for (const part of [
      "export function pocketWidthFor(",
      "export function geometryFor(",
      "export function cellOf(",
      "export function PageFrame(",
      "export function Pocket(",
      "export function EmptyPocket(",
      "export function AddPocket(",
      "export function SleeveLip(",
      "export function Copies(",
      "export function PageDots(",
    ]) {
      expect(src.pockets, part).toContain(part);
      /* Defined once: the binder imports it rather than keeping a copy. */
      expect(src.binder, part).not.toContain(part.replace("export ", ""));
    }
    expect(src.binder).toContain('} from "../pockets";');
    for (const use of [
      "<PageFrame geometry={geometry}>",
      "<Pocket",
      "<AddPocket",
      "<EmptyPocket",
      "<PageDots at={at} of={pageCount} />",
      "<SleeveLip />",
      "<Copies quantity={card.quantity} />",
      "cellOf(",
      "geometryFor(",
    ]) {
      expect(src.binder, use).toContain(use);
    }
    /* The binder keeps what is its own. */
    for (const own of [
      "function useDragToPocket(",
      "function HeldPocket(",
      "function RemoveZone(",
      "function BinderPocket(",
      "activateAfterLongPress(HOLD_MS)",
      "ON YOUR HUNT",
    ]) {
      expect(src.binder, own).toContain(own);
    }
  });

  it("the + pocket reads Add cards and the plus, once, for both screens", () => {
    expect(src.pockets).toContain('accessibilityLabel="Add cards"');
    expect(src.pockets).toMatch(/>\s*\+\s*</);
    /* Nine a page, read from the one place that number lives. */
    expect(src.pockets).toContain(
      'import { BINDER_LAYOUT, POCKETS_PER_PAGE } from "./binder-covers";',
    );
    expect(src.pockets).not.toContain("POCKETS_PER_PAGE =");
  });
});

/**
 * No player-facing line about a hunt says "list". The founder wanted
 * one language: a hunt is drawn like a binder, so the word that
 * described the old drawing goes with it. Component names and
 * comments are not strings; what is pinned is every string literal
 * and every JSX text node in the hunt files.
 */
describe('no player-facing line about a hunt says "list"', () => {
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
  const literals = (source: string) =>
    [
      ...source.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g),
    ].map((match) => match[0]);
  const jsxText = (source: string) =>
    [...source.matchAll(/>([^<>{}]+)</g)].map((match) => match[1]);

  it("in every hunt file and the hunt copy module", () => {
    const files = {
      "hunts-panel.tsx": src.panel,
      "hunt-binder.tsx": src.page,
      "screens/hunt.tsx": src.huntScreen,
      "screens/hunts.tsx": src.huntsScreen,
      "hunt-copy.ts": src.copy,
    };
    for (const [name, source] of Object.entries(files)) {
      expect(source.length, name).toBeGreaterThan(0);
      const code = stripComments(source);
      const said = [...literals(code), ...jsxText(code)];
      expect(said.length, name).toBeGreaterThan(0);
      for (const line of said) {
        expect(line, `${name}: ${line}`).not.toMatch(/\blist\b/i);
      }
    }
  });

  it("the pins above would catch the word", () => {
    const code = stripComments(
      '/* a list */ const a = "the whole list"; // list\n<Text>a list</Text>',
    );
    const said = [...literals(code), ...jsxText(code)];
    expect(said.some((line) => /\blist\b/i.test(line))).toBe(true);
    expect(code).not.toContain("a list */");
  });
});
