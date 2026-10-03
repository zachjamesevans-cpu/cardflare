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
 * The profile tabs round, both platforms: the sections slide in place,
 * like Instagram's profile.
 *
 * The founder, with a recording of Instagram's profile: "Take note of
 * how instagram looks with this and make the UI closer to this. The
 * goal is to just have a sliding animation between them that's click
 * and doesn't go into a full screen animation / loading screen so you
 * can still access these buttons."
 *
 * So: the header and the highlights stay put; under them a strip of
 * icon tabs with a thin underline that slides to the one tapped; under
 * the strip a pane that slides sideways when a tab is tapped or the
 * pane is swiped; the strip stays on screen; nothing navigates,
 * nothing loads. Read off the source, because parity is the same six
 * tabs in the same order with the same words, the same default, and
 * the same motion on the website and in the app.
 */

const web = {
  /* The strip and the tab data it draws from, which the server pages read. */
  tabs:
    read("src/components/players/profile-tabs.tsx") +
    read("src/lib/players/profile-tabs.ts"),
  ownProfile: read("src/app/profile/page.tsx"),
  playerProfile: read("src/app/p/[playerId]/page.tsx"),
  flares: read("src/components/players/profile-flares.tsx"),
  ownHunts: read("src/app/profile/hunts/page.tsx"),
  playerHunts: read("src/app/p/[playerId]/hunts/page.tsx"),
  ownBinders: read("src/app/profile/binders/page.tsx"),
  playerBinders: read("src/app/p/[playerId]/binders/page.tsx"),
  iconRow: read("src/components/players/profile-icon-row.tsx"),
};

const app = {
  tabs: read("mobile/src/profile-tabs.tsx"),
  ownProfile: read("mobile/src/screens/profile.tsx"),
  playerProfile: read("mobile/src/screens/player-profile.tsx"),
  flares: read("mobile/src/profile-flares.tsx"),
  stack: read("mobile/App.tsx"),
};

const platforms = [
  ["web", web],
  ["app", app],
] as const;

/** The first index of each marker, in the order given; -1 when missing. */
const order = (source: string, markers: (string | RegExp)[]) =>
  markers.map((marker) =>
    typeof marker === "string" ? source.indexOf(marker) : source.search(marker),
  );

const inOrder = (source: string, markers: (string | RegExp)[], name: string) => {
  const at = order(source, markers);
  for (const [i, index] of at.entries()) {
    expect(index, `${name}: ${String(markers[i])}`).toBeGreaterThan(-1);
  }
  expect(
    [...at].sort((a, b) => a - b),
    `${name}: the order`,
  ).toEqual(at);
};

describe("the strip: six tabs for the owner, four for anyone else, Flares first", () => {
  it("names the six in the same order with the same words on both platforms", () => {
    for (const [name, source] of platforms) {
      expect(source.tabs.length, `${name}: the strip exists`).toBeGreaterThan(0);
      inOrder(
        source.tabs,
        ['"Flares"', '"Hunts"', '"Binders"', '"Showcase"', '"Trades"', '"Embers"'],
        name,
      );
      inOrder(
        source.tabs,
        ['"flares"', '"hunts"', '"binders"', '"showcase"', '"trades"', '"embers"'],
        name,
      );
    }
  });

  it("draws the same icon for each tab on both platforms", () => {
    inOrder(
      web.tabs,
      [
        "icon: Flame",
        "icon: Crosshair",
        "icon: BookOpen",
        "icon: Sparkles",
        "icon: ArrowLeftRight",
        "icon: Store",
      ],
      "web",
    );
    inOrder(
      app.tabs,
      [
        '"flame-outline"',
        '"locate-outline"',
        '"book-outline"',
        '"sparkles-outline"',
        '"swap-horizontal-outline"',
        '"storefront-outline"',
      ],
      "app",
    );
  });

  it("gives the owner all six and a visitor the first four", () => {
    expect(web.tabs).toMatch(
      /const OWN: ProfileTab\[\] = \[\s*"flares",\s*"hunts",\s*"binders",\s*"showcase",\s*"trades",\s*"embers",?\s*\];/,
    );
    expect(web.tabs).toMatch(
      /const THEIRS: ProfileTab\[\] = \[\s*"flares",\s*"hunts",\s*"binders",\s*"showcase",?\s*\];/,
    );
    expect(web.tabs).toContain("return yours ? OWN : THEIRS;");
    expect(app.tabs).toMatch(
      /\[\s*"flares",\s*"hunts",\s*"binders",\s*"showcase",\s*"trades",\s*"embers",?\s*\]/,
    );
    expect(app.tabs).toMatch(
      /\[\s*"flares",\s*"hunts",\s*"binders",\s*"showcase",?\s*\]/,
    );
    /* The app's screens hand the strip the panes they own; the two
       lists say which. */
    expect(app.ownProfile).toMatch(/OWN_TABS|"trades"/);
    expect(app.playerProfile).not.toContain('"trades"');
    expect(app.playerProfile).not.toContain('"embers"');
  });

  it("opens on Flares", () => {
    expect(web.tabs).toContain(
      'export const DEFAULT_PROFILE_TAB: ProfileTab = "flares";',
    );
    expect(app.tabs).toMatch(/DEFAULT(_PROFILE)?_TAB: ProfileTab = "flares"/);
  });

  it("is 44px tall, icon only, with the label for a screen reader alone", () => {
    expect(web.tabs).toContain('role="tablist"');
    expect(web.tabs).toContain('role="tab"');
    expect(web.tabs).toContain("aria-selected={on}");
    expect(web.tabs).toContain("aria-label={TABS[tab].label}");
    expect(web.tabs).toContain("h-11");
    expect(web.tabs).toContain('<Icon className="size-5" aria-hidden="true" />');
    /* No visible label under the icon: Instagram's strip has none. */
    expect(web.tabs).not.toContain("text-[11px]");
    expect(web.tabs).not.toContain("{TABS[tab].label}</");
    expect(app.tabs).toContain('accessibilityRole="tab"');
    expect(app.tabs).toContain("accessibilityLabel=");
    expect(app.tabs).toMatch(/STRIP(_HEIGHT)? = 44\b|height: 44\b/);
    expect(app.tabs).toMatch(/ICON = 20\b|size=\{20\}/);
  });

  it("colours the active icon text-primary and the rest text-muted, under one border line", () => {
    expect(web.tabs).toContain('on ? "text-text-primary" : "text-text-muted');
    expect(web.tabs).toContain("border-b border-border");
    expect(app.tabs).toContain("colors.textPrimary");
    expect(app.tabs).toContain("colors.textMuted");
    expect(app.tabs).toContain("colors.border");
  });
});

