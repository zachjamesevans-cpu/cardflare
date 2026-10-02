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
 * Binder round 1, both platforms: the trade binder, basic.
 *
 * The founder: "I'm down for the front being a card. build a basic
 * version of it first with a few simple color change options, no
 * animated stuff yet. just so we can test the grids and stuff along
 * those lines, and where the binder lives."
 *
 * Read off the source, because parity is the same words, the same
 * controls and the same place on the website and in the app: a panel
 * between the hunts and the showcase, a page of pockets, and one cover
 * drawing per platform.
 */

const web = {
  cover: read("src/components/binder/binder-cover.tsx"),
  panel: read("src/components/binder/binder-panel.tsx"),
  /* The page is three client pieces; together they are the screen. */
  page:
    read("src/components/binder/binder-page.tsx") +
    read("src/components/binder/binder-settings.tsx") +
    read("src/components/binder/add-binder-card.tsx"),
  view: read("src/components/binder/binder-page.tsx"),
  settings: read("src/components/binder/binder-settings.tsx"),
  ownPage: read("src/app/profile/binder/page.tsx"),
  playerPage: read("src/app/p/[playerId]/binder/page.tsx"),
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
  covers: read("src/lib/binder/covers.ts"),
};

const app = {
  cover: read("mobile/src/binder-cover.tsx"),
  panel: read("mobile/src/binder-panel.tsx"),
  page: read("mobile/src/screens/binder.tsx"),
  ownProfile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  covers: read("mobile/src/binder-covers.ts"),
};

describe("the binder panel on a profile", () => {
  it("opens the binder, or starts it with Add cards, on both platforms", () => {
    for (const [name, panel] of [
      ["web", web.panel],
      ["app", app.panel],
    ] as const) {
      expect(panel.length, `${name}: the panel exists`).toBeGreaterThan(0);
      expect(panel, name).toContain("Open binder");
      expect(panel, name).toContain("Add cards");
      /* The small cover carries the name alone: "'s binder" truncated. */
      expect(panel, name).toContain('yours ? "Yours" : ownerName');
      expect(panel, name).not.toContain("'s binder");
      expect(panel, name).toContain("Private, only you");
      expect(panel, name).toContain("binderCountLine(");
      expect(panel, name).toContain("binderMatchLine(");
    }
  });

  it("sits between the hunts and the showcase on all four profile pages", () => {
    for (const [name, source, showcase] of [
      ["web own profile", web.ownProfile, "Your showcase"],
      ["web player profile", web.playerProfile, ">Showcase<"],
      ["app own profile", app.ownProfile, "Your showcase"],
      ["app player profile", app.playerProfile, /\bShowcase\b/],
    ] as const) {
      const hunts = source.indexOf("<HuntsPanel");
      const binder = source.indexOf("<BinderPanel");
      const rest = source.slice(hunts);
      const shelf =
        typeof showcase === "string" ? rest.indexOf(showcase) : rest.search(showcase);
      expect(hunts, `${name}: the hunts panel`).toBeGreaterThan(-1);
      expect(binder, `${name}: the binder panel`).toBeGreaterThan(hunts);
      expect(shelf, `${name}: the showcase`).toBeGreaterThan(-1);
      expect(binder - hunts, `${name}: binder before showcase`).toBeLessThan(shelf);
    }
  });

  it("is drawn only when the server hands over a summary", () => {
    for (const page of [web.ownProfile, web.playerProfile]) {
      expect(page).toContain("{profile.binder && (");
    }
    /* The viewer's id goes into the profile read on the public page,
       so the summary respects the Public switch and counts hunts. */
    expect(web.playerProfile).toContain("publicProfile(playerId, me)");
    expect(web.playerProfile).toContain("yours={me === playerId}");
    expect(web.ownProfile).toContain('href="/profile/binder"');
    expect(web.playerProfile).toContain("href={`/p/${playerId}/binder`}");
  });
});

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
        "Public",
        "2 × 2",
        "3 × 3",
        "ON YOUR HUNT",
        "Cards you would trade. Add the ones you carry.",
        "Nothing to trade yet.",
        "Anyone on cardflare can open it",
        "Only you",
        "On your hunts",
        "Front",
      ]) {
        expect(page, `${name}: ${word}`).toContain(word);
      }
    }
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
    ]) {
      expect(web.page).toContain(action);
    }
    expect(web.settings).toContain("router.refresh()");
  });

  it("is reached from /profile/binder and /p/<id>/binder", () => {
    expect(web.ownPage).toContain("readBinder(playerId, playerId)");
    expect(web.ownPage).toContain('title="Your binder"');
    expect(web.playerPage).toContain("readBinder(playerId, me)");
    expect(web.playerPage).toContain("if (!binder) notFound();");
  });
});

describe("one cover drawing per platform", () => {
  it("draws the spine in the cover component and nowhere else", () => {
    const webElsewhere = [
      web.panel,
      web.page,
      web.ownPage,
      web.playerPage,
      web.ownProfile,
      web.playerProfile,
    ];
    const appElsewhere = [app.panel, app.page, app.ownProfile, app.playerProfile];
    expect(web.cover).toContain("spine");
    expect(app.cover).toContain("spine");
    for (const source of [...webElsewhere, ...appElsewhere]) {
      expect(source).not.toContain("spine");
    }
    /* Everyone draws through the one component. */
    expect(web.panel).toContain("<BinderCover");
    expect(web.settings).toContain("<BinderCover");
    expect(app.panel).toContain("<BinderCover");
  });

  it("keeps the brief's geometry on the web cover", () => {
    for (const measure of [
      "rounded-l-[4px] rounded-r-[12px]",
      "w-[9%]",
      '"18%", "49%", "80%"',
      "top-[11%] left-[22%] h-[58%] w-[56%]",
      "bottom-[8%]",
      "h-[300px] w-[232px]",
      "h-[130px] w-[100px]",
      "h-[76px] w-[58px]",
    ]) {
      expect(web.cover, measure).toContain(measure);
    }
    expect(web.cover).toContain("linear-gradient(90deg, ${spine}, ${edge})");
    expect(web.cover).not.toContain("#");
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
