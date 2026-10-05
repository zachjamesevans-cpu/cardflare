import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* A file that is not there yet reads as empty, so every pin on it
   fails by name instead of the whole suite failing to load. */
const read = (path: string) => {
  try {
    return readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");
  } catch {
    return "";
  }
};

/**
 * Binder round 2, both platforms: any binder can be up for trade, no
 * cover picture, names, 3 x 3 only, and the fixes.
 *
 * The founder, with four screenshots: "Delete the ability to have a
 * picture on the binder, it's tacky imo." "Ability to change name of
 * binder. Notice how it says 'yours' in bottom left of binder? Allow
 * us to change that text." "Ability for multiple types of binders -
 * and a toggle to enable it as a public / trade binder. Anything
 * that's public is up for trade." "The drag and drop thing in the
 * binder is awful and broken." "The little text box for adding a new
 * card is so small and when u click the TCG dropdown, it gets cut
 * off." "The 2x2 and 3x3 are both broken on phone. I think it may be
 * best to not even give them the option for a 2x2. Just have a 3x3."
 *
 * So there is no Trade binder any more: every binder is one of the
 * player's, named by them, with one switch, Up for trade. Read off
 * the source, because parity is the same words, the same controls
 * and the same drawing on the website and in the app.
 */

const web = {
  cover: read("src/components/binder/binder-cover.tsx"),
  highlights: read("src/components/binder/binder-highlights.tsx"),
  list: read("src/components/binder/binder-list.tsx"),
  create: read("src/components/binder/create-binder.tsx"),
  forTrade: read("src/components/binder/for-trade-switch.tsx"),
  view: read("src/components/binder/binder-page.tsx"),
  /* Shared with the hunt page since the hunts-as-binders round. */
  pockets: read("src/components/binder/pockets.tsx"),
  settings: read("src/components/binder/binder-settings.tsx"),
  add: read("src/components/binder/add-binder-card.tsx"),
  ownBinder: read("src/app/profile/binders/[binderId]/page.tsx"),
  /* The page is a thin door now; its body is PublicBinder, shared with
     the share link /b/<id>. */
  playerBinder:
    read("src/app/p/[playerId]/binders/[binderId]/page.tsx") +
    read("src/components/binder/public-binder.tsx"),
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
};

const app = {
  cover: read("mobile/src/binder-cover.tsx"),
  highlights: read("mobile/src/binder-highlights.tsx"),
  list: read("mobile/src/binder-list.tsx"),
  create: read("mobile/src/create-binder-sheet.tsx"),
  binder: read("mobile/src/screens/binder.tsx"),
  pockets: read("mobile/src/pockets.tsx"),
  binders: read("mobile/src/screens/binders.tsx"),
  covers: read("mobile/src/binder-covers.ts"),
  ownProfile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  api: read("mobile/src/api.ts"),
};

const platforms = [
  ["web", web],
  ["app", app],
] as const;

/* The page as a whole: the website's is four client pieces, the
   switch being drawn from its own file so the create dialog and the
   settings strip say the same words. */
const webPage = web.view + web.settings + web.add + web.forTrade;
const webCreate = web.create + web.forTrade;
const appPage = app.binder;

/* The words, the same on both platforms. */
const FOR_TRADE_LINE = "People nearby hunting one of these cards hear about it.";
const OWN_FOR_TRADE =
  "Up for trade. Somebody nearby hunting one of these hears about it.";
const OWN_PRIVATE = "Private. Only you can open it.";

