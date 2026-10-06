import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Search, the card page, one pick store and Remove from hunt, on both
 * platforms.
 *
 * The Feed's search finds cards, players and stores in one field; a
 * card result opens the card's page, which says who has it, who is
 * hunting it and which stores have it; a post's cards sheet and its
 * viewer share one set of picks; and the owner's pocket sheet on a
 * hunt can take a card off it. Read off the source, because parity
 * is the same words, the same sections in the same order and the
 * same controls on the website and in the app.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** The source between two markers, so a pin lands in one component. */
function between(source: string, from: string, to: string): string {
  const start = source.indexOf(from);
  expect(start, `missing ${from}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(to, start + from.length);
  expect(end, `missing ${to}`).toBeGreaterThanOrEqual(0);
  return source.slice(start, end);
}

/** Every marker appears, and in this order. */
function inOrder(source: string, markers: string[]) {
  let at = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, at + 1);
    expect(next, `${marker} after position ${at}`).toBeGreaterThan(at);
    at = next;
  }
}

const web = {
  feedPage: read("src/app/feed/page.tsx"),
  searchPage: read("src/app/search/page.tsx"),
  searchPanel: read("src/components/feed/search-panel.tsx"),
  search: read("src/components/feed/everything-search.tsx"),
  playerSearch: read("src/components/players/player-search.tsx"),
  cardRoute: read("src/app/cards/[cardId]/page.tsx"),
  cardPage: read("src/components/cards/card-page.tsx"),
  sheet: read("src/components/feed/flare-cards-sheet.tsx"),
  postActions: read("src/components/feed/post-actions.tsx"),
  binder: read("src/components/players/hunt-binder.tsx"),
  huntActions: read("src/lib/players/hunt-actions.ts"),
};

const app = {
  App: read("mobile/App.tsx"),
  api: read("mobile/src/api.ts"),
  home: read("mobile/src/screens/home.tsx"),
  search: read("mobile/src/screens/search.tsx"),
  card: read("mobile/src/screens/card.tsx"),
  sheet: read("mobile/src/flare-cards-sheet.tsx"),
  feedCard: read("mobile/src/flare-feed-card.tsx"),
  post: read("mobile/src/screens/flare-post.tsx"),
  binder: read("mobile/src/hunt-binder.tsx"),
};

describe("search, from the Feed", () => {
  it("one field, the same placeholder, autofocused, after two characters, on both", () => {
    for (const source of [web.search, app.search]) {
      expect(source).toContain('placeholder="Search cards, players and stores"');
      expect(source).toContain("Nothing for that yet.");
      expect(source).toMatch(/autoFocus/);
      /* Two characters before anything is asked, and a short pause. */
      expect(source).toMatch(/length < (2|MIN_CHARS|SEARCH_MIN_CHARS)/);
      expect(source).toMatch(/MIN_CHARS = 2;/);
      expect(source).toMatch(/= 250;/);
    }
  });

  it("three sections, each only when it has rows, in the pinned order", () => {
    for (const source of [web.search, app.search]) {
      inOrder(source, ['heading="Cards"', 'heading="Players"', 'heading="Stores"']);
      expect(source).toMatch(/cards\.length > 0/);
      expect(source).toMatch(/players\.length > 0/);
      expect(source).toMatch(/stores\.length > 0/);
    }
  });

  it("the website's Search tab is the combined search, built on the three actions", () => {
    expect(web.searchPage).toContain("<SearchPanel account={playerId} />");
    expect(web.searchPage).toContain("<TabPageShell");
    expect(web.searchPanel).toContain("<EverythingSearch account={account} />");
    /* It reads this device's recents as it draws, so never on the server. */
    expect(web.searchPanel).toContain("{ ssr: false }");
    expect(web.searchPanel).not.toContain("PlayerSearch");
    /* Somebody with no bell, who may have no bar, keeps a door to it. */
    expect(web.feedPage).toContain('href="/search"');
    expect(web.feedPage).not.toContain("FeedSearch");
    /* The profile keeps its own player search. */
    expect(web.playerSearch).toContain("export function PlayerSearch");
    expect(web.search).toContain('"use client"');
    expect(web.search).toContain("searchCardsAction(");
    expect(web.search).toContain("/api/players/search?q=");
    expect(web.search).toContain("searchStoresAction(");
    /* Each ask on its own, together, so the sections land together. */
    expect(web.search).toContain("Promise.all([");
  });

  it("every website row is a door to its page, drawn as asked", () => {
    const cards = between(web.search, 'heading="Cards"', 'heading="Players"');
    expect(cards).toContain("href={`/cards/${card.id}`}");
    expect(cards).toContain("{card.exactName}");
    expect(cards).toContain("{card.canonicalCardNumber}");
    expect(cards).toContain("gameShortName(card.game)");
    expect(cards).toContain("<img");

    const players = between(web.search, 'heading="Players"', 'heading="Stores"');
    expect(players).toContain("<PlayerAvatar");
    expect(players).toContain("href={`/p/${person.playerId}`}");
    expect(players).toContain("formatHandle(person.handle)");

    const stores = between(web.search, 'heading="Stores"', "function Section(");
    expect(stores).toContain("href={`/s/${store.storeId}`}");
    expect(stores).toContain("store.verified && <VerifiedMark");
    expect(stores).toContain("[store.city, store.region]");
  });

  it("the app's Search tab is the Search screen, the same three asks", () => {
    expect(app.App).toContain('name="Search"');
    expect(app.App).toContain('title: "Search"');
    expect(app.App).toContain("Card: { cardId: string }");
    expect(app.home).toContain('navigation.navigate("Tabs", { screen: "Search" })');
    expect(app.search).toContain("searchCards(");
    expect(app.search).toContain("searchPlayersByName(");
    expect(app.search).toContain("searchStores(");
    expect(app.api).toContain("export const searchStores =");
    expect(app.api).toContain("/api/v1/stores/search?q=");

    const cards = between(app.search, 'heading="Cards"', 'heading="Players"');
    expect(cards).toContain('navigation.navigate("Card", { cardId: card.id })');
    const players = between(app.search, 'heading="Players"', 'heading="Stores"');
    expect(players).toContain('navigation.navigate("PlayerProfile"');
    expect(players).toContain("<PlayerAvatar");
    const stores = between(app.search, 'heading="Stores"', "function Section(");
    expect(stores).toContain('navigation.navigate("StoreProfile"');
    expect(stores).toContain("store.verified ? <VerifiedMark");
  });
});

describe("the card page", () => {
  const SECTIONS = [
    "In your trade binder",
    "On your hunt: ",
    "You want this",
    "Post a Flare for it",
    'located ? "Who has it near you" : "Who has it"',
    "Nobody with it in a binder up for trade yet.",
    "Who is hunting it",
    "Nobody is hunting it yet.",
    'located ? "In the case nearby" : "In the case"',
    "No store near you has it listed.",
  ];

  it("draws the same sections in the same order with the same empties, on both", () => {
    inOrder(web.cardPage, SECTIONS);
    inOrder(app.card, SECTIONS);
    for (const source of [web.cardPage, app.card]) {
      expect(source).toContain("gameShortName(card.game)");
      expect(source).toContain("`Wants ${");
      expect(source).toContain('store.inCase ? "In the case" : "Counter has it"');
      expect(source).toContain("About ${Math.max(1, Math.round(");
    }
  });

  it("the website's route is public, noindex, and reads the page object", () => {
    expect(web.cardRoute).toContain("robots: { index: false, follow: false }");
    expect(web.cardRoute).toContain("cardPage(cardId, viewerId)");
    expect(web.cardRoute).toContain("if (!page) notFound();");
    expect(web.cardRoute).toContain("<CardPageView");
    /* Signed out, the You block is the way in, back to this card. */
    expect(web.cardPage).toContain("Sign in to see what you have");
    expect(web.cardPage).toContain("href={`/login?next=${encodeURIComponent(href)}`}");
    expect(web.cardPage).toContain("const href = `/cards/${card.cardId}`;");
    expect(web.cardPage).toContain(
      "href={`/flare?card=${encodeURIComponent(card.cardId)}`}",
    );
    expect(web.cardPage).toContain("href={`/hunts/${you.onHunt.huntId}`}");
    /* A holder's row: face, name, miles, Message. */
    const holders = between(web.cardPage, '"Who has it near you"', "Who is hunting it");
    expect(holders).toContain("<PlayerRow");
    expect(holders).toContain("<MessageButton playerId={player.playerId}");
    /* A hunter's row opens the hunt when it is one. */
    const hunters = between(web.cardPage, "Who is hunting it", '"In the case nearby"');
    expect(hunters).toContain("`/hunts/${row.huntId}`");
    expect(hunters).toContain("row.printingLabel");
    const stores = between(web.cardPage, '"In the case nearby"', "function PlayerRow(");
    expect(stores).toContain("href={`/s/${store.storeId}`}");
  });

  it("the app's Card screen is reached from a search result and reads the same API", () => {
    expect(app.api).toContain("export interface CardPage {");
    expect(app.api).toContain("export const getCardPage =");
    expect(app.api).toContain("/api/v1/cards/${encodeURIComponent(cardId)}/page");
    expect(app.card).toContain("getCardPage(cardId)");
    expect(app.card).toContain('label="Post a Flare for it"');
    expect(app.card).toContain('navigation.navigate("Hunt", { huntId: you.onHunt');
    expect(app.card).toContain(
      'navigation.navigate("FlarePost", { postId: hunter.postId',
    );
    expect(app.card).toContain('navigation.navigate("Hunt", { huntId: hunter.huntId');
  });
});

