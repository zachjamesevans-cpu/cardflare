import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import * as web from "@/lib/events/store-day-rules";

import * as app from "../../mobile/src/store-day-copy";

/**
 * Store days, in the app: the Rooms tab, the plan-a-visit sheet, the
 * store page's button, the Feed's "Find your store", the You're-here
 * banner and Find the store I'm in, and no "here now" left on a
 * player's screen. The founder (2026-10-09): "I miss the simplicity of
 * just getting into a room." The store is the room and the day is the
 * time. The website's half is store-days-web.test.ts; the server's is
 * store-days.test.ts. Nobody here has a renderer: what a phone draws
 * is the visual pass.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Comments out, so a pin on code cannot be satisfied by a remark. */
const spoken = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const src = {
  root: spoken(read("mobile/App.tsx")),
  api: read("mobile/src/api.ts"),
  copy: read("mobile/src/store-day-copy.ts"),
  sheet: spoken(read("mobile/src/plan-visit-sheet.tsx")),
  here: spoken(read("mobile/src/youre-here.tsx")),
  rooms: spoken(read("mobile/src/screens/nights.tsx")),
  store: spoken(read("mobile/src/screens/store-profile.tsx")),
  home: spoken(read("mobile/src/screens/home.tsx")),
  header: spoken(read("mobile/src/night-header.tsx")),
  room: spoken(read("mobile/src/screens/room.tsx")),
  people: spoken(read("mobile/src/room-people.tsx")),
};

/** The text of one function, from its declaration to the next top-level one. */
function body(source: string, start: string): string {
  const from = source.indexOf(start);
  expect(from, `missing ${start}`).toBeGreaterThan(-1);
  const next = source
    .slice(from + start.length)
    .search(/\n(export )?(async )?function /);
  return next === -1
    ? source.slice(from)
    : source.slice(from, from + start.length + next);
}

function expectInOrder(source: string, markers: string[], label: string) {
  const positions = markers.map((marker) => source.indexOf(marker));
  markers.forEach((marker, index) => {
    expect(positions[index], `${label} is missing ${marker}`).toBeGreaterThan(-1);
  });
  expect(
    [...positions].sort((a, b) => a - b),
    `${label} draws out of order`,
  ).toEqual(positions);
}

describe("the words, mirrored", () => {
  /* Server-only settings, not words: the hours a store without any is
     open, which the app never computes. */
  const SERVER_ONLY = new Set(["DEFAULT_OPEN", "DEFAULT_CLOSE"]);

  it("has every string the website exports, word for word", () => {
    const strings = Object.entries(web).filter(
      ([name, value]) => typeof value === "string" && !SERVER_ONLY.has(name),
    );
    expect(strings.length).toBeGreaterThan(15);
    for (const [name, value] of strings) {
      expect((app as Record<string, unknown>)[name], name).toBe(value);
    }
    expect(app.PLAN_REFUSALS).toEqual(web.PLAN_REFUSALS);
  });

  it("words a day, a room and a visit the same way", () => {
    const today = "2026-10-14";
    for (const days of [0, 1, 2, 3, 6, 18, 80]) {
      const date = web.addDays(today, days);
      expect(app.addDays(today, days)).toBe(date);
      expect(app.dayChipLabel(date, today)).toBe(web.dayChipLabel(date, today));
      expect(app.dayInWords(date, today)).toBe(web.dayInWords(date, today));
      expect(app.goingToStoreLine("Mox", date, today)).toBe(
        web.goingToStoreLine("Mox", date, today),
      );
    }
    expect(app.addDays("2026-12-31", 1)).toBe("2027-01-01");
    for (const going of [0, 1, 6]) {
      expect(app.dayRoomLine("Friday Night Trades", going)).toBe(
        web.dayRoomLine("Friday Night Trades", going),
      );
    }
    expect(app.youreAtLine("Mox")).toBe(web.youreAtLine("Mox"));
  });

  it("imports nothing, so a web test can read it as it is", () => {
    expect(src.copy).not.toMatch(/^import /m);
  });

  it("turns a refusal code into its words, and anything else into unavailable", () => {
    expect(app.planRefusal("no-open-trading")).toBe(
      web.PLAN_REFUSALS["no-open-trading"],
    );
    expect(app.planRefusal("http-500")).toBe(web.PLAN_REFUSALS.unavailable);
  });
});

