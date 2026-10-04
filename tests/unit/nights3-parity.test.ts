import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as webCopy from "@/lib/events/night-copy";
import { youHaveLabel } from "@/lib/matching/schema";
import { PUSH_GROUPS } from "@/lib/notifications/push-prefs";

/**
 * Nights, round 3: printing-aware matches, on both platforms.
 *
 * A match card now says whether the holder's copy is the printing the
 * wanter named. When it is not, one muted line under the card's name
 * says so, in the direction that is true: "They have another printing"
 * on cards they have that you want, "You have another printing" on
 * cards they want that you have. This reads both sources and holds the
 * words, the field and the side to one another, so a platform cannot
 * drift quietly. Whether either one looks right is the visual pass.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/** The app's copy, run as written. */
function loadModule(source: string): Record<string, unknown> {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports;
}

const appCopy = loadModule(read("mobile/src/night-copy.ts"));
const appHeldLabel = loadModule(read("mobile/src/held-label.ts")) as {
  youHaveLabel: (kind: "exact" | "other-printing", count: number) => string;
};
const appPush = loadModule(read("mobile/src/push-copy.ts")) as {
  PUSH_GROUPS: { key: string; line: string }[];
};

const THEY = "They have another printing";
const YOU = "You have another printing";
const NIGHTS_LINE =
  "Boards opening, matches, a reminder on the day, and Flares in a room you are in.";

const web = {
  matches: read("src/lib/events/night-matches.ts"),
  matchList: read("src/components/events/match-list.tsx"),
  mutualMatch: read("src/components/events/mutual-match.tsx"),
  whatToBring: read("src/components/events/what-to-bring.tsx"),
  matchesForYou: read("src/components/events/matches-for-you.tsx"),
  nightPlayer: read("src/components/events/night-player.tsx"),
};

const app = {
  api: read("mobile/src/api.ts"),
  nightMatches: read("mobile/src/screens/night-matches.tsx"),
  mutualMatch: read("mobile/src/mutual-match.tsx"),
  whatToBring: read("mobile/src/what-to-bring.tsx"),
  nightPlayer: read("mobile/src/screens/night-player.tsx"),
};

/** The text between two markers, so a pin can say "on this side". */
function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start, `${from} is drawn`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(to, start + from.length);
  expect(end, `${to} follows ${from}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

/** `export interface Name { ... }`, the braces balanced. */
function declaration(source: string, name: string): string {
  const start = source.indexOf(`export interface ${name} {`);
  expect(start, `${name} is exported`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} never closes`);
}

describe("the two printing lines", () => {
  it("carry the brief's words on both platforms", () => {
    expect(webCopy.OTHER_PRINTING_THEY).toBe(THEY);
    expect(webCopy.OTHER_PRINTING_YOU).toBe(YOU);
    expect(appCopy.OTHER_PRINTING_THEY).toBe(THEY);
    expect(appCopy.OTHER_PRINTING_YOU).toBe(YOU);
  });

  it("reuse the card viewer's phrase, word for word, on both platforms", () => {
    expect(youHaveLabel("other-printing", 1)).toBe(webCopy.OTHER_PRINTING_YOU);
    expect(appHeldLabel.youHaveLabel("other-printing", 1)).toBe(
      appCopy.OTHER_PRINTING_YOU,
    );
  });
});

describe("the MatchCard contract", () => {
  it("carries match on both platforms, beside the wanter's printing label", () => {
    const webCard = declaration(web.matches, "MatchCard");
    expect(webCard).toContain("printingLabel: string | null;");
    expect(webCard).toContain("match: MatchKind;");
    expect(web.matches).toMatch(
      /import \{[^}]*\btype MatchKind\b[^}]*\} from "@\/lib\/matching\/schema";/,
    );

    const appCard = declaration(app.api, "MatchCard");
    expect(appCard).toContain("printingLabel: string | null;");
    expect(appCard).toContain('match: "exact" | "other-printing";');
  });
});

