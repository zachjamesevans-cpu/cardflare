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
  "nearbyStores",
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
    /* camelCase allowed: `nearbyStores` is one kind, not two words. */
    const declared = [...union.matchAll(/^\s*kind: "([a-zA-Z]+)";$/gm)].map(
      (m) => m[1],
    );

    expect([...new Set(declared)].sort()).toEqual([...KINDS].sort());
  });
});

describe("the home screen's furniture", () => {
  it("keeps the shortcut row off the Feed on both", () => {
    /*
     * There were three tiles here — Your wants, Embers store, Customize —
     * and the founder cut them: "the top three things at top can be
     * removed since they're already elsewhere in the app... which will
     * open up more room for people's posts." Every one of them was a
     * second door to a screen that already has one, sitting above the
     * thing the Feed is actually for.
     *
     * Asserted on both platforms rather than deleted, because the row's
     * whole history is one platform growing furniture the other did not.
     */
    /*
     * The row itself, not the words. "Embers store" still appears on the
     * pack item and "Customize" is still a route the cosmetics item
     * navigates to — both are Feed posts rather than shortcuts, and
     * asserting on the strings alone would fail on those.
     */
    expect(app).not.toContain("Your wants");
    expect(web).not.toContain("Your wants");
    expect(app).not.toMatch(/const ACTIONS = \[/);
    expect(web).not.toMatch(/const ACTIONS = \[/);
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

  it("makes every picture in the answer absolute for a phone", () => {
    /*
     * A relative /api/avatars/... is meaningless to a device with no
     * origin to resolve it against, so it draws as initials. The rule
     * used to name ONE kind and every other face was quietly broken on
     * the phone - the founder: "will has a profile pic but it's not
     * visible". Keyed on the FIELD now, so the next item carrying a face
     * cannot forget it.
     */
    const route = read("src/app/api/v1/feed/route.ts");

    expect(route).toContain("function absoluteAvatars");
    expect(route).not.toContain('item.kind === "hunt" && item.avatarUrl');
  });

  it("dresses every face in the feed", () => {
    /*
     * PRODUCT.md names "it gives the cosmetics somewhere to be seen" as
     * a reason the Feed earns its place, and it showed bare circles.
     * The founder: "steven b should show his gif he has selected and his
     * avatar and ring effects."
     */
    const repo = read("src/lib/feed/repository.ts");

    /* Through avatarPathFor, which is the one place that knows a GIF is
       shown only while the tier allows it. */
    expect(repo).toContain("avatarSrc(avatarPathFor(row))");
    expect(repo).toContain("async function facesFor");

    for (const source of [items, app]) {
      expect(source).toMatch(/ring=\{(item|person|entry)\.ring\}/);
      expect(source).toMatch(/aura=\{(item|person|entry)\.aura\}/);
    }
  });

  it("keeps Verified and Ultra as two separate marks", () => {
    /*
     * Verified is trust - "cardflare has confirmed this profile is
     * controlled by the listed business" - and it is never for sale.
     * Ultra is the product tier. A row may show one, both or neither,
     * and no client may infer one from the other.
     */
    for (const source of [items, app]) {
      expect(source).toContain("store.verified");
      expect(source).toContain("store.ultra");
    }

    const repo = read("src/lib/feed/repository.ts");
    expect(repo).toContain('ultra: store.tier === "ultra"');
    expect(repo).toContain("verified: store.verified");
  });

  it("never carries a coordinate to a client", () => {
    /* The privacy rule as a type: NearbyStore has no latitude and no
       longitude, so a payload cannot leak one by omission. */
    const nearby = read("src/lib/stores/nearby.ts");
    const shape = nearby.slice(
      nearby.indexOf("export interface NearbyStore"),
      nearby.indexOf("const EARTH_MILES"),
    );

    expect(shape).not.toMatch(/\blatitude\b/);
    expect(shape).not.toMatch(/\blongitude\b/);

    for (const source of [items, app]) {
      expect(source).not.toMatch(/store\.latitude/);
      expect(source).not.toMatch(/store\.longitude/);
    }
  });

  it("names the tabs the same on both: Feed is Feed, Local is its own", () => {
    /* The founder's second pass on the bar: the Feed tab keeps its name,
       Room's slot becomes Local — area Flares and their conversations —
       and the live room rides the Feed as a banner. Both platforms, one
       arrangement. */
    expect(appRoot).toContain('tabBarLabel: "Feed"');
    expect(appRoot).toContain('name="Local"');
    expect(appRoot).not.toContain('<Tab.Screen name="Room"');

    const webTabs = read("src/components/players/player-tabs.tsx");
    expect(webTabs).toContain('label: "Feed"');
    expect(webTabs).toContain('label: "Local"');
    expect(webTabs).not.toContain('label: "Room"');
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

    /* It lives on the Feed screen now rather than in the navigator: the
       app's header floats over its own list so it can get out of the
       way on scroll, which a navigator header cannot do. Same place on
       screen, different owner. */
    expect(read("mobile/src/screens/home.tsx")).toContain(
      'navigation.navigate("FindPlayer")',
    );
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
