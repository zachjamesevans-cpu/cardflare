import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { HUNT_LIMIT, huntLimitFor } from "@/lib/players/hunts";

/**
 * HUNTS: a named set of cards somebody is looking for.
 *
 * The founder: "a way for someone to go onto someone's profile and see
 * their flare groups... they can have a section for their flaregroups
 * with cards they already found, and cards they're still looking for...
 * free users can do two flare groups... pro players get 50 of these."
 *
 * Named "hunts" because the product already says it: the Feed reads "is
 * hunting", the item is a HuntItem, and the composer's own field is the
 * hunt's name. Picking any other word would have meant a third noun for
 * one thing.
 */
describe("how many hunts a player may keep", () => {
  it("is two on the free tier and fifty on a paid one", () => {
    expect(HUNT_LIMIT.free).toBe(2);
    expect(HUNT_LIMIT.pro).toBe(50);

    expect(huntLimitFor("free")).toBe(2);
    expect(huntLimitFor("pro")).toBe(50);
  });

  it("carries upward, because capabilities accumulate", () => {
    /* ultra has everything pro has, max has everything ultra has. A
       paying player who upgrades must not lose hunts. */
    expect(huntLimitFor("ultra")).toBe(50);
    expect(huntLimitFor("max")).toBe(50);
  });

  it("treats an unknown or missing tier as free", () => {
    /* An older row, a null, or a tier this build has never heard of.
       Guessing upward would hand out fifty for free. */
    expect(huntLimitFor(null)).toBe(2);
    expect(huntLimitFor("enterprise")).toBe(2);
  });
});

describe("what a hunt is made of", () => {
  it("keeps the folder itself derived: no hunts table, no membership rows", async () => {
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    /*
     * The composer has asked for a group name since batches arrived,
     * and the Feed already draws a deck as one post because of it. What
     * was missing was anywhere to SEE the set, not a place to keep it -
     * so a hunt is still just the label, read off `flares`.
     */
    expect(hunts).toContain('.from("flares")');
    expect(hunts).toContain('.not("deck_label", "is", null)');
    expect(hunts, "a hunt must not be a table of its own").not.toMatch(
      /from\("hunts"\)|from\("hunt_cards"\)/,
    );
  });

  it("checks a card off by a trade OR by hand, and never confuses the two", async () => {
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    /*
     * THIS RULE WAS REVERSED, deliberately. The panel was built on
     * "nothing is checked off by hand", on the argument that a box is a
     * second thing to keep in step with the trade. The founder asked
     * for the box: "think of it as a checklist, others can help you
     * check those things off, or you can check them off yourself as you
     * collect the cards."
     *
     * He is right, and the old rule was wrong about the world: it
     * assumed every card arrives through a trade here, when most arrive
     * by pull, purchase or a friend. A checklist only a trade could
     * tick was wrong about most of its own boxes.
     *
     * The two facts stay SEPARATE. A trade writes `status`, a tick
     * writes `found_at`, and found is either - so neither is derived
     * from the other and there is nothing to keep in step.
     */
    expect(hunts).toContain(
      'const found = row.status === "traded" || row.found_at !== null;',
    );

    /* And the tick must never invent a trade: a trades row means two
       people actually dealt, and it shows up in somebody's history. */
    const mark = hunts.slice(hunts.indexOf("export async function markHuntCard"));
    expect(mark).toContain("found_at:");
    expect(mark, "ticking a box must not write a trade").not.toMatch(
      /from\("trades"\)|status: "traded"/,
    );
  });

  it("lets only the owner tick their own list", async () => {
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    /*
     * `flares` runs RLS on with ZERO policies, so every read and write
     * goes through the service role. The ownership check in the code is
     * not defence in depth - it is the entire defence.
     */
    const mark = hunts.slice(hunts.indexOf("export async function markHuntCard"));
    expect(mark).toContain('.eq("player_id", playerId)');
    expect(mark).toContain('reason: "not-yours"');
    /* And a card a real trade closed is not untickable from here. */
    expect(mark).toContain('reason: "traded"');
  });

  it("reads them once for the whole profile", async () => {
    /* A query per hunt is the shape that makes a profile arrive late on
       a shop's wifi. One read and a fold. */
    const profile = await readFile("src/lib/players/profile.ts", "utf8");
    expect(profile).toContain("hunts: await huntsFor(playerId)");
  });
});

