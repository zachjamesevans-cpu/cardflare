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
 * Round 13, both platforms: the card viewer builds an offer; it does
 * not send one.
 *
 * The founder: "The current screen... makes it feel like pressing
 * 'Offer this card' is immediately submitting an offer. In CardFlare,
 * this action actually means 'I own this card and want to include it
 * in my offer.'" The viewer should "primarily function as a card
 * viewer"; "'I have this card' should feel low-commitment and
 * obvious. The actual commitment should happen later when the user
 * presses 'Send Offer' from the review screen." And: "Do not make
 * this screen feel like a checkout screen."
 *
 * Read off the source, because parity is the same words, the same
 * states and the same order on the website and in the app.
 */

const web = {
  zoom: read("src/components/cards/card-image-zoom.tsx"),
  sheet: read("src/components/feed/flare-cards-sheet.tsx"),
  review: read("src/components/flares/offer-review.tsx"),
};

const app = {
  zoom: read("mobile/src/ui.tsx"),
  sheet: read("mobile/src/flare-cards-sheet.tsx"),
  review: read("mobile/src/offer-review-sheet.tsx"),
  home: read("mobile/src/screens/home.tsx"),
  thread: read("mobile/src/screens/flare-post.tsx"),
};

/*
 * The Feed-offer block alone. The room's offer form lives in the same
 * files and keeps its own note behind "Add a note"; the pins that say
 * "no note here" must not catch it.
 */
/* Round 16 moved the picks into useOfferBuild above the block. */
const webHave = between(web.zoom, "function ZoomHaveBlock(", "const OPEN_MS");
const appHave = between(
  app.zoom,
  "function ZoomHaveForm(",
  "export function CardImage(",
);

/*
 * Round 14 trimmed the viewer on both platforms. The founder: "delete
 * the text that says 'Have this card? Add it to your offer.' It doesn't
 * need to be explained", and "delete the '+ Add another card' button
 * that's always present. It doesn't do anything."
 */
const GONE = ["Have this card?", "Add it to your offer.", "+ Add another card"];
const CTA = ["I have this card", "Added to your offer"];
/* Round 16: the tray's words come from reviewLabel in offer-copy. */
const TRAY = "reviewLabel(";

describe("the viewer builds an offer in the same words on both platforms", () => {
  it("has the toggle and the tray, and no lines or link to explain them", () => {
    expect(webHave.length, "web: the have block is where it was").toBeGreaterThan(0);
    expect(appHave.length, "app: the have form is where it was").toBeGreaterThan(0);
    for (const [name, zoom] of [
      ["web", web.zoom],
      ["app", app.zoom],
    ] as const) {
      for (const line of GONE) expect(zoom, name).not.toContain(line);
      for (const label of CTA) expect(zoom, name).toContain(label);
      expect(zoom, name).toContain(TRAY);
      /* "Somebody already offered. You can too." stays as a fact about
         the card, on the one card somebody else already answered. */
      expect(zoom, name).toContain("Somebody already offered. You can too.");
    }
  });

  it("draws the check as an icon before the words, never a typed character", () => {
    expect(webHave).toContain("<Check ");
    expect(webHave.indexOf("<Check ")).toBeLessThan(
      webHave.indexOf("Added to your offer"),
    );
    expect(webHave).not.toContain("✓");
    expect(appHave).toContain("checkmark");
    expect(appHave).not.toContain("✓");
  });

  it("says the tray with a middle dot and counts cards", async () => {
    for (const zoom of [web.zoom, app.zoom]) expect(zoom).toContain(TRAY);
    const webCopy = await import("@/lib/feed/offer-copy");
    const appCopy = await import("../../mobile/src/offer-copy");
    for (const copy of [webCopy, appCopy]) {
      expect(copy.reviewLabel(1)).toBe("Review offer · 1 card");
      expect(copy.reviewLabel(3)).toBe("Review offer · 3 cards");
    }
  });

  it("keeps the strip for a card that is found, offered or sent", () => {
    for (const have of [webHave, appHave]) {
      /* JSX text wraps where the formatter likes; the sentence is one. */
      expect(have).toMatch(/This one already\s+traded\./);
      expect(have).toContain("You offered this.");
      expect(have).toContain("They will see your name and can message you.");
    }
  });
});

