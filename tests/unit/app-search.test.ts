import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* A file that is not there reads as empty, so every pin on it fails
   by name instead of the whole suite failing to load. */
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

/** Comments out, so a pin on words cannot be satisfied by a remark. */
const spoken = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * Search, the card page, one pick store, Remove from hunt: the app's
 * half. The website's half and the words both platforms share are in
 * tests/unit/search-parity.test.ts; this file pins what only the app
 * does, read off the source because the app has no renderer in the
 * test run.
 */
const src = {
  api: read("mobile/src/api.ts"),
  app: read("mobile/App.tsx"),
  search: read("mobile/src/screens/search.tsx"),
  card: read("mobile/src/screens/card.tsx"),
  home: read("mobile/src/screens/home.tsx"),
  feedCard: read("mobile/src/flare-feed-card.tsx"),
  sheet: read("mobile/src/flare-cards-sheet.tsx"),
  post: read("mobile/src/screens/flare-post.tsx"),
  binder: read("mobile/src/hunt-binder.tsx"),
  href: read("mobile/src/follow-href.ts"),
  oldSearch: read("mobile/src/screens/find-player.tsx"),
};

describe("the API carries the server's contracts", () => {
  it("has the card page, by card, with every section the page draws", () => {
    const page = between(
      src.api,
      "export interface CardPage {",
      "export const getCardPage",
    );
    expect(page).toContain("you: {");
    expect(page).toContain("inTradeBinder: boolean;");
    expect(page).toContain("onHunt: { huntId: string; name: string } | null;");
    expect(page).toContain("wanted: boolean;");
    expect(page).toContain("} | null;");
    expect(page).toContain("located: boolean;");
    expect(page).toContain(
      "holders: { player: CardPagePlayer; milesLabel: string | null }[];",
    );
    expect(page).toContain("hunters: {");
    expect(page).toContain("postId: string | null;");
    expect(page).toContain("huntId: string | null;");
    expect(page).toContain("printingLabel: string | null;");
    expect(page).toContain("quantity: number;");
    expect(page).toContain("stores: {");
    expect(page).toContain("miles: number | null;");
    expect(page).toContain("inCase: boolean;");
    expect(src.api).toContain(
      'call<{ page: CardPage }>("GET", `/api/v1/cards/${encodeURIComponent(cardId)}/page`)',
    );
  });

  it("searches stores by name or city, and removes a card from a hunt", () => {
    const store = between(src.api, "export interface FoundStore {", "}");
    for (const field of [
      "storeId: string;",
      "name: string;",
      "city: string | null;",
      "region: string | null;",
      "verified: boolean;",
    ]) {
      expect(store).toContain(field);
    }
    expect(src.api).toContain("export const searchStores = (query: string) =>");
    expect(src.api).toContain("`/api/v1/stores/search?q=${encodeURIComponent(query)}`");
    expect(src.api).toContain("export const removeHuntCard = (requestId: string) =>");
    expect(src.api).toContain(
      'call<{ ok: true }>("POST", "/api/v1/hunts", {\n    action: "remove-card",\n    requestId,\n  })',
    );
    /* Card and player search stay what they were. */
    expect(src.api).toContain("`/api/v1/cards?q=${encodeURIComponent(query)}");
    expect(src.api).toContain("`/api/players/search?q=${encodeURIComponent(query)}`");
    /* A search row can say the game; an older server may not send it. */
    expect(
      between(src.api, "export interface CardHit {", "export const searchCards"),
    ).toContain("game?: string | null;");
  });
});

