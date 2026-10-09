import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as app from "../../mobile/src/binder-add-copy";
import * as site from "@/lib/binder/add-copy";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * Binder round 3, the app's binder. The founder:
 *
 * 1. "Binder should bring up same menu as posting flares - can select
 *    multiple of one card, etc, to put into binder at mass."
 * 2. "Share button shouldn't be in same bubble as edit."
 * 3. "I should be able to hold it down, and without lifting finger
 *    start moving the cards around."
 * 5. "Adding a card in a specific slot should put that exact card there."
 *
 * Read off the source: the app has no renderer in the test run.
 */

const src = {
  binder: read("mobile/src/screens/binder.tsx"),
  sheet: read("mobile/src/binder-add-sheet.tsx"),
  select: read("mobile/src/card-select.tsx"),
  composer: read("mobile/src/screens/flare-composer.tsx"),
  tray: read("mobile/src/card-tray.tsx"),
  pockets: read("mobile/src/pockets.tsx"),
  api: flat(read("mobile/src/api.ts")),
  config: read("mobile/src/config.ts"),
  root: read("mobile/App.tsx"),
  pkg: JSON.parse(read("mobile/package.json")) as {
    dependencies: Record<string, string>;
  },
};

describe("the words", () => {
  it("say what a batch did in the website's sentence, word for word", () => {
    const cases = [
      { added: 0, merged: 0, skipped: 0 },
      { added: 1, merged: 0, skipped: 0 },
      { added: 3, merged: 0, skipped: 0 },
      { added: 2, merged: 1, skipped: 0 },
      { added: 0, merged: 4, skipped: 0 },
      { added: 5, merged: 2, skipped: 1 },
      { added: 0, merged: 0, skipped: 3 },
    ];
    for (const result of cases) {
      expect(app.binderAddedLine(result)).toBe(site.binderAddedLine(result));
    }
    expect(app.BINDER_ADD_MAX).toBe(site.BINDER_ADD_MAX);
  });

  it("count cards on the button and copies in the binder", () => {
    expect(app.addToBinderLabel(1)).toBe("Add 1 card to binder");
    expect(app.addToBinderLabel(5)).toBe("Add 5 cards to binder");
    expect(app.inThisBinderLine(1)).toBe("In this binder");
    expect(app.inThisBinderLine(2)).toBe("×2 in this binder");
    expect(app.notFoundLine("OP99-999")).toBe("Not found: OP99-999");
    expect(app.unreadableLine("hello")).toBe("Couldn't read: hello");
    expect(app.BINDER_ADD_COPY.paste).toBe("Paste a list");
    expect(app.BINDER_ADD_COPY.pastePlaceholder).toBe("2x OP01-001\nOP05-119\n...");
  });
});

