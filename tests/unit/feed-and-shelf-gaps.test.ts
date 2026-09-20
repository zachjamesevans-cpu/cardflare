import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(path, "utf8");

describe("your own Flares reach your own Feed, wherever you posted them", () => {
  /*
   * The founder: "when i post a flare, at least, a flare with multiple
   * cards, it doesn't show in feed at all" - then, decisively: "i am in
   * a room, if that helps. seems maybe if ur in a room it doesnt post
   * to feed."
   *
   * Exactly that. A board Flare has an `event_id` AND no `player_id` -
   * it is keyed to the room session - so it failed both filters on the
   * area read. The "recent" list covers rooms but only for people you
   * FOLLOW, and nobody follows themselves, so a Flare posted from a
   * room was invisible to its own author. Nothing to do with the card
   * count; a single one vanished just the same.
   */
  it("reads the author's own room Flares as well as their area ones", async () => {
    const repo = await read("src/lib/feed/repository.ts");

    expect(repo).toContain("async function ownRoomFlares(");
    expect(repo).toContain("const mine = await ownRoomFlares(viewerId);");
    /* Merged before grouping, or a batch posted in a room stops being
       one post and becomes one post per card. */
    expect(repo).toContain("const all = [...(flares ?? []), ...mine]");
    expect(repo).toContain("for (const flare of all) {");
  });

  it("finds them by session, since a board Flare carries no player id", async () => {
    const repo = await read("src/lib/feed/repository.ts");
    const fn = repo.slice(repo.indexOf("async function ownRoomFlares("));

    expect(fn).toContain('.from("player_sessions")');
    expect(fn).toContain('.in("player_session_id", ids)');
    /* Stamped with the account on the way out: the fact the row was
       missing, recovered from the session that owns it. Grouping and
       "is this mine" both key on it. */
    expect(fn).toContain("player_id: viewerId");
  });

  it("merges the two reads by time, not by which query found them", async () => {
    /*
     * The second half of the same bug, and the one the founder hit
     * after the first fix: "flares still not posting in the feed when
     * there's multiple. try it for yourself."
     *
     * Two reads, each already sorted, simply concatenated - so every
     * room Flare sorted BELOW every area one however recent it was. His
     * four Bonney cards WERE in the Feed, sixth, under five posts from
     * days earlier. From the top of the screen that is indistinguishable
     * from a Feed that dropped the post.
     */
    const repo = await read("src/lib/feed/repository.ts");
    expect(repo).toContain("const all = [...(flares ?? []), ...mine].sort(");
    expect(repo).toContain("b.created_at.localeCompare(a.created_at)");
  });

  it("does not read the area Flares twice", async () => {
    /*
     * The area query already returns everything with no event. Without
     * this filter the same Flare arrives down both paths and every
     * post outside a room is drawn twice.
     */
    const repo = await read("src/lib/feed/repository.ts");
    const fn = repo.slice(repo.indexOf("async function ownRoomFlares("));
    expect(fn).toContain('.not("event_id", "is", null)');
  });
});

describe("one shelf, both directions", () => {
  /*
   * The founder: "when a flare is in the 'letting go' tab if im trying
   * to offer something up, when i click it, it only shows the cards
   * that are in cards im looking for. the letting go cards should be
   * swipable in the carousel like normal, but should say im offering it
   * up or letting it go once i swipe to it."
   *
   * The app built its zoom shelf from the WANTS alone, so a showcase
   * tile was never in it - `shelfAt` missed, the `?? 0` fallback put
   * the viewer at the first wanted card, and opening a card somebody
   * was letting go showed one they were hunting.
   */
  it("puts showcases on the shelf on both platforms", async () => {
    const app = await read("mobile/src/screens/room.tsx");
    const web = await read("src/components/lists/list-entries.tsx");

    expect(app).toContain("...inRailOrder(showcases, held, isCovered),");
    expect(web).toContain(
      "const shelfEntries = [...inTileOrder(wantEntries), ...inTileOrder(showcases)];",
    );
  });

  it("keeps the two visibly separate in the rail", async () => {
    /* One swipe, two sections. The founder asked for both: "they should
       still be visibly separate in carousel, but when clicking on one,
       it's same swiping carousel." */
    const app = await read("mobile/src/screens/room.tsx");
    expect(app).toContain("{showcases.map(tile)}");
    expect(app).toMatch(/Offering ·/);
  });

  it("says which way each card points once it is swiped to", async () => {
    /* The shelf carries `direction` per card, and the zoom reads it -
       so a showcase says so on its own rather than inheriting the
       wording of whatever was tapped first. */
    const app = await read("mobile/src/screens/room.tsx");
    expect(app).toContain("direction: f.intent");

    const ui = await read("mobile/src/ui.tsx");
    expect(ui).toContain('direction === "showcase"');
    expect(ui).toContain("Offering this");
  });
});

describe("a tap closes the zoom the instant it lands, even mid-swipe", () => {
  /*
   * The founder: "when swiping between cards, i want to close out of it
   * immediately, but i cant until the swipe animation is done."
   *
   * Two different locks, one per platform. On the website a swipe set a
   * flag to swallow the click it might leave behind, but a real swipe
   * never produces a click, so the flag sat there and ate the NEXT tap.
   * In the app a finger landing while the rail was still sliding went to
   * the rail, which stopped the slide and told nobody, so the tap was
   * lost. Both now read a still finger as intent to close.
   */
  it("the website clears the swipe flag on its own", async () => {
    const zoom = await read("src/components/cards/card-image-zoom.tsx");
    /* A new finger is new intent. */
    expect(zoom).toContain(
      "touchFrom.current = event.touches[0]?.clientX ?? null;\n          /*",
    );
    expect(zoom).toContain("swiped.current = false;\n        }}");
    /* And the flag a swipe sets lets go by itself. */
    expect(zoom).toMatch(
      /swiped\.current = true;\s*window\.setTimeout\(\(\) => \{\s*swiped\.current = false;\s*\}, 120\);/,
    );
  });

  it("the app closes on a still tap while the rail settles", async () => {
    const ui = await read("mobile/src/ui.tsx");
    expect(ui).toContain("const settling = useRef(false);");
    expect(ui).toContain("settling.current = true;");
    expect(ui).toContain("if (moved < 12) close();");
  });
});