describe("the Search screen, from the Feed", () => {
  it("replaced Find a player: the route is Search and nothing navigates to the old name", () => {
    expect(src.oldSearch).toBe("");
    expect(src.search).toContain("export function SearchScreen()");
    expect(src.app).toContain('import { SearchScreen } from "./src/screens/search";');
    expect(src.app).toContain("  Search: undefined;");
    expect(src.app).toContain('name="Search"');
    expect(src.app).toContain('options={{ title: "Search", headerBackTitle: "Feed" }}');
    expect(src.app).toContain('Search: "Feed",');
    expect(src.app).not.toContain("FindPlayer");
    expect(src.home).toContain('onSearch={() => navigation.navigate("Search")}');
    expect(src.home).not.toContain("FindPlayer");
  });

  it("is one field, autofocused, searching as you type after two characters", () => {
    expect(src.search).toContain('placeholder="Search cards, players and stores"');
    expect(src.search).toContain("autoFocus");
    expect(src.search).toContain("export const SEARCH_DEBOUNCE_MS = 250;");
    expect(src.search).toContain("export const SEARCH_MIN_CHARS = 2;");
    expect(src.search).toContain("if (trimmed.length < SEARCH_MIN_CHARS) {");
    expect(src.search).toContain("}, SEARCH_DEBOUNCE_MS);");
    /* All three go out together. */
    for (const fn of [
      "searchCards(trimmed)",
      "searchPlayersByName(trimmed)",
      "searchStores(trimmed)",
    ]) {
      expect(src.search).toContain(fn);
    }
  });

  it("draws Cards, Players, Stores in that order, each only when it has rows", () => {
    const cards = src.search.indexOf('<Section heading="Cards">');
    const players = src.search.indexOf('<Section heading="Players">');
    const stores = src.search.indexOf('<Section heading="Stores">');
    expect(cards).toBeGreaterThan(-1);
    expect(players).toBeGreaterThan(cards);
    expect(stores).toBeGreaterThan(players);
    expect(src.search).toContain("{found && found.cards.length > 0 ? (");
    expect(src.search).toContain("{found && found.players.length > 0 ? (");
    expect(src.search).toContain("{found && found.stores.length > 0 ? (");
    /* A card row: art, name, number, the game's short name; tap opens the card. */
    expect(src.search).toContain("uri={leadArt(card)}");
    expect(src.search).toContain("{card.name}");
    expect(src.search).toContain("`${card.cardNumber} · ${gameShortName(card.game)}`");
    expect(src.search).toContain('navigation.navigate("Card", { cardId: card.id })');
    /* A player row: the face, the name, the handle; tap opens the profile. */
    expect(src.search).toContain("{formatHandle(person.handle)}");
    expect(src.search).toContain(
      'navigation.navigate("PlayerProfile", { playerId: person.playerId })',
    );
    /* A store row: the verified glyph where earned, city and region; tap opens the store. */
    expect(src.search).toContain(
      "{store.verified ? <VerifiedMark size={14} /> : null}",
    );
    expect(src.search).toContain(
      '[store.city, store.region].filter(Boolean).join(", ")',
    );
    expect(src.search).toContain(
      'navigation.navigate("StoreProfile", { storeId: store.storeId })',
    );
  });

  it("says Nothing for that yet. only once every search has answered empty", () => {
    expect(src.search).toContain(
      "{nothing ? <Muted>Nothing for that yet.</Muted> : null}",
    );
    expect(src.search).toContain("found.pending === 0 &&");
    /* Before typing, nothing: the state is null until a search runs. */
    expect(src.search).toContain("useState<Results | null>(null)");
    expect(src.search).toContain("setFound(null);");
  });
});

