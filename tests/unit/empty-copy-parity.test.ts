import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import * as webCopy from "@/lib/copy/empty-copy";

/**
 * What an empty place says, on both platforms: Search with nothing
 * matched, the Inbox with no notices, a store's page with no nights.
 *
 * The founder's standing instruction is that the website and the app
 * say the same words for the same thing. The words live in one file on
 * each side (src/lib/copy/empty-copy.ts, mobile/src/empty-copy.ts);
 * this reads both, runs both, and holds every export of one to the
 * other, then checks each screen draws from the file and not from a
 * string of its own. Whether either looks right is the visual pass.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

/**
 * The app's copy file, run as written: transpiled from TypeScript and
 * evaluated as a module, so its functions are tested and not just read.
 */
function loadModule(source: string): Record<string, unknown> {
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} as Record<string, unknown> };
  new Function("module", "exports", js)(mod, mod.exports);
  return mod.exports;
}

const webSource = read("src/lib/copy/empty-copy.ts");
const appSource = read("mobile/src/empty-copy.ts");
const web = webCopy as unknown as Record<string, unknown>;
const app = loadModule(appSource);

type SearchEmpty = (
  tab: string,
  counts: { players: number; cards: number; stores: number },
) => { line: string; hint: string; action: string | null };

const NONE = { players: 0, cards: 0, stores: 0 };

/** Every call the screens can make of `searchEmpty`, and what it says. */
const SEARCHES: [string, typeof NONE, ReturnType<SearchEmpty>][] = [
  [
    "top",
    NONE,
    {
      line: "Nothing matched that.",
      hint: "Try a card number like OP01-001, a player's @username or a store's name.",
      action: null,
    },
  ],
  [
    "players",
    NONE,
    {
      line: "No players matched that.",
      hint: "Check the spelling of their name or username.",
      action: null,
    },
  ],
  [
    "cards",
    NONE,
    {
      line: "No cards matched that.",
      hint: "Try the card number, like OP01-001.",
      action: null,
    },
  ],
  [
    "stores",
    NONE,
    {
      line: "No stores matched that.",
      hint: "Try the store's name or its city.",
      action: null,
    },
  ],
  /* Another kind matched: it is named, and the button goes to Top. */
  [
    "players",
    { players: 0, cards: 4, stores: 0 },
    { line: "No players matched that.", hint: "Cards did.", action: "See all results" },
  ],
  [
    "players",
    { players: 0, cards: 4, stores: 1 },
    {
      line: "No players matched that.",
      hint: "Cards and stores did.",
      action: "See all results",
    },
  ],
  [
    "cards",
    { players: 2, cards: 0, stores: 1 },
    {
      line: "No cards matched that.",
      hint: "Players and stores did.",
      action: "See all results",
    },
  ],
  [
    "stores",
    { players: 1, cards: 0, stores: 0 },
    {
      line: "No stores matched that.",
      hint: "Players did.",
      action: "See all results",
    },
  ],
];

describe("the empty copy is one set of words", () => {
  it("exports the same names from both files", () => {
    expect(Object.keys(app).sort()).toEqual(Object.keys(web).sort());
    expect(Object.keys(web).length).toBeGreaterThan(0);
  });

  it("says the same thing under every name", () => {
    for (const [name, value] of Object.entries(web)) {
      if (typeof value === "function") continue;
      expect(app[name], name).toEqual(value);
    }
  });

  it("is the same file under its header, so a function cannot drift either", () => {
    const body = (source: string) => source.slice(source.indexOf("*/") + 2);
    expect(body(appSource)).toBe(body(webSource));
  });

  it("answers a search with nothing in it the same way, by tab", () => {
    for (const copy of [web, app]) {
      const searchEmpty = copy.searchEmpty as SearchEmpty;
      for (const [tab, counts, said] of SEARCHES) {
        expect(searchEmpty(tab, counts), `${tab} ${JSON.stringify(counts)}`).toEqual(
          said,
        );
      }
    }
  });

  it("points a store's empty calendar at Follow, or says the viewer already does", () => {
    for (const copy of [web, app]) {
      const hint = copy.storeNightsEmptyHint as (following: boolean) => string;
      expect(copy.STORE_NIGHTS_EMPTY).toBe("Nothing scheduled yet.");
      expect(hint(false)).toBe(
        "Follow the store above and its next night shows up in your Feed.",
      );
      expect(hint(true)).toBe(
        "You follow this store, so its next night shows up in your Feed.",
      );
    }
  });

  it("says what lands in the Inbox, and names the one door", () => {
    for (const copy of [web, app]) {
      expect(copy.INBOX_EMPTY).toBe("No notifications yet.");
      expect(copy.INBOX_EMPTY_HINT).toBe(
        "Offers and comments on your Flares, new followers and players near you who want your cards land here.",
      );
      expect(copy.INBOX_EMPTY_ACTION).toBe("Post a Flare");
    }
  });
});

describe("the house rules, on every word", () => {
  /* Built, not written, so this file carries no em dash of its own. */
  const EM_DASH = String.fromCharCode(0x2014);

  const strings = (value: unknown): string[] =>
    typeof value === "string"
      ? [value]
      : value && typeof value === "object"
        ? Object.values(value).flatMap(strings)
        : [];

  const said = [
    ...Object.values(web).flatMap(strings),
    ...SEARCHES.flatMap(([tab, counts]) =>
      strings((web.searchEmpty as SearchEmpty)(tab, counts)),
    ),
  ];

  it("is short and plain: no em dash, no exclamation mark, no price", () => {
    for (const line of said) {
      expect(line).not.toContain(EM_DASH);
      expect(line).not.toContain("!");
      expect(line).not.toMatch(/[$£€]/);
      expect(line.length).toBeLessThanOrEqual(110);
    }
    for (const source of [webSource, appSource]) {
      expect(source).not.toContain(EM_DASH);
    }
  });

  it("never names the brand in capitals", () => {
    for (const line of said) expect(line).not.toMatch(/CardFlare|Cardflare/);
  });
});