describe("the cover: the colour and the name, no picture", () => {
  it("has no window and no front card on either platform", () => {
    for (const [name, source] of platforms) {
      expect(source.cover.length, `${name}: the cover exists`).toBeGreaterThan(0);
      expect(source.cover, name).not.toContain("frontImageUrl");
      expect(source.cover, name).not.toMatch(/sleeve/i);
      expect(source.cover, name).not.toMatch(/window/i);
      expect(source.cover, name).toMatch(/zipper/i);
    }
    expect(web.cover).not.toContain("<img");
    expect(app.cover).not.toContain("RemoteImage");
    expect(app.cover).not.toContain("<Image");
  });

  it("wears the binder's name, embossed bottom left, one line", () => {
    expect(web.cover).toContain("{!plain && label && (");
    expect(web.cover).toContain("right-[8%] bottom-[9%] left-[8%] truncate font-bold");
    expect(app.cover).toContain("numberOfLines={1}");
    /* The list hands it the binder's own name, never "Yours" or the
       owner's name. */
    for (const [name, source] of platforms) {
      expect(source.list, name).toContain("label={binder.name}");
      expect(source.list, name).not.toContain('"Yours"');
      expect(source.list, name).not.toContain("ownerName");
    }
  });

  it("has no Front control and no front card anywhere", () => {
    for (const [name, page] of [
      ["web", webPage],
      ["app", appPage],
    ] as const) {
      expect(page, name).not.toMatch(/>\s*Front\s*</);
      expect(page, name).not.toContain("frontEntryId");
      expect(page, name).not.toContain("onFront");
      expect(page, name).not.toContain("isFront");
    }
    for (const source of [
      web.highlights,
      web.list,
      web.ownBinder,
      web.playerBinder,
      app.highlights,
      app.list,
      app.binders,
    ]) {
      expect(source).not.toContain("frontImageUrl");
      expect(source).not.toContain("frontEntryId");
    }
  });
});

describe("the highlights: the binder itself, small", () => {
  it("draws each one as the cover at xs, no circle, no initial, no picture", () => {
    expect(web.highlights).toContain(
      '<BinderCover cover={binder.cover} size="xs" plain />',
    );
    expect(web.highlights).not.toContain("binderInitial");
    expect(web.highlights).not.toContain("<img");
    expect(app.highlights).toContain(
      '<BinderCover cover={binder.cover} size="xs" plain />',
    );
    expect(app.highlights).not.toContain("binderInitial");
    expect(app.highlights).not.toContain("RemoteImage");
    expect(app.highlights).not.toContain("frontImageUrl");
  });

  it("rings a binder up for trade in lime with the arrows badge, in the owner's order", () => {
    expect(web.highlights).toContain("binder.forTrade");
    expect(web.highlights).toContain("ring-2 ring-accent ring-offset-2");
    expect(web.highlights).toContain("ring-1 ring-border-strong");
    expect(web.highlights).toContain("<ArrowLeftRight");
    expect(app.highlights).toContain("binder.forTrade");
    expect(app.highlights).toContain('"swap-horizontal"');
    for (const [name, source] of platforms) {
      expect(source.highlights, name).not.toContain("kind");
      expect(source.highlights, name).not.toMatch(/trade first/i);
    }
  });

  it("keeps the + for the owner, even with no binders left", () => {
    expect(web.highlights).toContain(
      "if (binders.length === 0 && !yours) return null;",
    );
    expect(web.highlights).toContain('<CreateBinder trigger="tile" />');
    expect(app.highlights).toMatch(/binders\.length === 0 && !yours/);
  });
});

describe("the Binders list", () => {
  it("says Up for trade as a lime chip, or Private to the owner", () => {
    for (const [name, source] of platforms) {
      expect(source.list, name).toContain("binder.forTrade");
      expect(source.list, name).toMatch(/>\s*Up for trade\s*</);
      expect(source.list, name).toMatch(/>\s*Private\s*</);
      expect(source.list, name).not.toContain("Private, only you");
      expect(source.list, name).not.toMatch(/>\s*Trade\s*</);
      expect(source.list, name).not.toMatch(/>\s*Public\s*</);
    }
    /* The count line is "12 cards", not "12 cards to trade": inline on
       the web, inline or through the app's own cover helpers. */
    expect(web.list).toContain('=== 1 ? "card" : "cards"');
    expect(app.list + app.covers).toContain('=== 1 ? "card" : "cards"');
    expect(app.list + app.covers).not.toContain("to trade");
    expect(web.list).toContain("bg-accent");
    expect(web.list).toContain("yours ?");
  });
});