describe("the gesture handler", () => {
  it("is installed at the SDK's version and wraps the whole app", () => {
    expect(src.pkg.dependencies["react-native-gesture-handler"]).toBe("~2.28.0");
    expect(src.root).toContain(
      'import { GestureHandlerRootView } from "react-native-gesture-handler";',
    );
    expect(src.root).toMatch(
      /export default function App\(\) \{\s*return \(\s*<GestureHandlerRootView style=\{\{ flex: 1 \}\}>\s*<AppGates \/>\s*<\/GestureHandlerRootView>/,
    );
  });
});

describe("the add menu is the Flare picker", () => {
  it("lives once, and the Flare composer opens it exactly as before", () => {
    expect(src.select).toContain("export function CardSelectSheet(");
    expect(src.select).toContain('title = "Select cards",');
    expect(src.select).toContain("{body ?? (");
    expect(src.select).toContain("{footer ?? (");
    expect(src.select).toContain("{hitNote ? hitNote(hit) : null}");
    expect(src.select).toContain(
      "<Button label={`Done (${items.length})`} onPress={onClose} />",
    );
    /* The composer hands it the lines and nothing of the binder's. */
    expect(src.composer).toContain('from "../card-select";');
    const open = src.composer.slice(src.composer.indexOf("<CardSelectSheet"));
    const tag = open.slice(0, open.indexOf("/>"));
    expect(tag).toContain("visible={picking}");
    for (const binderOnly of ["above=", "body=", "hitNote=", "footer=", "title="]) {
      expect(tag, binderOnly).not.toContain(binderOnly);
    }
    expect(src.composer).not.toContain("function useCardSearch(");
    expect(src.composer).not.toContain("export function CardPicker(");
  });

  it("is the binder's menu, with its tray, its button and its note", () => {
    expect(src.sheet).toContain("<CardSelectSheet");
    expect(src.sheet).toContain("title={BINDER_ADD_COPY.title}");
    expect(src.sheet).toContain("hitNote={hitNote}");
    expect(src.sheet).toContain("<QuantityBadge quantity={copies} />");
    expect(src.sheet).toContain("accessibilityLabel={inThisBinderLine(copies)}");
    /* The tray: every picked card with the quantity tag and a minus. */
    expect(src.sheet).toContain("quantity={line.quantity}");
    expect(src.sheet).toContain("accessibilityLabel={`One fewer ${line.name}`}");
    expect(src.sheet).toContain("label={addToBinderLabel(lines.length)}");
    /* The batch starts at the pocket tapped. */
    expect(src.sheet).toContain(
      "await addBinderCards(binderId, folded(items), pocket)",
    );
    expect(src.binder).toContain("onPress={() => onAdd(pocket)}");
    expect(src.binder).toContain("pocket={addAt}");
    expect(src.binder).toContain(
      "turnTo(Math.floor(added.firstPocket / POCKETS_PER_PAGE));",
    );
    expect(src.binder).toContain("setNotice(added.message);");
    expect(src.binder).not.toContain('from "../card-picker"');
  });

  it("pastes a list, looks it up, and confirms it before adding", () => {
    expect(src.sheet).toContain("BINDER_ADD_COPY.paste");
    expect(src.sheet).toContain("placeholder={BINDER_ADD_COPY.pastePlaceholder}");
    expect(src.sheet).toContain("const result = await previewBinderList(text);");
    expect(src.sheet).toContain("{notFoundLine(line.cardNumber)}");
    expect(src.sheet).toContain("{unreadableLine(line)}");
    expect(src.sheet).toContain("<Stepper");
    expect(src.sheet).toContain("label={addToBinderLabel(matched.length)}");
    /* The scanner is the third body (tests/unit/card-scan-app.test.ts). */
    expect(src.sheet).toContain(
      'body={mode === "paste" ? pasteBody : mode === "scan" ? scanBody : undefined}',
    );
  });

  it("talks to the routes the server has", () => {
    expect(src.api).toContain(
      'call<{ binder: Binder; message: string; firstPocket: number | null }>( "POST", `${binderPath(binderId)}/cards`, { items, pocket }, );',
    );
    expect(src.api).toContain(
      'call<{ binder: Binder }>("PATCH", `${binderPath(binderId)}/cards`, { entryId, pocket, });',
    );
    expect(src.api).toContain('"/api/v1/binders/list-preview", { list },');
    expect(src.api).toContain("pocket: number;");
    expect(src.api).toContain("shareCode?: string | null;");
    expect(src.api).not.toContain("export const reorderBinder");
  });
});

describe("real pockets", () => {
  it("draws every page from the shared pocket maths, gaps and all", () => {
    expect(src.binder).toContain(
      'import { POCKETS_PER_PAGE, pageOf, pagesFor, placeInPockets } from "../pocket-math";',
    );
    expect(src.binder).toContain("slots={pageOf(shown, index)}");
    expect(src.binder).toContain("const pocket = page * POCKETS_PER_PAGE + index;");
    expect(src.binder).not.toContain("cards.slice(index * per");
    /* Every count in a pocket is the quantity tag. */
    expect(src.pockets).toContain("<QuantityBadge");
    expect(src.binder).toContain("<Copies quantity={card.quantity} />");
  });
});

describe("share", () => {
  it("is its own round button, apart from the pencil, for owner and visitor", () => {
    const header = src.binder.slice(
      src.binder.indexOf("navigation.setOptions({"),
      src.binder.indexOf("}, [binder, navigation]);"),
    );
    expect(header).toContain('"pencil-outline"');
    expect(header).not.toContain("share-outline");
    expect(src.binder).toContain("function ShareButton(");
    expect(src.binder).toContain("<ShareButton onPress={share} />");
    expect(src.binder).toContain("borderRadius: 20,");
    expect(src.binder).toContain(
      "const url = binderShareUrl(binder.shareCode ?? binder.id);",
    );
    expect(src.binder).toContain(
      'Alert.alert("Turn on Up for trade to share this binder.");',
    );
    expect(src.config).toContain("export const binderShareUrl = (code: string)");
  });
});

describe("a picked result in either picker", () => {
  it("wears the quantity tag, x1 included, and nowhere else does x1 show", () => {
    const badge = read("mobile/src/quantity-badge.tsx");
    expect(badge).toContain("always = false,");
    expect(badge).toContain("(quantity === 1 && !always)");
    const pick = src.select.slice(
      src.select.indexOf("export function PickCount("),
      src.select.indexOf("export function CardSelectSheet("),
    );
    expect(pick).toMatch(/<QuantityBadge\s+quantity=\{count\}\s+size="md"\s+always/);
    expect(pick).not.toContain("colors.accentContrast");
    /* The binder's menu draws its results through the same PickCount. */
    expect(src.sheet).toContain("<CardSelectSheet");
    expect(src.tray).not.toMatch(/<QuantityBadge[^>]*\balways\b/);
  });
});

describe("the Flare tray's copies", () => {
  it("are the quantity tag in the corner the count had", () => {
    expect(src.tray).toContain('import { QuantityBadge } from "./quantity-badge";');
    expect(src.tray).toMatch(
      /<QuantityBadge\s+quantity=\{item\.quantity\}\s+style=\{\{ position: "absolute", bottom: 3, right: 3 \}\}/,
    );
    expect(src.tray).not.toContain("`x${item.quantity}`");
  });
});
