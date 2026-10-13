import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as appGeometry from "../../mobile/src/page-geometry";
import {
  STATUS_TOKEN,
  needsLook,
  pocketName,
  pocketStatus,
  statusWord,
  type PocketStatus,
} from "../../mobile/src/page-scan";
import * as app from "../../mobile/src/scan-copy";
import * as siteGeometry from "@/lib/cards/page-geometry";
import * as site from "@/lib/cards/scan-rules";

/**
 * The second scanner in the app. The founder (2026-10-13): each pocket is
 * matched (green), needs review (yellow), empty (grey) or unable to
 * identify (red); a pocket can be read again on its own; a page the
 * scanner is unsure of is lined up by hand and never guessed; nothing in
 * the binder is overwritten without a yes. The app is the website's: the
 * same rule for a lined-up page, the same statuses in the same tokens,
 * the same words on the same buttons.
 *
 * Read off the source where it has to be: the app has no renderer in
 * the test run. The rules run for real.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
const has = (path: string) => existsSync(resolve(import.meta.dirname, "../..", path));
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const src = {
  geometry: read("mobile/src/page-geometry.ts"),
  align: read("mobile/src/page-align.tsx"),
  pages: read("mobile/src/page-scanner.tsx"),
  viewer: read("mobile/src/card-viewer.tsx"),
  scanner: read("mobile/src/card-scanner.tsx"),
  api: read("mobile/src/api.ts"),
  theme: read("mobile/src/theme.ts"),
};

/** One exported function's text, from its line to the closing brace at column 0. */
const fn = (text: string, name: string) => {
  const start = text.indexOf(`export function ${name}(`);
  return start < 0 ? "" : text.slice(start, text.indexOf("\n}\n", start) + 2);
};

const q = (...points: [number, number][]) =>
  points.map(([x, y]) => ({ x, y })) as appGeometry.Quad;

describe("lining a page up: the website's rule, word for word", () => {
  it("is the same text as src/lib/cards/page-geometry.ts", () => {
    const mine = fn(src.geometry, "cornersMakeAPage");
    expect(mine.length).toBeGreaterThan(200);
    expect(mine).toBe(fn(read("src/lib/cards/page-geometry.ts"), "cornersMakeAPage"));
  });

  it("answers the same on every quad", () => {
    const quads = [
      /* A page, clockwise from A1's corner. */
      q([0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]),
      /* The same page, turned: still a page. */
      q([0.9, 0.1], [0.9, 0.9], [0.1, 0.9], [0.1, 0.1]),
      /* Anticlockwise: mirrored, a slip. */
      q([0.1, 0.1], [0.1, 0.9], [0.9, 0.9], [0.9, 0.1]),
      /* A bow tie. */
      q([0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]),
      /* Too small. */
      q([0.4, 0.4], [0.5, 0.4], [0.5, 0.5], [0.4, 0.5]),
      /* Off the photo. */
      q([-0.5, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]),
      /* A little over the edge, as a page shot close can be. */
      q([-0.1, -0.1], [1.1, -0.05], [1.05, 1.1], [-0.05, 1.05]),
      /* A keystoned page. */
      q([0.25, 0.15], [0.75, 0.15], [0.95, 0.9], [0.05, 0.9]),
    ];
    const answers = quads.map((quad) => appGeometry.cornersMakeAPage(quad));
    expect(answers).toEqual(
      quads.map((quad) => siteGeometry.cornersMakeAPage(quad as siteGeometry.Quad)),
    );
    expect(answers).toEqual([true, true, false, false, false, false, true, true]);
  });

  it("turns A1 to the next corner round, and four turns are where it began", () => {
    const page = q([0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]);
    const once = appGeometry.turnCorners(page);
    expect(once[0]).toEqual(page[1]);
    expect(once[3]).toEqual(page[0]);
    expect(appGeometry.cornersMakeAPage(once)).toBe(true);
    let turned = page;
    for (let n = 0; n < 4; n += 1) turned = appGeometry.turnCorners(turned);
    expect(turned).toEqual(page);
  });

  it("draws the photo contained and keeps a dragged corner on it", () => {
    expect(
      appGeometry.containFit(
        { width: 300, height: 600 },
        { width: 3000, height: 4000 },
      ),
    ).toEqual({ x: 0, y: 100, width: 300, height: 400 });
    const drawn = { width: 300, height: 400 };
    expect(appGeometry.dragCorner({ x: 0.5, y: 0.5 }, 30, -40, drawn)).toEqual({
      x: 0.6,
      y: 0.4,
    });
    expect(appGeometry.dragCorner({ x: 0.95, y: 0.05 }, 300, -300, drawn)).toEqual({
      x: 1,
      y: 0,
    });
  });
});