describe("one pick store", () => {
  it("the website's cards sheet reads the post's picks and opens the post's review", () => {
    expect(web.sheet).toContain("const shared = useContext(OfferPicksContext);");
    expect(web.sheet).toContain("const picked = shared ? shared.picks : own.selected;");
    expect(web.sheet).toContain("toggle: shared ? shared.toggle : own.toggle,");
    expect(web.sheet).toContain(
      "setQuantity: shared ? shared.setQuantity : own.setQuantity,",
    );
    expect(web.sheet).toContain(
      "const openReview = shared ? shared.openReview : () => setReview(true);",
    );
    expect(web.sheet).toContain("onClick={openReview}");
    /* The sheet's own review only where no post draws one. */
    expect(web.sheet).toContain("{offerable && !shared && (");
    /* With no provider, the local build stays. */
    expect(web.sheet).toContain("const own = useSelection(remainingFor);");
    /* The post draws the provider and the one review. */
    expect(web.postActions).toContain("<OfferPicksContext.Provider value={build}>");
  });

  it("the app's sheet takes the picks as props and keeps none of its own", () => {
    expect(app.sheet).toContain("picks: ZoomPicks;");
    expect(app.sheet).toContain("onPicks: (next: ZoomPicks) => void;");
    expect(app.sheet).not.toContain("picked, setPicked");
    expect(app.sheet).not.toMatch(/useState<Record<string, number>>/);
  });

  it("the app's Feed keeps one set of picks per post, and the post screen one", () => {
    expect(app.home).toContain("picksByPost");
    expect(app.home).toMatch(/useState<Record<string, ZoomPicks>>/);
    /* The card is handed its post's picks; it keeps none of its own. */
    expect(app.feedCard).toContain("picks: ZoomPicks;");
    expect(app.feedCard).toContain("onPicks: (next: ZoomPicks) => void;");
    expect(app.feedCard).not.toMatch(/useState<ZoomPicks>/);
    /* One picks state on the post screen, for its card and its sheet. */
    expect(app.post.match(/useState<ZoomPicks>/g)).toHaveLength(1);
    expect(app.post.match(/picks=\{picks\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});

describe("Remove from hunt", () => {
  const WORDS = ["Remove from hunt", "from this hunt? Its Flares come down too."];

  it("the owner's pocket sheet asks inline with the pinned words, on both", () => {
    const webSheet = between(
      web.binder,
      "function ProgressSheet(",
      "function HuntPocket(",
    );
    const appSheet = between(app.binder, "function HuntPocketSheet(", "\n}\n");
    for (const sheet of [webSheet, appSheet]) {
      for (const word of WORDS) expect(sheet).toContain(word);
      expect(sheet).toMatch(/>\s*Remove\s*<|label="Remove"/);
      expect(sheet).toMatch(/>\s*Keep\s*<|label="Keep"/);
      /* Under the stepper. */
      expect(sheet.lastIndexOf("<Stepper")).toBeLessThan(
        sheet.lastIndexOf("Remove from hunt"),
      );
    }
    /* The exact sentence, with the card's name in it. */
    expect(web.binder).toContain(
      "Remove {card.cardName} from this hunt? Its Flares come down too.",
    );
    expect(app.binder).toMatch(
      /Remove \$\{card\.(cardName|name)\} from this hunt\? Its Flares come down too\./,
    );
  });

  it("Remove calls the new action, closes the sheet, drops the pocket and reloads behind", () => {
    expect(web.huntActions).toContain("export async function removeHuntCardAction(");
    expect(web.binder).toContain("removeHuntCardAction(card.requestId)");
    expect(web.binder).toContain(
      "setRemoved((current) => new Set([...current, card.requestId]));",
    );
    expect(web.binder).toContain(
      "const cards = progress.cards.filter((card) => !removed.has(card.requestId));",
    );
    expect(web.binder).toContain("setOpenId(null);");
    expect(web.binder).toContain("router.refresh();");

    expect(app.api).toContain("export const removeHuntCard =");
    expect(app.api).toContain('action: "remove-card"');
    expect(app.binder).toContain("removeHuntCard(");
  });
});
