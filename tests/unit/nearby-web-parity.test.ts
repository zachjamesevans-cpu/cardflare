import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { planNearby } from "@/lib/feed/nearby-plan";

/**
 * Nearby, the second tab, on the website.
 *
 * The app moved first (2026-10-11): Nearby took the Rooms slot in the
 * bar and the Feed became Following alone. The founder: "i really dont
 * think the nights tab will be used as much, and this nearby feature,
 * if it works, could be extremely helpful for people looking for
 * cards." The standing rule is that the two platforms match: same
 * sections, same wording, same buttons, same order. This holds the
 * website's /nearby to the app's Nearby tab.
 *
 * Read off the source, because that is what a parity rule is about.
 * Whether either one looks right is the visual pass.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const web = {
  page: read("src/app/nearby/page.tsx"),
  reach: read("src/app/nearby/nearby-reach.tsx"),
  actions: read("src/app/nearby/actions.ts"),
  plan: read("src/lib/feed/nearby-plan.ts"),
  dock: read("src/components/players/player-tabs.tsx"),
  feed: read("src/app/feed/page.tsx"),
  list: read("src/components/feed/feed-list.tsx"),
  codeSheet: read("src/components/nights/code-sheet.tsx"),
};

const app = {
  root: read("mobile/App.tsx"),
  home: read("mobile/src/screens/home.tsx"),
  parts: read("mobile/src/nearby-parts.tsx"),
  plan: read("mobile/src/nearby-plan.ts"),
  nights: read("mobile/src/screens/nights.tsx"),
};

/** Each marker present, and in this order. */
function inOrder(source: string, markers: string[], label: string) {
  const positions = markers.map((marker) => source.indexOf(marker));
  markers.forEach((marker, index) => {
    expect(positions[index], `${label} is missing ${marker}`).toBeGreaterThan(-1);
  });
  expect(
    [...positions].sort((a, b) => a - b),
    `${label} draws out of order`,
  ).toEqual(positions);
}

const item = (fields: Record<string, unknown>) => fields as { kind: string };

