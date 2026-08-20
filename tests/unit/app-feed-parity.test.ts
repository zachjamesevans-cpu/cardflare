import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The Feed, on both platforms, in the same round.
 *
 * The founder's standing instruction: "all design changes and anything I
 * say should also be programmed exactly the same for the app as well,
 * unless I explicitly say otherwise." The app is the same product, not a
 * companion.
 *
 * This exists because the first cut of the Feed's round two failed it
 * quietly. The four new ITEM kinds were shared - the server derives them
 * once and both clients render them - so the gap was invisible from the
 * server: the app got a new home header and a row of call to actions,
 * and the website's /feed kept an <h1> and a list. Nothing typechecked
 * differently and no test noticed.
 *
 * Read off the source, because that is what a parity rule is about: the
 * same sections, the same wording, in the same order. Whether either one
 * looks right is the visual pass in mobile/VISUAL-PASS.md.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const web = read("src/app/feed/page.tsx");
const app = read("mobile/src/screens/home.tsx");
const items = read("src/components/feed/feed-items.tsx");

/** Every item kind the server can produce, from the union itself. */
const KINDS = [
  "announcement",
  "board",
  "hunt",
  "upcoming",
  "recent",
  "traded",
  "added",
  "pack",
  "shop",
  "suggest",
  "start",
];

describe("the Feed's items", () => {
  it.each(KINDS)("%s is drawn on the website", (kind) => {
    /* `board` is the fallthrough on both, so it is asserted by the union
       check below rather than by a branch of its own. */
    if (kind === "board") return;
    expect(items).toContain(`item.kind === "${kind}"`);
  });

  it.each(KINDS)("%s is drawn in the app", (kind) => {
    if (kind === "board") return;
    expect(app).toContain(`item.kind === "${kind}"`);
  });

  it("has no kind the server sends and a client ignores", () => {
    const union = read("src/lib/feed/repository.ts");
    const declared = [...union.matchAll(/^\s*kind: "([a-z]+)";$/gm)].map((m) => m[1]);

    expect([...new Set(declared)].sort()).toEqual([...KINDS].sort());
  });
});

describe("the home screen's furniture", () => {
  it("offers the same three actions, in the same order, on both", () => {
    const labels = ["Your wants", "Embers store", "Customize"];

    for (const source of [web, app]) {
      const found = labels.map((label) => source.indexOf(label));
      expect(found.every((at) => at > -1)).toBe(true);
      expect([...found].sort((a, b) => a - b)).toEqual(found);
    }
  });

  it("keeps scanning out of the Feed on both", () => {
    /* The founder moved it once already: "move the qr code scanner/code
       entry to Room. No need to have that in the feed." Room holds the
       scanner and the code form on both platforms. */
    expect(app).not.toContain("Scan a code");
    expect(web).not.toContain("Scan a code");
  });

  it("hides the explainer once the screen has filled up", () => {
    expect(web).toContain("items.length < 3");
    expect(app).toContain("feed.length < 3");
  });

  it("says nothing rather than zero when a balance did not arrive", () => {
    /* An app build meets servers older than itself, and "0 Embers" beside
       somebody holding thousands is worse than an absent badge. */
    expect(app).toContain('typeof me.player.embersBalance === "number"');
    expect(app).not.toContain("me.player.embersBalance ?? 0");
    expect(web).toContain("balance !== null &&");
  });
});
