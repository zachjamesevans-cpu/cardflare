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
 * Binder rounds 1 and 1b, both platforms: the trade binder, basic,
 * then the founder's four corrections.
 *
 * Round 1: "I'm down for the front being a card. build a basic
 * version of it first with a few simple color change options, no
 * animated stuff yet. just so we can test the grids and stuff along
 * those lines, and where the binder lives."
 *
 * Round 1b, on the renders: a "hold to move" reorder like the Flare
 * composer's; the cover drawn as a zip binder, not a three-ring one;
 * a "+" on every open pocket; and a Private switch, on for private.
 *
 * Read off the source, because parity is the same words, the same
 * controls and the same place on the website and in the app: a page
 * of pockets, and one cover drawing per platform.
 *
 * The profile panel this round built is gone: the profile IA round
 * turned it into the highlights row and the Binders list (pinned in
 * profile-ia-parity.test.ts), and the binder page moved to
 * /binders/<id>. Binder round 2 (binder2-parity.test.ts) took the
 * picture off the cover, the Front control off the page, the 2 x 2
 * off the strip and the Private switch out: every binder is named
 * and has one switch, Up for trade. Binder round 3
 * (binder3-parity.test.ts) took the Add cards and Edit buttons from
 * under the page and moved the settings into a sheet behind a pencil
 * at the top. The pins here are what those rounds left standing.
 */

const web = {
  cover: read("src/components/binder/binder-cover.tsx"),
  list: read("src/components/binder/binder-list.tsx"),
  highlights: read("src/components/binder/binder-highlights.tsx"),
  /* The page is three client pieces; together they are the screen. */
  page:
    read("src/components/binder/binder-page.tsx") +
    read("src/components/binder/pockets.tsx") +
    read("src/components/binder/binder-settings.tsx") +
    read("src/components/binder/add-binder-card.tsx"),
  view: read("src/components/binder/binder-page.tsx"),
  /* The pockets, arrows and dots: shared with the hunt page since the
     hunts-as-binders round, so they are read from their own file. */
  pockets: read("src/components/binder/pockets.tsx"),
  settings: read("src/components/binder/binder-settings.tsx"),
  ownPage: read("src/app/profile/binders/[binderId]/page.tsx"),
  /* The page is a thin door now; its body is PublicBinder, shared with
     the share link /b/<id>. */
  playerPage:
    read("src/app/p/[playerId]/binders/[binderId]/page.tsx") +
    read("src/components/binder/public-binder.tsx"),
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
  covers: read("src/lib/binder/covers.ts"),
};

const app = {
  cover: read("mobile/src/binder-cover.tsx"),
  list: read("mobile/src/binder-list.tsx"),
  highlights: read("mobile/src/binder-highlights.tsx"),
  page: read("mobile/src/screens/binder.tsx") + read("mobile/src/pockets.tsx"),
  ownProfile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  covers: read("mobile/src/binder-covers.ts"),
};