describe("the alignment screen", () => {
  it("is the website's: Line up the page, the hint, the photo and four handles, Turn, Read it again", () => {
    const order = [
      "<Title>{LINE_UP_PAGE}</Title>",
      "{LINE_UP_HINT}",
      "source={{ uri: photo }}",
      "label={TURN_PAGE}",
      "label={READ_PAGE_AGAIN}",
    ].map((mark) => src.align.indexOf(mark));
    expect(order.every((at) => at > -1)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(src.align).toContain("[0, 1, 2, 3].map((at) =>");
    expect(src.align).toContain("PanResponder.create({");
  });

  it("marks A1's corner and turns which corner it is", () => {
    expect(src.align).toContain(
      "{first ? <Text style={styles.first}>{POCKET_NAMES[0]}</Text> : null}",
    );
    expect(src.align).toContain(
      "onPress={() => setCorners((current) => turnCorners(current))}",
    );
  });

  it("never sends corners that do not make a page", () => {
    expect(src.align).toContain("const makesAPage = cornersMakeAPage(corners);");
    expect(src.align).toContain("disabled={!makesAPage}");
    expect(src.align).toContain("if (busy || !makesAPage) return;");
  });

  it("starts from the player's corners, else the page the server found, and reads the page again", () => {
    expect(src.pages).toContain("start={lining.vision.corners ?? lining.vision.page}");
    expect(src.pages).toContain(
      "onRead={(corners) => readAgain(lining.scanId, corners)}",
    );
    expect(src.api).toContain('{ action: "realign", scanId, corners }');
    /* While a page is being lined up the queue is not asked again. */
    expect(src.pages).toContain(
      "if (pages === null || settled || retaking !== null || aligning !== null) return;",
    );
  });
});

describe("statuses", () => {
  const cases: [Parameters<typeof pocketStatus>[0], PocketStatus][] = [
    [{ state: "empty" }, "empty"],
    [{ state: "found", sure: true }, "matched"],
    /* A quick read says nothing of sure: matched, as before. */
    [{ state: "found" }, "matched"],
    [{ state: "found", sure: false }, "ambiguous"],
    [{ state: "unread" }, "unrecognized"],
    /* The server's own status wins. */
    [{ state: "found", sure: true, status: "ambiguous" }, "ambiguous"],
    [{ state: "unread", status: "unrecognized" }, "unrecognized"],
  ];

  it("come from the server, or from what an older page found", () => {
    for (const [pocket, status] of cases) {
      expect(pocketStatus(pocket), JSON.stringify(pocket)).toBe(status);
    }
  });

  it("say the website's words", () => {
    for (const name of [
      "STATUS_MATCHED",
      "STATUS_REVIEW",
      "STATUS_EMPTY",
      "STATUS_UNRECOGNIZED",
      "RESCAN_POCKET",
      "RESCANNING_POCKET",
      "RESCAN_FAILED",
      "CHOOSE_PRINTING",
      "GLARE_ON_CARD",
      "BLURRY_PAGE",
      "CHOOSE_PHOTO",
      "LINE_UP_PAGE",
      "LINE_UP_HINT",
      "PAGE_NEEDS_LINING_UP",
      "TURN_PAGE",
      "READ_PAGE_AGAIN",
      "MOVE_AND_PLACE",
      "CANCEL_PLACING",
    ] as const) {
      expect(app[name], name).toBe(site[name]);
    }
    expect([...app.POCKET_NAMES]).toEqual([...site.POCKET_NAMES]);
    expect(statusWord("matched")).toBe(site.STATUS_MATCHED);
    expect(statusWord("ambiguous")).toBe(site.STATUS_REVIEW);
    expect(statusWord("empty")).toBe(site.STATUS_EMPTY);
    expect(statusWord("unrecognized")).toBe(site.STATUS_UNRECOGNIZED);
    expect(pocketName({ slot: 4 })).toBe("B2");
    expect(pocketName({ slot: 4, position: "B2" })).toBe("B2");
  });

  it("are drawn in the theme's tokens, the same ones the website uses", async () => {
    expect(STATUS_TOKEN).toEqual({
      matched: "success",
      ambiguous: "warning",
      unrecognized: "danger",
      empty: "textMuted",
    });
    for (const token of Object.values(STATUS_TOKEN)) {
      expect(src.theme).toMatch(new RegExp(`\\b${token}:`));
    }
    const tile = src.pages.slice(src.pages.indexOf("function PocketTile("));
    expect(tile).toContain("const tone = colors[STATUS_TOKEN[status]];");
    expect(code(tile)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    if (has("src/components/cards/pocket-status.ts")) {
      const PATH = "../../src/components/cards/pocket-status";
      const web = (await import(/* @vite-ignore */ PATH)) as {
        STATUS_LOOK: Record<PocketStatus, { word: string; dot: string }>;
      };
      const kebab = (token: string) =>
        token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
      for (const status of Object.keys(STATUS_TOKEN) as PocketStatus[]) {
        expect(web.STATUS_LOOK[status].word).toBe(statusWord(status));
        expect(web.STATUS_LOOK[status].dot).toBe(`bg-${kebab(STATUS_TOKEN[status])}`);
      }
    }
  });

  it("send Check N unsure through the ones to check, can't identify, and an open printing", () => {
    expect(needsLook({ state: "found", status: "ambiguous" }, false)).toBe(true);
    expect(needsLook({ state: "unread", status: "unrecognized" }, false)).toBe(true);
    expect(needsLook({ state: "found", status: "matched" }, false)).toBe(false);
    expect(
      needsLook({ state: "found", status: "matched", printingUncertain: true }, false),
    ).toBe(true);
    expect(needsLook({ state: "empty", status: "empty" }, false)).toBe(false);
    expect(needsLook({ state: "found", status: "ambiguous" }, true)).toBe(false);
  });

  it("never show the confidence as a number", () => {
    for (const text of [src.pages, src.viewer]) {
      expect(code(text)).not.toContain(".confidence");
      expect(code(text)).not.toMatch(/%`|"%"/);
    }
  });
});

describe("the check and the viewer", () => {
  it("shows each pocket's name and status word on its tile", () => {
    const tile = src.pages.slice(src.pages.indexOf("function PocketTile("));
    expect(tile).toContain("const status = pocketStatus(pocket);");
    expect(tile).toContain("const word = statusWord(status);");
    expect(tile).toContain("<Text style={styles.name}>{name}</Text>");
    expect(tile.indexOf("{name}</Text>")).toBeLessThan(tile.indexOf("{word}"));
  });

  it("says a blurry page is, and offers Line up the page on one that needs it", () => {
    expect(src.pages).toContain("{BLURRY_PAGE}");
    expect(src.pages).toContain(
      'page.status === "failed" && page.error === "needs-alignment" ? (',
    );
    expect(src.pages).toContain("{PAGE_NEEDS_LINING_UP}");
    expect(src.pages).toContain("label={LINE_UP_PAGE}");
  });

  it("reads a pocket again with the accent spinner, once at a time", () => {
    const menu = src.viewer.slice(
      src.viewer.indexOf("<View style={styles.actions}>"),
      src.viewer.indexOf("{panel ? ("),
    );
    expect(menu.indexOf("label={LEAVE_EMPTY}")).toBeLessThan(
      menu.indexOf("label={RESCAN_POCKET}"),
    );
    expect(menu).toContain('<ActivityIndicator size="small" color={colors.accent} />');
    expect(menu).toContain("{RESCANNING_POCKET}");
    expect(menu).toContain("disabled={rescanning !== null}");
    expect(menu).toContain("{RESCAN_FAILED}");
    expect(src.viewer).toContain("if (!onRescan || rescanBusy.current) return;");
    expect(src.pages).toContain("onRescan={(index) => rescan(shown[index].key)}");
    expect(src.pages).toContain(
      "const answer = await rescanPagePocket(at.scanId, at.slot);",
    );
    expect(src.api).toContain('{ action: "rescan-pocket", scanId, slot }');
  });

  it("shows the reasons small, the glare, and opens the printings asked when the printing is open", () => {
    const pane = src.viewer.slice(src.viewer.indexOf("function Pane("));
    expect(pane).toContain("{GLARE_ON_CARD}");
    expect(pane).toContain("{reasons.map((reason, at) => (");
    expect(src.viewer).toContain(
      'useState<Panel | null>(() =>\n    choosesPrinting(pockets[index]) ? "printing" : null,',
    );
    expect(src.viewer).toContain("? CHOOSE_PRINTING");
    expect(src.viewer).toContain("pocket?.printingUncertain === true");
  });
});

describe("the same constants as the website's screens", () => {
  /* The web components are written alongside; a name they do not use
     yet is checked on the app's side alone. */
  const pairs: [string, string, string][] = [
    [
      "STATUS_MATCHED",
      "mobile/src/page-scan.ts",
      "src/components/cards/pocket-status.ts",
    ],
    [
      "STATUS_REVIEW",
      "mobile/src/page-scan.ts",
      "src/components/cards/pocket-status.ts",
    ],
    [
      "STATUS_EMPTY",
      "mobile/src/page-scan.ts",
      "src/components/cards/pocket-status.ts",
    ],
    [
      "STATUS_UNRECOGNIZED",
      "mobile/src/page-scan.ts",
      "src/components/cards/pocket-status.ts",
    ],
    [
      "RESCAN_POCKET",
      "mobile/src/card-viewer.tsx",
      "src/components/cards/card-viewer.tsx",
    ],
    [
      "LINE_UP_PAGE",
      "mobile/src/page-scanner.tsx",
      "src/components/cards/page-check.tsx",
    ],
    [
      "LINE_UP_PAGE",
      "mobile/src/page-align.tsx",
      "src/components/cards/page-align.tsx",
    ],
    ["TURN_PAGE", "mobile/src/page-align.tsx", "src/components/cards/page-align.tsx"],
    [
      "READ_PAGE_AGAIN",
      "mobile/src/page-align.tsx",
      "src/components/cards/page-align.tsx",
    ],
    [
      "MOVE_AND_PLACE",
      "mobile/src/page-scanner.tsx",
      "src/components/cards/queue-check.tsx",
    ],
    ["CHOOSE_PHOTO", "mobile/src/card-scanner.tsx", "src/components/cards/scanner.tsx"],
    [
      "BLURRY_PAGE",
      "mobile/src/page-scanner.tsx",
      "src/components/cards/page-check.tsx",
    ],
    [
      "GLARE_ON_CARD",
      "mobile/src/card-viewer.tsx",
      "src/components/cards/card-viewer.tsx",
    ],
    [
      "CHOOSE_PRINTING",
      "mobile/src/card-viewer.tsx",
      "src/components/cards/card-viewer.tsx",
    ],
  ];

  /** Where a file imports a name from, or null. */
  const importedFrom = (text: string, name: string) => {
    for (const match of text.matchAll(/import \{([^}]*)\} from "([^"]+)";/g)) {
      if (new RegExp(`\\b${name}\\b`).test(match[1])) return match[2];
    }
    return null;
  };

  it.each(pairs)("%s, in %s", (name, mine, theirs) => {
    const used = new RegExp(`\\b${name}\\b`);
    const appText = read(mine);
    expect(code(appText)).toMatch(used);
    /* From the app's copy of the website's words, never typed in again. */
    expect(importedFrom(appText, name)).toBe("./scan-copy");
    const words = (site as unknown as Record<string, string>)[name];
    expect(code(appText)).not.toContain(`"${words}"`);
    /* The website's screen, where it has it: the same name, from the
       module the app's copy mirrors. */
    if (has(theirs) && used.test(code(read(theirs)))) {
      expect(importedFrom(read(theirs), name)).toBe("@/lib/cards/scan-rules");
    }
  });

  it("are the same strings as the website's, so the same buttons say the same thing", () => {
    for (const [name] of pairs) {
      expect((app as unknown as Record<string, string>)[name], name).toBe(
        (site as unknown as Record<string, string>)[name],
      );
    }
  });
});
