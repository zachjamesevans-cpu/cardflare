import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as app from "../../mobile/src/offer-copy";
import {
  hidePost,
  isPostHidden,
  resetHiddenPosts,
  unhidePost,
} from "@/components/feed/hidden-posts";
import { cardCountLabel } from "@/lib/feed/card-copy";
import * as web from "@/lib/feed/offer-copy";

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
 * What the code SAYS, with what it explains stripped out: the
 * founder's quotes in a comment may still name a retired button.
 */
const spoken = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Round 16, both platforms: the offer flow.
 *
 * The second audit (2026-10-02), verbatim where it matters: "Viewer
 * offers always send 1 copy... no stepper." "Closing the viewer
 * silently drops every picked card." "Keyboard: every card is its own
 * tab stop." "Take down shows 'Taken down.' before the post leaves
 * the list." "Two wordings for one action." "Full list is hidden."
 * "Review screen: no way to remove a card there." "The panel also
 * jumps about 25px when the review button appears." "Ticking a card
 * expands a stepper and pushes the rows down." And the founder's
 * rule: "Wants 2" until something is found.
 *
 * The copy helpers are run on both platforms; the surfaces are read
 * off the source, because parity is the same words in the same
 * places on the website and in the app.
 */

const WEB = {
  copy: read("src/lib/feed/offer-copy.ts"),
  cardCopy: read("src/lib/feed/card-copy.ts"),
  zoom: read("src/components/cards/card-image-zoom.tsx"),
  feedCard: read("src/components/feed/flare-feed-card.tsx"),
  carousel: read("src/components/feed/flare-carousel.tsx"),
  sheet: read("src/components/feed/flare-cards-sheet.tsx"),
  review: read("src/components/flares/offer-review.tsx"),
  /* The hunt page, drawn like a binder since the hunts-as-binders
     round: the view and the machinery under it. */
  hunt:
    read("src/components/players/hunt-binder.tsx") +
    read("src/components/players/hunt-detail.tsx"),
  progress: read("src/components/feed/flare-progress-sheet.tsx"),
  actions: read("src/components/feed/post-actions.tsx"),
  toast: read("src/components/feed/undo-toast.tsx"),
  hidden: read("src/components/feed/hidden-posts.ts"),
  button: read("src/components/ui/button.tsx"),
};

const APP = {
  copy: read("mobile/src/offer-copy.ts"),
  zoom: read("mobile/src/ui.tsx"),
  card: read("mobile/src/flare-feed-card.tsx"),
  pager: read("mobile/src/flare-deck-pager.tsx"),
  sheet: read("mobile/src/flare-cards-sheet.tsx"),
  review: read("mobile/src/offer-review-sheet.tsx"),
  hunt: read("mobile/src/hunt-binder.tsx") + read("mobile/src/hunts-panel.tsx"),
  progress: read("mobile/src/flare-progress-sheet.tsx"),
  home: read("mobile/src/screens/home.tsx"),
};

/* The viewer's offer block alone, on each platform. */
const webHave = between(WEB.zoom, "function ZoomHaveBlock(", "const OPEN_MS");
const appHave = between(
  APP.zoom,
  "function ZoomHaveForm(",
  "export function CardImage(",
);

/** Every .ts/.tsx under a root, as source. */
const sources = (root: string): [string, string][] => {
  const dir = resolve(import.meta.dirname, "../..", root);
  const walk = (at: string): string[] =>
    readdirSync(at, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? walk(join(at, entry.name)) : [join(at, entry.name)],
    );
  return walk(dir)
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => [file.slice(dir.length + 1), readFileSync(file, "utf8")]);
};