describe("the binder page", () => {
  it("has the owner's switch and the visitor's words on both platforms", () => {
    /* Round 3 took the Add cards and Edit buttons: the "+" pockets
       add and the Remove zone removes, so neither word is pinned. */
    for (const [name, page] of [
      ["web", web.page],
      ["app", app.page],
    ] as const) {
      expect(page.length, `${name}: the page exists`).toBeGreaterThan(0);
      for (const word of [
        "Up for trade",
        "ON YOUR HUNT",
        "Cards you would trade. Add the ones you carry.",
        "Nothing to trade yet.",
        "Only you can open it",
        "On your hunts",
      ]) {
        expect(page, `${name}: ${word}`).toContain(word);
      }
    }
  });

  it("has one switch, Up for trade, that is on for up for trade, on both platforms", () => {
    /* Round 2: the Private switch is gone. The founder: "a toggle to
       enable it as a public / trade binder. Anything that's public is
       up for trade." The switch writes forTrade as it reads: on is on. */
    for (const [name, page] of [
      ["web", web.page],
      ["app", app.page],
    ] as const) {
      expect(page, name).toContain("forTrade");
      expect(page, name).not.toContain("isPublic: !");
      expect(page, name).not.toContain("isPublic:");
    }
    expect(web.settings).toContain("save({ forTrade: on })");
    expect(read("src/components/binder/for-trade-switch.tsx")).toContain(
      "checked={on}",
    );
  });

  it("moves a held pocket, shifting the others, on both platforms", () => {
    /* Round 3: the web holds and moves in one gesture, with pointer
       events, and a drop lands in a pocket by the database's rule
       (binder3-web.test.ts pins the gesture). */
    expect(web.view).toContain("...(binder.yours ? pocketProps(card.entryId) : {})");
    expect(web.view).toContain("placeBinderCardAction(binder.id, { entryId, pocket })");
    expect(web.view).toContain("setCards(placeInPockets(cards, entryId, pocket));");
    expect(web.view).not.toContain("reorderBinderAction");
    expect(web.view).not.toContain("draggable=");
    expect(web.view).toContain("hold Alt and use the arrow keys");
    /* Both arrows turn the page while a card is held over them. */
    expect(web.view).toContain('ring={over === "prev"}');
    expect(web.view).toContain('ring={over === "next"}');
    /* The app: one held-then-dragged pan, the drop by the same rule. */
    expect(app.page).toContain(".activateAfterLongPress(HOLD_MS)");
    expect(app.page).toContain("placeBinderCard(writeId, entryId, pocket)");
    expect(app.page).toContain("placeInPockets(before, entryId, pocket)");
    expect(app.page).not.toContain("reorderBinder");
  });

  it("gives the owner a + in every empty pocket, and a page of them when full", () => {
    for (const [name, page] of [
      ["web", web.page],
      ["app", app.page],
    ] as const) {
      /* The "+" glyph as its own text node, however the formatter wraps it. */
      expect(page, name).toMatch(/>\s*\+\s*</);
    }
    expect(web.pockets).toContain('aria-label="Add a card"');
    /* The owner's page count: one more page once the last is full,
       including an empty binder. A visitor never sees the extra page.
       Round 3: the shared pocket maths decides it. */
    expect(web.view).toContain("const pages = pagesFor(list, binder.yours);");
    expect(web.view).toContain("const pockets = pageOf(drawn, page);");
    /* The pocket opens the Add cards sheet for itself, the one way in. */
    expect(web.view).toMatch(
      /<AddPocket\s+onClick=\{\(\) => setAdding\(\{ pocket: slot \}\)\}/,
    );
    expect(web.page).toContain("open={adding !== null}");
  });

  it("has the message door under a visitor's view", () => {
    expect(web.playerPage).toMatch(/<MessageButton\s+playerId=\{playerId\}/);
    expect(web.playerPage).toContain("label={`Message ${binder.ownerName}`}");
    expect(app.page).toContain("Message ");
  });

  it("opens a card in the one viewer, with nothing to offer on", () => {
    expect(web.view).toContain("<CardImageZoom");
    expect(web.view).not.toContain("offer=");
    expect(web.view).not.toContain("have=");
    expect(web.view).toContain('direction="showcase"');
  });

  it("turns pages with arrows and dots on the web", () => {
    expect(web.pockets).toContain('"Previous page"');
    expect(web.pockets).toContain('"Next page"');
    expect(web.view).toContain("<PageArrow");
    expect(web.view).toContain("<PageDots");
    expect(web.view).toContain('from "@/components/binder/pockets"');
    /* Three by three, the one page a binder has. */
    expect(web.pockets).toContain("export const COLUMNS = 3;");
    expect(web.pockets).toContain("export const POCKETS_PER_PAGE = COLUMNS * COLUMNS;");
    expect(web.view).toContain("grid-cols-3");
    expect(web.view).not.toContain("grid-cols-2");
    expect(web.view).toContain("cfa-bg-binder-page");
    expect(web.pockets).toContain("aspect-[63/88]");
  });

  it("saves every setting at once and refreshes behind it", () => {
    for (const action of [
      "saveBinderSettingsAction",
      "addBinderCardsAction",
      "removeBinderCardAction",
      "placeBinderCardAction",
    ]) {
      expect(web.page).toContain(action);
    }
    expect(web.settings).toContain("router.refresh()");
  });

  it("is reached from /profile/binders/<id> and /p/<id>/binders/<id>", () => {
    expect(web.ownPage).toContain("readBinder(playerId, playerId, binderId)");
    expect(web.ownPage).toContain("title={binder.name}");
    expect(web.playerPage).toContain("readBinder(playerId, me, binderId)");
    expect(web.playerPage).toContain("if (!binder) notFound();");
    /* The old addresses still redirect, and there is no Trade binder
       to send them to: profile-ia-parity pins where they go. */
    expect(read("src/app/profile/binder/page.tsx")).toContain("redirect(");
    expect(read("src/app/profile/binder/page.tsx")).not.toContain("TRADE_BINDER_ID");
    expect(read("src/app/p/[playerId]/binder/page.tsx")).toContain("redirect(");
    expect(read("src/app/p/[playerId]/binder/page.tsx")).not.toContain(
      "TRADE_BINDER_ID",
    );
  });
});

