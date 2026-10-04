import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BINDER_COVERS, huntCover } from "@/lib/binder/covers";
import { huntRowLine } from "@/lib/players/hunt-copy";
import { huntCover as appHuntCover } from "../../mobile/src/binder-covers";
import { huntRowLine as appHuntRowLine } from "../../mobile/src/hunt-copy";

/**
 * Hunts drawn like binders, on both platforms.
 *
 * The founder: "Do you think the Hunts feature should just be binders
 * instead of lists? So it's all kinda the same language." A hunt
 * stays a hunt on the server; what changed is how it is drawn: a
 * cover on the Hunts tab, 3x3 pockets when it is open, and the word
 * "list" gone from every player-facing line. Read off the source,
 * because parity is the same words, the same controls and the same
 * drawing on the website and in the app; and run the two plain
 * modules side by side, because the cover and the row line are
 * computed, and a hunt must wear the same colour and say the same
 * numbers wherever it is opened.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const web = {
  covers: read("src/lib/binder/covers.ts"),
  copy: read("src/lib/players/hunt-copy.ts"),
  pockets: read("src/components/binder/pockets.tsx"),
  binderPage: read("src/components/binder/binder-page.tsx"),
  panel: read("src/components/players/hunts-panel.tsx"),
  binder: read("src/components/players/hunt-binder.tsx"),
  detail: read("src/components/players/hunt-detail.tsx"),
  page: read("src/app/hunts/[huntId]/page.tsx"),
  zoom: read("src/components/cards/card-image-zoom.tsx"),
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
};

const app = {
  covers: read("mobile/src/binder-covers.ts"),
  copy: read("mobile/src/hunt-copy.ts"),
  pockets: read("mobile/src/pockets.tsx"),
  binderScreen: read("mobile/src/screens/binder.tsx"),
  panel: read("mobile/src/hunts-panel.tsx"),
  binder: read("mobile/src/hunt-binder.tsx"),
  huntScreen: read("mobile/src/screens/hunt.tsx"),
  huntsScreen: read("mobile/src/screens/hunts.tsx"),
  zoom: read("mobile/src/ui.tsx"),
};

/** The six covers a hunt can wear, in the pinned order. */
const HUNT_COVERS = ["lime", "ember", "frost", "rose", "galaxy", "gold"] as const;

const IDS = [
  "a",
  "ab",
  "hunt-1",
  "hunt-2",
  "7f3c9a1e-4b2d-4c8e-9f0a-1b2c3d4e5f60",
  "0e1d2c3b-4a59-4687-9c0d-e1f2a3b4c5d6",
  "Green Zoro",
  "Wishlist upgrades",
  "",
  "zzzzzz",
];

/** What a person reads from a source file: strings and JSX text, never comments or code. */
function spoken(source: string): string[] {
  const noComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const noImports = noComments.replace(
    /^import\s+(?:type\s+)?(?:[\w$*]+(?:\s+as\s+[\w$]+)?|\{[^}]*\}|[\w$]+\s*,\s*\{[^}]*\})\s+from\s+["'][^"']+["'];?$/gm,
    "",
  );
  const literals = [
    ...noImports.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g),
  ].map((match) => match[0]);
  const jsxText = [...noImports.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map(
    (match) => match[1] ?? "",
  );
  return [...literals, ...jsxText];
}

describe("huntCover: the same colour from the same id on both platforms", () => {
  it("is one of the six covers, never charcoal, chosen by char codes modulo six", () => {
    for (const id of IDS) {
      let sum = 0;
      for (const char of id) sum += char.charCodeAt(0);
      const expected = HUNT_COVERS[sum % HUNT_COVERS.length];
      expect(huntCover(id), `web ${JSON.stringify(id)}`).toBe(expected);
      expect(appHuntCover(id), `app ${JSON.stringify(id)}`).toBe(expected);
      expect(huntCover(id)).not.toBe("charcoal");
      expect(BINDER_COVERS.some((cover) => cover.id === huntCover(id))).toBe(true);
    }
  });

  it("agrees across every id, and covers every colour", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const id = `hunt-${index}-${String.fromCharCode(97 + (index % 26))}`;
      expect(appHuntCover(id)).toBe(huntCover(id));
      seen.add(huntCover(id));
    }
    expect([...seen].sort()).toEqual([...HUNT_COVERS].sort());
  });

  it("is exported from the covers module on both, with the order pinned", () => {
    for (const [name, source] of [
      ["web", web.covers],
      ["app", app.covers],
    ] as const) {
      expect(source, name).toContain(
        "export function huntCover(huntId: string): BinderCoverId",
      );
      expect(source, name).toMatch(
        /"lime",\s*"ember",\s*"frost",\s*"rose",\s*"galaxy",\s*"gold",?\s*\]/,
      );
      expect(source, name).toContain("charCodeAt(");
    }
  });
});