describe("the five copy helpers say the same thing on both platforms", () => {
  it("exist on both, with the same bodies", () => {
    for (const name of [
      "reviewLabel",
      "inYourOfferLine",
      "seeAllLabel",
      "selectionSummary",
      "wantsLine",
    ]) {
      const body = (source: string) => {
        const from = source.indexOf(`export function ${name}(`);
        return from === -1 ? "" : source.slice(from, source.indexOf("\n}\n", from));
      };
      expect(body(WEB.copy).length, name).toBeGreaterThan(0);
      expect(body(APP.copy), name).toBe(body(WEB.copy));
    }
  });

  it("give the exact strings", () => {
    for (const copy of [web, app]) {
      expect(copy.reviewLabel(1)).toBe("Review offer · 1 card");
      expect(copy.reviewLabel(3)).toBe("Review offer · 3 cards");
      expect(copy.inYourOfferLine(1)).toBe("1 in your offer");
      expect(copy.inYourOfferLine(3)).toBe("3 in your offer");
      expect(copy.seeAllLabel(4)).toBe("See all 4 cards");
      expect(copy.seeAllLabel(17)).toBe("See all 17 cards");
      expect(copy.selectionSummary(1, 1)).toBe("1 card · 1 copy");
      expect(copy.selectionSummary(2, 3)).toBe("2 cards · 3 copies");
      expect(copy.wantsLine(2, 2)).toBe("Wants 2");
      expect(copy.wantsLine(2, 1)).toBe("Need 1 more");
      expect(copy.wantsLine(2, 0)).toBe("Found");
    }
    /* The middle dot is U+00B7, never a hyphen or a bullet. */
    expect(web.reviewLabel(1)).toContain("·");
    expect(web.selectionSummary(1, 1)).toContain("·");
  });

  it("give the same answers across the board", () => {
    for (const n of [0, 1, 2, 3, 7, 17]) {
      expect(app.reviewLabel(n)).toBe(web.reviewLabel(n));
      expect(app.inYourOfferLine(n)).toBe(web.inYourOfferLine(n));
      expect(app.seeAllLabel(n)).toBe(web.seeAllLabel(n));
      for (const m of [0, 1, 2, 5]) {
        expect(app.selectionSummary(n, m)).toBe(web.selectionSummary(n, m));
        expect(app.wantsLine(n, m)).toBe(web.wantsLine(n, m));
      }
    }
  });

  it("have let the old button go, on both", () => {
    for (const copy of [WEB.copy, APP.copy]) {
      expect(copy).not.toContain("offerButtonLabel");
      expect(spoken(copy)).not.toContain("Offer this card");
      expect(copy).not.toContain("`Offer ${count} cards`");
    }
    /* The website's summary lives in the plain module now, so the
       server-rendered card and the client sheets read one function. */
    expect(WEB.review).not.toContain("export function selectionSummary");
    expect(WEB.review).toContain(
      'import { selectionSummary } from "@/lib/feed/offer-copy"',
    );
  });
});