describe("the create dialog", () => {
  it("asks the name, the cover and Up for trade, off by default, with its line", () => {
    for (const [name, create] of [
      ["web", webCreate],
      ["app", app.create],
    ] as const) {
      expect(create, name).toContain("Up for trade");
      expect(create, name).toContain(FOR_TRADE_LINE);
      expect(create, name).toContain("forTrade");
      expect(create, name).not.toContain("Private");
    }
    expect(web.create).toContain("useState(false)");
    expect(web.create).toContain(
      "createBinderAction({ name: trimmed, cover, forTrade })",
    );
    expect(web.create).toContain("<ForTradeSwitch");
    expect(web.forTrade).toContain('role="switch"');
    expect(web.forTrade).toContain("checked={on}");
    expect(app.create).toMatch(/useState\(false\)/);
    expect(app.create).toContain("<Switch");
  });
});

describe("the binder page", () => {
  it("has the Up for trade switch with its line, and the Private words, on both", () => {
    for (const [name, page] of [
      ["web", webPage],
      ["app", appPage],
    ] as const) {
      expect(page, name).toContain("Up for trade");
      expect(page, name).toContain(FOR_TRADE_LINE);
      expect(page, name).toContain(OWN_FOR_TRADE);
      expect(page, name).toContain(OWN_PRIVATE);
      expect(page, name).toContain("will trade.");
      expect(page, name).not.toContain("isPublic");
      expect(page, name).not.toContain("Anyone on cardflare can open it");
    }
    expect(web.view).toContain("`Cards ${ownerName} will trade.`");
    expect(web.settings).toContain("<ForTradeSwitch");
    expect(web.settings).toContain("save({ forTrade: on })");
    expect(web.forTrade).toContain("export function ForTradeSwitch");
  });

  it("has no 2 x 2 and no layout picker anywhere, on either platform", () => {
    for (const [name, source] of [
      ["web page", webPage],
      ["web own binder", web.ownBinder],
      ["web player binder", web.playerBinder],
      ["app page", appPage],
      ["app api", app.api],
    ] as const) {
      expect(source, name).not.toContain("2 × 2");
      expect(source, name).not.toContain("2x2");
      expect(source, name).not.toContain("BINDER_LAYOUTS");
      expect(source, name).not.toMatch(/>\s*Layout\s*</);
      expect(source, name).not.toMatch(/layout === 2/);
    }
    expect(web.pockets).toContain("export const COLUMNS = 3;");
    expect(web.pockets).toContain("export const POCKETS_PER_PAGE = COLUMNS * COLUMNS;");
    expect(web.view).toContain("grid-cols-3");
    expect(web.view).not.toContain("grid-cols-2");
    expect(web.view).not.toContain("pocketsPerPage(");
  });

  it("names and deletes every binder, with the confirm", () => {
    for (const [name, page] of [
      ["web", webPage],
      ["app", appPage],
    ] as const) {
      expect(page, name).toContain("Delete binder");
      expect(page, name).toContain("Keep");
      expect(page, name).toContain("with it.");
      expect(page, name).not.toContain("kind");
      expect(page, name).not.toContain("TRADE_BINDER");
      expect(page, name).not.toContain("Trade binder");
    }
    expect(web.settings).toContain("deleteBinderAction(binderId)");
    expect(web.settings).toContain("Delete {name}?");
    expect(web.settings).toContain('router.push("/profile?tab=binders")');
    expect(web.settings).toContain("onBlur={commitName}");
    expect(app.binder).toContain("deleteBinder(");
    expect(app.binder).toContain("onBlur");
  });

  it("sends every write to the binder's id, which is always given", () => {
    expect(web.view).toContain("removeBinderCardAction(card.entryId, binder.id)");
    expect(web.settings).toContain("saveBinderSettingsAction(patch, binderId)");
    expect(web.add).toContain("binderId,");
    expect(web.ownBinder).toContain("readBinder(playerId, playerId, binderId)");
    expect(web.playerBinder).toContain("readBinder(playerId, me, binderId)");
    for (const source of [web.ownBinder, web.playerBinder, webPage]) {
      expect(source).not.toContain("binder.kind");
      expect(source).not.toContain("TRADE_BINDER_ID");
      expect(source).not.toContain("subtitle");
    }
    expect(app.binder).not.toContain("TRADE_BINDER_ID");
    expect(app.binder).not.toContain("binderId ??");
  });

  it("removes a card and nothing else, with no front control", () => {
    /* Round 3 took the Edit mode: a card is removed by dropping it on
       the Remove zone (binder3-parity.test.ts). The front control
       round 2 took stays gone. */
    expect(web.view).toContain('aria-label="Remove from binder"');
    expect(web.view).not.toContain("aria-pressed={settings.frontEntryId");
    expect(app.binder).not.toContain("the front card");
  });
});