describe("the underline: one 2px accent line that slides to the tab", () => {
  it("is one element translated under the active tab, 200ms, on both", () => {
    expect(web.tabs).toContain("h-0.5 bg-accent transition-transform duration-200");
    expect(web.tabs).toContain("width: `${100 / tabs.length}%`");
    expect(web.tabs).toContain("transform: `translateX(${index * 100}%)`");
    expect(app.tabs).toContain("withTiming(");
    expect(app.tabs).toContain("translateX");
    expect(app.tabs).toContain("colors.accent");
    expect(app.tabs).toMatch(/height: 2\b/);
  });

  it("follows the finger in the app while the pane is swiped", () => {
    expect(app.tabs).toContain("scrollEventThrottle={16}");
    expect(app.tabs).toMatch(/Animated\.event|onScroll/);
  });
});

describe("the panes: side by side in a track that slides", () => {
  it("slides the track by whole widths with the soft ease, clipped, on the web", () => {
    expect(web.tabs).toContain("transform: `translateX(-${index * 100}%)`");
    expect(web.tabs).toContain('transition: "transform 240ms var(--ease-out-soft)"');
    expect(web.tabs).toContain("overflow-hidden");
    expect(web.tabs).toContain('className="w-full shrink-0 pt-4"');
  });

  it("is as tall as the open pane, measured, and follows it", () => {
    expect(web.tabs).toContain("new ResizeObserver(measure)");
    expect(web.tabs).toContain("track.style.height = `${pane.offsetHeight}px`");
    expect(web.tabs).toContain("transition-[height] duration-200");
    expect(app.tabs).toContain("onLayout");
    expect(app.tabs).toContain("withTiming(");
    expect(app.tabs).toMatch(/SLIDE_MS = 200\b|duration: 200\b/);
  });

  it("hides the panes that are not open from assistive tech and the tab order", () => {
    expect(web.tabs).toContain("aria-hidden={!on}");
    expect(web.tabs).toContain("inert={!on}");
    expect(web.tabs).toContain('role="tabpanel"');
  });

  it("turns the page on a sideways drag over 40px and ignores a vertical one", () => {
    expect(web.tabs).toContain("const SWIPE_PX = 40;");
    expect(web.tabs).toContain("onPointerDown={onPointerDown}");
    expect(web.tabs).toContain("onPointerMove={onPointerMove}");
    expect(web.tabs).toContain(
      "Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)",
    );
    expect(web.tabs).toContain("touch-pan-y");
    /* A drag along the showcase shelf scrolls the shelf, not the page. */
    expect(web.tabs).toContain("insideSidewaysScroller(event.target, track)");
    /* The app pages a horizontal ScrollView inside the profile's scroll. */
    expect(app.tabs).toContain("pagingEnabled");
    expect(app.tabs).toContain("horizontal");
    expect(app.tabs).toContain("onMomentumScrollEnd");
  });
});