describe("the card page", () => {
  it("is the Card route, reached from a search result and from a /cards/ link", () => {
    expect(src.app).toContain('import { CardScreen } from "./src/screens/card";');
    expect(src.app).toContain("  Card: { cardId: string };");
    expect(src.app).toContain('name="Card"');
    expect(src.app).toContain("<CardScreen cardId={route.params.cardId} />");
    expect(src.app).toContain('Card: "Back",');
    expect(src.href).toContain('if (href.startsWith("/cards/")) {');
    expect(src.href).toContain('navigation.navigate("Card", { cardId });');
    expect(src.card).toContain("await getCardPage(cardId)");
    /* A 404 is "no such card", said as that and not as a crash. */
    expect(src.card).toContain("caught instanceof ApiError && caught.status === 404");
    expect(src.card).toContain("<Muted>No such card.</Muted>");
  });

  it("draws the card, then you, then the three sections in order", () => {
    const you = src.card.indexOf("{you ? (");
    const has = src.card.indexOf(
      'heading={located ? "Who has it near you" : "Who has it"}',
    );
    const hunting = src.card.indexOf('heading="Who is hunting it"');
    const stores = src.card.indexOf(
      'heading={located ? "In the case nearby" : "In the case"}',
    );
    expect(you).toBeGreaterThan(src.card.indexOf("uri={card.imageUrl}"));
    expect(has).toBeGreaterThan(you);
    expect(hunting).toBeGreaterThan(has);
    expect(stores).toBeGreaterThan(hunting);
    expect(src.card).toContain("{gameShortName(card.game)}");
  });

  it("the You block is one line per true fact, then Post a Flare for it", () => {
    const block = between(src.card, "{you ? (", "<Section heading={located");
    expect(block).toContain(
      "{you.inTradeBinder ? <Fact>In your Trade binder</Fact> : null}",
    );
    expect(block).toContain('{"On your hunt: "}');
    expect(block).toContain("{you.onHunt.name}");
    expect(block).toContain(
      'navigation.navigate("Hunt", { huntId: you.onHunt?.huntId ?? "" })',
    );
    expect(block).toContain("{you.wanted ? <Fact>You want this</Fact> : null}");
    expect(block).toContain('label="Post a Flare for it"');
    /* The card goes with it, to be the draft's first line. */
    expect(block).toMatch(
      /navigation\.navigate\("Tabs", \{\s*screen: "Flare",\s*params: \{\s*card: \{\s*cardId: card\.cardId,/,
    );
  });

  it("every section has rows from the page object or its one honest empty line", () => {
    expect(src.card).toContain(
      "<Muted>Nobody with it in a binder up for trade yet.</Muted>",
    );
    expect(src.card).toContain("<Muted>Nobody is hunting it yet.</Muted>");
    expect(src.card).toContain("<Muted>No store near you has it listed.</Muted>");
    expect(src.card).toContain("holders.map((holder, index) =>");
    expect(src.card).toContain("hunters.map((hunter, index) =>");
    expect(src.card).toContain("stores.map((store, index) =>");
    /* Holders: face, name, distance, the Message button and the profile door. */
    expect(src.card).toContain('label="Message"');
    expect(src.card).toContain("await openDirectThread(player.playerId)");
    expect(src.card).toContain(
      'navigation.navigate("PlayerProfile", { playerId: player.playerId })',
    );
    /* Hunters: Wants N, the printing when there is one, the post or the hunt. */
    expect(src.card).toContain("{`Wants ${hunter.quantity}`}");
    expect(src.card).toContain(
      '{hunter.printingLabel ? ` · ${hunter.printingLabel}` : ""}',
    );
    expect(src.card).toContain(
      'navigation.navigate("FlarePost", { postId: hunter.postId ?? "" })',
    );
    expect(src.card).toContain(
      'navigation.navigate("Hunt", { huntId: hunter.huntId ?? "" })',
    );
    /* Stores: About N mi, the chip. */
    expect(src.card).toContain("return `About ${Math.max(1, Math.round(miles))} mi`;");
    expect(src.card).toContain(
      '<Chip label={store.inCase ? "In the case" : "Counter has it"} />',
    );
    expect(src.card).toContain(
      'navigation.navigate("StoreProfile", { storeId: store.storeId })',
    );
    /* No literal colour anywhere on the page. */
    expect(spoken(src.card)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(spoken(src.search)).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

describe("one pick store per post", () => {
  it("the Feed screen keeps picksByPost and hands each card and the sheet its post's", () => {
    expect(src.home).toContain(
      "const [picksByPost, setPicksByPost] = useState<Record<string, ZoomPicks>>({});",
    );
    expect(src.home).toContain("picks={picksFor(item.postId)}");
    expect(src.home).toContain("onPicks={(next) => setPicksFor(item.postId, next)}");
    expect(src.home).toContain(
      "picks={cardsSheet ? picksFor(cardsSheet.postId) : NO_PICKS}",
    );
    expect(src.home).toContain("if (cardsSheet) setPicksFor(cardsSheet.postId, next);");
  });

  it("the Feed card takes picks and onPicks and keeps none of its own", () => {
    const props = between(src.feedCard, "export function FlareFeedCard({", ") {");
    expect(props).toContain("picks: ZoomPicks;");
    expect(props).toContain("onPicks: (next: ZoomPicks) => void;");
    expect(src.feedCard).not.toContain("useState<ZoomPicks>");
    expect(src.feedCard).not.toContain("setPicks");
    expect(src.feedCard).toContain("onSent={() => onPicks({})}");
  });

  it("the sheet takes picks and onPicks and keeps no picked state of its own", () => {
    const props = between(src.sheet, "export function FlareCardsSheet({", ") {");
    expect(props).toContain("picks: ZoomPicks;");
    expect(props).toContain("onPicks: (next: ZoomPicks) => void;");
    expect(src.sheet).not.toContain("picked, setPicked");
    expect(src.sheet).not.toContain("useState<Record<string, number>>");
    expect(src.sheet).not.toContain("setPicked(");
    /* Every tick, step and review edit writes back up through onPicks. */
    expect(src.sheet).toContain("onPicks(next);");
    expect(src.sheet).toContain("onPress={() => setPick(key, count > 0 ? 0 : 1)}");
    expect(src.sheet).toContain("onChange={(value) => setPick(key, value)}");
    expect(src.sheet).toContain("onChange={setPick}");
    /* Sent: the post's picks are spent. */
    expect(src.sheet).toContain("onPicks({});");
    /* Opening on a post with picks opens it picking, so they are in sight. */
    expect(src.sheet).toContain(
      'setSelecting(open.mode === "offer" || Object.keys(picksAtOpen.current).length > 0);',
    );
  });

  it("the post screen keeps one picks state and passes it to its card and its sheet", () => {
    expect(src.post.match(/useState<ZoomPicks>\(\{\}\)/g)?.length).toBe(1);
    expect(src.post).toContain("const [picks, setPicks] = useState<ZoomPicks>({});");
    /* The single slide, the carousel, and the sheet: three doors, one store. */
    expect(src.post.match(/picks=\{picks\}/g)?.length).toBe(3);
    expect(src.post.match(/onPicks=\{setPicks\}/g)?.length).toBe(3);
    expect(between(src.post, "<FlareCardsSheet", "/>")).toContain("picks={picks}");
  });
});

describe("Remove from hunt", () => {
  const sheet = src.binder.slice(src.binder.indexOf("function HuntPocketSheet("));

  it("is a danger text button under the stepper in the owner's pocket sheet", () => {
    const stepper = sheet.indexOf("<Stepper");
    const remove = sheet.indexOf("Remove from hunt\n");
    expect(stepper).toBeGreaterThan(-1);
    expect(remove).toBeGreaterThan(stepper);
    expect(spoken(sheet)).toContain("Remove from hunt");
    expect(sheet).toContain(
      '<Text style={{ color: colors.danger, fontSize: 14, fontWeight: "600" }}>',
    );
    expect(sheet).toContain("onPress={() => setConfirming(true)}");
    /* Only where the server can act: a card with no request has no button. */
    expect(sheet).toContain("{onRemove ? (");
    expect(src.binder).toContain(
      "onRemove={open?.requestId ? () => remove(open) : undefined}",
    );
  });

  it("asks inline with the exact words, Remove in danger and Keep", () => {
    expect(sheet).toContain(
      "{`Remove ${card.cardName} from this hunt? Its Flares come down too.`}",
    );
    const question = between(sheet, "confirming ? (", ") : (");
    expect(question).toContain("<DangerButton");
    expect(question).toContain('label="Remove"');
    expect(question).toContain('label="Keep"');
    expect(question).toContain("onPress={() => setConfirming(false)}");
    expect(sheet).toContain("borderColor: colors.danger,");
  });

  it("Remove calls removeHuntCard, closes the sheet, drops the pocket and reloads behind", () => {
    expect(src.binder).toContain("await removeHuntCard(card.requestId);");
    const remove = between(
      src.binder,
      "const remove = async (card: HuntCard) => {",
      "};",
    );
    expect(remove).toContain(
      'setRemoved((current) => new Set(current).add(card.requestId ?? ""));',
    );
    expect(remove).toContain("setOpen(null);");
    expect(remove).toContain("onChanged?.();");
    /* Gone on the next paint: the page's cards are filtered by what was removed. */
    expect(src.binder).toContain(
      "const cards = (hunt.cards ?? []).filter(\n    (card) => !card.requestId || !removed.has(card.requestId),\n  );",
    );
    /* The question is answered fresh for every pocket opened. */
    expect(src.binder).toContain('key={open?.requestId ?? open?.cardId ?? "closed"}');
    /* And the comment that said the server had no such action is gone. */
    expect(src.binder).not.toContain("the server has no such action");
  });
});

/* Built, not written, so this file carries no em dash of its own. */
const EM_DASH = String.fromCharCode(0x2014);

describe("no em dashes in the round's copy or comments", () => {
  it("none of the new or rewritten files carries one", () => {
    for (const [name, source] of [
      ["search", src.search],
      ["card", src.card],
    ] as const) {
      expect(source, name).not.toContain(EM_DASH);
    }
    for (const name of ["sheet", "feedCard", "binder", "href"] as const) {
      const touched = src[name];
      /* The parts this round wrote. */
      for (const marker of [
        "ONE STORE PER POST",
        "THE SHEET KEEPS NO PICKS",
        "Remove from hunt",
        "/cards/<cardId>",
      ]) {
        const at = touched.indexOf(marker);
        if (at === -1) continue;
        expect(touched.slice(at, at + 600), `${name}:${marker}`).not.toContain(EM_DASH);
      }
    }
  });
});