describe("the limit is enforced where a hunt is started", () => {
  it("guards the one door: naming a group when posting", async () => {
    const actions = await readFile("src/lib/local/actions.ts", "utf8");
    expect(actions).toContain("canStartHunt(playerId, deckLabel)");
  });

  it("never refuses adding to a hunt they already keep", async () => {
    /* The limit is on how many SETS somebody keeps, not on how many
       cards go in them. */
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain("allowed: already || hunts.length < limit");
  });

  it("reads the tier itself rather than trusting the caller", async () => {
    /* A caller that has to fetch the tier first is a caller that can
       forget to, and hand a free player fifty. */
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain('.select("tier")');
  });
});

describe("both platforms draw the same panel", () => {
  it("has one on each, with the same rows and the same words", async () => {
    const web = await readFile("src/components/players/hunts-panel.tsx", "utf8");
    const app = await readFile("mobile/src/hunts-panel.tsx", "utf8");

    for (const source of [web, app]) {
      expect(source).toContain("export function HuntsPanel");
      /* The two numbers that are the whole point: what is left says
         whether you can help, what is found says whether it is worth
         reading at all. */
      expect(source).toContain("lookingLabel");
      expect(source).toContain("found");
      /* A finished hunt is not hidden - finishing one is the good
         outcome, and dropping it would only ever show unfinished work. */
      expect(source).toContain("All found");
    }
  });

  it("is drawn on your profile and on somebody else's, on both", async () => {
    const pages = await Promise.all([
      readFile("src/app/profile/page.tsx", "utf8"),
      readFile("src/app/p/[playerId]/page.tsx", "utf8"),
      readFile("mobile/src/screens/profile.tsx", "utf8"),
      readFile("mobile/src/screens/player-profile.tsx", "utf8"),
    ]);

    for (const page of pages) expect(page).toContain("<HuntsPanel");
  });

  it("survives a server that has never heard of hunts", async () => {
    /* The app ships on TestFlight's clock and the server on Vercel's. A
       profile with no hunts field must draw a profile, not a crash. */
    const app = await readFile("mobile/src/api.ts", "utf8");
    expect(app).toContain("hunts?: Hunt[];");

    for (const path of [
      "mobile/src/screens/profile.tsx",
      "mobile/src/screens/player-profile.tsx",
    ]) {
      const screen = await readFile(path, "utf8");
      expect(screen).toContain("profile.hunts ?? []");
    }
  });
});