describe("huntRowLine: the same words from the same numbers on both platforms", () => {
  it("says No cards yet, then cards and what is left", () => {
    const cases: [number, number, string][] = [
      [0, 0, "No cards yet"],
      [1, 1, "1 card · 1 left"],
      [1, 0, "1 card · All found"],
      [3, 2, "3 cards · 2 left"],
      [3, 0, "3 cards · All found"],
      [12, 12, "12 cards · 12 left"],
    ];
    for (const [cards, left, line] of cases) {
      expect(huntRowLine(cards, left), `web ${cards}/${left}`).toBe(line);
      expect(appHuntRowLine(cards, left), `app ${cards}/${left}`).toBe(line);
    }
    /* The middle dot is U+00B7, never a hyphen or a bullet. */
    expect(huntRowLine(2, 1)).toContain("·");
  });

  it("agrees across the grid", () => {
    for (let cards = 0; cards <= 20; cards += 1) {
      for (let left = 0; left <= cards; left += 1) {
        expect(appHuntRowLine(cards, left)).toBe(huntRowLine(cards, left));
      }
    }
  });

  it("lives in a plain module on both, with no React and no server import", () => {
    for (const source of [web.copy, app.copy]) {
      expect(source).toContain(
        "export function huntRowLine(cards: number, left: number): string",
      );
      expect(source).not.toContain('from "react"');
      expect(source).not.toContain('import "server-only"');
    }
  });
});

