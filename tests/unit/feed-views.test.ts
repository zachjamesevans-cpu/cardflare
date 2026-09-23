import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { FEED_VIEWS, feedViewFrom } from "@/lib/feed/views";

/**
 * How the Feed is drawn, and who decides.
 *
 * The founder: "lets develop a few 'views' for the feed, that can be
 * changed under settings in the profile. this is the orignal view,
 * let's make a compact view... one flare takes up the whole screen
 * right now pretty much."
 */
const read = (path: string) => readFile(path, "utf8");

describe("feed views", () => {
  it("falls back to the original for anything it cannot draw", () => {
    /*
     * Version skew, and the reason this is a function rather than a
     * cast. A phone ships on TestFlight's clock and will meet a view
     * added after it was built; the original card is the one answer
     * always drawable, and a blank Feed is the alternative.
     */
    expect(feedViewFrom("compact")).toBe("compact");
    expect(feedViewFrom("classic")).toBe("classic");
    expect(feedViewFrom("mosaic-3d")).toBe("classic");
    expect(feedViewFrom(null)).toBe("classic");
    expect(feedViewFrom(undefined)).toBe("classic");
  });

  it("offers the same views, in the same order, on both platforms", async () => {
    /*
     * The app keeps its own copy of the vocabulary because it cannot
     * import from `src/`. A view the website offers and the app cannot
     * draw is a setting that appears to do nothing.
     */
    const web = await read("src/lib/feed/views.ts");
    const app = await read("mobile/src/feed-views.ts");

    for (const source of [web, app]) {
      expect(source).toContain(
        'export const FEED_VIEWS = ["classic", "compact"] as const',
      );
      expect(source).toContain("export function feedViewFrom(");
    }

    /* Same words too, or the same choice is described two ways. */
    for (const view of FEED_VIEWS) {
      const title = web.match(new RegExp(`${view}: "([^"]+)"`))?.[1];
      expect(title, `no title for ${view}`).toBeTruthy();
      expect(app).toContain(`${view}: "${title}"`);
    }
  });

  it("stores the choice on the account, not the device", async () => {
    /*
     * A view is a preference about reading, not about a handset. The
     * room already follows the account across platforms for the same
     * reason, and the founder asked for it "under settings in the
     * profile".
     */
    const migration = await read("supabase/migrations/20261013090000_feed_views.sql");
    expect(migration).toContain("alter table public.players");
    expect(migration).toContain("feed_view");
    /* Constrained in the database as well as in the code: two guards,
       neither relied on alone. */
    expect(migration).toContain("check (feed_view in ('classic', 'compact'))");
  });

  it("does not take /me down when the column is not there yet", async () => {
    /*
     * The migration is applied by hand, so there is a window where the
     * code is deployed and the column is not. Folded into the existing
     * select, a missing column fails the whole query - and /me is the
     * endpoint the app opens with. Read on its own, it costs a setting
     * rather than a session.
     */
    const route = await read("src/app/api/v1/me/route.ts");
    /* Its own read, in the same batch as the rest, never folded into
       the players select. */
    expect(route).toContain("feedViewFor(player.playerId),");
    expect(route).not.toContain('select("avatar_url, embers_balance, feed_view")');
  });

  it("draws the compact card on both platforms, with the count on the art", async () => {
    /*
     * "a green quantity count of the card they're needing on the card.
     * so if it's a bonney, the bottom right will show a '1x'."
     */
    const app = await read("mobile/src/flare-feed-card-compact.tsx");
    const web = await read("src/components/feed/flare-feed-card-compact.tsx");

    for (const source of [app, web]) {
      expect(source).toContain("function NeedBadge");
      /* What is STILL wanted, not what was asked for. */
      expect(source).toContain("card.remaining ?? card.quantity ?? 1");
      /* Bottom right, and in the accent. */
      expect(source).toMatch(/bottom/);
    }
    expect(app).toContain("`${wanted}x`");
    expect(web).toContain("{wanted}x");
  });

  it("shows the whole card rather than cropping its border off", async () => {
    /*
     * The founder, on the compact view: "the images for the cards are
     * quite pixelated and distorted. i get that they're smaller, but it
     * is cleraly rendering incorrectly."
     *
     * A tile is sized to the PHYSICAL card - 2.5 x 3.5, or 0.714 - but
     * a scan carries a margin and arrives at 600x825, which is 0.727.
     * Filling the box cut the sides off and took the card's own border
     * with them, which reads as a squeezed picture. Containing shows
     * the whole card and never squeezes it; the one percent of
     * difference goes to the ground behind.
     *
     * Both platforms had it, and the app's tile is the same geometry.
     */
    const webTile = await read("src/components/feed/feed-tile.tsx");
    expect(webTile).toContain('className="size-full object-contain"');
    expect(webTile).not.toContain("object-cover");

    const appUi = await read("mobile/src/ui.tsx");
    /* The tile image, anchored on the frame it is drawn into rather
       than on a line number. */
    const tile = appUi.slice(appUi.indexOf("if (!ownImageUrl) return"));
    const first = tile.slice(tile.indexOf("<RemoteImage"));
    expect(first.slice(0, 900)).toContain('contentFit="contain"');
  });

  it("opens a profile with every hunt closed", async () => {
    /*
     * The founder, opening somebody else's profile: "it immediately
     * unnests their top hunt holder. dont do that."
     *
     * The first folder used to open itself, on the argument that a
     * panel of closed lids shows nothing. But a profile is a thing you
     * glance at, and one arbitrary folder springing open makes it the
     * loudest thing on somebody's page. Closed is also the only state
     * that reads the same whoever is looking.
     */
    for (const path of [
      "src/components/players/hunts-panel.tsx",
      "mobile/src/hunts-panel.tsx",
    ]) {
      const source = await read(path);
      expect(source).toContain("useState<string | null>(null)");
      expect(source, `${path} still opens a hunt on arrival`).not.toMatch(
        /useState<string \| null>\(\s*(keyOf\(hunts\[0\]\)|hunts\[0\])/,
      );
    }
  });

  it("puts the carousel arrows on the card, not in a row above it", async () => {
    /*
     * The founder: "the arrows to sift between the cards in a carousel
     * should be at the right and left middle of the card, not at the
     * very top. this will also allow you to eliminate dead space at the
     * top and bottom as well."
     */
    const zoom = await read("src/components/cards/card-image-zoom.tsx");
    expect(zoom).toContain("absolute top-1/2 left-2 -translate-y-1/2");
    expect(zoom).toContain("absolute top-1/2 right-2 -translate-y-1/2");
    /* And the row they came from is gone rather than emptied. */
    expect(zoom).not.toContain(
      '<div className="flex items-center justify-between gap-3">',
    );
  });

  it("keeps the extras contextual", async () => {
    /*
     * "focus on making things contexual - only popping up when needed."
     * The chips went because "Want" is true of every hunt; cash is the
     * exception that earns a word. The note was already conditional.
     */
    const app = await read("mobile/src/flare-feed-card-compact.tsx");
    const web = await read("src/components/feed/flare-feed-card-compact.tsx");

    for (const source of [app, web]) {
      expect(source).toContain("item.acceptsCash");
      expect(source).toContain("(done || terms || item.note)");
      /* No always-on row of buttons: that is what made a post a screen. */
      expect(source).not.toContain("Update progress");
      expect(source).not.toContain("View all");
    }
  });

  it("says so when the save fails, rather than just snapping back", async () => {
    /*
     * The founder, before the migration had been run: "clicking compact
     * clicks it back to classic immediately upon clicking."
     *
     * It was doing the right thing - the write failed, so the optimistic
     * choice was put back - but in SILENCE, which reads as a setting
     * that does not work rather than one that could not save. The
     * website's picker already said so; the app did not.
     */
    const app = await read("mobile/src/screens/settings.tsx");
    expect(app).toContain("setViewError(");
    expect(app).toContain("<ErrorLine message={viewError} />");
    /* And it reverts to what it was, not to whatever the closure held. */
    expect(app).toContain("const previous = view;");
    expect(app).toContain("setView(previous)");

    const web = await read("src/components/feed/feed-view-picker.tsx");
    expect(web).toContain("setError(");
  });

  it("is switched from settings on both platforms", async () => {
    const appSettings = await read("mobile/src/screens/settings.tsx");
    const webSettings = await read("src/app/profile/settings/page.tsx");

    expect(appSettings).toContain("<Title>Feed view</Title>");
    expect(appSettings).toContain("setFeedView(option)");
    expect(webSettings).toContain("<FeedViewPicker");
  });
});