describe("the API client", () => {
  it("speaks the store days routes", () => {
    expect(src.api).toContain("export interface StoreDays {");
    expect(src.api).toContain("export interface StoreDay {");
    expect(src.api).toContain("export interface StoreHere {");
    expect(src.api).toContain("export interface StorePicker {");
    expect(src.api).toContain("export interface PickerStore {");
    expect(src.api).toContain("/api/v1/stores/picker?lat=");
    expect(src.api).toContain("/api/v1/stores/${encodeURIComponent(storeId)}/days");
    expect(src.api).toContain("/api/v1/stores/here?lat=${latitude}&lng=${longitude}");
    expect(src.api).toMatch(
      /export async function planVisit\(\s*storeId: string,\s*date: string,?\s*\)/,
    );
    expect(src.api).toContain('kind?: "scheduled" | "day" | "walk_in";');
  });

  it("keeps the room identity a plan mints, as Going does", () => {
    const plan = body(src.api, "export async function planVisit(");
    expect(plan).toContain(
      "SecureStore.setItemAsync(SESSION_KEY, result.sessionToken)",
    );
  });

  it("still carries hereNow from the server, drawn nowhere", () => {
    expect(src.api).toContain("hereNow?: number;");
  });
});

describe("the Rooms tab", () => {
  it("is labelled Rooms with a storefront, on the Nights route", () => {
    expect(src.root).toContain('name="Nights"');
    expect(src.root).toMatch(
      /options=\{\{\s*title: "Rooms",\s*tabBarLabel: "Rooms",\s*headerRight: \(\) => <NightsCodeButton \/>,\s*\}\}/,
    );
    expect(src.root).toContain(
      'Nights: { idle: "storefront-outline", focused: "storefront" }',
    );
    expect(src.root).not.toContain('tabBarLabel: "Nights"');
    expect(src.root).not.toContain("calendar-outline");
  });

  it("opens on the banner, then Plan a visit, then the strip", () => {
    expectInOrder(
      src.rooms,
      [
        "<YoureHereBanner />",
        "{PLAN_VISIT_HINT}",
        "label={PLAN_VISIT} onPress={() => openPlanVisit()}",
        "<NightTabs",
      ],
      "the Rooms screen",
    );
  });

  it("offers Find the store I'm in only while location was never given", () => {
    expect(src.rooms).toContain("{located === false ? <FindMyStore /> : null}");
    expect(src.rooms).toContain("haveLocationPermission()");
  });
});

describe("the plan-a-visit sheet", () => {
  it("is one host at the root, opened by name", () => {
    expect(src.root).toContain("<PlanVisitHost />");
    expect(src.sheet).toContain("export function openPlanVisit(");
  });

  it("picks a store first: search, then followed, then near", () => {
    const step = body(src.sheet, "function StoreStep(");
    expectInOrder(
      step,
      [
        "<Title>{PICK_A_STORE}</Title>",
        "placeholder={SEARCH_STORES}",
        "STORES_YOU_FOLLOW",
        "STORES_NEAR_YOU",
      ],
      "step 1",
    );
    expect(step).toContain("searchStores(trimmed)");
    expect(step).toContain("SEARCH_DEBOUNCE_MS");
    expect(src.sheet).toContain("return miles !== null ? `${miles} mi` : city;");
  });

  it("sends the position to the picker only when it is already ours", () => {
    const step = body(src.sheet, "function StoreStep(");
    expect(step).toContain("silentCoords()");
    expect(src.sheet).not.toContain("requestCoords");
    expect(src.sheet).not.toContain("requestForegroundPermissionsAsync");
  });

  it("then the day: the store's name, back, the chips, the room and one Going", () => {
    const step = body(src.sheet, "function DayStep(");
    expectInOrder(
      step,
      [
        'name="chevron-back"',
        "<Title>{name}</Title>",
        "{WHICH_DAY}",
        "week.days.map(",
        "{CLOSED_THAT_DAY}",
        "dayRoomLine(room.name, room.goingCount)",
        'PLAN_REFUSALS["no-open-trading"]',
        "label={GOING} onPress={toSignIn}",
        "label={YOURE_GOING}",
        "onPress={going}",
      ],
      "step 2",
    );
    expect(step).toContain("disabled={d.closed ||");
    expect(step).toContain(
      "const noOpenTrading = Boolean(week && !week.openTrading && day && !room);",
    );
    expect(step).toContain("disabled={!day || noOpenTrading || signedIn === null}");
  });

  it("goes, says so, opens the room the scanner's way and offers the binders", () => {
    const go = body(src.sheet, "function DayStep(");
    expectInOrder(
      go,
      [
        "await planVisit(store.storeId, day.date)",
        "markFeedStale()",
        "goingToStoreLine(name, day.date, week.today)",
        "await rememberRoom(answer.code)",
        "await rememberRoomGame(null)",
        "openRoom(navigation)",
        "offerBringingAfterGoing(answer.eventId)",
      ],
      "Going",
    );
    expect(go).toContain("setError(planRefusal(");
    expect(go).toContain('navigation.navigate("SignIn")');
  });
});

