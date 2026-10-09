import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RECENT_LIMIT,
  readRecent,
  recentKey,
  withRecent,
  writeRecent,
} from "@/components/feed/recent-searches";

/**
 * Round 16 on the website: the tab bar, the Feed's bell, search, and
 * the chevron that replaced "Back to ..." on a player's pages.
 *
 * The founder's list: Feed · Nights · [+] · Messages · Profile, the +
 * raised and opening Post a Flare; notifications in a bell at the
 * Feed's top right with a dot when unread; search in tabs with Top
 * ordered by how well things match, "See all", "@" for players, and
 * the recent searches; back buttons a plain chevron.
 */

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

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
  tabs: read("src/components/players/player-tabs.tsx"),
  tabBar: read("src/components/players/player-tab-bar.tsx"),
  feedPage: read("src/app/feed/page.tsx"),
  searchPanel: read("src/components/feed/search-panel.tsx"),
  bell: read("src/components/feed/notification-bell.tsx"),
  shell: read("src/components/players/tab-page-shell.tsx"),
  search: read("src/components/feed/everything-search.tsx"),
  recent: read("src/components/feed/recent-searches.ts"),
  backLink: read("src/components/ui/back-link.tsx"),
  inbox: read("src/app/inbox/page.tsx"),
  local: read("src/app/local/page.tsx"),
};

describe("the tab bar", () => {
  it("is Feed, Nights, Messages, Search, Profile, with no Inbox and no raised +", () => {
    /* The founder: "Tabs should be in this order left to right. Feed -
       nights - messages - search - profile". */
    inOrder(web.tabs, [
      'label: "Feed"',
      'label: "Rooms"',
      'label: "Messages"',
      'label: "Search"',
      'label: "Profile"',
    ]);
    expect(web.tabs).toContain('{ href: "/search", label: "Search", icon: Search }');
    expect(web.tabs).not.toContain('label: "Inbox"');
    expect(web.tabs).not.toContain('href: "/inbox"');
    /* The founder: "Not a fan of the big plus." */
    expect(web.tabs).not.toContain('"raised" in tab');
    expect(web.tabs).not.toContain('href: "/flare"');
    /* Local's switch is untouched. */
    expect(web.tabs).toMatch(/LOCAL_ENABLED\s*\?\s*\[\{ href: "\/local"/);
  });

  it("posts a Flare from the + at the Feed's top left, a player's", () => {
    expect(web.feedPage).toContain('href="/flare"');
    expect(web.feedPage).toContain('aria-label="Post a Flare"');
    expect(web.feedPage).toContain(
      '<Plus className={HEADER_ICON} aria-hidden="true" />',
    );
    expect(web.shell).toContain("{leading}");
  });

  it("puts Messages on the conversations list, with the unread dot fed by messages", () => {
    expect(web.tabs).toContain(
      '{ href: "/local", label: "Messages", icon: MessageCircle }',
    );
    expect(web.tabs).toContain('const dot = tab.label === "Messages" && unread > 0;');
    expect(web.tabs).toContain("size-2.5 rounded-full bg-accent ring-2 ring-surface");
    expect(web.tabs).toContain('{dot && ", unread"}');
    expect(web.tabBar).toContain("unreadMessages(playerId)");
    expect(web.tabBar).not.toContain("unreadCount(");
  });

  it("keeps the Feed lit on the notifications and Messages lit in a conversation", () => {
    expect(web.tabs).toContain('label === "Feed" && pathname === "/inbox"');
    expect(web.tabs).toContain('!LOCAL_ENABLED && pathname.startsWith("/local")');
  });
});

describe("the Feed's bell", () => {
  it("sits alone at the top right and opens the notifications", () => {
    expect(web.bell).toContain('href="/inbox"');
    expect(web.bell).toContain("<Bell");
    expect(web.bell).toContain(
      'unread > 0 ? "Notifications, unread" : "Notifications"',
    );
    expect(web.bell).toContain("rounded-full bg-accent ring-2 ring-canvas");
    expect(web.bell).toContain("className={HEADER_BUTTON}");
    /* Alone: search is a tab now, not an icon beside it. */
    expect(web.feedPage).not.toContain("FeedSearch");
  });

  it("is a player's, with the dot from the notifications' unread count", () => {
    expect(web.feedPage).toContain("unreadCount(playerId)");
    expect(web.feedPage).toMatch(
      /playerId \? \(\s*<NotificationBell unread=\{unread\} \/>/,
    );
    expect(web.feedPage).toContain("<Shell playerId={playerId} unread={unread}>");
    /* One button each side, so the mark stays centred. */
    expect(web.feedPage).not.toContain("trailingCount=");
    expect(web.shell).toContain('trailingCount === 2 ? "h-11 w-[5.75rem]" : "size-11"');
  });

  it("leaves the notifications page a way back to the Feed, and Messages none to the Inbox", () => {
    expect(web.inbox).toContain('<BackLink href="/feed" />');
    expect(web.local).not.toContain('href="/inbox"');
  });
});

describe("search", () => {
  it("has the four tabs, from the shared list", () => {
    expect(web.search).toContain("SEARCH_TABS.map(");
    expect(web.search).toContain('role="tablist"');
    expect(web.search).toContain('role="tab"');
    expect(web.search).toContain("aria-selected={on}");
  });

  it("ranks every list and orders Top by the best player and store", () => {
    expect(web.search).toContain("rankBy(cards, cardScore(text))");
    expect(web.search).toContain("rankBy(players, playerScore(text))");
    expect(web.search).toContain("rankBy(stores, storeScore(text))");
    expect(web.search).toContain(
      "matchScore(text, [person.displayName, person.handle])",
    );
    expect(web.search).toContain("matchScore(text, [store.name])");
    expect(web.search).toContain(
      "matchScore(text, [card.exactName, card.canonicalCardNumber])",
    );
    expect(web.search).toContain("topOrder(");
    expect(web.search).toContain("limit: TOP_LIMITS[kind]");
  });

  it("holds Top to a few of each with See all, which opens the tab", () => {
    expect(web.search).toContain(
      "rows.length > limit ? () => setTab(kind) : undefined",
    );
    expect(web.search).toMatch(/>\s*See all\s*</);
  });

  it("reads '@' as players only, asking for nothing else", () => {
    expect(web.search).toContain("readQuery(value)");
    expect(web.search).toContain(
      'const shown: SearchTab = playersOnly ? "players" : tab;',
    );
    expect(web.search).toContain(
      "onlyPlayers ? none<SearchCard>() : quietly(findCards(text))",
    );
    expect(web.search).toContain(
      "onlyPlayers ? none<FoundStore>() : quietly(searchStoresAction(text))",
    );
  });

  it("shows the recent searches before typing, with a Clear", () => {
    inOrder(web.search, ["{!typing && recent.length > 0 && (", ">", "Recent", "Clear"]);
    expect(web.search).toContain("onClick={clearRecent}");
    expect(web.search).toContain("onClick={() => search(item)}");
    /* Remembered when a result is opened or the field submitted. */
    expect(web.search.match(/onClick=\{opened\}/g)).toHaveLength(3);
    expect(web.search).toContain("remember(query)");
    /* Per account. */
    expect(web.search).toContain("recentKey(account)");
    expect(web.searchPanel).toContain("<EverythingSearch account={account} />");
  });

  it("touches storage only inside try/catch", () => {
    expect(web.recent.match(/window\.localStorage/g)).toHaveLength(3);
    expect(web.recent.match(/try \{/g)).toHaveLength(2);
  });
});

describe("the recent searches list", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps the last eight, newest first, never twice", () => {
    expect(RECENT_LIMIT).toBe(8);
    let list: string[] = [];
    for (let n = 1; n <= 10; n++) list = withRecent(list, `query ${n}`);
    expect(list).toHaveLength(8);
    expect(list[0]).toBe("query 10");
    expect(list.at(-1)).toBe("query 3");

    expect(withRecent(["Luffy", "Zoro"], "  zoro ")).toEqual(["zoro", "Luffy"]);
    expect(withRecent(["Luffy"], "   ")).toEqual(["Luffy"]);
  });

  it("is one list per account", () => {
    expect(recentKey("p1")).not.toBe(recentKey("p2"));
    expect(recentKey(null)).toBe("cardflare:recent-searches:guest");
  });

  it("reads back what it wrote, and Clear removes it", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
      },
    });
    const key = recentKey("p1");
    writeRecent(key, ["@luffy", "Nami"]);
    expect(readRecent(key)).toEqual(["@luffy", "Nami"]);
    writeRecent(key, []);
    expect(store.has(key)).toBe(false);
    expect(readRecent(key)).toEqual([]);

    store.set(key, "not json");
    expect(readRecent(key)).toEqual([]);
    store.set(key, JSON.stringify([1, "Nami", ""]));
    expect(readRecent(key)).toEqual(["Nami"]);
  });

  it("is empty, not broken, where storage throws", () => {
    const boom = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("window", {
      localStorage: { getItem: boom, setItem: boom, removeItem: boom },
    });
    expect(readRecent(recentKey("p1"))).toEqual([]);
    expect(() => writeRecent(recentKey("p1"), ["Nami"])).not.toThrow();
    expect(() => writeRecent(recentKey("p1"), [])).not.toThrow();
  });
});

