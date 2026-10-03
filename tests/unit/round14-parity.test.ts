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

/** The source between two markers, or "" when either is missing. */
const between = (source: string, start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from === -1 || to === -1 ? "" : source.slice(from, to);
};

/**
 * Round 14, both platforms: offers always allowed, OFFERED at once,
 * the viewer trimmed.
 *
 * The founder, verbatim: "ppl should still be able to make offers or
 * say they have something even if someone already did." "When an
 * offer is made, immediately visually show that I've made an offer on
 * it without having to refresh the feed... ideally, it would
 * immediately visually update, even if it takes a second or two for
 * it to actually update on the server." "Delete the '+ Add another
 * card' button that's always present. It doesn't do anything. Also
 * delete the text that says 'Have this card? Add it to your offer.'
 * It doesn't need to be explained."
 *
 * Read off the source, because parity is the same words, the same
 * states and the same order on the website and in the app.
 */

const web = {
  zoom: read("src/components/cards/card-image-zoom.tsx"),
  carousel: read("src/components/feed/flare-carousel.tsx"),
  sheet: read("src/components/feed/flare-cards-sheet.tsx"),
  review: read("src/components/flares/offer-review.tsx"),
  tile: read("src/components/feed/feed-tile.tsx"),
};

const app = {
  zoom: read("mobile/src/ui.tsx"),
  review: read("mobile/src/offer-review-sheet.tsx"),
  home: read("mobile/src/screens/home.tsx"),
  thread: read("mobile/src/screens/flare-post.tsx"),
};

/* The Feed-offer block alone, as round 13 scoped it. */
/* Round 16 moved the picks into useOfferBuild above the block. */
const webHave = between(web.zoom, "function ZoomHaveBlock(", "const OPEN_MS");
const appHave = between(
  app.zoom,
  "function ZoomHaveForm(",
  "export function CardImage(",
);

const EVENT = "cardflare:offered";

describe("the viewer is trimmed to the toggle and the tray on both platforms", () => {
  it("keeps only the fact, the toggle and the tray, in that order", () => {
    /* The tray's words are built above the block on both platforms; the
       order is where each one is drawn. */
    for (const [name, have, drawsTray] of [
      ["web", webHave, "{reviewLabel(count)}"],
      ["app", appHave, "label={tray}"],
    ] as const) {
      expect(have.length, `${name}: the have block is where it was`).toBeGreaterThan(0);
      expect(have, name).not.toContain("Have this card?");
      expect(have, name).not.toContain("Add it to your offer.");
      expect(have, name).not.toContain("+ Add another card");
      /* Round 16: the tray's words come from reviewLabel in offer-copy. */
      expect(have, name).toContain("reviewLabel(");
      const fact = have.indexOf("Somebody already offered. You can too.");
      const toggle = have.indexOf("I have this card");
      const tray = have.indexOf(drawsTray);
      expect(fact, `${name}: the fact`).toBeGreaterThan(-1);
      expect(toggle, `${name}: the toggle`).toBeGreaterThan(fact);
      expect(tray, `${name}: the tray`).toBeGreaterThan(toggle);
    }
  });

  it("has no next-card plumbing left behind the link", () => {
    expect(webHave).not.toContain("offers.next");
    expect(webHave).not.toContain("offers.more");
    expect(web.zoom).not.toContain("nextToAdd");
    expect(appHave).not.toContain("onNext");
    expect(appHave).not.toContain("goTo");
  });

  it("never gates the toggle on somebody else's offer", () => {
    /* The toggle is drawn whenever the strip is not; "offered" is a
       fact above it, not a reason to hide it. */
    expect(webHave).toContain('have.state === "offered" &&');
    expect(webHave).not.toContain('have.state !== "offered"');
    expect(appHave).not.toContain('state !== "offered"');
  });
});