describe("the store's page", () => {
  it("puts Plan a visit after Follow, straight to this store's days", () => {
    expectInOrder(
      src.store,
      [
        "<FollowStoreButton",
        "label={PLAN_VISIT}",
        "openPlanVisit({ storeId: store.storeId, storeName: store.name })",
        "Following puts this store",
      ],
      "the store page",
    );
  });
});

describe("the Feed", () => {
  it('asks "Where do you play?" in the website\'s words, and Find your store opens the sheet', () => {
    const webFeed = read("src/components/feed/feed-items.tsx");
    const store = (source: string) =>
      source.slice(source.indexOf("store: {"), source.indexOf("deck: {"));
    const line = (source: string, key: string) =>
      new RegExp(`${key}: "([^"]*)"`).exec(store(source))?.[1];
    for (const key of ["headline", "body", "label"]) {
      expect(line(src.home, key), key).toBe(line(webFeed, key));
    }
    expect(line(src.home, "label")).toBe("Find your store");
    expect(src.home).toMatch(/item\.topic === "store"\s*\?\s*openPlanVisit\(\)/);
  });

  it("wears the You're-here banner at the top, above the filters", () => {
    expectInOrder(src.home, ["<YoureHereBanner />", "<FeedFilterTabs"], "the Feed");
  });
});

describe("you're here", () => {
  it("checks as the app comes to the front, and never asks for location there", () => {
    expect(src.root).toMatch(
      /AppState\.addEventListener\("change", \(next\) => \{[\s\S]*?void checkStoreHere\(\);/,
    );
    const check = body(src.here, "export async function checkStoreHere(");
    expect(check).toContain("positionIfGranted()");
    expect(check).toContain("CHECK_EVERY_MS");
    expect(src.here).toContain("const CHECK_EVERY_MS = 10 * 60 * 1000;");

    const position = body(src.here, "async function positionIfGranted(");
    expect(position).toContain("getForegroundPermissionsAsync()");
    expect(position).toContain("if (!granted) return null;");
    expect(position).toContain("Location.Accuracy.Balanced");
    expect(position).toContain("FIX_TIMEOUT_MS");
    /* No dialog anywhere on this path: the one request lives in the
       button that says what it is for. */
    for (const part of [check, position]) {
      expect(part).not.toContain("requestForegroundPermissionsAsync");
      expect(part).not.toContain("requestCoords");
    }
    expect(src.here).not.toContain("requestForegroundPermissionsAsync");
    expect(body(src.here, "export function FindMyStore(")).toContain("requestCoords()");
  });

  it("never joins by itself: the one door is Join the room's tap", () => {
    expect(src.here.match(/rememberRoom\(/g)).toHaveLength(1);
    expect(src.here.match(/openRoom\(/g)).toHaveLength(1);
    expect(src.here).not.toContain("joinRoom");
    const banner = body(src.here, "export function YoureHereBanner(");
    const handler = banner.slice(
      banner.indexOf("const joinTheRoom = async () => {"),
      banner.indexOf("const notNow = () => {"),
    );
    expect(handler).toContain("await rememberRoom(store.code);");
    expect(handler).toContain("await rememberRoomGame(null);");
    expect(handler).toContain("openRoom(navigation);");
    expect(banner).toContain("onPress={() => void joinTheRoom()}");
    expect(banner).toContain("accessibilityLabel={JOIN_THE_ROOM}");
    expect(banner).toContain("{youreAtLine(store.storeName)}");
    expect(body(src.here, "export async function checkStoreHere(")).not.toContain(
      "rememberRoom",
    );
  });

  it("waves a store off for the day, and stays quiet inside that store's room", () => {
    expect(body(src.here, "export function YoureHereBanner(")).toContain(
      "void dismissForToday(store.storeId);",
    );
    const offer = body(src.here, "async function offerFor(");
    expect(offer).toContain("=== store.code) return null;");
    expect(offer).toContain("if (await dismissedToday(store.storeId)) return null;");
  });

  it("says why when it finds nothing, or cannot look", () => {
    const find = body(src.here, "export function FindMyStore(");
    expect(find).toContain("setNote(LOCATION_DENIED);");
    expect(find).toContain("setNote(NO_STORE_HERE);");
    expect(find).toContain("{FIND_MY_STORE}");
  });
});

describe("no here now on a player's screen", () => {
  it("is gone from the Night header, the room and the people sheet", () => {
    expect(src.header).not.toContain("hereNow");
    expect(src.room).not.toContain("hereNow");
    expect(src.rooms).not.toContain("hereNow");
    expect(src.people).not.toContain("here now");
    expect(src.people).toContain("`${people.length} coming`");
  });
});