describe("one set of words wherever a card can be offered", () => {
  const TOGGLE = ["I have this card", "Added to your offer"];
  const GONE = ["Offer this card", "Continue to offer", "Offer ${count} cards"];

  it("the viewer, the full list and the hunt page say the toggle the same way", () => {
    for (const [name, source] of [
      ["web zoom", webHave],
      ["web sheet", WEB.sheet],
      ["app zoom", appHave],
      ["app sheet", APP.sheet],
    ] as const) {
      expect(source.length, `${name}: read`).toBeGreaterThan(0);
      for (const word of TOGGLE) expect(source, name).toContain(word);
      for (const word of GONE) expect(spoken(source), name).not.toContain(word);
      /* The way on is the review's label, by count. */
      expect(source, name).toContain("reviewLabel(");
    }
    /* The hunt page, a binder since the hunts-as-binders round, opens
       a pocket in the viewer and hands it the offer block, so the
       toggle there is the viewer's own; the way on under the pages is
       still the review's label. */
    for (const [name, source] of [
      ["web hunt", WEB.hunt],
      ["app hunt", APP.hunt],
    ] as const) {
      expect(source.length, `${name}: read`).toBeGreaterThan(0);
      for (const word of GONE) expect(spoken(source), name).not.toContain(word);
      expect(source, name).toContain("reviewLabel(");
      expect(source, name).toContain('state: "open"');
    }
    /* The check is an icon before the words, never a typed character. */
    for (const source of [webHave, WEB.sheet]) {
      expect(source).toContain("<Check ");
      expect(source.indexOf("<Check ")).toBeLessThan(
        source.indexOf("Added to your offer"),
      );
      expect(source).not.toContain("✓");
    }
  });

  it("nothing on either platform still says the retired words", () => {
    const offenders: string[] = [];
    for (const [root, prefix] of [
      ["src", "src"],
      ["mobile/src", "mobile/src"],
    ] as const) {
      for (const [file, source] of sources(root)) {
        const said = spoken(source);
        for (const word of [
          "Offer this card",
          "Continue to offer",
          "offerButtonLabel",
        ]) {
          if (said.includes(word)) offenders.push(`${prefix}/${file}: ${word}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the picks live on the post, not in the viewer", () => {
  it("the website's post owns them as quantities and hands them to every tile", () => {
    /* The Feed card is server-rendered; the picks are a client wrapper
       around it, reaching the viewer through a context. */
    expect(WEB.feedCard).toContain("<PostOffer post={shape}>{article}</PostOffer>");
    expect(WEB.actions).toContain("export function PostOffer(");
    expect(WEB.actions).toContain("const build = useOfferBuild(post.postId, cards);");
    expect(WEB.actions).toContain("<OfferPicksContext.Provider value={build}>");
    expect(WEB.zoom).toContain("picks: Readonly<Record<string, number>>;");
    expect(WEB.zoom).toContain("const shared = useContext(OfferPicksContext);");
    expect(WEB.zoom).toContain("const offers = shared ?? local;");
    /* In at one copy; the review is where the number is raised. */
    expect(WEB.zoom).toContain("return { ...current, [flareId]: 1 };");
    /* Closing the viewer keeps them. */
    expect(WEB.zoom).not.toContain("resetOffers");
    expect(
      between(WEB.zoom, "const onClose = () => {", "element.addEventListener"),
    ).not.toMatch(/setPicks|clear\(\)/);
    /* Nothing is stored: the page's life is the rule. */
    for (const source of [WEB.zoom, WEB.actions, WEB.feedCard]) {
      expect(source).not.toMatch(/localStorage|sessionStorage/);
    }
  });

  it("the app's Feed owns them per post and hands each card its own", () => {
    /* One pick store: the Feed screen keeps a post's picks and hands
       them to its card and to the cards sheet, so the two cannot
       disagree. Pinned in full by search-parity.test.ts. */
    expect(APP.home).toMatch(/useState<Record<string, ZoomPicks>>/);
    expect(APP.card).toContain("picks: ZoomPicks;");
    expect(APP.card).not.toContain("useState<ZoomPicks>({})");
    expect(APP.zoom).toContain("ZoomPicks = Record<string, number>");
    expect(APP.card).not.toContain("AsyncStorage");
  });

  it("says N in your offer with a Review door while the viewer is closed", () => {
    expect(WEB.feedCard).toContain("{!preview && <InYourOffer />}");
    expect(WEB.actions).toContain("{inYourOfferLine(build.count)}");
    expect(WEB.actions).toMatch(/>\s*Review\s*<\/button>/);
    expect(WEB.actions).toContain("onClick={build.openReview}");
    expect(WEB.actions).toContain("if (!build || build.count === 0) return null;");
    expect(APP.card).toContain("inYourOfferLine(");
    expect(APP.card).toMatch(/>\s*Review\s*<\/Text>/);
  });
});

describe("the review has a stepper and a Remove on every line", () => {
  it("steps each line, capped at what the line allows, on the website", () => {
    expect(WEB.review).toContain('import { Stepper } from "@/components/ui/stepper"');
    expect(WEB.review).toContain("max: number;");
    expect(WEB.review).toContain("max={line.max}");
    expect(WEB.review).toContain("onChange={(value) => onQuantity(line.key, value)}");
    /* The cap is the card's remaining, or its quantity, on every door. */
    expect(WEB.actions).toContain("max: card.remaining ?? card.quantity ?? 1,");
    expect(WEB.zoom).toContain("max: card.stillNeeds ?? card.lookingFor ?? 1,");
    expect(WEB.sheet).toContain("max: remainingFor(flareId),");
    expect(WEB.hunt).toContain("max: card.remaining,");
    /* No more "1 copy" as plain text. */
    expect(WEB.review).not.toContain(
      '{line.quantity} {line.quantity === 1 ? "copy" : "copies"}',
    );
  });

  it("removes a line by name and closes on the last one, on both", () => {
    expect(WEB.review).toContain("aria-label={`Remove ${line.name}`}");
    expect(WEB.review).toMatch(/>\s*Remove\s*<\/Button>/);
    expect(WEB.review).toContain("if (lines.length === 1) close();");
    expect(APP.review).toContain("Remove ${line.name}");
    expect(APP.review).toMatch(/>\s*Remove\s*<\/Text>/);
  });

  it("sums up as N cards · M copies, on both", () => {
    expect(WEB.review).toContain("{selectionSummary(lines.length, copies)}");
    expect(APP.review).toContain("selectionSummary(lines.length, copies)");
    expect(WEB.sheet).toContain("selectionSummary(selection.count, selection.copies)");
    expect(WEB.hunt).toContain("{selectionSummary(cards, copies)}");
    expect(APP.hunt).toContain("selectionSummary(cards, copies)");
  });
});

describe("the next step stands out, and its room is kept", () => {
  it("the website's tray is the accent, with a blank of the same height before it", () => {
    const tray = between(webHave, "{count > 0 ? (", "</div>");
    expect(tray).toContain('variant="primary"');
    expect(tray).toContain("{reviewLabel(count)}");
    /* The placeholder is the button's own height: md is h-11. */
    expect(tray).toContain('<span aria-hidden="true" className="block h-11" />');
    expect(WEB.button).toMatch(/md: "h-11/);
    /* "Added to your offer" stays secondary. */
    expect(webHave).toContain('variant={added ? "secondary" : "primary"}');
  });

  it("the website's full list draws its review button disabled until a pick", () => {
    expect(WEB.sheet).toContain("disabled={selection.count === 0}");
    expect(WEB.sheet).toContain("reviewLabel(selection.count)");
    expect(WEB.sheet).not.toContain('variant="secondary"\n                size="sm"');
  });

  it("the app's tray is the accent, drawn from the start", () => {
    expect(appHave).toContain("disabled={count === 0}");
    expect(appHave).not.toMatch(/\{count > 0 \? \(\s*<Button label=\{tray\}/);
  });
});

describe("every row of the full list reserves its stepper's space", () => {
  it("draws the stepper disabled until the row is added, on the website", () => {
    expect(WEB.sheet).toContain("disabled={!picked}");
    expect(WEB.sheet).toContain("value={picked ? selection.quantity(flareId) : 1}");
    expect(WEB.sheet).not.toMatch(/\{picked && \(\s*<Stepper/);
    /* The hunt page has no rows since the hunts-as-binders round: a
       visitor's pick is the viewer's toggle, one copy, and the number
       is raised on the review's stepper. */
    expect(WEB.hunt).toContain("onQuantity={offer.selection.setQuantity}");
    expect(WEB.hunt).toContain("<OfferReview");
  });

  it("and in the app", () => {
    expect(APP.sheet).not.toMatch(/\{count > 0 \? \(\s*<Stepper/);
    expect(APP.sheet).toContain("disabled={count === 0}");
  });
});

describe("the full list is one tap from the carousel", () => {
  it("draws See all N cards on the dots row, opening the same sheet, on both", () => {
    expect(WEB.carousel).toContain("{seeAllLabel(cards.length)}");
    expect(WEB.carousel).toContain("{post && cards.length > 1 && (");
    expect(WEB.carousel).toContain("<FlareCardsSheet");
    expect(WEB.carousel).toContain("justify-between");
    expect(WEB.feedCard).toContain("post={preview ? null : shape}");
    /* The menu entry stays. */
    expect(WEB.actions).toContain("label: `View all ${post.total} cards`,");
    expect(APP.pager).toContain("seeAllLabel(cards.length)");
    expect(APP.card).toContain("View all ${total} cards");
  });
});

describe("one tab stop per carousel, after any re-render", () => {
  it("runs the pass on every render and watches the rail for replaced tiles", () => {
    /* Reproduced in Chromium: the rule held on first paint and broke
       when a re-render replaced the tiles, because an effect keyed on
       `at` and the count never ran again. */
    expect(WEB.carousel).not.toContain("}, [at, cards.length]);");
    expect(WEB.carousel).toContain("useEffect(setTabStops);");
    expect(WEB.carousel).toContain("new MutationObserver(setTabStops)");
    expect(WEB.carousel).toContain(
      "observer.observe(rail, { childList: true, subtree: true });",
    );
    expect(WEB.carousel).toContain("return () => observer.disconnect();");
    expect(WEB.carousel).toContain(
      "stop.tabIndex = index === current.current ? 0 : -1;",
    );
    /* The rail is the stop, as before. */
    expect(WEB.carousel).toContain("tabIndex={0}");
    expect(WEB.carousel).toContain('aria-roledescription="carousel"');
  });

  it("the open viewer's arrows do not page the rail beneath it", () => {
    const keys = between(WEB.zoom, "onKeyDown={(event) => {", "onTouchStart=");
    expect(keys).toContain("event.stopPropagation();");
  });
});

describe("take down leaves the list at once", () => {
  it("the website hides the post by id on the server's ok, and Undo unhides", () => {
    expect(WEB.actions).toContain(
      "takeDown(() => takeDownPostAction(post.postId), post.postId)",
    );
    const flow = between(
      WEB.toast,
      "const takeDown = (run",
      "return { takeDown, pending };",
    );
    expect(flow).toContain("if (postId) hidePost(postId);");
    expect(flow.indexOf("if (!result.ok)")).toBeLessThan(flow.indexOf("hidePost("));
    expect(flow.indexOf("hidePost(")).toBeLessThan(flow.indexOf("router.refresh()"));
    const undo = between(WEB.toast, "const undo = () => {", "return (");
    expect(undo).toContain("if (state.postId) unhidePost(state.postId);");
    expect(undo.indexOf("unhidePost(")).toBeLessThan(undo.indexOf("router.refresh()"));
    /* The Feed card reads the store. */
    expect(WEB.feedCard).toContain(
      "<UnlessHidden postId={item.postId} playerId={shape.playerId}>",
    );
    expect(WEB.actions).toContain("const hidden = usePostHidden(postId);");
  });

  it("the store hides, unhides and resets", () => {
    resetHiddenPosts();
    expect(isPostHidden("p1")).toBe(false);
    hidePost("p1");
    expect(isPostHidden("p1")).toBe(true);
    expect(isPostHidden("p2")).toBe(false);
    hidePost("p1");
    unhidePost("p1");
    expect(isPostHidden("p1")).toBe(false);
    hidePost("p2");
    resetHiddenPosts();
    expect(isPostHidden("p2")).toBe(false);
    /* The page's life, nothing more. */
    expect(WEB.hidden).not.toMatch(/localStorage|sessionStorage/);
  });

  it("the app does the same in its Feed screen's state", () => {
    expect(APP.home).toContain("setHidden(");
    expect(APP.home).toContain("hidden.has(item.postId)");
  });
});

describe("Wants N until something is found", () => {
  it("cardCountLabel goes through wantsLine", () => {
    const card = (quantity: number, remaining: number, state?: "open" | "found") => ({
      cardId: "c",
      cardName: "Nami",
      cardNumber: "OP01-016",
      imageUrl: null,
      match: null,
      quantity,
      remaining,
      state,
    });
    expect(cardCountLabel(card(2, 2), "want")).toBe("Wants 2");
    expect(cardCountLabel(card(1, 1), "want")).toBe("Wants 1");
    expect(cardCountLabel(card(2, 1), "want")).toBe("Need 1 more");
    expect(cardCountLabel(card(2, 0), "want")).toBe("Found");
    expect(cardCountLabel(card(2, 2, "found"), "want")).toBe("Found");
    expect(cardCountLabel(card(2, 2), "showcase")).toBe("2 available");
    expect(WEB.cardCopy).toContain("return wantsLine(quantity, remaining);");
  });

  it("every place that printed Need N more goes through it, on both", () => {
    expect(WEB.progress).toContain("{wantsLine(row.needed, row.remaining)}");
    expect(WEB.hunt).toContain("wantsLine(card.needed, card.remaining)");
    for (const source of [APP.pager, APP.sheet, APP.hunt, APP.progress]) {
      expect(source).toContain("wantsLine(");
    }
    const offenders: string[] = [];
    for (const [root, prefix] of [
      ["src", "src"],
      ["mobile/src", "mobile/src"],
    ] as const) {
      for (const [file, source] of sources(root)) {
        if (file.endsWith("offer-copy.ts")) continue;
        if (/Need \$\{|`Need \d|"Need \d/.test(spoken(source))) {
          offenders.push(`${prefix}/${file}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