describe("nothing navigates from the strip", () => {
  it("has no link, no router and no screen in the web strip, only the address", () => {
    expect(web.tabs).toContain('"use client"');
    expect(web.tabs).not.toContain("next/link");
    expect(web.tabs).not.toContain("useRouter");
    expect(web.tabs).not.toContain("router.push");
    expect(web.tabs).toContain("window.history.replaceState(");
    expect(web.tabs).toContain('url.searchParams.set("tab", next)');
    expect(web.tabs).toContain('url.searchParams.delete("tab")');
  });

  it("lands on the tab in the address, own and theirs", () => {
    expect(web.ownProfile).toContain(
      "searchParams: Promise<{ tab?: string | string[] }>",
    );
    expect(web.ownProfile).toContain("initial={profileTabFrom(tab, true)}");
    expect(web.playerProfile).toContain(
      "searchParams: Promise<{ tab?: string | string[] }>",
    );
    expect(web.playerProfile).toContain("initial={profileTabFrom(tab, false)}");
    expect(web.playerProfile).toContain("yours={false}");
    /* A stale value is the default, not an error. */
    expect(web.tabs).toContain(
      "return tabs.includes(key as ProfileTab) ? (key as ProfileTab) : DEFAULT_PROFILE_TAB;",
    );
  });

  it("slides to the tab in the app instead of opening the Hunts or Binders screen", () => {
    for (const profile of [app.ownProfile, app.playerProfile]) {
      expect(profile).toContain("<ProfileTabs");
      expect(profile).not.toMatch(/navigate\("Hunts"/);
      expect(profile).not.toMatch(/navigate\("Binders"/);
      expect(profile).not.toContain("<ProfileIconRow");
    }
    expect(app.tabs).not.toContain("navigation.navigate(");
    /* The screens stay registered for anywhere else that opens them. */
    expect(app.stack).toMatch(/name="Hunts"/);
    expect(app.stack).toMatch(/name="Binders"/);
  });

  it("has no round doors left on either platform", () => {
    for (const profile of [web.ownProfile, web.playerProfile]) {
      expect(profile).not.toContain("<ProfileIconRow");
      expect(profile).not.toContain("profile-icon-row");
    }
    /* Deleted on the web, the strip in its place. */
    expect(web.iconRow).toBe("");
  });
});

describe("the panes' contents, own and theirs", () => {
  it("hands the six panes to the owner's strip and four to a visitor's, keyed by tab", () => {
    inOrder(
      web.ownProfile,
      [
        "flares: (",
        "hunts: (",
        "binders: (",
        "showcase: (",
        "trades: <TradesPane",
        "embers: (",
      ],
      "web own",
    );
    inOrder(
      web.playerProfile,
      ["flares: (", "hunts:", "binders: (", "showcase: ("],
      "web theirs",
    );
    expect(web.playerProfile).not.toContain("trades:");
    expect(web.playerProfile).not.toContain("embers:");
  });

  it("Flares: the grid without its heading, the count as a small line", () => {
    for (const profile of [web.ownProfile, web.playerProfile]) {
      expect(profile).toContain("heading={false}");
    }
    expect(web.flares).toContain("heading = true,");
    expect(web.flares).toContain('flares.length === 1 ? "Flare" : "Flares"');
    expect(web.flares).toContain("No Flares up. Post one from the Flare tab.");
    for (const [name, source] of platforms) {
      expect(source.ownProfile, name).toContain("<ProfileFlares");
      expect(source.playerProfile, name).toContain("<ProfileFlares");
      expect(source.flares, name).toContain("Flares");
    }
  });

  it("Hunts: the panel as the hunts page drew it, no Back link", () => {
    expect(web.ownProfile).toContain("limit={huntLimitFor(profile.tier)}");
    expect(web.playerProfile).toContain("ownerName={profile.displayName}");
    for (const profile of [web.ownProfile, web.playerProfile]) {
      expect(profile).toContain("<HuntsPanel");
      expect(profile).not.toContain("Back to");
    }
    expect(app.ownProfile).toContain("<HuntsPanel");
    expect(app.playerProfile).toContain("<HuntsPanel");
  });

  it("Binders: the rows, with New binder above them for the owner", () => {
    expect(web.ownProfile).toContain('<CreateBinder trigger="button" />');
    expect(web.ownProfile).toContain("<BinderList");
    expect(web.playerProfile).toContain("{yours && (");
    expect(web.playerProfile).toContain("No binders to open.");
    expect(app.ownProfile).toContain("<BinderList");
    expect(app.playerProfile).toContain("<BinderList");
    expect(app.ownProfile).toContain("New binder");
  });

  it("Showcase: the shelf as it was, minus the heading", () => {
    const heading = /[^A-Za-z]Showcase\s*</;
    for (const [name, source] of platforms) {
      for (const profile of [source.ownProfile, source.playerProfile]) {
        expect(profile, name).not.toMatch(heading);
      }
    }
    for (const profile of [web.ownProfile, web.playerProfile]) {
      expect(profile).toContain("<WornBackdrop");
      expect(profile).toContain("<Rail");
    }
    expect(web.ownProfile).toContain('aria-label="What is a showcase?"');
    expect(web.ownProfile).toMatch(/<AddShowcaseForm\s+tile/);
  });

  it("Trades: totals, three recent rows, See all, locked as the card drew it, owner only", () => {
    expect(web.ownProfile).toContain("listTradeHistory(playerId, profile.tier)");
    expect(web.ownProfile).toContain(
      "<TradeHistoryTotalsRow totals={history.totals} />",
    );
    expect(web.ownProfile).toContain("history.trades.slice(0, 3)");
    expect(web.ownProfile).toContain(
      "<TradeHistoryRow key={trade.id} trade={trade} compact />",
    );
    expect(web.ownProfile).toContain("<LockedRows count={3} />");
    expect(web.ownProfile).toContain(
      "<TradeHistoryWall count={history.totals.trades} />",
    );
    expect(web.ownProfile).toContain('href="/profile/trades"');
    expect(web.ownProfile).toMatch(/>\s*See all\s*</);
    expect(web.playerProfile).not.toContain("listTradeHistory");
    expect(web.playerProfile).not.toContain("/profile/trades");
    expect(app.ownProfile).toContain("See all");
    expect(app.ownProfile).toContain('"TradeHistory"');
    expect(app.playerProfile).not.toContain('"TradeHistory"');
  });

  it("Embers: the earned tile and the store door as they were, owner only", () => {
    expect(web.ownProfile).toContain("Earned, all time");
    expect(web.ownProfile).toContain("{profile.embersEarned.toLocaleString()}");
    expect(web.ownProfile).toContain('href="/profile/store"');
    expect(web.ownProfile).toMatch(/>\s*Embers store\s*</);
    expect(web.ownProfile).toContain("{profile.embersBalance.toLocaleString()}");
    expect(web.ownProfile).toContain("to spend");
    expect(web.playerProfile).not.toContain("Earned, all time");
    expect(web.playerProfile).not.toContain("/profile/store");
    expect(web.playerProfile).not.toContain("to spend");
    expect(app.ownProfile).toContain("Earned, all time");
    expect(app.ownProfile).toContain("to spend");
    expect(app.ownProfile).toContain('"Store"');
    expect(app.playerProfile).not.toContain("Earned, all time");
    expect(app.playerProfile).not.toContain('"Store"');
  });
});

describe("the cog is back top right", () => {
  it("sits beside Share and the wand on the own profile, and is not a tab", () => {
    inOrder(
      web.ownProfile,
      ["<ShareProfileButton", "<Wand2", '<Settings className="size-5"'],
      "web own",
    );
    expect(web.ownProfile).toContain('href="/profile/settings"');
    expect(web.ownProfile).toContain('title="Settings"');
    expect(web.tabs).not.toContain('"Settings"');
    expect(web.tabs).not.toContain("/profile/settings");
    expect(app.ownProfile).toContain('"settings-outline"');
    expect(app.ownProfile).toContain('"Settings"');
    expect(app.tabs).not.toContain('"settings-outline"');
    expect(app.playerProfile).not.toContain('"settings-outline"');
  });
});

describe("the old pages redirect to the tab", () => {
  it("sends /profile/hunts and /profile/binders to the profile with the tab set", () => {
    expect(web.ownHunts).toContain('redirect("/profile?tab=hunts")');
    expect(web.ownBinders).toContain('redirect("/profile?tab=binders")');
    expect(web.playerHunts).toContain("redirect(`/p/${playerId}?tab=hunts`)");
    expect(web.playerBinders).toContain("redirect(`/p/${playerId}?tab=binders`)");
    for (const page of [
      web.ownHunts,
      web.ownBinders,
      web.playerHunts,
      web.playerBinders,
    ]) {
      expect(page).not.toContain("<HuntsPanel");
      expect(page).not.toContain("<BinderList");
      expect(page).not.toContain("Back to");
    }
  });
});

describe("copy and colour rules", () => {
  it("has no em dashes and no literal hex in the new pieces", () => {
    for (const [name, source] of [
      ["web tabs", web.tabs],
      ["web own profile", web.ownProfile],
      ["web player profile", web.playerProfile],
      ["web flares", web.flares],
      ["web own hunts", web.ownHunts],
      ["web own binders", web.ownBinders],
      ["web player hunts", web.playerHunts],
      ["web player binders", web.playerBinders],
      ["app tabs", app.tabs],
    ] as const) {
      expect(source, name).not.toContain("—");
      expect(source, name).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
  });
});