describe("a hunt is a folder, and it opens", () => {
  /*
   * The founder, looking at his own profile: "hunts doesn't really do
   * anything rn... this should be a carousel of cards someone is
   * looking for nested into a folder. go to my profile. there's
   * nothing i can tap or add to."
   *
   * Three faults in one sentence - no cards, nothing tappable, nothing
   * to add with - and all three are guarded here, because each one is
   * the kind that typechecks perfectly while the panel sits dead.
   */
  it("carries the cards, not just the counts", async () => {
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain("export interface HuntCard");
    expect(hunts).toContain("cards: HuntCard[]");
    /* Through the one helper that turns ids into something readable,
       rather than a second copy of that query. */
    expect(hunts).toContain("cardFacts(");
  });

  it("draws one tile per card, however many Flares carried it", async () => {
    /*
     * Posting the same card into a hunt twice is ordinary, and it used
     * to mean two tiles sharing a React key - the exact duplicate-key
     * fault the Feed had to be fixed for once already.
     */
    const hunts = await readFile("src/lib/players/hunts.ts", "utf8");
    expect(hunts).toContain("const byCard = new Map<string, HuntCard>()");
  });

  it("opens onto a carousel on both platforms", async () => {
    /* The rails the rest of the product already uses, so a hunt's cards
       zoom and swipe like every other card rather than being a new kind
       of picture that does nothing. */
    const app = await readFile("mobile/src/hunts-panel.tsx", "utf8");
    const web = await readFile("src/components/players/hunts-panel.tsx", "utf8");
    /* A horizontal rail of the product's own card tiles, and the shelf
       that lets an opened card swipe along the rest of the folder. The
       app draws its rail inline rather than through `CardRail`, because
       each card carries a tick box underneath - same tile, same zoom. */
    expect(app).toContain("<ScrollView");
    expect(app).toContain("horizontal");
    expect(app).toContain("<CardImage");
    expect(web).toContain("<FeedTile");
    for (const source of [app, web]) {
      expect(source).toContain("siblings={shelf}");
    }
    /* And the found ones read as found, in the same vocabulary a traded
       card wears on a Flare. */
    for (const source of [app, web]) {
      expect(source).toMatch(/card\.found \? "found" : "open"/);
    }
  });

  it("gives every folder a lid and a way to add", async () => {
    const app = await readFile("mobile/src/hunts-panel.tsx", "utf8");
    const web = await readFile("src/components/players/hunts-panel.tsx", "utf8");

    /* Tappable: the row toggles rather than just sitting there. */
    expect(app).toContain("onPress={onToggle}");
    expect(web).toContain("onClick={onToggle}");

    /* And somewhere to press on your own profile - into the composer
       with the group already named, so it adds to THIS hunt. */
    expect(app).toContain('label="Add cards"');
    expect(web).toContain("Add cards");
    expect(web).toContain("/flare?hunt=$");
    expect(app).toContain("onAdd");
  });

  it("opens the composer into the named group on both platforms", async () => {
    /*
     * "Add cards" that dropped you on an empty composer would be a
     * button that looks like it worked. Both sides carry the name
     * through to the field the composer already had.
     */
    const appForm = await readFile("mobile/src/screens/post-flare.tsx", "utf8");
    const webForm = await readFile("src/components/lists/add-to-list-form.tsx", "utf8");
    expect(appForm).toContain("initialDeck");
    expect(webForm).toContain("initialDeck");
    expect(appForm).toContain('useState(initialDeck ?? "")');
    expect(webForm).toContain("useState(initialDeck)");

    const page = await readFile("src/app/flare/page.tsx", "utf8");
    expect(page).toContain("const { hunt } = await searchParams");
  });

  it("survives a server that has never heard of hunt cards", async () => {
    /*
     * Version skew. The app ships on TestFlight's clock and the server
     * on Vercel's, so a phone carrying the folder meets a server still
     * sending counts and nothing else. Optional, and read through a
     * default - a folder that opens on nothing is honest, one that
     * crashes on `undefined.map` is not.
     */
    const api = await readFile("mobile/src/api.ts", "utf8");
    const panel = await readFile("mobile/src/hunts-panel.tsx", "utf8");
    expect(api).toContain("cards?: HuntCard[]");
    expect(panel).toContain("hunt.cards ?? []");
  });
});

describe("the checklist", () => {
  /*
   * The founder: "needs to be a simply way in hunts to mark off if
   * you've already found that card. think of it as a checklist, others
   * can help you check those things off, or you can check them off
   * yourself as you collect the cards."
   */
  it("puts a box under every card on your own hunts, on both platforms", async () => {
    const app = await readFile("mobile/src/hunts-panel.tsx", "utf8");
    const web = await readFile("src/components/players/hunts-panel.tsx", "utf8");

    for (const source of [app, web]) {
      expect(source).toContain("function TickBox");
      /* Yours only. Somebody else's list is a thing to read. */
      expect(source).toMatch(/yours \? <TickBox|onTick \? <TickBox/);
      /* And a card a trade closed says so instead of offering a box. */
      expect(source).toContain("card.tradedAway");
    }
  });

  it("ticks optimistically, and puts the box back when the write fails", async () => {
    /*
     * The whole value of a checklist is that ticking feels like
     * nothing - somebody at a counter taps five in a row. A spinner
     * between each turns it back into a form. But a tick that silently
     * did not save is worse than a slow one, so a failure has to undo
     * itself.
     */
    const app = await readFile("mobile/src/hunts-panel.tsx", "utf8");
    expect(app).toContain("setFound(next)");
    expect(app).toContain("catch(() => setFound(!next))");

    const web = await readFile("src/components/players/hunts-panel.tsx", "utf8");
    expect(web).toContain("useOptimistic");
    expect(web).toContain("setError(");
  });

  it("reaches the server the same way from both platforms", async () => {
    const route = await readFile("src/app/api/v1/hunts/route.ts", "utf8");
    const action = await readFile("src/lib/players/hunt-actions.ts", "utf8");

    /* Both go through the one function that owns the rule. */
    for (const source of [route, action]) {
      expect(source).toContain("markHuntCard(");
    }
    /* A Server Action is a public POST, so the viewer is resolved on the
       server rather than trusted from the caller. */
    expect(action).toContain("getViewer()");
    expect(route).toContain("apiPlayer(request)");

    /* The answer carries the whole list back: a tick moves the folder's
       counts, and a client recomputing those will drift from them. */
    expect(route).toContain("hunts: await huntsFor(player.playerId)");
  });
});
