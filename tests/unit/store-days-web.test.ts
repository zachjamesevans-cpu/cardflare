import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Store days, on the website: the Rooms tab, the plan-a-visit sheet,
 * the store page's button, Find the store I'm in, the console's pin and
 * its day rooms, and no "here now" left on a player's screen. The
 * founder (2026-10-09): "I miss the simplicity of just getting into a
 * room." The store is the room and the day is the time. The app's half
 * is store-days-app.test.ts; the server's is store-days.test.ts.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Comments out, so a pin on code cannot be satisfied by a remark. */
const spoken = (source: string) =>
  source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const web = {
  tabs: spoken(read("src/components/players/player-tabs.tsx")),
  list: spoken(read("src/components/nights/night-list.tsx")),
  page: spoken(read("src/app/nights/page.tsx")),
  card: spoken(read("src/components/nights/plan-visit-card.tsx")),
  sheet: spoken(read("src/components/nights/plan-visit-sheet.tsx")),
  find: spoken(read("src/components/nights/find-my-store.tsx")),
  store: spoken(read("src/app/s/[storeId]/page.tsx")),
  feed: spoken(read("src/components/feed/feed-items.tsx")),
  location: spoken(read("src/components/stores/store-location-button.tsx")),
  settings: spoken(read("src/app/store/settings/page.tsx")),
  eventList: spoken(read("src/components/events/event-list.tsx")),
  eventsPage: spoken(read("src/app/store/events/page.tsx")),
  eventPage: spoken(read("src/app/store/events/[id]/page.tsx")),
};

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

describe("the Rooms tab", () => {
  it("is labelled Rooms with a storefront, still at /nights", () => {
    expect(web.tabs).toContain('{ href: "/nights", label: "Rooms", icon: Store }');
    expect(web.tabs).toMatch(/import \{[^}]*\bStore\b[^}]*\} from "lucide-react"/);
    expect(web.tabs).not.toContain('label: "Nights"');
    expect(web.tabs).not.toContain("CalendarDays");
  });

  it("is headed Rooms, with Plan a visit at the top above the strip", () => {
    expect(web.page).toContain('title: "Rooms"');
    expect(web.page).toContain('<TabPageShell title="Rooms">');
    expect(web.list).toContain(">Rooms</h2>");
    expectInOrder(
      web.list,
      [
        ">Rooms</h2>",
        "<CodeSheet />",
        "<PlanVisitCard signedIn={signedIn} />",
        "<NightsTabs",
      ],
      "the Rooms page",
    );
  });

  it("draws the card as the hint and the one button, with Find the store I'm in", () => {
    expect(web.card).toContain("{PLAN_VISIT_HINT}");
    expect(web.card).toContain("label={PLAN_VISIT}");
    expect(web.card).toContain("<PlanVisitButton");
    expect(web.card).toContain("<FindMyStore />");
  });
});