describe("the line under the card", () => {
  it("says THEY on the match list's Has rows and YOU on its Looking for rows", () => {
    const has = between(web.matchList, "Has:", "Looking for:");
    expect(has).toContain('card.match === "other-printing"');
    expect(has).toContain("{OTHER_PRINTING_THEY}");
    expect(has).not.toContain("OTHER_PRINTING_YOU");
    const looking = web.matchList.slice(web.matchList.indexOf("Looking for:"));
    expect(looking).toContain('card.match === "other-printing"');
    expect(looking).toContain("{OTHER_PRINTING_YOU}");
    expect(looking).not.toContain("OTHER_PRINTING_THEY");

    const appHas = between(app.nightMatches, 'lead: "Has"', 'lead: "Looking for"');
    expect(appHas).toMatch(
      /printing:\s*card\.match === "other-printing" \? OTHER_PRINTING_THEY : null,/,
    );
    const appLooking = app.nightMatches.slice(
      app.nightMatches.indexOf('lead: "Looking for"'),
    );
    expect(appLooking).toMatch(
      /printing:\s*card\.match === "other-printing" \? OTHER_PRINTING_YOU : null,/,
    );
    /* The line is drawn, muted, under the name. */
    expect(app.nightMatches).toMatch(
      /\{printing \? \(\s*<Text style=\{\{ color: colors\.textMuted, fontSize: 12 \}\}>\s*\{printing\}\s*<\/Text>/,
    );
    expect(web.matchList).toMatch(
      /card\.match === "other-printing" && \(\s*<span className="text-xs text-text-muted">\s*\{OTHER_PRINTING_THEY\}/,
    );
  });

  it("sits under the thumbnails in a mutual match, short, since the column says whose", () => {
    for (const [source, thumbs] of [
      [web.mutualMatch, "MatchThumbs"],
      [app.mutualMatch, "ThumbRow"],
    ] as const) {
      expect(source).toContain("{OTHER_PRINTING_SHORT}");
      expect(source).toContain('card.match === "other-printing"');
      expect(source).not.toContain("OTHER_PRINTING_THEY");
      expect(source).not.toContain("OTHER_PRINTING_YOU");
      expect(source).not.toContain('side: "they-have" | "they-want";');
      expect(source).toContain(`export function ${thumbs}(`);
    }
    expect(webCopy.OTHER_PRINTING_SHORT).toBe("Other printing");
    expect(appCopy.OTHER_PRINTING_SHORT).toBe("Other printing");
    /* The caption on the card is still the printing the wanter named. */
    expect(web.mutualMatch).toContain('caption: card.printingLabel ?? "Any printing"');
    expect(app.mutualMatch).toContain("caption={card.printingLabel}");
  });

  it("sits under the thumbnails on a player's night page too, through the same rows", () => {
    expect(web.nightPlayer).toContain("cards={view.theyHave}");
    expect(web.nightPlayer).toContain("cards={view.theyWant}");
    expect(web.nightPlayer).not.toContain('side="they-');
    expect(app.nightPlayer).toContain("cards={view.theyHave}");
    expect(app.nightPlayer).toContain("cards={view.theyWant}");
    expect(app.nightPlayer).not.toContain('side="they-');
  });

  it("says YOU, and only YOU, on the What to bring checklist", () => {
    for (const source of [web.whatToBring, app.whatToBring]) {
      expect(source).toContain('card.match === "other-printing"');
      expect(source).toContain("{OTHER_PRINTING_YOU}");
      expect(source).not.toContain("OTHER_PRINTING_THEY");
    }
    expect(web.whatToBring).toMatch(
      /card\.match === "other-printing" && \(\s*<span className="text-xs text-text-muted">\{OTHER_PRINTING_YOU\}<\/span>/,
    );
    expect(app.whatToBring).toMatch(
      /row\.card\.match === "other-printing" \? \(\s*<Text style=\{\{ color: colors\.textMuted, fontSize: 12 \}\}>\s*\{OTHER_PRINTING_YOU\}/,
    );
  });

  it("is not drawn by Matches for you, which hands its cards to the mutual block", () => {
    expect(web.matchesForYou).toContain("<MutualMatchBlock");
    expect(web.matchesForYou).not.toContain("MatchCard");
    expect(web.matchesForYou).not.toContain("OTHER_PRINTING");
  });
});

describe("the nights push line", () => {
  it("mentions the reminder on both platforms", () => {
    expect(PUSH_GROUPS.find((group) => group.key === "nights")?.line).toBe(NIGHTS_LINE);
    expect(appPush.PUSH_GROUPS.find((group) => group.key === "nights")?.line).toBe(
      NIGHTS_LINE,
    );
  });
});