describe("one cover drawing per platform", () => {
  it("draws the spine in the cover component and nowhere else", () => {
    /* The highlights are the one other place that reads the spine
       colour: the binder's initial is drawn in it (round 2). Nothing
       else knows the word. */
    const webElsewhere = [
      web.list,
      web.page,
      web.ownPage,
      web.playerPage,
      web.ownProfile,
      web.playerProfile,
    ];
    const appElsewhere = [app.list, app.page, app.ownProfile, app.playerProfile];
    expect(web.cover).toContain("spine");
    expect(app.cover).toContain("spine");
    for (const source of [...webElsewhere, ...appElsewhere]) {
      expect(source).not.toContain("spine");
    }
    /* Everyone draws through the one component. */
    expect(web.list).toContain("<BinderCover");
    expect(web.settings).toContain("<BinderCover");
    expect(app.list).toContain("<BinderCover");
  });

  it("is a zip binder on both platforms, not a three-ring one", () => {
    /* The founder: "the binder shouldn't be modeled after a 3 ring
       binder. I'm attaching a picture of a VaultX binder, which is the
       most common binder and will be most recognizable." So no ring
       dots, and a zipper with a pull. The front card in a sleeve went
       in round 2: "Delete the ability to have a picture on the binder,
       it's tacky imo." */
    for (const [name, cover] of [
      ["web", web.cover],
      ["app", app.cover],
    ] as const) {
      expect(cover.length, `${name}: the cover exists`).toBeGreaterThan(0);
      expect(cover, name).not.toContain('"18%", "49%", "80%"');
      expect(cover, name).not.toContain("ring dots");
      expect(cover, name).toMatch(/zipper/i);
      expect(cover, name).toMatch(/pull/i);
      expect(cover, name).not.toMatch(/sleeve/i);
      expect(cover, name).not.toContain("frontImageUrl");
    }
  });

  it("keeps the brief's geometry on the web cover", () => {
    for (const measure of [
      "rounded-l-[2px]",
      "h-[300px] w-[232px] rounded-r-[23px]",
      "h-[130px] w-[100px] rounded-r-[10px]",
      "h-[76px] w-[58px] rounded-r-[6px]",
      /* The weave, the spine, the zipper's track and its pull. */
      "repeating-linear-gradient(45deg,rgb(0_0_0/0.06)_0_1px,transparent_1px_3px)",
      "inset-y-0 left-0 w-[5%]",
      "top-[4%] right-[4%] bottom-[4%] left-[5%] border-y-2 border-r-2 border-dashed opacity-70",
      "top-[2%] left-[7%] h-[4%] w-[10%] rounded-[2px] bg-accent",
      /* The embossed name. */
      "right-[8%] bottom-[9%] left-[8%] truncate font-bold",
      'textShadow: "0 1px 0 rgb(255 255 255/0.12)"',
    ]) {
      expect(web.cover, measure).toContain(measure);
    }
    expect(web.cover).toContain("style={{ background: edge }}");
    expect(web.cover).toContain("style={{ background: spine }}");
    expect(web.cover).toContain("style={{ borderColor: spine }}");
    expect(web.cover).not.toContain("#");
    expect(web.cover).not.toContain("uppercase");
    /* A swatch is the body alone: no name. Nothing else is optional,
       because there is nothing else on the cover. */
    expect(web.cover).toContain("{!plain && label && (");
    expect(web.cover).not.toContain("<img");
    expect(web.settings).toContain("plain");
  });

  it("mirrors every cover id and name into the app", () => {
    const ids = [...web.covers.matchAll(/id: "([a-z]+)"/g)].map((match) => match[1]);
    const names = [...web.covers.matchAll(/name: "([A-Za-z ]+)"/g)].map(
      (match) => match[1],
    );
    expect(ids.length).toBe(7);
    expect(names.length).toBe(7);
    for (const id of ids) {
      expect(app.covers, `app cover id ${id}`).toContain(`id: "${id}"`);
    }
    for (const name of names) {
      expect(app.covers, `app cover name ${name}`).toContain(`name: "${name}"`);
    }
  });
});