describe("the website says OFFERED at once, then the refresh confirms it", () => {
  it("dispatches the cards the server took from the zoom, by the one name", () => {
    /* Round 16: the send is useOfferBuild's, in the same file. */
    const sendBlock = between(
      web.zoom,
      "const submit = async (message: string): Promise<OfferOutcome> => {",
      "const closeReview = useCallback",
    );
    expect(sendBlock.length).toBeGreaterThan(0);
    expect(sendBlock).toContain(`new CustomEvent("${EVENT}"`);
    expect(sendBlock).toContain("detail: { postId, flareIds: taken }");
    /* Taken, not refused: the server answers { ok, offered, refused }. */
    expect(sendBlock).toContain("flareIds.filter((flareId) => !refused.has(flareId))");
    expect(sendBlock.indexOf("if (!result.ok) return result;")).toBeLessThan(
      sendBlock.indexOf("window.dispatchEvent("),
    );
    /* The refresh stays, as the confirmation, outside the send. */
    expect(web.zoom).toContain("router.refresh()");
    expect(sendBlock).not.toContain("router.refresh()");
  });

  it("marks the carousel's line and badge from a listener it cleans up", () => {
    expect(web.carousel).toContain(`window.addEventListener("${EVENT}", onOffered)`);
    expect(web.carousel).toContain(
      `return () => window.removeEventListener("${EVENT}", onOffered)`,
    );
    expect(web.carousel).toContain("offered.has(card.flareId)");
    expect(web.carousel).toContain("You offered this");
    /* The badge over the slide is the server tile's badge, in its words
       and its type. */
    const badge = between(web.carousel, "function OfferedOverlay(", "\n}\n");
    expect(badge.length).toBeGreaterThan(0);
    expect(badge).toContain("offered");
    for (const look of [
      "pointer-events-none absolute inset-x-0 bottom-0",
      "text-[9px] font-bold tracking-wider",
      "uppercase",
      "bg-surface/90",
      "text-text-secondary",
    ]) {
      expect(web.tile, `tile: ${look}`).toContain(look);
      expect(badge, `carousel: ${look}`).toContain(look);
    }
    expect(web.carousel).not.toContain("#");
  });

  it("marks youOffered on the full list from the same listener", () => {
    expect(web.sheet).toContain(`window.addEventListener("${EVENT}", onOffered)`);
    expect(web.sheet).toContain(
      `return () => window.removeEventListener("${EVENT}", onOffered)`,
    );
    expect(web.sheet).toContain("{ ...card, youOffered: true }");
    expect(web.sheet).toContain("rows.map((card) => {");
    /* A send from the list itself tells the carousel behind it. */
    expect(web.sheet).toContain(`new CustomEvent("${EVENT}"`);
  });

  it("says a refused card could not be taken, nothing about who got there first", () => {
    expect(web.review).toContain("could not be taken.");
    expect(web.review).toContain("could not be taken, so");
    for (const review of [web.review, app.review]) {
      expect(review).not.toContain("answered while you were writing");
    }
  });
});

describe("the app patches its state before the Feed reloads", () => {
  it("marks each sent card offered on the post ref's result, then reloads behind it", () => {
    for (const [name, screen, setter] of [
      ["home", app.home, "setFeed("],
      ["flare-post", app.thread, "setPost("],
    ] as const) {
      const offerPath = between(
        screen,
        "offer: async (items, message) => {",
        "return result",
      );
      expect(offerPath.length, `${name}: the post ref's offer`).toBeGreaterThan(0);
      expect(offerPath, name).toContain(setter);
      expect(offerPath, name).toContain("youOffered: true");
      expect(offerPath, name).toContain('state: "offered"');
      expect(offerPath, name).toContain("void load(");
      expect(offerPath, name).not.toContain("await load(");
      /* The patch lands first; the reload only repaints later. */
      expect(offerPath.indexOf("youOffered: true"), name).toBeLessThan(
        offerPath.indexOf("void load("),
      );
      expect(offerPath.indexOf('state: "offered"'), name).toBeLessThan(
        offerPath.indexOf("void load("),
      );
    }
  });
});

describe("a one-card post flips at once on the website too", () => {
  it("draws its face through the carousel's SingleFlare, which hears the same event", () => {
    const carousel = readFileSync("src/components/feed/flare-carousel.tsx", "utf8");
    const feedCard = readFileSync("src/components/feed/flare-feed-card.tsx", "utf8");
    expect(carousel).toContain("export function SingleFlare(");
    const single = carousel.slice(carousel.indexOf("export function SingleFlare("));
    expect(single).toContain("useOfferedHere(cards)");
    expect(single).toContain("<OfferedOverlay badge={badge}>{tile}</OfferedOverlay>");
    expect(single).toContain("You offered this");
    expect(feedCard).toContain("<SingleFlare card={lead} tile={tiles[0]}>");
    /* The feed card no longer decides the offered line for one card. */
    expect(feedCard).not.toContain("You offered this");
  });
});
