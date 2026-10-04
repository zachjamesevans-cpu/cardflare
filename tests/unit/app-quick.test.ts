import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The app feels instant: the founder's three notes from the TestFlight
 * build (2026-10-05).
 *
 * 1. "Searching a card from the feed and clicking post a flare for it,
 *    doesn't automatically put the card in the flare screen. Should
 *    autofill as the first flare."
 * 2. "Once you post a flare, that screen needs to be saved in your
 *    phone's cache indefinitely ... Same thing with everything else
 *    pretty much on the main tabs."
 * 3. "If you have an unread notification in app, there should be a
 *    small neon green dot on the inbox icon so you know to check your
 *    inbox."
 *
 * Read off the source, because the test runner is Node with no
 * renderer; the first-line rule is transpiled and run as written.
 */
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const app = read("mobile/App.tsx");
const api = read("mobile/src/api.ts");
const cache = read("mobile/src/cache.ts");
const unread = read("mobile/src/unread.ts");
const card = read("mobile/src/screens/card.tsx");
const hub = read("mobile/src/screens/hub.tsx");
const composer = read("mobile/src/screens/flare-composer.tsx");
const nights = read("mobile/src/screens/nights.tsx");
const inbox = read("mobile/src/screens/inbox.tsx");

/** One function out of a source file, transpiled and returned callable. */
function loadFunction<T>(source: string, name: string): T {
  const start = source.indexOf(`export function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf("\n}\n", start) + 2);
  const js = ts.transpileModule(body, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports[name] as T;
}

type Line = {
  cardId: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
  printings: unknown[];
  printingId: string | null;
  quantity: number;
};
type Draft = { intent: "want" | "showcase"; items: Line[]; caption: string };
type Handed = {
  cardId: string;
  name: string;
  cardNumber: string;
  imageUrl: string | null;
};

const withCardFirst = loadFunction<(draft: Draft, card: Handed, line?: Line) => Draft>(
  composer,
  "withCardFirst",
);

const handed: Handed = {
  cardId: "c-zoro",
  name: "Roronoa Zoro",
  cardNumber: "OP01-025",
  imageUrl: null,
};
const line = (cardId: string, extra: Partial<Line> = {}): Line => ({
  cardId,
  name: cardId,
  cardNumber: "X",
  imageUrl: null,
  printings: [],
  printingId: null,
  quantity: 1,
  ...extra,
});

describe("Post a Flare for it carries the card", () => {
  it("the Flare tab takes a card param", () => {
    expect(app).toMatch(
      /Flare:\s*\|\s*\{\s*hunt\?: string;\s*card\?: \{\s*cardId: string;\s*name: string;\s*cardNumber: string;\s*imageUrl: string \| null;\s*\};\s*\}\s*\|\s*undefined;/,
    );
  });

  it("the card page hands over its card", () => {
    expect(card).toMatch(
      /screen: "Flare",\s*params: \{\s*card: \{\s*cardId: card\.cardId,\s*name: card\.name,\s*cardNumber: card\.number,\s*imageUrl: card\.imageUrl,/,
    );
  });

  it("the hub reads it once, clears it, and hands it to the composer", () => {
    expect(hub).toContain("const card = route.params?.card;");
    expect(hub).toContain("navigation.setParams({ card: undefined } as never);");
    expect(hub).toContain("initialCard={openWith}");
  });

  it("a new card becomes the first line: any printing, one copy, Looking for", () => {
    const draft: Draft = {
      intent: "showcase",
      caption: "hi",
      items: [line("a", { quantity: 3 }), line("b")],
    };
    const next = withCardFirst(draft, handed);
    expect(next.items.map((item) => item.cardId)).toEqual(["c-zoro", "a", "b"]);
    expect(next.items[0]).toMatchObject({
      cardId: "c-zoro",
      name: "Roronoa Zoro",
      cardNumber: "OP01-025",
      printingId: null,
      quantity: 1,
      printings: [],
    });
    expect(next.intent).toBe("want");
    expect(next.caption).toBe("hi");
    expect(next.items[1]?.quantity).toBe(3);
  });

  it("a card already in the draft moves to the front and nothing else changes", () => {
    const mine = line("c-zoro", { printingId: "alt", quantity: 4 });
    const draft: Draft = {
      intent: "showcase",
      caption: "",
      items: [line("a"), mine, line("b")],
    };
    const next = withCardFirst(draft, handed);
    expect(next.items.map((item) => item.cardId)).toEqual(["c-zoro", "a", "b"]);
    expect(next.items[0]).toBe(mine);
    expect(next.intent).toBe("showcase");
    expect(next.items).toHaveLength(3);

    const first: Draft = { intent: "want", caption: "", items: [mine, line("a")] };
    expect(withCardFirst(first, handed)).toBe(first);
  });

  it("survives the draft restore: saved lines stay, the handed card goes first", () => {
    expect(composer).toContain("const card = handed.current;");
    expect(composer).toContain(
      "if (current.items.length > 0 && !onlyHanded) return current;",
    );
    expect(composer).toContain(
      "return card ? withCardFirst(base, card, handedLine) : base;",
    );
  });

  it("fetches printings through the card search and keeps any printing on failure", () => {
    const effect = composer.slice(
      composer.indexOf("handed.current = initialCard;"),
      composer.indexOf("}, [initialCard]);"),
    );
    expect(effect).toContain(
      "setDraft((current) => withCardFirst(current, initialCard));",
    );
    expect(effect).toContain("searchCards(initialCard.name)");
    expect(effect).toContain("cards.find((card) => card.id === initialCard.cardId)");
    expect(effect).toContain("{ ...item, printings: hit.printings }");
    expect(effect).toContain(".catch(() => {});");
  });

  it("opens on the compose step", () => {
    const effect = composer.slice(
      composer.indexOf("handed.current = initialCard;"),
      composer.indexOf("searchCards(initialCard.name)"),
    );
    expect(effect).toContain("setPosted(null);");
    expect(effect).toContain("setPreviewing(false);");
    expect(effect).toContain("setPicking(false);");
  });
});

describe("the main tabs paint at once", () => {
  it("the Flare tab spins only on the first decision ever", () => {
    expect(hub).not.toContain("One moment");
    expect(hub).toContain("if (target === null) {\n    return <Loading />;");
    expect(hub).toContain("useState<HubTarget | null>(memory.target)");
  });

  it("the Flare tab paints its last answer and decides again behind it", () => {
    expect(hub).toContain('readCache<PostTarget>("hub", id)');
    expect(hub).toContain('writeCache("hub", id, next)');
    expect(hub).toContain("memory.target = next;");
    expect(hub).toContain("sameTarget(current, next) ? current : next");
    /* Signing out forgets the session's copy. */
    expect(hub).toMatch(/onSignedOut\(\(\) => \{\s*memory\.target = null;/);
  });

  it("posting waits for the real decision, never the paint", () => {
    expect(hub).toContain("decision.current = decide();");
    expect(hub).toContain("resolveTarget={resolveTarget}");
    expect(composer).toContain(
      "const where = resolveTarget ? await resolveTarget() : target;",
    );
    expect(composer).toContain('code: where.kind === "room" ? where.code : undefined,');
  });

  it("the Flares list paints the last wants", () => {
    expect(hub).toContain('readCache<Me["wants"]>("hub", id, "wants")');
    expect(hub).toContain('writeCache("hub", me.player.id, me.wants, "wants")');
  });

  it("the composer paints who is posting and their hunts", () => {
    expect(composer).toContain('readCache<Me>("composerMe", id)');
    expect(composer).toContain('writeCache("composerMe", result.player.id, result)');
    expect(composer).toMatch(
      /readCache<\{ hunts: Hunt\[\]; limit: number \| null \}>\(\s*"composerHunts",/,
    );
    expect(composer).toContain('writeCache("composerHunts", id, result)');
  });

  it("Nights paints the last list and spins only with nothing to paint", () => {
    expect(nights).toContain('readCache<NightItem[]>("nights", id)');
    expect(nights).toContain('writeCache("nights", id, fresh.nights)');
    expect(nights).toContain("haveList.current");
    expect(nights).toContain(
      "if (nights === null && (signedIn === null || (signedIn && !failed))) {",
    );
    /* The old failure rule stands: a failure only shows on an empty screen. */
    expect(nights).toContain("const loadFailed = failed && nights === null;");
  });

  it("the Inbox paints the last notices, unread styling from the fresh answer", () => {
    expect(inbox).toContain('readCache<InboxItem[]>("inbox", id)');
    expect(inbox).toContain('writeCache("inbox", id, notifications)');
    expect(inbox).toContain("const unread = fresh && !item.readAt;");
  });

  it("every paint goes through the account-keyed cache with a session", () => {
    for (const source of [hub, nights, inbox, composer]) {
      expect(source).toContain("await cachedPlayerId()");
      expect(source).toContain("if (!(await storedAccessToken())) return;");
    }
  });

  it("names the new kinds in CACHE_TTL, each with its reason", () => {
    expect(cache).toMatch(/\*\/\n\s*hub: 30 \* 24 \* 60 \* 60 \* 1000,/);
    expect(cache).toMatch(/\*\/\n\s*nights: 24 \* 60 \* 60 \* 1000,/);
    expect(cache).toMatch(/\*\/\n\s*composerMe: 30 \* 24 \* 60 \* 60 \* 1000,/);
    expect(cache).toContain("composerHunts: 30 * 24 * 60 * 60 * 1000,");
    expect(cache).toContain("indefinitely");
    expect(cache).toContain("the paint is ALWAYS refreshed over");
  });
});

describe("the Inbox dot", () => {
  const dot = app.slice(
    app.indexOf("function InboxDot()"),
    app.indexOf("function Tabs()"),
  );

  it("is a small accent dot with a ring in the bar's fill, and no number", () => {
    expect(app).toContain("const INBOX_DOT = 9;");
    expect(dot).toContain("backgroundColor: colors.accent,");
    expect(dot).toContain("borderColor: colors.elevated,");
    expect(dot).not.toContain("<Text");
    expect(dot).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("shows on the Inbox icon only while something is unread, and says so", () => {
    expect(app).toContain("const unread = useUnread();");
    expect(app).toContain('if (route.name === "Inbox" && unread > 0) {');
    expect(app).toContain("<InboxDot />");
    expect(app).toContain(
      'tabBarAccessibilityLabel: unread > 0 ? "Inbox, unread" : "Inbox",',
    );
  });

  it("refreshes on launch, foreground, tab change and an arriving notice", () => {
    const effect = app.slice(
      app.indexOf("The Inbox dot's count"),
      app.indexOf("}, [gate]);", app.indexOf("The Inbox dot's count")),
    );
    expect(effect).toContain('if (gate !== "open") return;\n    void refreshUnread();');
    expect(effect).toContain('if (next === "active") void refreshUnread();');
    expect(effect).toContain("Notifications.addNotificationReceivedListener(");
    expect(app).toMatch(/focus: \(\) => \{\s*void refreshUnread\(\);/);
  });

  it("is cleared with the Inbox's read, after the badge", () => {
    expect(inbox).toContain('import { setUnread } from "../unread";');
    const cleared = inbox.indexOf("await syncBadge(0);");
    expect(cleared).toBeGreaterThan(-1);
    expect(inbox.indexOf("setUnread(0);", cleared)).toBeGreaterThan(cleared);
  });

  it("is one shared value: failures keep it, signed out has none", () => {
    expect(unread).toContain("useSyncExternalStore(subscribe, snapshot, snapshot)");
    expect(unread).toContain("if (generation !== started) return;");
    expect(unread).toMatch(
      /caught\.status === 401 && generation === started\) \{\s*setUnread\(0\);/,
    );
    expect(unread).toContain("onSignedOut(() => setUnread(0));");
  });

  it("reads the count from the server's unread endpoint", () => {
    expect(api).toContain(
      'export const getUnreadCount = () =>\n  call<{ unread: number }>("GET", "/api/v1/notifications/unread");',
    );
  });
});

describe("house rules on everything this round touched", () => {
  it("has no literal hex and no em dash in the new module", () => {
    expect(unread).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(unread).not.toContain("—");
  });
});