describe("the Hunts tab: one binder row per hunt", () => {
  it("draws the small cover with the hunt's name, the name in bold, the line, a chevron", () => {
    /* The website. */
    expect(web.panel).toContain(
      '<BinderCover cover={huntCover(hunt.id)} label={hunt.name} size="sm" />',
    );
    expect(web.panel).toContain("font-bold text-text-primary");
    expect(web.panel).toContain("{huntRowLine(hunt.cards.length, hunt.looking)}");
    expect(web.panel).toContain("<ChevronRight");
    expect(web.panel).toContain("href={`/hunts/${hunt.id}`}");
    expect(web.panel).toContain("hunts.map((hunt) =>");
    /* The app. */
    expect(app.panel).toContain("<BinderCover");
    expect(app.panel).toContain("huntCover(hunt.id");
    expect(app.panel).toContain('size="sm"');
    expect(app.panel).toContain("huntRowLine(");
    expect(app.panel).toContain('name="chevron-forward"');
    expect(app.panel).toContain("onOpen?: (huntId: string) => void");
  });

  it("opens the hunt's own page, and expands nothing in place", () => {
    expect(web.panel).not.toContain("aria-expanded");
    expect(web.panel).not.toContain("HuntDetail");
    expect(web.panel).not.toContain("ChevronDown");
    expect(app.panel).not.toContain("HuntExpanded");
    expect(app.panel).not.toContain("expanded");
    expect(app.huntScreen).toContain("<HuntBinder");
    expect(web.page).toContain("<HuntBinder");
  });

  it("says Private, muted, on the owner's private hunt alone", () => {
    expect(web.panel).toMatch(
      /yours && hunt\.visibility === "private" && \(\s*<span className="shrink-0 text-xs text-text-muted">Private<\/span>/,
    );
    expect(app.panel).toMatch(/>\s*Private\s*</);
    expect(app.panel).toContain('visibility === "private"');
  });

  it("keeps the owner's New hunt control and the limit line", () => {
    expect(web.panel).toContain("New hunt");
    expect(web.panel).toContain("{hunts.length} of {limit}");
    expect(app.panel).toContain("New hunt");
  });

  it("says the empty state the same way on both", () => {
    const OWNER =
      "Start a hunt and add the cards you are after. Post a Flare into it and the whole hunt follows you, with what is found and what is left.";
    for (const source of [web.panel, app.panel]) {
      expect(source).toContain(OWNER);
      expect(source).toContain("No hunts yet.");
    }
  });

  it("wears the crosshair, never the list with ticks, on every hunt surface", () => {
    expect(web.panel).toContain("<Crosshair");
    expect(web.binder).toContain("<Crosshair");
    for (const [name, source] of Object.entries(web)) {
      expect(source, `web ${name}`).not.toContain("ListChecks");
    }
    expect(app.panel).toContain('name="locate-outline"');
    expect(app.binder).toContain('name="locate-outline"');
    for (const [name, source] of Object.entries(app)) {
      expect(source, `app ${name}`).not.toContain("format-list-checks");
    }
  });
});

describe("the hunt page: the open binder", () => {
  it("has the crosshair, the name, and the description or the row line under it", () => {
    expect(web.binder).toContain(
      "hunt.description || huntRowLine(cards.length, looking)",
    );
    expect(app.binder).toContain("huntRowLine(");
  });

  it("gives the owner the pencil and Share, and a visitor the owner's name and Share", () => {
    expect(web.binder).toContain('aria-label="Edit hunt"');
    expect(web.binder).toContain('title="Edit hunt"');
    expect(web.binder).toContain("<HuntEditForm");
    expect(web.binder).toContain('label="Share hunt"');
    expect(web.binder).toContain("href={`/p/${hunt.playerId}`}");
    expect(app.binder).toContain("HuntEditForm");
  });

  it("links back to the Hunts tab the row came from, on the web", () => {
    expect(web.page).toContain('"/profile?tab=hunts"');
    expect(web.page).toContain("`/p/${hunt.playerId}?tab=hunts`");
    expect(web.page).toContain('"Back to your hunts"');
    expect(web.page).toContain("`Back to ${hunt.ownerName}'s hunts`");
  });

  it("draws 3x3 pockets on the binder-page background with arrows and dots", () => {
    expect(web.binder).toContain("cfa-bg-binder-page");
    expect(web.binder).toContain("grid-cols-3");
    expect(web.binder).toContain("POCKETS_PER_PAGE");
    expect(web.binder).toContain("<PageArrow");
    expect(web.binder).toContain('side="prev"');
    expect(web.binder).toContain('side="next"');
    expect(web.binder).toContain("<PageDots");
    expect(web.binder).toContain("<HuntProgress");
    /* No hold to move: a hunt has no order of its own. */
    expect(web.binder).not.toContain("draggable");
    expect(web.binder).not.toContain("onDragStart");
    expect(app.binder).toContain("POCKETS_PER_PAGE");
    expect(app.binder).toContain("<PageDots");
    expect(app.binder).toContain("<HuntProgress");
    expect(app.binder).not.toContain("onLongPress");
  });

  it("dims a found pocket with a check, chips found/needed when more than one is wanted", () => {
    expect(web.binder).toContain("dim={card.found}");
    expect(web.pockets).toContain('dim && "opacity-50"');
    expect(web.binder).toMatch(
      /card\.found \? \(\s*<span\s+aria-label="Found"[\s\S]*?<Check /,
    );
    expect(web.binder).toMatch(
      /card\.needed > 1 \? \(\s*<span[^>]*>\s*\{card\.foundCopies\}\/\{card\.needed\}/,
    );
    /* One copy wanted and still open: nothing. */
    expect(web.binder).toMatch(
      /\{card\.foundCopies\}\/\{card\.needed\}\s*<\/span>\s*\) : null\}/,
    );
    expect(app.binder).toContain("dimmed={done}");
    expect(app.pockets).toContain("opacity: dimmed ? 0.5 : 1");
    expect(app.binder).toContain('name="checkmark"');
    expect(app.binder).toContain("{`${found}/${needed}`}");
  });

  it("gives the owner + pockets into the Flare composer, and a visitor empty ones", () => {
    expect(web.binder).toMatch(
      /yours \? \(\s*<AddPocket href=\{`\/flare\?hunt=\$\{encodeURIComponent\(hunt\.id\)\}`\} \/>\s*\) : \(\s*<EmptyPocket \/>/,
    );
    /* The trailing page always has them: one more page once the last is full. */
    expect(web.binder).toContain("Math.floor(cards.length / perPage) + 1");
    expect(web.binder).toContain("Math.max(1, Math.ceil(cards.length / perPage))");
    expect(app.binder).toMatch(/yours \? \(\s*<AddPocket/);
    expect(app.binder).toContain("<EmptyPocket");
  });

  it("opens Update progress with one stepper for the owner, with Undo and no invented remove", () => {
    expect(web.binder).toContain('title="Update progress"');
    expect(web.binder.match(/<Stepper/g)).toHaveLength(1);
    expect(web.binder).toContain(
      '{card.cardNumber} · {card.printingLabel ?? "Any printing"}',
    );
    expect(web.binder).toContain("{card.foundCopies} of {card.needed} found");
    expect(web.binder).toContain("wantsLine(card.needed, card.remaining)");
    expect(web.binder).toContain("h-[7.75rem] w-[5.5rem]");
    expect(web.binder).toContain("<UndoLine");
    expect(web.binder).toContain("progress.write(open, value)");
    expect(web.detail).toContain("setRequestFoundAction(card.requestId, next)");
    expect(web.binder).not.toContain("+1 found");
    /* No remove-from-hunt action exists on the server, so none is drawn. */
    expect(spoken(web.binder).join("\n")).not.toContain("Remove from hunt");
    expect(app.binder).toContain("Update progress");
    expect(app.binder.match(/<Stepper/g)).toHaveLength(1);
    expect(app.binder).toContain("<UndoLine");
    expect(app.binder).toContain("wantsLine(");
    expect(spoken(app.binder).join("\n")).not.toContain("Remove from hunt");
  });

  it("hands a visitor's pocket to the viewer with the Feed's picks, keyed by request", () => {
    /* The picks are the page's own store, through the post's context,
       so a pick outlives the viewer. */
    expect(web.binder).toContain("<OfferPicksContext.Provider value={picks}>");
    expect(web.binder).toContain("!yours && canOffer && !card.found");
    expect(web.binder).toContain("flareId: card.requestId");
    expect(web.binder).toContain('state: "open"');
    expect(web.binder).toContain("toggle: offer.selection.toggle");
    expect(web.binder).toContain("<HuntOfferFooter");
    expect(web.binder).toContain("<OfferReview");
    expect(web.binder).toContain("onSubmit={picks.submit}");
    expect(web.binder).toContain("Sign in to offer");
    expect(web.detail).toContain("offerOnHuntAction(");
    expect(web.detail).toContain("reviewLabel(");
    /* The words are the viewer's. */
    expect(web.zoom).toContain("I have this card");
    expect(web.zoom).toContain("Added to your offer");
    expect(app.binder).toContain("haveFor(card)");
    expect(app.binder).toContain('state: "open"');
    expect(app.binder).toContain("offerOnHunt(");
    expect(app.binder).toContain("<HuntOfferFooter");
    expect(app.zoom).toContain("I have this card");
    expect(app.zoom).toContain("Added to your offer");
  });
});

describe("the pockets are shared with the binder", () => {
  it("binder-page.tsx and binder.tsx import them rather than drawing their own", () => {
    expect(web.binderPage).toContain('from "@/components/binder/pockets"');
    expect(web.binder).toContain('from "@/components/binder/pockets"');
    for (const name of [
      "AddPocket",
      "EmptyPocket",
      "POCKETS_PER_PAGE",
      "PageArrow",
      "PageDots",
      "PocketTile",
    ]) {
      expect(web.binderPage).toContain(name);
      expect(web.binder).toContain(name);
    }
    expect(web.binderPage).not.toContain("const COLUMNS =");
    expect(web.binderPage).not.toContain("function PocketTile");
    expect(web.binderPage).not.toContain("function AddPocket");
    for (const name of [
      "export const COLUMNS = 3;",
      "export const POCKETS_PER_PAGE = COLUMNS * COLUMNS;",
      "export const POCKET =",
      "export function PocketTile(",
      "export function EmptyPocket(",
      "export function AddPocket(",
      "export function PageArrow(",
      "export function PageDots(",
    ]) {
      expect(web.pockets).toContain(name);
    }
    expect(app.binderScreen).toContain('from "../pockets"');
    expect(app.binder).toContain('from "./pockets"');
    for (const name of [
      "export function pocketWidthFor(",
      "export function geometryFor(",
      "export function Pocket(",
      "export function EmptyPocket(",
      "export function AddPocket(",
      "export function PageFrame(",
      "export function PageDots(",
    ]) {
      expect(app.pockets).toContain(name);
    }
    expect(app.binderScreen).not.toContain("function Pocket(");
  });
});

describe("the word list has left every player-facing line about hunts", () => {
  const files = {
    "web hunt copy": web.copy,
    "web hunts panel": web.panel,
    "web hunt binder": web.binder,
    "web hunt detail": web.detail,
    "web hunt page": web.page,
    "app hunt copy": app.copy,
    "app hunts panel": app.panel,
    "app hunt binder": app.binder,
    "app hunt screen": app.huntScreen,
    "app hunts screen": app.huntsScreen,
  };

  it("in no string literal or JSX text, on either platform", () => {
    for (const [name, source] of Object.entries(files)) {
      const offenders = spoken(source).filter((text) => /\blist\b/i.test(text));
      expect(offenders, name).toEqual([]);
    }
  });

  it("and the old row machinery is gone from the website", () => {
    expect(web.detail).not.toContain("export function HuntDetail");
    expect(web.detail).not.toContain("HuntCardRow");
    expect(web.ownProfile).not.toContain("ownerName=");
    expect(web.playerProfile).toMatch(/<HuntsPanel hunts=\{profile\.hunts\} \/>/);
  });
});