describe("each screen reads the words from the file", () => {
  const webSearch = read("src/components/feed/everything-search.tsx");
  const appSearch = read("mobile/src/screens/search.tsx");
  const webInbox = read("src/app/inbox/page.tsx");
  const appInbox = read("mobile/src/screens/inbox.tsx");
  const webStore = read("src/app/s/[storeId]/page.tsx");
  const appStore = read("mobile/src/screens/store-profile.tsx");

  it("Search: the line, the hint, and one button back to Top when there is one", () => {
    expect(webSearch).toContain('from "@/lib/copy/empty-copy"');
    expect(appSearch).toContain('from "../empty-copy"');
    for (const source of [webSearch, appSearch]) {
      expect(source).toContain("searchEmpty(shown, {");
      expect(source).toContain("{empty.line}");
      expect(source).toContain("{empty.hint}");
      expect(source).toContain("{empty.action}");
      expect(source).toContain('setTab("top")');
    }
  });

  it("the Inbox: the line, what lands here, and the composer as the one door", () => {
    for (const source of [webInbox, appInbox]) {
      expect(source).toContain("{INBOX_EMPTY}");
      expect(source).toContain("{INBOX_EMPTY_HINT}");
      expect(source).toContain("INBOX_EMPTY_ACTION");
      /* One door, not two: the old room button is gone. */
      expect(source).not.toContain("Open the room");
    }
    /* A real destination on each side: the composer that already exists. */
    expect(webInbox).toContain('<ButtonLink href="/flare" variant="secondary">');
    expect(read("src/app/flare/page.tsx")).toContain("<FlareComposer");
    expect(appInbox).toContain('navigation.navigate("Tabs", { screen: "Flare" })');
    expect(read("mobile/App.tsx")).toMatch(/\n {2}Flare:\n/);
  });

  it("the Inbox names only notices the server sends", () => {
    const notify = read("src/lib/notifications/notify.ts");
    for (const kind of [
      "offer-received",
      "post-comment",
      "new-follower",
      "nearby-match",
    ]) {
      expect(notify).toContain(`kind: "${kind}"`);
    }
  });

  it("a store's page: the line, then the pointer at the Follow already on the page", () => {
    for (const source of [webStore, appStore]) {
      expect(source).toContain("{STORE_NIGHTS_EMPTY}");
      expect(source).toContain("storeNightsEmptyHint(");
      /* Follow is drawn before the nights, so "above" is true, and
         the empty state adds no second Follow of its own. */
      const follow = source.indexOf("<FollowStoreButton");
      const empty = source.indexOf("{STORE_NIGHTS_EMPTY}");
      expect(follow).toBeGreaterThan(-1);
      expect(follow).toBeLessThan(empty);
      expect(source.match(/<FollowStoreButton/g)).toHaveLength(1);
    }
  });
});

describe("the app's three screens: pull to refresh and tap targets", () => {
  const screens = {
    search: read("mobile/src/screens/search.tsx"),
    inbox: read("mobile/src/screens/inbox.tsx"),
    store: read("mobile/src/screens/store-profile.tsx"),
  };

  it("each has a standard RefreshControl in the accent, with the refresh tick", () => {
    for (const [name, source] of Object.entries(screens)) {
      expect(source, name).toMatch(
        /import \{[^}]*RefreshControl[^}]*\} from "react-native";/,
      );
      expect(source, name).toContain("tintColor={colors.accent}");
      expect(source, name).toContain("onRefresh={() => void refresh()}");
      expect(source, name).toContain("refreshTick();");
    }
  });

  it("Search refreshes the results and never the field", () => {
    const refresh = screens.search.slice(
      screens.search.indexOf("const refresh = async () => {"),
      screens.search.indexOf("const type = (text: string) => {"),
    );
    expect(refresh).toContain("readQuery(query)");
    expect(refresh).toContain("await ask(trimmed, onlyPlayers, ++latest.current);");
    expect(refresh).not.toContain("setQuery(");
    expect(refresh).not.toContain("setFound(null)");
  });

  it("the Inbox and the store page re-run the loader they open with", () => {
    for (const source of [screens.inbox, screens.store]) {
      expect(source).toContain("void load(() => live);");
      expect(source).toContain("await load(() => true);");
    }
  });

  it("the Inbox's 40pt face reaches a 44pt target", () => {
    expect(screens.inbox).toMatch(
      /onPress=\{\(\) => openProfile\(actor\.playerId\)\}\s*hitSlop=\{2\}/,
    );
    expect(screens.inbox).toContain("size={40}");
  });
});

describe("a player with no binders is told what one is for", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("says the same two lines wherever your own binders are listed", () => {
    for (const file of [
      "src/components/binder/binder-list.tsx",
      "mobile/src/screens/binders.tsx",
      "mobile/src/screens/profile.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("{BINDERS_EMPTY}");
      expect(source).toContain("{BINDERS_EMPTY_HINT}");
    }
  });

  it("only on your own list: somebody else's empty list stays one line", () => {
    expect(read("src/components/binder/binder-list.tsx")).toContain(
      "if (yours && binders.length === 0) {",
    );
    expect(read("mobile/src/screens/binders.tsx")).toContain("No binders to open.");
  });
});