describe("back is a plain chevron on a player's pages", () => {
  const PAGES = [
    "src/app/profile/edit/page.tsx",
    "src/app/profile/settings/page.tsx",
    "src/app/profile/store/page.tsx",
    "src/app/profile/binders/[binderId]/page.tsx",
    "src/app/profile/customize/page.tsx",
    "src/app/profile/password/page.tsx",
    "src/app/cards/[cardId]/page.tsx",
    "src/app/hunts/[huntId]/page.tsx",
    "src/app/e/[code]/matches/page.tsx",
    "src/app/e/[code]/p/[playerId]/page.tsx",
    "src/app/tournaments/page.tsx",
    "src/app/inbox/page.tsx",
  ];

  it("is one component: a chevron, labelled Back, with no words", () => {
    expect(web.backLink).toContain('aria-label="Back"');
    expect(web.backLink).toContain("<ChevronLeft");
    const link = web.backLink.slice(
      web.backLink.indexOf("<Link"),
      web.backLink.indexOf("</Link>"),
    );
    /* Nothing between the tags but the icon. */
    expect(link.replace(/<ChevronLeft[^>]*\/>/, "")).not.toMatch(/>\s*[A-Za-z]/);
  });

  it("replaces every Back to ... link on those pages", () => {
    for (const path of PAGES) {
      const source = read(path);
      expect(source, path).toContain("<BackLink");
      expect(source, path).not.toMatch(/Back to (your|the Feed|\$\{)/);
      expect(source, path).not.toContain("<ArrowLeft");
    }
  });

  it("leaves the store and admin consoles' own links alone", () => {
    expect(read("src/app/profile/settings/page.tsx")).toContain(
      'Back to {viewer.kind === "admin" ? "the admin console" : "your store"}',
    );
  });
});