describe("the website's Add cards sheet", () => {
  it("gives the search a tall body so the game menu opens inside it whole", () => {
    /* The container, not the search: CardSearch is reused as it is. */
    expect(web.add).toContain("min-h-[70dvh]");
    expect(web.add).toContain("<CardSearch");
    expect(web.add).not.toContain("overflow-hidden");
    expect(read("src/components/cards/card-search.tsx")).toContain(
      "absolute top-full left-0 z-20",
    );
  });
});

describe("the app's grid and hold to move", () => {
  it("measures the page with onLayout and gives every pocket a third of it", () => {
    /* The maths moved into pockets.tsx with the hunts-as-binders round,
       and the binder screen reads it from there. */
    const grid = app.binder + app.pockets;
    expect(app.binder).toContain("onLayout");
    expect(app.binder).toContain('from "../pockets"');
    expect(grid).toContain("PAGE_PAD");
    expect(grid).toContain("POCKET_GAP");
    expect(grid).toMatch(
      /Math\.floor\(\s*\(\s*\w+\s*-\s*2 \* PAGE_PAD\s*-\s*2 \* POCKET_GAP\s*\)\s*\/\s*3\s*\)/,
    );
    expect(app.binder).not.toContain("useWindowDimensions");
    expect(app.binder).not.toContain('Dimensions.get("window")');
    expect(grid).toContain('overflow: "hidden"');
  });

  it("lifts only the held card, and never turns a page while holding", () => {
    expect(app.binder).toContain("onLongPress");
    expect(app.binder).toContain("reorderBinder(");
    expect(app.binder).not.toContain("watchEdge");
    expect(app.binder).not.toContain("turnHeld");
    expect(app.binder).not.toContain("EDGE_HOLD_MS");
    expect(app.binder).toMatch(/LayoutAnimation|Layout\.duration|withTiming/);
  });
});

describe("the profiles hand the row and the list the new shape", () => {
  it("passes no owner name to the list and no kind to anything", () => {
    for (const [name, source] of platforms) {
      for (const profile of [source.ownProfile, source.playerProfile]) {
        expect(profile, name).toContain("<BinderHighlights");
        expect(profile, name).toContain("<BinderList");
        expect(profile, name).not.toContain('kind === "trade"');
        expect(profile, name).not.toContain("TRADE_BINDER");
      }
    }
    expect(web.ownProfile).toContain(
      '<BinderList binders={profile.binders} yours base="/profile" />',
    );
    expect(web.playerProfile).not.toMatch(/<BinderList[^>]*ownerName/);
    expect(app.api).toContain("forTrade: boolean;");
    expect(app.api).not.toContain("TRADE_BINDER_ID");
  });
});

describe("copy and colour rules", () => {
  it("has no em dashes and no literal hex in anything this round touched", () => {
    for (const [name, source] of [
      ["web cover", web.cover],
      ["web highlights", web.highlights],
      ["web list", web.list],
      ["web create", web.create],
      ["web for trade switch", web.forTrade],
      ["web view", web.view],
      ["web settings", web.settings],
      ["web add", web.add],
      ["web own binder", web.ownBinder],
      ["web player binder", web.playerBinder],
      ["app cover", app.cover],
      ["app highlights", app.highlights],
      ["app list", app.list],
      ["app create", app.create],
      ["app binder", app.binder],
      ["app binders", app.binders],
    ] as const) {
      expect(source, name).not.toContain("—");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
