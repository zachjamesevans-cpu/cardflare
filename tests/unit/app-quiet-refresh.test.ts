import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASK_AGAIN_MS,
  FIX_MOVED_MILES,
  askedRecently,
  keepSame,
  milesBetween,
  movedEnough,
  sameData,
  sameShallow,
} from "../../mobile/src/quiet-refresh";

/*
 * The app's rules for when a refresh is worth it (mobile/src/
 * quiet-refresh.ts), and the screens that are meant to keep them. The
 * rules are pure and walked directly; the screens are read as text,
 * because nothing here can render one.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

describe("a fresher fix is worth asking again only when the phone has moved", () => {
  const home = { latitude: 40.7128, longitude: -74.006 };

  it("measures miles the way a map does", () => {
    /* One degree of latitude is about 69 miles anywhere. */
    const north = { latitude: home.latitude + 1, longitude: home.longitude };
    expect(milesBetween(home, north)).toBeGreaterThan(68.5);
    expect(milesBetween(home, north)).toBeLessThan(69.5);
    expect(milesBetween(home, home)).toBe(0);
  });

  it("does not ask again for a fix under a mile away", () => {
    /* About 0.35 miles north. */
    const near = { latitude: home.latitude + 0.005, longitude: home.longitude };
    expect(movedEnough(home, near)).toBe(false);
    expect(movedEnough(home, home)).toBe(false);
  });

  it("asks again once the phone is more than a mile from where it said", () => {
    /* About 2 miles north. */
    const far = { latitude: home.latitude + 0.03, longitude: home.longitude };
    expect(movedEnough(home, far)).toBe(true);
    expect(FIX_MOVED_MILES).toBe(1);
  });

  it("asks when the first request went out with no place at all", () => {
    expect(movedEnough(null, home)).toBe(true);
  });

  it("never asks on the strength of no fix, or a broken one", () => {
    expect(movedEnough(home, null)).toBe(false);
    expect(movedEnough(null, null)).toBe(false);
    expect(movedEnough(home, { latitude: Number.NaN, longitude: 0 })).toBe(false);
  });
});

