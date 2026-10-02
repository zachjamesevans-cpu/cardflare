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
 * Round 12, both platforms: "Offer" is the verb wherever a hand goes
 * up on a post, one send covers several cards, and a refusal is said
 * in words.
 *
 * The founder, from a phone, on the card zoom: "'I have this' just
 * doesn't feel like it's the right verbiage", and "if someone has
 * multiple of someone else's flares, they have to send multiple
 * different notifications... Ideally it would say 'CHUNC has 4 of the
 * cards you're looking for' as one message." And the tap that took
 * five seconds and then "stopped going through with no word why".
 *
 * Read off the source, because parity is the same words, the same
 * states and the same order on the website and in the app.
 */

const web = {
  copy: read("src/lib/feed/offer-copy.ts"),
  zoom: read("src/components/cards/card-image-zoom.tsx"),
  sheet: read("src/components/feed/flare-cards-sheet.tsx"),
  hunt: read("src/components/players/hunt-detail.tsx"),
  thread: read("src/components/feed/post-social.tsx"),
  carousel: read("src/components/feed/flare-carousel.tsx"),
  feedCard: read("src/components/feed/flare-feed-card.tsx"),
};

const app = {
  copy: read("mobile/src/offer-copy.ts"),
  zoom: read("mobile/src/ui.tsx"),
  sheet: read("mobile/src/flare-cards-sheet.tsx"),
  /* Round 13 moved the send out of the zoom into the one review sheet. */
  review: read("mobile/src/offer-review-sheet.tsx"),
  hunt: read("mobile/src/hunts-panel.tsx"),
  thread: read("mobile/src/screens/flare-post.tsx"),
  pager: read("mobile/src/flare-deck-pager.tsx"),
  /* The app's zoom sends through a callback; these screens wire it. */
  home: read("mobile/src/screens/home.tsx"),
};

describe("the offer's sentences are one set on both platforms", () => {
  const SENTENCES = [
    "That card was answered already.",
    "That one is yours.",
    "You have offers on the most cards this room allows.",
    "That is a lot of offers. Give it a minute.",
    "Could not send the offer. Try again.",
    "Offer this card",
  ];

  it("has the same functions with the same words", () => {
    for (const copy of [web.copy, app.copy]) {
      expect(copy).toContain("export function offerFailureMessage(");
      expect(copy).toContain("export function offeredLine(");
      expect(copy).toContain("export function listOf(");
      expect(copy).toContain("export function offerButtonLabel(");
      for (const sentence of SENTENCES) expect(copy).toContain(sentence);
      expect(copy).toContain("`Offer ${count} cards`");
      expect(copy).toContain("`Offered ${listOf(names)}.`");
    }
  });
});

describe("the verb is Offer wherever a hand goes up on a post", () => {
  it("says the strip in the same words on both zooms", () => {
    /* Round 13 took the send out of the zoom (the viewer builds an
       offer; the review sends it), so the button by count and
       "Offering…" live on the review now. The strip is the zoom's. */
    for (const zoom of [web.zoom, app.zoom]) {
      expect(zoom).toContain("You offered this.");
      expect(zoom).toContain("They can see your name, so keep an eye out.");
      expect(zoom).toContain("Somebody already offered. You can too.");
      expect(zoom).not.toContain("in their room");
    }
  });

  it("says Offer this card on the full list and the hunt", () => {
    expect(web.sheet).toContain("Offer this card");
    expect(web.hunt).toContain("Offer this card");
    expect(app.sheet).toContain("`Offer ${card.cardName}`");
    expect(app.hunt).toContain("`Offer ${card.cardName}`");
    expect(app.hunt).toContain("Offer this card");
    /* The buttons that follow the ticks keep their names. */
    expect(web.sheet).toContain("Continue to offer");
    expect(app.sheet).toMatch(/Send offer|Continue to offer/);
  });

  it("says You offered this once the hand is up", () => {
    /* The app's feed card draws its cards through the pager, which
       carries the line; the website's single-card face carries its own. */
    for (const source of [
      web.sheet,
      web.carousel,
      web.feedCard,
      app.sheet,
      app.pager,
    ]) {
      expect(source).toContain("You offered this");
    }
  });

  it("names the card the thread's chip was offered on", () => {
    for (const thread of [web.thread, app.thread]) {
      expect(thread).toContain("`Offered ${");
      expect(thread).not.toContain("`Has ${");
    }
  });

  it("has no I have this left on either platform", () => {
    for (const source of [
      web.zoom,
      web.sheet,
      web.hunt,
      web.thread,
      app.zoom,
      app.sheet,
      app.hunt,
      app.thread,
    ]) {
      /* Round 13's toggle is "I have this card", the one deliberate
         exception: it adds to an offer and sends nothing. */
      expect(source).not.toMatch(/I have this(?! card)/);
      expect(source).not.toContain("I have ${");
      expect(source).not.toContain("You said you have this");
    }
  });
});

describe("one send, one notice, through the door that answers", () => {
  it("sends from the zoom through offer-items, never the silent form action", () => {
    expect(web.zoom).toContain("offerItemsAction(");
    expect(web.zoom).not.toContain("offerFromFeedAction");
    expect(web.zoom).toContain("quantity: 1");
    /* Lands on the shelf's bar, under the picture, as round 9 put it. */
    expect(web.zoom.indexOf("<ZoomHaveBlock")).toBeGreaterThan(
      web.zoom.indexOf("aspect-[60/84]"),
    );

    /* The app's zoom builds the lines and hands them to the review,
       which the screen wires to offer-items, so one send is one notice
       there too. The refusal is read through offer-copy wherever the
       send lives now. */
    expect(app.zoom).toContain("quantity: 1");
    expect(app.zoom + app.review + app.sheet).toContain("offerFailureMessage(");
    expect(app.zoom).not.toMatch(/action: "offer"[^-]/);
    for (const screen of [app.home, app.thread]) {
      expect(screen).toContain("offerItemsOnPost(");
    }
  });

  it("builds one offer across the shelf, keyed by Flare", () => {
    /* Round 13: the picks persist between swipes and go as one send
       from "Review offer · N cards". The zoom never sends on its own. */
    for (const zoom of [web.zoom, app.zoom]) {
      expect(zoom).toContain("Review offer ·");
      expect(zoom).not.toContain("Pick more cards");
      expect(zoom).not.toContain("Pick this card");
    }
    expect(web.zoom).toContain("picks.has(");
  });

  it("says why when the server refuses, and which cards were not taken", () => {
    /* The sentence is the review's now; the strip still names the
       cards the server would not take. */
    const review = read("src/components/flares/offer-review.tsx");
    expect(review).toContain("outcome.message");
    expect(review).toContain("text-danger");
    for (const zoom of [web.zoom, app.zoom]) {
      expect(zoom).toContain("Not taken: ");
    }
  });

  it("keeps the zoom up after a send", () => {
    /* The confirmation strip takes the block's place; nothing closes the dialog. */
    const sendBlock = web.zoom.slice(
      web.zoom.indexOf("const submitOffer = async (message: string) => {"),
      web.zoom.indexOf("A swipe ends in a click"),
    );
    expect(sendBlock.length).toBeGreaterThan(0);
    expect(sendBlock).not.toContain("close()");
    expect(web.zoom).toContain("onSent={() => setPicks(new Set())}");
  });
});
