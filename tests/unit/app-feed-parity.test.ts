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
const webPage = read("src/app/feed/page.tsx");
const appRoot = read("mobile/App.tsx");

/** Every item kind the server can produce, from the union itself. */
const KINDS = [
  "wanted",
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

  it("draws nothing for a kind the client has never heard of", () => {
    /*
     * The server ships on Vercel's clock and the app on TestFlight's, so
     * a phone meets kinds newer than itself routinely. Both chains used to
     * END in the board branch, which rendered an unknown kind AS a board -
     * an undefined title over a button to an undefined room. That is how
     * the two platforms came to show different feeds the week the new
     * kinds landed, reported by the founder rather than caught here.
     */
    expect(items).toContain('if (item.kind !== "board") return null;');
    expect(app).toContain('item.kind !== "board" ? null : (');
  });

  it("says why every item is on the screen, and where it belongs", () => {
    /*
     * The founder: "seeing a bunch of random cards posted just doesn't
     * feel great." A feed that explains itself stops feeling arbitrary
     * even when it is thin, and the ordering was always an argument
     * about what is worth a tap - this is that argument said out loud.
     *
     * Both live on the server so the two platforms cannot word them
     * differently, which is what a shared SECTION_TITLES is for.
     */
    const repo = read("src/lib/feed/repository.ts");

    expect(repo).toContain("function reasonFor(item: FeedItem): string");
    expect(repo).toContain("function sectionFor(item: FeedItem): FeedSection");
    expect(repo).toContain("export const SECTION_TITLES");

    expect(webPage).toContain("SECTION_TITLES[item.section]");
    expect(app).toContain("SECTION_TITLES[item.section]");
    expect(webPage).toContain("{item.reason}");
    expect(app).toContain("{item.reason}");
  });

  it("lets the feed be asked for again", () => {
    /* The most-reopened screen in the app had no pull to refresh, which
       quietly teaches that reopening is pointless. */
    expect(app).toContain("<RefreshControl");
  });

  it("hides the explainer once the screen has filled up", () => {
    expect(web).toContain("items.length < 3");
    expect(app).toContain("feed.length < 3");
  });

  it("sizes a card by how many are in the row, the same way on both", () => {
    /* "It looks a little silly to have one single card on a thing." One
       card gets a picture, a deck gets a strip, and the thresholds are
       one product's, not two. */
    const web = readFileSync(
      resolve(import.meta.dirname, "../../src/components/feed/feed-items.tsx"),
      "utf8",
    );

    expect(web).toContain("if (count <= 1) return");
    expect(web).toContain("if (count <= 3) return");
    expect(app).toContain("if (count <= 1) return 160;");
    expect(app).toContain("if (count <= 3) return 96;");
  });

  it("puts finding a player on the feed, on both", () => {
    /* "Let's make a search icon in the top right of the main feed." */
    expect(webPage).toContain("<FeedSearch />");
    expect(appRoot).toContain('navigation.navigate("FindPlayer")');
  });

  it("keeps one wants list, and lets it say which state a card is in", () => {
    /* "The 'saved wants' section in the settings is kinda redundant." */
    const settings = read("mobile/src/screens/settings.tsx");
    const row = read("mobile/src/want-row.tsx");
    const entries = read("src/components/players/want-entries.tsx");

    /* The rendered heading, not the word: the file may well explain in a
       comment why the list is no longer here. */
    expect(settings).not.toContain("<Title>Your saved wants</Title>");
    expect(row).toContain("want.postedAt");
    expect(entries).toContain("want.postedAt");
  });

  it("says nothing rather than zero when a balance did not arrive", () => {
    /* An app build meets servers older than itself, and "0 Embers" beside
       somebody holding thousands is worse than an absent badge. */
    expect(app).toContain('typeof me.player.embersBalance === "number"');
    expect(app).not.toContain("me.player.embersBalance ?? 0");
    expect(web).toContain("balance !== null &&");
  });
});