describe("two answers that say the same thing are the same answer", () => {
  it("compares all the way down", () => {
    const a = { room: { name: "Friday", players: [{ id: "1", cards: [1, 2] }] } };
    const b = { room: { name: "Friday", players: [{ id: "1", cards: [1, 2] }] } };
    expect(sameData(a, b)).toBe(true);
    b.room.players[0].cards.push(3);
    expect(sameData(a, b)).toBe(false);
  });

  it("tells a list from an object, and null from either", () => {
    expect(sameData([], {})).toBe(false);
    expect(sameData(null, {})).toBe(false);
    expect(sameData(null, null)).toBe(true);
    expect(sameData(0, null)).toBe(false);
    expect(sameData("1", 1)).toBe(false);
  });

  it("minds the order of a list and not the order of keys", () => {
    expect(sameData([1, 2], [2, 1])).toBe(false);
    expect(sameData({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it("reads an undefined key as an absent one, as disk does", () => {
    const fresh = { trade: undefined, name: "Mia" };
    const fromDisk = JSON.parse(JSON.stringify(fresh));
    expect(sameData(fresh, fromDisk)).toBe(true);
    expect(sameData(fromDisk, fresh)).toBe(true);
    expect(sameData({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameData({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });
});

describe("a re-read keeps every object that still says the same thing", () => {
  const keyOf = (entry: unknown) =>
    (entry as { postId?: string } | null)?.postId ?? null;

  it("hands back the old list itself when nothing changed", () => {
    const before = [
      { postId: "a", likes: 1 },
      { postId: "b", likes: 2 },
    ];
    const after = JSON.parse(JSON.stringify(before));
    expect(keepSame(before, after, keyOf)).toBe(before);
  });

  it("keeps the rows that did not change and replaces the one that did", () => {
    const before = [
      { postId: "a", likes: 1 },
      { postId: "b", likes: 2 },
    ];
    const after = [
      { postId: "a", likes: 1 },
      { postId: "b", likes: 3 },
    ];
    const kept = keepSame(before, after, keyOf);
    expect(kept).not.toBe(before);
    expect(kept).toEqual(after);
    expect(kept[0]).toBe(before[0]);
    expect(kept[1]).not.toBe(before[1]);
  });

  it("keeps a row's object when a new one arrives above it", () => {
    const before = [
      { postId: "a", cards: [{ id: 1 }] },
      { postId: "b", cards: [] },
    ];
    const after = [
      { postId: "new", cards: [] },
      { postId: "a", cards: [{ id: 1 }] },
      { postId: "b", cards: [] },
    ];
    const kept = keepSame(before, after, keyOf);
    expect(kept).toEqual(after);
    expect(kept[1]).toBe(before[0]);
    expect(kept[2]).toBe(before[1]);
  });

  it("keeps the unchanged parts of a row that changed", () => {
    const before = [{ postId: "a", likes: 1, cards: [{ id: 1 }, { id: 2 }] }];
    const after = [{ postId: "a", likes: 2, cards: [{ id: 1 }, { id: 2 }] }];
    const kept = keepSame(before, after, keyOf);
    expect(kept[0]).not.toBe(before[0]);
    expect(kept[0].cards).toBe(before[0].cards);
  });

  it("always says exactly what the newer answer says", () => {
    const before = [{ postId: "a", gone: true, n: 1 }, { kind: "start" }, 3, null];
    const after = [{ kind: "start" }, { postId: "a", n: 1 }, null, [1, { x: 1 }]];
    expect(keepSame(before as unknown[], after as unknown[], keyOf)).toEqual(after);
    expect(keepSame<unknown>({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
    expect(keepSame<unknown>([1], { 0: 1 })).toEqual({ 0: 1 });
    expect(keepSame<unknown>(null, [1])).toEqual([1]);
  });
});

describe("a row rebuilt from the same values is the same row", () => {
  it("compares one level, by identity", () => {
    const card = { entryId: "e", pocket: 3, name: "Pikachu", note: null };
    expect(sameShallow(card, { ...card })).toBe(true);
    expect(sameShallow(card, { ...card, pocket: 4 })).toBe(false);
    expect(sameShallow(card, { ...card, extra: 1 })).toBe(false);
    expect(sameShallow(undefined, undefined)).toBe(true);
    expect(sameShallow(card, undefined)).toBe(false);
    expect(sameShallow({ a: {} }, { a: {} })).toBe(false);
  });
});

describe("a tab change does not ask the same thing twice in a few seconds", () => {
  it("counts an ask inside the window as recent", () => {
    expect(askedRecently(1_000, 1_000 + ASK_AGAIN_MS - 1)).toBe(true);
    expect(askedRecently(1_000, 1_000 + ASK_AGAIN_MS)).toBe(false);
  });

  it("never throttles the first ask, or a clock that went backwards", () => {
    expect(askedRecently(0, 10)).toBe(false);
    expect(askedRecently(5_000, 4_000)).toBe(false);
  });
});

describe("the screens keep the rules", () => {
  const home = read("mobile/src/screens/home.tsx");
  const location = read("mobile/src/location.ts");
  const room = read("mobile/src/screens/room.tsx");
  const thread = read("mobile/src/screens/thread.tsx");
  const unread = read("mobile/src/unread-messages.ts");
  const app = read("mobile/App.tsx");

  it("the Feed asks with the last known place and never waits on a fresh fix with one", () => {
    expect(location).toContain("export async function lastKnownCoords()");
    expect(location).toContain("maxAge: LAST_KNOWN_MAX_AGE_MS");
    expect(location).toContain("const LAST_KNOWN_MAX_AGE_MS = 24 * 60 * 60 * 1000;");
    expect(home).toContain("const known = await lastKnownCoords();");
    expect(home).toContain("if (known.coords || !known.permitted) return known;");
    /* The old shape, a feed request behind a fresh fix, is gone. */
    expect(home).not.toContain("getFeed(await silentCoords())");
    expect(home).not.toContain("const coords = await silentCoords();");
    /* A fresher fix asks again only when the phone has moved. */
    expect(home).toContain("!movedEnough(place.coords, fix)");
  });

  it("the tap that asks where you are still takes only a fresh fix", () => {
    const tap = location.slice(
      location.indexOf("export async function requestCoords()"),
      location.indexOf("const LAST_KNOWN_MAX_AGE_MS"),
    );
    expect(tap).toContain("maxAge: 120_000");
    expect(tap).toContain("Location.getCurrentPositionAsync");
  });

  it("the Feed asks for the account and the feed together", () => {
    const load = home.slice(home.indexOf("const meRequest = getMe();"));
    expect(load.length).toBeGreaterThan(0);
    const together = load.slice(0, load.indexOf("const fresh = await meRequest;"));
    expect(together).toContain(
      "const feedRequest = placeRequest.then((place) => getFeed(place.coords));",
    );
  });

  it("a Feed post is a memoised row handed stable doors", () => {
    expect(home).toContain("const FeedPost = memo(function FeedPost({");
    expect(home).toContain("doors={doors}");
    expect(home).toContain("const doors = useMemo<PostDoors>(");
    expect(home).toContain("keepSame(current, fresh.items, feedRowKey)");
  });

  it("the room polls only while it is in front, and draws only what changed", () => {
    expect(room).toContain('if (AppState.currentState === "active") start();');
    expect(room).toContain(
      "setState((shown) => (sameData(shown, fresh) ? shown : fresh));",
    );
    expect(room).toContain(
      "setTrades((shown) => (sameData(shown, read) ? shown : read));",
    );
    /* Back from another screen: one read, then the timer. */
    expect(room).toContain("if (away.current) {");
    /* The old timer, running for as long as the screen was mounted. */
    expect(room).not.toContain(
      "const timer = setInterval(() => void refresh({ poll: true }), pollMs);",
    );
  });

  it("a quiet conversation poll with nothing new draws nothing and writes nothing", () => {
    expect(thread).toContain("if (!quiet || !sameData(applied.current, thread)) {");
    expect(thread).toContain("if (!sameData(stored.current, thread)) {");
  });

  it("the Messages dot asks for a number, falls back to the list, and is throttled", () => {
    expect(unread).toContain("await getUnreadMessageCount()");
    expect(read("mobile/src/api.ts")).toContain(
      'call<{ unread: number }>("GET", "/api/v1/local/threads/unread")',
    );
    /* A 401 is still "signed out"; anything else counts the list. */
    expect(unread).toContain(
      "if (caught instanceof ApiError && caught.status === 401) throw caught;",
    );
    expect(unread).toContain("const { threads } = await listLocalThreads();");
    expect(unread).toContain(
      "if (options?.throttle && askedRecently(askedAt, Date.now())) return;",
    );
    expect(app).toContain(
      'if (route.name !== "Messages") void refreshUnreadMessages({ throttle: true });',
    );
  });
});

describe("a loop nobody can see is not run", () => {
  const awake = read("mobile/src/awake.ts");

  it("asks the screen and the app, and never throws outside a navigator", () => {
    expect(awake).toContain("useContext(NavigationContext)");
    expect(awake).not.toContain("useIsFocused(");
    expect(awake).toContain('next !== "background"');
  });

  it("the foil, the ring and the aura all run through it", () => {
    const foil = read("mobile/src/foil.tsx");
    const worn = read("mobile/src/cosmetic-worn.tsx");
    expect(foil).toContain("useLoop(phase, awake, duration, easeInOut, bounce);");
    expect(foil).toContain("if (!sweepAwake) {");
    expect(worn).toContain(
      "useLoop(turn, awake, art.spinSeconds === null ? null : art.spinSeconds * 1000);",
    );
    expect(worn).toContain("useLoop(clock, awake, art.seconds * 1000);");
  });
});

describe("a screen that opened on a spinner paints its last copy first", () => {
  it("each keeps its copy by id, under the signed-in player", () => {
    const binder = read("mobile/src/screens/binder.tsx");
    const binders = read("mobile/src/screens/binders.tsx");
    const card = read("mobile/src/screens/card.tsx");
    expect(binder).toContain('readCache<Binder>("binder", viewer, cacheKey)');
    expect(binder).toContain('writeCache("binder", viewer, fresh, cacheKey)');
    expect(binders).toContain(
      'readCache<BinderSummary[]>("binders", viewer, cacheKey)',
    );
    expect(binders).toContain('writeCache("binders", viewer, fresh, cacheKey)');
    expect(card).toContain('readCache<CardPage>("card", viewer, cardId)');
    expect(card).toContain('writeCache("card", viewer, fresh, cardId)');
    for (const screen of [binder, binders, card]) {
      expect(screen).toContain("const viewer = await cachedPlayerId();");
      /* Only when nothing is on screen: a paint never replaces a read. */
      expect(screen).toContain("(current) => current ?? cached");
    }
  });

  it("sign-out still sweeps every cached copy", () => {
    const api = read("mobile/src/api.ts");
    const locals = api.slice(api.indexOf("async function forgetAccountLocals()"));
    expect(locals.slice(0, locals.indexOf("\n}\n"))).toContain("await clearCache();");
  });

  it("no card is moved on the strength of a cached binder", () => {
    expect(read("mobile/src/screens/binder.tsx")).toContain(
      "enabled: yours && confirmed === cacheKey,",
    );
  });
});

describe("the tokens are read from the keychain once", () => {
  const api = read("mobile/src/api.ts");

  it("every write of a token changes the copy in memory with it", () => {
    const sets = api.match(/SecureStore\.setItemAsync\(ACCESS_KEY, /g) ?? [];
    expect(sets).toHaveLength(1);
    expect(api).toContain(
      "await SecureStore.setItemAsync(ACCESS_KEY, access);\n  /* In memory the moment it is in the keychain",
    );
    expect(api).toContain("rememberAccess(access);");

    const sessionSets =
      api.match(
        /await SecureStore\.setItemAsync\(SESSION_KEY, result\.sessionToken\);/g,
      ) ?? [];
    const sessionKept = api.match(/rememberSession\(result\.sessionToken\);/g) ?? [];
    expect(sessionSets.length).toBeGreaterThan(0);
    expect(sessionKept).toHaveLength(sessionSets.length);
  });

  it("every delete of a token drops the copy, before and after", () => {
    expect(api).toContain(
      "rememberAccess(null);\n  await SecureStore.deleteItemAsync(ACCESS_KEY).catch(() => {});\n  rememberAccess(null);",
    );
    expect(api).toContain(
      "rememberSession(null);\n  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});\n  rememberSession(null);",
    );
    expect(api.match(/SecureStore\.deleteItemAsync\(ACCESS_KEY\)/g)).toHaveLength(1);
    expect(api.match(/SecureStore\.deleteItemAsync\(SESSION_KEY\)/g)).toHaveLength(1);
  });

  it("only a token is remembered, never its absence", () => {
    expect(api).toContain("if (read && writes === accessWrites) accessMemo = read;");
    expect(api).toContain("if (read && writes === sessionWrites) sessionMemo = read;");
  });
});