describe("the plan-a-visit sheet", () => {
  it("is a client sheet, portalled, that starts at Pick a store", () => {
    expect(web.sheet).toContain('"use client"');
    expect(web.sheet).toContain("createPortal(");
    expect(web.sheet).toContain("<Sheet");
    expect(web.sheet).toContain("chosen ? chosen.name || WHICH_DAY : PICK_A_STORE");
  });

  it("searches stores with a debounced field, and otherwise lists followed then near", () => {
    expect(web.sheet).toContain("placeholder={SEARCH_STORES}");
    expect(web.sheet).toContain("searchStoresAction(query)");
    expect(web.sheet).toContain("setTimeout(");
    expect(web.sheet).toContain("SEARCH_DEBOUNCE_MS");
    expect(web.sheet).toContain("storePickerAction()");
    expectInOrder(
      web.sheet,
      ["title={STORES_YOU_FOLLOW}", "title={STORES_NEAR_YOU}"],
      "the store step",
    );
    /* Miles when known, the city otherwise. */
    expect(web.sheet).toContain(
      "store.miles !== null ? `${store.miles} mi` : (store.city ??",
    );
  });

  it("opens straight at the day step for a store it is handed", () => {
    expect(web.sheet).toContain('storeId ? { storeId, name: "" } : null');
    expect(web.sheet).toContain("<DayStep");
  });

  it("draws Which day? as seven chips, closed days disabled, with a back chevron", () => {
    expect(web.sheet).toContain("storeDaysAction(storeId)");
    expect(web.sheet).toContain("{WHICH_DAY}");
    expect(web.sheet).toContain("<ChevronLeft");
    expect(web.sheet).toContain("aria-label={PICK_A_STORE}");
    expect(web.sheet).toContain("onClick={onBack}");
    expect(web.sheet).toContain("days.days.map((entry)");
    expect(web.sheet).toContain("{entry.label}");
    expect(web.sheet).toContain("disabled={entry.closed || pending}");
    expect(web.sheet).toContain("{CLOSED_THAT_DAY}");
  });

  it("says the day's room, or why there cannot be one, under the chips", () => {
    expect(web.sheet).toContain("dayRoomLine(room.name, room.goingCount)");
    expect(web.sheet).toContain(
      "const noRoom = days !== null && !days.openTrading && room === null;",
    );
    expect(web.sheet).toContain('{PLAN_REFUSALS["no-open-trading"]}');
  });

  it("has one Going button, You're going and disabled once you are", () => {
    expect(web.sheet).toContain("{room?.youGoing ? YOURE_GOING : GOING}");
    expect(web.sheet).toMatch(/disabled=\{[^}]*noRoom[^}]*Boolean\(room\?\.youGoing\)/);
  });

  it("is the sign-in door signed out, as the Going chip is", () => {
    expect(web.sheet).toContain(
      'href={`/login?next=${encodeURIComponent("/nights")}`}',
    );
  });

  it("plans the visit, says where you are going, offers binders on the chip's rule, then opens the room", () => {
    expect(web.sheet).toContain("planVisitAction(days.storeId, day.date)");
    expect(web.sheet).toContain(
      "goingToStoreLine(days.storeName, day.date, days.today)",
    );
    expect(web.sheet).toContain("nightBinderStateAction(result.eventId)");
    expect(web.sheet).toContain("binders.state.editable &&");
    expect(web.sheet).toContain("binders.state.binders.length > 0 &&");
    expect(web.sheet).toContain("binders.state.selectedCount === 0");
    expect(web.sheet).toContain("<BringingPicker");
    expect(web.sheet).toContain("result.code ? `/e/${result.code}`");
    expect(web.sheet).toContain("router.push(");
    /* A refusal is said in the sheet. */
    expect(web.sheet).toContain("setError(result.message)");
  });
});

describe("the store page", () => {
  it("has Plan a visit beside Follow, opening the sheet at this store", () => {
    expectInOrder(
      web.store,
      ["<FollowStoreButton", "<PlanVisitButton"],
      "the store page",
    );
    expect(web.store).toContain("label={PLAN_VISIT}");
    expect(web.store).toContain("storeId={store.storeId}");
  });
});

describe("the Feed's store starter", () => {
  it("is Find your store, opening the sheet at its first step", () => {
    expect(web.feed).toContain('label: "Find your store"');
    expect(web.feed).not.toContain("Enter a store code");
    expect(web.feed).toContain("<PlanVisitButton label={starter.label}");
    expect(web.feed).toContain(
      "Join your store's room once and it saves itself here, with its next board and who is looking for what. The code is on the counter.",
    );
  });
});