describe("the bar: Feed, Nearby, Messages, Search, Profile on both", () => {
  it("draws the same five in the same order", () => {
    inOrder(
      web.dock,
      [
        'label: "Feed"',
        'label: "Nearby"',
        'label: "Messages"',
        'label: "Search"',
        'label: "Profile"',
      ],
      "the website's bar",
    );
    inOrder(
      app.root.slice(app.root.indexOf("<Tab.Navigator")),
      [
        'tabBarLabel: "Feed"',
        'tabBarLabel: "Nearby"',
        'tabBarLabel: "Messages"',
        'tabBarLabel: "Search"',
        'name="Profile"',
      ],
      "the app's bar",
    );
  });

  it("gives Nearby a location pin on both, at its own address on the website", () => {
    expect(web.dock).toContain('{ href: "/nearby", label: "Nearby", icon: MapPin }');
    expect(app.root).toContain(
      'Nearby: { idle: "location-outline", focused: "location" },',
    );
  });

  it("keeps Local ahead of Nearby when it is switched on, as the app does", () => {
    expect(web.dock.indexOf('label: "Local"')).toBeLessThan(
      web.dock.indexOf('label: "Nearby"'),
    );
    expect(web.dock).toMatch(/LOCAL_ENABLED\s*\?\s*\[\{ href: "\/local"/);
    expect(app.root.indexOf('<Tab.Screen name="Local"')).toBeLessThan(
      app.root.indexOf('name="Nearby"'),
    );
  });

  it("has no Rooms slot on either, and the Rooms page still answers at /nights", () => {
    expect(web.dock).not.toContain('label: "Rooms"');
    expect(web.dock).not.toContain('href: "/nights"');
    /* The app hides the route's button; the screen stays. */
    expect(app.root).toContain(
      'route.name === "Flare" || route.name === "Nights" ? null : <TabButton {...props} />',
    );
    expect(read("src/app/nights/page.tsx")).toContain(
      "export default async function NightsPage",
    );
  });
});

describe("Nearby's header", () => {
  it("has the way into a store's room at the top left, where the Feed has its +", () => {
    expect(app.home).toContain(
      'left={tab === "nearby" ? <NightsCodeButton /> : undefined}',
    );
    expect(web.page).toContain("leading={<CodeSheet />}");
    /* The same words on the icon, and a door that is real: the code
       form at /room. */
    expect(app.nights).toContain("label={SCAN_OR_CODE}");
    expect(web.codeSheet).toContain("aria-label={SCAN_OR_CODE}");
    expect(web.codeSheet).toContain('href="/room"');
    /* The + stays the Feed's. */
    expect(web.page).not.toContain('href="/flare"\n              aria-label');
    expect(web.feed).toContain('aria-label="Post a Flare"');
  });

  it("keeps the bell on the right, as the Feed does", () => {
    expect(web.page).toMatch(
      /playerId \? \(\s*<NotificationBell unread=\{unread\} \/>/,
    );
  });
});

describe("Nearby's sections, in the app's order with the app's words", () => {
  it("draws the reach, the ask, the trades, the empty room, then the explainer", () => {
    inOrder(
      web.page,
      [
        "<LiveRoomBanner",
        "<NearbyHeader miles={miles} />",
        "{plan.ask && (",
        "<FeedList shown={plan.items} view={view} headings />",
        "{!plan.ask && plan.posts === 0 && (",
        "{items.length < 3 && <HowItWorks />}",
      ],
      "the website's Nearby",
    );
    inOrder(
      app.home.slice(app.home.indexOf("const tabContent = ")),
      [
        "<NearbyHeader",
        "{plan?.ask ? (",
        "{shown.map((item, index) => {",
        'tab === "nearby" && plan && !plan.ask && plan.posts === 0 && (',
        "feed.length < 3 && (",
      ],
      "the app's Nearby",
    );
  });

  it("says where it is looking and how far, and changes it from the same four", () => {
    for (const source of [web.reach, app.parts]) {
      expect(source).toContain("Near you");
      expect(source).toContain('"· Distance"');
      expect(source).toContain("Change distance");
    }
    expect(app.parts).toContain('{miles ? `· ${miles} mi` : "· Distance"}');
    expect(web.reach).toContain('{shown ? `· ${shown} mi` : "· Distance"}');
    expect(app.parts).toContain("label: `Within ${each} miles`,");
    expect(web.reach).toContain("return `Within ${miles} miles`;");
    expect(app.parts).toContain("const RADII = [10, 25, 50, 100] as const;");
    expect(read("src/lib/local/shared.ts")).toContain(
      "export const LOCAL_RADII = [10, 25, 50, 100] as const;",
    );
    expect(web.reach).toContain("LOCAL_RADII.map(");
  });

  it("asks for a place first, in Nearby's own words", () => {
    for (const source of [web.page, app.home]) {
      expect(source).toContain("See Flares near you");
      expect(source).toContain("Show Flares near me");
    }
    expect(app.home).toContain(
      'intro="Tell us roughly where you are and we’ll show what players around you are looking for and trading."',
    );
    expect(web.page.replace(/\s+/g, " ")).toContain(
      "Tell us roughly where you are and we&rsquo;ll show what players around you are looking for and trading.",
    );
    expect(web.page).toContain(
      '<PostalAsk submitLabel="Show Flares near me" save={saveNearbyPostalAction} />',
    );
  });

  it("says an empty room is empty, with Post a Flare and a wider look", () => {
    const line =
      "miles has a Flare up right now. Post one and players around you will see it here.`}";
    expect(app.home).toContain("{`Nobody within ${nearbyMiles ?? 50} " + line);
    expect(web.page).toContain("{`Nobody within ${miles ?? 50} " + line);
    for (const source of [web.page, app.home]) {
      expect(source).toContain("No Flares near you yet");
    }
    expect(app.home).toContain('label="Post a Flare"');
    expect(web.page).toMatch(/<Link href="\/flare"[^>]*>\s*Post a Flare\s*<\/Link>/);
    expect(app.home).toContain('label="Look within 100 miles"');
    expect(web.reach).toContain("Look within 100 miles");
    expect(app.home).toContain("{(nearbyMiles ?? 50) < 100 ? (");
    expect(web.page).toContain("{(miles ?? 50) < 100 && <LookFurtherButton />}");
  });

  it("carries the first-visit tour, with the app's two stops", () => {
    expect(app.home).toContain(
      '{mode === "nearby" && !guest ? <Tour id="nearby" /> : null}',
    );
    expect(web.page).toContain('<Tour id="nearby" />');
    expect(web.page).toContain('tour="nearby:location"');
    expect(web.list).toContain(
      'data-tour={item.kind === "nearbyMatch" ? "nearby:wanted" : undefined}',
    );
  });
});

describe("what Nearby keeps: a trade room, by the same plan on both", () => {
  /*
   * The founder: "i think the nearby thing should solely be used as a
   * persistent nearby trade room, in a way, before anything else", with
   * store discovery left for "a later build once we have more stores
   * adopted". So neither Nearby lists the stores or the nights.
   */
  it("is one function, word for word", () => {
    const body = (source: string) =>
      source.slice(source.indexOf("export function planNearby"));
    expect(body(web.plan)).toBe(body(app.plan));
    expect(web.page).toContain(
      'planNearby(items.filter((item) => belongsToTab(item, "nearby")))',
    );
  });

  it("shows who wants your cards, then Flares near you", () => {
    const plan = planNearby([
      item({ kind: "hunt", postId: "p1", around: true }),
      item({ kind: "wanted" }),
      item({ kind: "nearbyMatch" }),
      item({ kind: "hunt", postId: "p2", around: true }),
    ]);
    expect(plan.items.map((each) => each.kind)).toEqual([
      "wanted",
      "nearbyMatch",
      "hunt",
      "hunt",
    ]);
    expect(plan.posts).toBe(2);
    expect(plan.ask).toBeNull();
  });

  it("leaves store discovery out, and asks when the server has no location", () => {
    const quiet = planNearby([
      item({ kind: "board", yours: true }),
      item({ kind: "upcoming" }),
      item({ kind: "nearbyStores", stores: [{ storeId: "s" }] }),
      item({ kind: "start", topic: "store" }),
    ]);
    expect(quiet).toEqual({ ask: null, items: [], posts: 0 });

    const lost = planNearby([
      item({ kind: "nearbyStores", stores: [], needsLocation: true }),
    ]);
    expect(lost.ask).not.toBeNull();
    expect(lost.items).toEqual([]);
  });

  it("offers no list of nights from Nearby, as the app does not", () => {
    expect(app.home).not.toContain("All nights");
    expect(web.page).not.toContain('href="/nights"');
    expect(web.reach).not.toContain("/nights");
  });
});

describe("Nearby's writes on the website", () => {
  it("forget the remembered list, so the answer shows without a wait", () => {
    /* The Feed's list is kept for half a minute. A new reach or a new
       ZIP changes what is near you, so both have to drop it. */
    expect(web.actions.startsWith('"use server";')).toBe(true);
    expect(web.actions.match(/forgetFeed\(playerId\);/g)).toHaveLength(2);
    expect(web.actions.match(/revalidatePath\("\/nearby"\);/g)).toHaveLength(2);
  });

  it("re-establish the player and narrow the reach on the server", () => {
    expect(web.actions).toContain("const playerId = await viewerPlayerId();");
    expect(web.actions).toContain("if (!isLocalRadius(radius))");
    expect(web.actions).toContain("await saveLocalRadius(playerId, radius)");
    expect(web.actions).toContain("await savePostalCodeAction(previous, formData)");
  });
});

describe("the old addresses", () => {
  it("send the Nearby filter to the Nearby page and the retired My Flares to the Feed", () => {
    expect(web.feed).toContain('if (tab === "nearby") redirect("/nearby");');
    expect(web.feed).not.toContain('"mine"');
    expect(web.feed).not.toContain("notFound");
  });

  it("light Nearby in a room and at the code door", () => {
    expect(web.dock).toContain(
      'label === "Nearby" && (pathname.startsWith("/e/") || pathname === "/room")',
    );
    /* The inbox stays the Feed's, Messages stays on /local. */
    expect(web.dock).toContain('label === "Feed" && pathname === "/inbox"');
    expect(web.dock).toContain('!LOCAL_ENABLED && pathname.startsWith("/local")');
  });
});
