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
 * /binders/<id>, the Trade binder being "trade".
 */

const web = {
  cover: read("src/components/binder/binder-cover.tsx"),
  list: read("src/components/binder/binder-list.tsx"),
  highlights: read("src/components/binder/binder-highlights.tsx"),
  /* The page is three client pieces; together they are the screen. */
  page:
    read("src/components/binder/binder-page.tsx") +
    read("src/components/binder/binder-settings.tsx") +
    read("src/components/binder/add-binder-card.tsx"),
  view: read("src/components/binder/binder-page.tsx"),
  settings: read("src/components/binder/binder-settings.tsx"),
  ownPage: read("src/app/profile/binders/[binderId]/page.tsx"),
  playerPage: read("src/app/p/[playerId]/binders/[binderId]/page.tsx"),
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
  covers: read("src/lib/binder/covers.ts"),
};

const app = {
  cover: read("mobile/src/binder-cover.tsx"),
  list: read("mobile/src/binder-list.tsx"),
  highlights: read("mobile/src/binder-highlights.tsx"),
  page: read("mobile/src/screens/binder.tsx"),
  ownProfile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  covers: read("mobile/src/binder-covers.ts"),
};

describe("the binder page", () => {
  it("has the owner's tools and the visitor's words on both platforms", () => {
    for (const [name, page] of [
      ["web", web.page],
      ["app", app.page],
    ] as const) {
      expect(page.length, `${name}: the page exists`).toBeGreaterThan(0);
      for (const word of [
        "Add cards",
        "Edit",
        "Private",
        "2 × 2",
        "3 × 3",
        "ON YOUR HUNT",
        "Cards you would trade. Add the ones you carry.",
        "Nothing to trade yet.",
        "Anyone on cardflare can open it",
        "Only you can open it",
        "On your hunts",
        "Front",
      ]) {
        expect(page, `${name}: ${word}`).toContain(word);
      }
    }
  });

  it("has a Private switch that is on for private, on both platforms", () => {
    /* The founder: "should be a toggle for 'private' if anything. so
       if the toggle is on, it is a private binder." The server still
       stores isPublic, so the switch writes its opposite. */
    for (const [name, page] of [
      ["web", web.page],
      ["app", app.page],
    ] as const) {
      expect(page, name).toContain("isPublic: !");
      expect(page, name).not.toContain("isPublic: event.target.checked");
      expect(page, name).not.toContain("isPublic: next");
    }
    expect(web.settings).toContain("checked={!isPublic}");
  });

  it("moves a held pocket, shifting the others, on both platforms", () => {
    /* The web drags, the composer's way; the app long-presses, the
       card tray's way. Both end in the one reorder call with the whole
       binder's ids. */
    expect(web.view).toContain("draggable={binder.yours && card !== null}");
    expect(web.view).toContain("reorderBinderAction(");
    expect(web.view).toContain("next.splice(from, 1)");
    expect(web.view).toContain("next.splice(slot, 0, moved)");
    expect(web.view).toContain('event.dataTransfer.effectAllowed = "move"');
    expect(web.view).toContain("hold Alt and use the arrow keys");
    /* Both arrows take a drop, to the far end of the page beyond. */
    expect(web.view).toContain('dropAt("prev")');
    expect(web.view).toContain('dropAt("next")');
    expect(app.page).toContain("onLongPress");
    expect(app.page).toContain("reorderBinder(");
  });

  it("gives the owner a + in every empty pocket, and a page of them when full", () => {
    for (const [name, page] of [
      ["web", web.page],
      ["app", app.page],
    ] as const) {
      /* The "+" glyph as its own text node, however the formatter wraps it. */
      expect(page, name).toMatch(/>\s*\+\s*</);
    }
    expect(web.view).toContain('aria-label="Add a card"');
    /* The owner's page count: one more page once the last is full,
       including an empty binder. A visitor never sees the extra page. */
    expect(web.view).toContain("Math.floor(list.length / perPage) + 1");
    expect(web.view).toContain("Math.max(1, Math.ceil(list.length / perPage))");
    /* The pocket opens the same sheet as the button under the page. */
    expect(web.view).toMatch(/<AddPocket\s+onClick=\{\(\) => setAdding\(true\)\}/);
    expect(web.page).toContain("onOpenChange={setAdding}");
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
    expect(web.view).toContain('aria-label="Previous page"');
    expect(web.view).toContain('aria-label="Next page"');
    expect(web.view).toContain("pocketsPerPage(settings.layout)");
    expect(web.view).toContain("cfa-bg-binder-page");
    expect(web.view).toContain("aspect-[63/88]");
  });

  it("saves every setting at once and refreshes behind it", () => {
    for (const action of [
      "saveBinderSettingsAction",
      "addBinderCardAction",
      "removeBinderCardAction",
      "reorderBinderAction",
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
    /* The old addresses still open the Trade binder. */
    expect(read("src/app/profile/binder/page.tsx")).toContain("/profile/binders/");
    expect(read("src/app/p/[playerId]/binder/page.tsx")).toContain("/binders/");
  });
});

describe("one cover drawing per platform", () => {
  it("draws the spine in the cover component and nowhere else", () => {
    const webElsewhere = [
      web.list,
      web.highlights,
      web.page,
      web.ownPage,
      web.playerPage,
      web.ownProfile,
      web.playerProfile,
    ];
    const appElsewhere = [
      app.list,
      app.highlights,
      app.page,
      app.ownProfile,
      app.playerProfile,
    ];
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
       dots, a zipper with a pull, and the front card in a sleeve. */
    for (const [name, cover] of [
      ["web", web.cover],
      ["app", app.cover],
    ] as const) {
      expect(cover.length, `${name}: the cover exists`).toBeGreaterThan(0);
      expect(cover, name).not.toContain('"18%", "49%", "80%"');
      expect(cover, name).not.toContain("ring dots");
      expect(cover, name).toMatch(/zipper/i);
      expect(cover, name).toMatch(/pull/i);
      expect(cover, name).toMatch(/sleeve/i);
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
      /* The card in its sleeve, and the embossed name. */
      "top-[16%] left-1/2 aspect-[63/88] w-1/2 -translate-x-1/2",
      "rounded-[4px] bg-black/60 ring-1 ring-white/25",
      "linear-gradient(135deg,rgb(255_255_255/0.18),transparent_45%)",
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
    /* A swatch is the body alone: no card, no name. */
    expect(web.cover).toContain("{!plain && (");
    expect(web.cover).toContain("{!plain && label && (");
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
