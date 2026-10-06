import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  RECENT_LIMIT,
  parseRecent,
  recentKey,
  withRecent,
} from "../../mobile/src/recent-search-list";

/**
 * Round 16, the app's navigation and search: the founder's items 5, 6,
 * 7, 8 and 11, read off the source because the app has no renderer in
 * the test run. What only a phone can show (the raised + sitting proud
 * of the glass pill, the sheet following a finger) still needs a look
 * on a device.
 */
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const app = read("mobile/App.tsx");
const header = read("mobile/src/collapsing-header.tsx");
const home = read("mobile/src/screens/home.tsx");
const search = read("mobile/src/screens/search.tsx");
const swipe = read("mobile/src/sheet-swipe.tsx");
const href = read("mobile/src/follow-href.ts");
const inbox = read("mobile/src/screens/inbox.tsx");
const messages = read("mobile/src/unread-messages.ts");

/** Comments out, so a pin on code cannot be satisfied by a remark. */
const spoken = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every marker appears, and in this order. */
function inOrder(source: string, markers: string[]) {
  let at = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, at + 1);
    expect(next, `${marker} after position ${at}`).toBeGreaterThan(at);
    at = next;
  }
}

describe("the tab bar: Feed, Nights, Messages, Search, Profile", () => {
  const tabs = app.slice(
    app.indexOf("function Tabs() {"),
    app.indexOf("class StartupGuard"),
  );

  it("draws the five in order, and the Inbox is no longer one of them", () => {
    /* The founder: "Tabs should be in this order left to right. Feed -
       nights - messages - search - profile". */
    inOrder(tabs, [
      'name="Feed"',
      'name="Nights"',
      'name="Messages"',
      'name="Search"',
      'name="Profile"',
    ]);
    expect(tabs).toMatch(/name="Search"\s*component=\{SearchScreen\}/);
    expect(tabs).not.toContain('name="Inbox"');
    /* Local still takes the second slot when it is switched on. */
    expect(tabs).toContain("{LOCAL_ENABLED ? (");
    expect(tabs).toContain('<Tab.Screen name="Local" component={LocalScreen}');
  });

  it("keeps Post a Flare's route but gives it no slot: the Feed's + opens it", () => {
    /* The founder: "Not a fan of the big plus... move the + to top left
       and messages bottom middle." */
    expect(tabs).toContain('route.name === "Flare" ? null : <TabButton {...props} />');
    expect(tabs).toMatch(/name="Flare"\s*component=\{HubScreen\}/);
    /* Its box goes too, or the bar keeps an empty slot: "Missing a
       whole tab at the bottom." */
    expect(tabs).toContain('tabBarItemStyle: { display: "none" }');
    expect(app).not.toContain("function PostButton(");
    const header = read("mobile/src/collapsing-header.tsx");
    expect(header).toContain(
      '<HeaderButton icon="add" label="Post a Flare" onPress={onPost} />',
    );
    expect(read("mobile/src/screens/home.tsx")).toContain(
      'onPost={() => navigation.navigate("Tabs", { screen: "Flare" })}',
    );
  });

  it("Messages is the conversations list, with a dot from the unread message count", () => {
    expect(tabs).toContain("{() => <LocalScreen threadsOnly />}");
    expect(tabs).toContain("const unreadMessages = useUnreadMessages();");
    expect(tabs).toContain('if (route.name === "Messages" && unreadMessages > 0) {');
    expect(tabs).toContain("<MessagesDot />");
    expect(tabs).toMatch(
      /tabBarAccessibilityLabel:\s*unreadMessages > 0 \? "Messages, unread" : "Messages"/,
    );
    /* Asked again on every tab change, foreground and arriving push. */
    expect(
      app.match(/void refreshUnreadMessages\(\);/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(messages).toContain("const { threads } = await listLocalThreads();");
    expect(messages).toContain("setUnreadMessages(totalUnread(threads))");
    expect(messages).toContain("onSignedOut(() => setUnreadMessages(0));");
  });

  it("the Inbox is a stack screen, and every door to it and to Messages moved", () => {
    expect(app).toContain("  Inbox: undefined;");
    expect(app).toMatch(
      /<Stack\.Screen\s+name="Inbox"\s+component=\{InboxScreen\}\s+options=\{\{ title: "Inbox" \}\}/,
    );
    /* No stack screen called Messages any more: it is the tab. */
    expect(app).not.toMatch(/<Stack\.Screen\s+name="Messages"/);
    expect(href).toContain('navigation.navigate("Inbox");');
    expect(href).toContain('navigation.navigate("Tabs", { screen: "Messages" });');
    expect(href).not.toContain('screen: "Inbox"');
    /* The Inbox's Messages row is gone: Messages has its own tab. */
    expect(inbox).not.toContain('screen: "Messages"');
    expect(inbox).not.toContain("listLocalThreads");
  });
});

describe("the Feed's bell", () => {
  it("sits alone top right, opens the Inbox, and wears the dot when unread", () => {
    expect(home).toContain('onInbox={() => navigation.navigate("Inbox")}');
    expect(home).toContain("const unread = useUnread();");
    /* Search is a tab now, so the header has no search icon. */
    expect(header).not.toContain('accessibilityLabel="Search"');
    expect(home).not.toContain("onSearch");
    inOrder(header, [
      'icon="notifications-outline"',
      'label={unread > 0 ? "Notifications, unread" : "Notifications"}',
      "dot={unread > 0}",
    ]);
    expect(spoken(header)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("back is a plain chevron", () => {
  it("has no words, says Back to VoiceOver, and no screen sets a back title", () => {
    /* Drawn by our own header now (src/header.tsx), in the same box as
       every other header button. */
    const shared = read("mobile/src/header.tsx");
    const back = shared.slice(
      shared.indexOf("export function StackHeader("),
      shared.indexOf("export function TabHeader("),
    );
    expect(back).toMatch(
      /<HeaderButton\s+icon="chevron-back"\s+label="Back"\s+color=\{colors\.accent\}\s+onPress=\{\(\) => navigation\.goBack\(\)\}/,
    );
    expect(spoken(back)).not.toContain("<Text");
    expect(app).not.toContain("BACK_LABELS");
    expect(app).not.toContain("headerBackTitle");
    expect(app).toContain("header: (props) => <StackHeader {...props} />");
  });

  it("calls the trade history History", () => {
    expect(app).toMatch(
      /name="TradeHistory"\s*component=\{TradeHistoryScreen\}\s*options=\{\{ title: "History" \}\}/,
    );
  });

  it("the stack keeps the left-edge swipe, not the whole-screen one", () => {
    expect(app).toContain("gestureEnabled: true,");
    expect(app).toContain("fullScreenGestureEnabled: false,");
  });
});

describe("full-height sheets close like a screen", () => {
  /* Loads the constants and the rule together, transpiled and run. */
  const rule = (() => {
    const start = swipe.indexOf("export const SHEET_EDGE");
    const end =
      swipe.indexOf("\n}\n", swipe.indexOf("export function shouldCloseSheet(")) + 2;
    const js = ts.transpileModule(swipe.slice(start, end), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;
    const mod = { exports: {} as Record<string, unknown> };
    new Function("module", "exports", js)(mod, mod.exports);
    return mod.exports.shouldCloseSheet as (
      distance: number,
      velocity: number,
    ) => boolean;
  })();

  it("closes on a long drag or a quick flick, never on a nudge", () => {
    expect(rule(80, 0)).toBe(true);
    expect(rule(200, 0)).toBe(true);
    expect(rule(40, 1200)).toBe(true);
    expect(rule(40, 100)).toBe(false);
    expect(rule(10, 2000)).toBe(false);
    expect(rule(0, 0)).toBe(false);
  });

  it("starts only in the left-edge strip or the top strip, never the whole sheet", () => {
    expect(swipe).toContain(".hitSlop({ left: 0, width: SHEET_EDGE })");
    expect(swipe).toContain(".hitSlop({ top: 0, height: pullZone })");
    expect(swipe).toContain("export const SHEET_EDGE = 24;");
    expect(swipe).toContain("Gesture.Race(edge, pull)");
    expect(swipe).toContain("runOnJS(onClose)()");
    /* A Modal is its own window on Android: the panel brings a root. */
    expect(swipe).toContain("<GestureHandlerRootView");
    /* And claims its taps, as the inner Pressable used to. */
    expect(swipe).toContain("onStartShouldSetResponder={() => true}");
  });

  it.each([
    ["mobile/src/card-select.tsx"],
    ["mobile/src/offer-review-sheet.tsx"],
    ["mobile/src/flare-cards-sheet.tsx"],
  ])("%s uses the one shared panel, and its list puts the keyboard away", (path) => {
    const source = read(path);
    expect(source).toContain('import { SwipeToClose } from "./sheet-swipe";');
    expect(source).toContain("<SwipeToClose");
    expect(source).toContain("onClose={onClose}");
    expect(source).toContain('keyboardDismissMode="on-drag"');
    expect(source).not.toContain("onPress={() => undefined}");
  });

  it("the binder's add menu is the card picker, and its pasted list dismisses too", () => {
    const binderAdd = read("mobile/src/binder-add-sheet.tsx");
    expect(binderAdd).toContain("<CardSelectSheet");
    expect(binderAdd).toContain('keyboardDismissMode="on-drag"');
  });
});

describe("search: tabs, Top, See all, @, recent", () => {
  it("draws SEARCH_TABS once something is typed, and @ forces Players", () => {
    expect(search).toContain("SEARCH_TABS.map(({ id, label }) =>");
    expect(search).toContain('const shown: SearchTab = playersOnly ? "players" : tab;');
    expect(search).toContain('const off = playersOnly && id !== "players";');
    expect(search).toContain("disabled={off}");
    expect(search).toContain('accessibilityRole="tab"');
    /* "@" asks only for players. */
    expect(search).toMatch(
      /onlyPlayers\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*searchCards/,
    );
    expect(search).toMatch(
      /onlyPlayers\s*\?\s*Promise\.resolve\(\[\]\)\s*:\s*searchStores/,
    );
  });

  it("ranks each kind by its own names, and Top orders and limits the sections", () => {
    expect(search).toContain("matchScore(text, [person.displayName, person.handle])");
    expect(search).toContain("matchScore(text, [store.name])");
    expect(search).toContain("matchScore(text, [card.name, card.cardNumber])");
    expect(search).toContain("rankBy(result.cards, cardScore(trimmed))");
    expect(search).toContain("rankBy(result.players, playerScore(trimmed))");
    expect(search).toContain("rankBy(result.stores, storeScore(trimmed))");
    expect(search).toContain("topOrder(");
    expect(search).toContain("limit: TOP_LIMITS[kind]");
    expect(search).toContain(".slice(0, limit)");
  });

  it("See all opens that tab, and only Top draws headings", () => {
    expect(search).toMatch(
      /limit !== undefined && found\[kind\]\.length > limit\s*\?\s*\(\) => setTab\(kind\)\s*:\s*undefined/,
    );
    expect(search).toContain('action="See all"');
    expect(search).toContain("{visible ? (");
  });

  it("recent searches show before typing, with Clear, saved on open or submit only", () => {
    expect(search).toContain("{!typing && recent.length > 0 ? (");
    expect(search).toContain(
      '<SectionHead heading="Recent" action="Clear" onAction={clearRecent} />',
    );
    expect(search).toContain('returnKeyType="search"');
    expect(search).toContain(
      "if (readQuery(query).text.length >= SEARCH_MIN_CHARS) remember(query);",
    );
    expect(search).toContain("remember(query);\n      go();");
    /* Never while typing: the change handler does not remember. */
    const typing = search.slice(
      search.indexOf("const type = (text: string) => {"),
      search.indexOf("const remember ="),
    );
    expect(typing).not.toContain("remember(");
    expect(spoken(search)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("keeps the last eight, newest first, never twice", () => {
    let list: string[] = [];
    for (const query of ["a", "b", "c", "d", "e", "f", "g", "h", "i"]) {
      list = withRecent(list, query);
    }
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]).toBe("i");
    expect(list).not.toContain("a");
    expect(withRecent(["Luffy", "zoro"], " luffy ")).toEqual(["luffy", "zoro"]);
    expect(withRecent(["x"], "   ")).toEqual(["x"]);
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent(JSON.stringify(["a", 3, "", "b"]))).toEqual(["a", "b"]);
  });

  it("is kept per account, under the cache's prefix so sign-out sweeps it", () => {
    expect(recentKey("p1")).not.toBe(recentKey("p2"));
    expect(recentKey(null)).toContain("guest");
    expect(recentKey("p1").startsWith("cardflare.cache.v2.")).toBe(true);
    expect(read("mobile/src/cache.ts")).toContain(
      'const PREFIX = "cardflare.cache.v2";',
    );
    const store = read("mobile/src/recent-searches.ts");
    expect(store).toContain("recentKey(await cachedPlayerId())");
    expect(store).toContain("AsyncStorage.removeItem(key)");
  });
});

/* Built, not written, so this file carries no em dash of its own. */
const EM_DASH = String.fromCharCode(0x2014);

describe("house rules on what this round wrote", () => {
  it.each([
    "mobile/src/sheet-swipe.tsx",
    "mobile/src/unread-dot.tsx",
    "mobile/src/unread-messages.ts",
    "mobile/src/recent-searches.ts",
    "mobile/src/recent-search-list.ts",
    "mobile/src/screens/search.tsx",
  ])("%s has no em dash and no literal hex", (path) => {
    const source = read(path);
    expect(source).not.toContain(EM_DASH);
    expect(spoken(source)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