describe("Find the store I'm in, on the website", () => {
  it("asks the browser only on the tap", () => {
    expect(web.find).toContain("{FIND_MY_STORE}");
    expect(web.find).toContain("onClick={find}");
    const calls =
      web.find.split("navigator.geolocation.getCurrentPosition(").length - 1;
    expect(calls).toBe(1);
    const handler = web.find.slice(
      web.find.indexOf("const find = () => {"),
      web.find.indexOf("if (found) {"),
    );
    expect(handler).toContain("navigator.geolocation.getCurrentPosition(");
    expect(web.find).not.toContain("useEffect");
  });

  it("shows the banner when a store is found, and never joins on its own", () => {
    expect(web.find).toContain(
      "storeHereAction(position.coords.latitude, position.coords.longitude)",
    );
    expect(web.find).toContain("youreAtLine(found.storeName)");
    expect(web.find).toContain("href={`/e/${found.code}`}");
    expect(web.find).toContain("{JOIN_THE_ROOM}");
    expect(web.find).toContain("{NOT_NOW}");
    expect(web.find).not.toContain("router");
    expect(web.find).not.toContain("location.assign");
  });

  it("says why when nothing is found or location is off", () => {
    expect(web.find).toContain("setLine(NO_STORE_HERE)");
    expect(web.find).toContain("setLine(LOCATION_DENIED)");
  });
});

describe("the store console", () => {
  it("sets the store's pin from the browser, on a tap, with high accuracy", () => {
    expect(web.location).toContain('"use client"');
    expect(web.location).toContain("saveStoreLocationAction(");
    expect(web.location).toContain("enableHighAccuracy: true");
    expect(web.location).toContain("{SET_STORE_LOCATION}");
    expect(web.location).toContain("{STORE_LOCATION_HINT}");
    expect(web.location).toContain("STORE_LOCATION_SAVED");
    expect(web.location).toContain(">Location</p>");
    expect(web.settings).toContain("<StoreLocationButton storeId={store.id} />");
  });

  it("labels a day room as opened by players", () => {
    expect(web.eventList).toContain(
      'export const DAY_EVENT_LABEL = "Open trading, opened by players";',
    );
    expect(web.eventList).toContain('event.kind === "day" && (');
    expect(web.eventPage).toContain("{DAY_EVENT_LABEL}");
  });

  it("gives a day room no status, edit or cancel controls", () => {
    const status = web.eventPage.slice(
      web.eventPage.indexOf('event.kind === "day" ? ('),
      web.eventPage.indexOf("<EventStatusControls"),
    );
    expect(status).toContain("{DAY_EVENT_LABEL}");
    expect(status).not.toContain("<WalkInSession");
    expect(web.eventPage).toContain('const scheduled = event.kind === "scheduled";');
    expect(web.eventPage).toContain(
      "const editable = scheduled && !event.cancelled_at;",
    );
    /* A closed day room folds into history, as a walk-in session does. */
    expect(web.eventsPage).toContain(
      '(event.kind === "walk_in" || event.kind === "day") && event.status === "closed"',
    );
  });
});

describe("no here now on a player's screen", () => {
  /* The console (src/components/events/room-roster.tsx, event-list.tsx,
     walk-in-session.tsx) and the admin page keep the count: a store
     wants to know who is in the building. */
  const consoleOnly = new Set([
    "src/components/events/room-roster.tsx",
    "src/components/events/event-list.tsx",
    "src/components/events/walk-in-session.tsx",
  ]);

  function walk(dir: string): string[] {
    return readdirSync(join(root, dir)).flatMap((name) => {
      const path = `${dir}/${name}`;
      if (statSync(join(root, path)).isDirectory()) return walk(path);
      return path.endsWith(".tsx") ? [path] : [];
    });
  }

  it("draws no hereNow and no 'here now' count in player components", () => {
    const files = [
      ...walk("src/components").filter((path) => !consoleOnly.has(path)),
      "src/app/e/[code]/page.tsx",
      "src/app/nights/page.tsx",
      "src/app/s/[storeId]/page.tsx",
    ];
    for (const file of files) {
      const source = spoken(read(file));
      expect(source, file).not.toContain("hereNow");
      expect(source, file).not.toMatch(/\}\s*here now/);
    }
  });

  it("still says how many are going on the Night card and header", () => {
    expect(read("src/components/nights/night-card.tsx")).toContain(
      "playersLine(night.goingCount)",
    );
    expect(read("src/components/events/night-header.tsx")).toContain(
      "playersLine(line.goingCount)",
    );
  });
});