describe("the viewer never sends, never notes, and never spins", () => {
  it("has no note, no pick mode, no send button and no spinner in the have block", () => {
    for (const have of [webHave, appHave]) {
      expect(have).not.toContain("Add a note");
      expect(have).not.toContain("Pick more cards");
      expect(have).not.toContain("Pick this card");
      expect(have).not.toContain("Offer this card");
      expect(have).not.toContain("Offering…");
      expect(have).not.toContain("offerButtonLabel(");
      expect(have).not.toContain("Tap anywhere to close");
    }
    /* The website's block carries no pending state at all. */
    expect(webHave).not.toContain("pending");
    expect(webHave).not.toContain("Loader2");
  });

  it("has no Pick more cards or Tap anywhere to close left in either zoom", () => {
    for (const zoom of [web.zoom, app.zoom]) {
      expect(zoom).not.toContain("Pick more cards");
      expect(zoom).not.toContain("Pick this card");
      expect(zoom).not.toContain("Tap anywhere to close");
      expect(zoom).not.toContain("offerButtonLabel");
    }
  });

  it("closes from an X on both, and still on a tap outside or on the card", () => {
    expect(web.zoom).toContain('aria-label="Close"');
    expect(app.zoom).toContain('accessibilityLabel="Close"');
  });
});

describe("the review is one screen, and the viewer opens it", () => {
  it("opens the website's existing OfferReview from the zoom and the full list", () => {
    expect(web.review).toContain("export function OfferReview(");
    for (const source of [web.zoom, web.sheet]) {
      expect(source).toContain("<OfferReview");
      expect(source).toContain("offerItemsAction(");
    }
    /* The lines come from the picks; the note is the review's own. A
       post draws the review once for all its tiles (round 16); the
       viewer's own is the fallback for a shelf with no post around it. */
    expect(web.zoom).toContain("offers.picks[have.flareId]");
    expect(web.zoom).toContain("onSubmit={local.submit}");
    expect(read("src/components/feed/post-actions.tsx")).toContain(
      "onSubmit={build.submit}",
    );
    expect(web.zoom).not.toContain("POST_COMMENT_MAX");
  });

  it("extracts the app's review into OfferReviewSheet, used from both files", () => {
    expect(app.review).toContain("export function OfferReviewSheet(");
    expect(app.review).toContain("Send offer");
    expect(app.review).toContain("Sending…");
    expect(app.review).toContain("A note, like where you will be (optional)");
    for (const source of [app.zoom, app.sheet]) {
      expect(source).toContain("<OfferReviewSheet");
    }
  });
});

describe("the wait after a send is the server's, not the page rebuild's", () => {
  it("refreshes the website after the transition settles, outside startTransition", () => {
    expect(web.zoom).toContain("router.refresh()");
    expect(web.zoom).not.toContain("startTransition");
    expect(web.zoom).not.toContain("useTransition");
    /* The refresh is an effect on the recorded send, not a step of it. */
    const sendBlock = between(
      web.zoom,
      "const submit = async (message: string): Promise<OfferOutcome> => {",
      "const closeReview = useCallback",
    );
    expect(sendBlock.length).toBeGreaterThan(0);
    expect(sendBlock).not.toContain("router.refresh()");
  });

  it("returns the app's result first and reloads the Feed in the background", () => {
    for (const [name, screen] of [
      ["home", app.home],
      ["flare-post", app.thread],
    ] as const) {
      const offerPath = between(
        screen,
        "offer: async (items, message) => {",
        "return result",
      );
      expect(offerPath.length, `${name}: the post ref's offer`).toBeGreaterThan(0);
      expect(offerPath, name).toContain("void load(");
      expect(offerPath, name).not.toContain("await load(");
    }
  });
});
