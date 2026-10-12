import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Wanted near you", the founder's round (2026-10-12):
 *
 *   - "Flares you can answer ... sounds kinda weird verbiage and very
 *     internal to us": it is Wanted near you now.
 *   - "in a big city like portland, it's entirely possible that there
 *     could be 100+ people looking for those cards ... how should we
 *     overcome, and organize this?": grouped by card, a summary on the
 *     Feed, everything on its own screen, and the phone buzzes three
 *     times a day, then once to say there are more.
 *   - "no need for an 'i have this' button on that screen": a message
 *     icon, which opens a draft.
 *   - "if that person who's looking for it removes their flare in the
 *     future ... it needs to be 'live'": gone from the screen, the
 *     Feed, the Inbox and its badge.
 */

type Row = Record<string, unknown>;
const db: Record<string, Row[]> = {};
const pushes: { title: string; to: string }[] = [];
let nextId = 0;

/* An in-memory database that really filters, inserts and deletes. */
function query(table: string) {
  let rows = () => db[table] ?? [];
  let filters: ((row: Row) => boolean)[] = [];
  let mode: "select" | "delete" | "insert" = "select";
  let head = false;
  let inserted: Row | null = null;
  let insertError: unknown = null;
  let limit = Infinity;

  const result = () => {
    const matching = rows().filter((row) => filters.every((keep) => keep(row)));
    if (mode === "delete") {
      db[table] = rows().filter((row) => !matching.includes(row));
      return { data: null, error: null };
    }
    if (mode === "insert") return { data: inserted, error: insertError };
    const data = matching.slice(0, limit);
    return head
      ? { data: null, error: null, count: matching.length }
      : { data, error: null, count: matching.length };
  };

  const builder: Record<string, unknown> = {
    select: (_columns?: string, options?: { head?: boolean }) => {
      head = Boolean(options?.head);
      return builder;
    },
    insert: (row: Row) => {
      mode = "insert";
      const clash = (db[table] ?? []).some(
        (other) => row.dedupe_key && other.dedupe_key === row.dedupe_key,
      );
      if (clash) {
        insertError = { code: "23505" };
      } else {
        inserted = {
          id: `row-${++nextId}`,
          created_at: new Date().toISOString(),
          ...row,
        };
        (db[table] ??= []).push(inserted);
      }
      return builder;
    },
    delete: () => {
      mode = "delete";
      return builder;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return builder;
    },
    neq: (column: string, value: unknown) => {
      filters.push((row) => row[column] !== value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) === value);
      return builder;
    },
    not: (column: string, _op: string, value: unknown) => {
      filters.push((row) => (row[column] ?? null) !== value);
      return builder;
    },
    gte: (column: string, value: string) => {
      filters.push((row) => String(row[column]) >= value);
      return builder;
    },
    or: () => builder,
    order: () => builder,
    limit: (count: number) => {
      limit = count;
      return builder;
    },
    maybeSingle: () => {
      const outcome = result();
      return Promise.resolve({
        data: Array.isArray(outcome.data) ? (outcome.data[0] ?? null) : outcome.data,
        error: outcome.error,
      });
    },
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  void rows;
  rows = () => db[table] ?? [];
  filters = [];
  return builder;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: query }),
}));
vi.mock("@/lib/players/safety", () => ({
  blockedBetween: async () => false,
  blockedSet: async () => new Set(),
}));
vi.mock("@/lib/notifications/push-prefs-server", () => ({
  pushPrefsFor: async () => ({
    offers: true,
    messages: true,
    nights: true,
    social: true,
  }),
}));
vi.mock("@/lib/players/equips", () => ({ avatarWearFor: async () => new Map() }));
const opened: string[] = [];
vi.mock("@/lib/local/threads", () => ({
  openWantThread: async (id: string) => {
    opened.push(`want:${id}`);
    return { ok: true, threadId: "thread-1" };
  },
  openFlareThread: async (id: string) => {
    opened.push(`flare:${id}`);
    return { ok: true, threadId: "thread-1" };
  },
}));

const { groupByCard, distinctPeople, wantedCountLine, PUSHES_PER_DAY, DIGEST_TITLE } =
  await import("@/lib/nearby/shared");
const { pruneStaleNearbyNotices, askIsLive } = await import("@/lib/nearby/live");
const { answerNearby } = await import("@/lib/nearby/answer");
const { notifyNearbyMatch } = await import("@/lib/notifications/notify");
const { listInbox, unreadCount } = await import("@/lib/notifications/inbox");

const WANT = "11111111-1111-4111-8111-111111111111";
const FLARE = "22222222-2222-4222-8222-222222222222";
const FOUND = "33333333-3333-4333-8333-333333333333";
const HAVE = "44444444-4444-4444-8444-444444444444";

function notice(ask: string, unread = true): Row {
  return {
    id: `n-${ask}`,
    player_id: "holder",
    kind: "nearby-match",
    title: "Someone wants your card",
    body: null,
    url: "/feed/wanted",
    dedupe_key: `nearby:${ask}:${HAVE}`,
    actor_id: null,
    read_at: unread ? null : "2026-10-12T00:00:00Z",
    created_at: "2026-10-12T00:00:00Z",
  };
}

beforeEach(() => {
  for (const key of Object.keys(db)) delete db[key];
  db.player_wants = [{ id: WANT, player_id: "maya" }];
  db.flares = [
    { id: FLARE, status: "open", quantity: 1, found_quantity: 0 },
    { id: FOUND, status: "open", quantity: 1, found_quantity: 1 },
  ];
  db.player_cards = [{ id: HAVE, local_trade: true }];
  db.notifications = [];
  db.player_devices = [
    { id: "d1", player_id: "holder", push_token: "ExponentPushToken[x]" },
  ];
  pushes.length = 0;
  opened.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      for (const message of JSON.parse(init.body)) {
        pushes.push({ title: message.title, to: message.to });
      }
      return new Response(JSON.stringify({ data: [] }));
    }),
  );
});

describe("live: an ask that comes down is gone everywhere", () => {
  it("clears the notice when the want is deleted, and keeps the live ones", async () => {
    db.notifications = [notice(`want:${WANT}`), notice(`flare:${FLARE}`)];
    db.player_wants = [];

    await pruneStaleNearbyNotices("holder");
    expect(db.notifications.map((row) => row.dedupe_key)).toEqual([
      `nearby:flare:${FLARE}:${HAVE}`,
    ]);
  });

  it("clears it when the Flare is closed, found, or the card is no longer traded", async () => {
    db.notifications = [notice(`flare:${FLARE}`), notice(`flare:${FOUND}`)];
    await pruneStaleNearbyNotices("holder");
    expect(db.notifications).toHaveLength(1);

    db.flares[0].status = "closed";
    await pruneStaleNearbyNotices("holder");
    expect(db.notifications).toHaveLength(0);

    db.flares[0].status = "open";
    db.notifications = [notice(`flare:${FLARE}`)];
    db.player_cards[0].local_trade = false;
    await pruneStaleNearbyNotices("holder");
    expect(db.notifications).toHaveLength(0);
  });

  it("takes it out of the Inbox and the badge on the next read", async () => {
    db.notifications = [notice(`want:${WANT}`)];
    expect(await unreadCount("holder")).toBe(1);

    db.player_wants = [];
    expect(await unreadCount("holder")).toBe(0);
    expect(await listInbox("holder")).toEqual([]);
  });

  it("refuses a reply to a Flare that came down, in words", async () => {
    expect(await askIsLive({ kind: "flare", id: FLARE })).toBe(true);
    db.flares[0].status = "closed";

    const outcome = await answerNearby(
      "holder",
      { kind: "flare", id: FLARE },
      "Hi",
      {},
    );
    expect(outcome).toEqual({ ok: false, message: "They found it or took it down." });
    expect(opened).toEqual([]);
  });

  it("sends the holder's own words while it is up", async () => {
    const outcome = await answerNearby(
      "holder",
      { kind: "want", id: WANT },
      "Got it, Friday?",
      {},
    );
    expect(outcome).toEqual({ ok: true, threadId: "thread-1" });
    expect(opened).toEqual([`want:${WANT}`]);
  });
});

describe("the phone does not buzz a hundred times", () => {
  const match = (n: number) => ({
    holderId: "holder",
    askKey: `want:ask-${n}`,
    haveEntryId: `have-${n}`,
    wanterId: `wanter-${n}`,
    wanterName: `Person ${n}`,
    cardName: "Umbreon",
    milesLabel: "Under 2 mi away",
  });

  it("buzzes for the first three, once more to say there are more, then waits", async () => {
    for (let n = 1; n <= 8; n++) await notifyNearbyMatch(match(n));

    expect(pushes.map((push) => push.title)).toEqual([
      "Person 1 wants your Umbreon",
      "Person 2 wants your Umbreon",
      "Person 3 wants your Umbreon",
      DIGEST_TITLE,
    ]);
    expect(PUSHES_PER_DAY).toBe(3);
    /* Every one is still in the Inbox. */
    expect(db.notifications).toHaveLength(8);
  });

  it("never tells the same match twice", async () => {
    await notifyNearbyMatch(match(1));
    await notifyNearbyMatch(match(1));
    expect(pushes).toHaveLength(1);
    expect(db.notifications).toHaveLength(1);
  });
});

describe("grouped by card", () => {
  const person = (
    card: string,
    who: string,
    miles: number,
    hoursAgo: number,
    threadId: string | null = null,
  ) => ({
    card: { cardId: card },
    wanter: { playerId: who },
    miles,
    when: new Date(Date.UTC(2026, 9, 12, 12 - hoursAgo)).toISOString(),
    threadId,
  });
  const matches = [
    person("umbreon", "a", 4, 1),
    person("umbreon", "b", 1, 5, "thread-b"),
    person("umbreon", "c", 9, 2),
    person("law", "a", 2, 0),
    person("law", "d", 12, 3),
    person("mewtwo", "e", 1, 8),
  ];

  it("puts the most wanted card first, and messaged people at the bottom of theirs", () => {
    const groups = groupByCard(matches, "most");
    expect(groups.map((group) => group.cardId)).toEqual(["umbreon", "law", "mewtwo"]);
    expect(groups[0].people.map((p) => p.wanter.playerId)).toEqual(["a", "c", "b"]);
  });

  it("sorts by closest and by newest when asked", () => {
    expect(groupByCard(matches, "closest").map((group) => group.cardId)).toEqual([
      "umbreon",
      "mewtwo",
      "law",
    ]);
    expect(groupByCard(matches, "newest").map((group) => group.cardId)).toEqual([
      "law",
      "umbreon",
      "mewtwo",
    ]);
  });

  it("counts people, not matches", () => {
    expect(distinctPeople(matches)).toBe(5);
    expect(wantedCountLine(5)).toBe("5 people near you want cards from your binder");
    expect(wantedCountLine(1)).toBe("1 person near you wants a card from your binder");
  });
});

describe("both platforms", () => {
  const root = path.resolve(__dirname, "../..");
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  it("has no I-have-this button and no internal name left on either", () => {
    for (const file of [
      "mobile/src/wanted-near-you.tsx",
      "mobile/src/screens/wanted.tsx",
      "mobile/src/screens/home.tsx",
      "src/components/nearby/wanted-list.tsx",
      "src/components/nearby/wanted-summary.tsx",
      "src/components/feed/feed-items.tsx",
    ]) {
      const source = read(file);
      /* As a button's label; the comments quote the founder saying so. */
      expect(source, file).not.toMatch(/label="I have this"|>\s*I have this\s*</);
      expect(source, file).not.toContain("You can answer a Flare");
    }
  });

  it("draws the summary on the Feed and the screen behind it, on each", () => {
    expect(read("mobile/src/screens/home.tsx")).toContain("<WantedSummaryCard");
    expect(read("src/components/feed/feed-items.tsx")).toContain("<WantedSummaryCard");
    expect(read("mobile/App.tsx")).toContain('name="WantedNearYou"');
    expect(read("src/app/feed/wanted/page.tsx")).toContain("<WantedGrid");
    expect(read("mobile/src/follow-href.ts")).toContain(
      'navigation.navigate("WantedNearYou")',
    );
  });

  /*
   * The founder, of the list of sections this replaced: "seems like a
   * lot of info for someone." Your cards as a grid with a count on
   * each; a card's people only once you pick it.
   */
  it("is a grid of your cards with a count, and a sheet of people per card", () => {
    const app = read("mobile/src/screens/wanted.tsx");
    expect(app).toContain("<WantedTile");
    expect(app).toContain("<CountBadge count={count} />");
    expect(app).toContain("<PeopleForCard");
    expect(app).toContain("<SwipeToClose");
    const web = read("src/components/nearby/wanted-list.tsx");
    expect(web).toContain("grid grid-cols-3");
    expect(web).toContain("<Sheet");
    expect(web).toContain("<PeopleForCard");
  });

  it("has nothing to sort and keeps Not trading behind the three dots", () => {
    for (const file of [
      "mobile/src/screens/wanted.tsx",
      "src/components/nearby/wanted-list.tsx",
    ]) {
      const source = read(file);
      expect(source, file).not.toContain("WANTED_SORTS");
      expect(source, file).not.toContain("Show all");
      expect(source, file).toMatch(/setMenu\(!menu\)/);
      expect(source, file).toContain("Not trading this anymore");
    }
  });

  it("opens straight onto the card tapped on the Feed", () => {
    expect(read("mobile/src/wanted-near-you.tsx")).toContain(
      "onPress={() => onOpen(group.card.cardId)}",
    );
    expect(read("mobile/src/screens/wanted.tsx")).toContain("route.params?.cardId");
    expect(read("src/components/nearby/wanted-summary.tsx")).toContain(
      "`${WANTED_PATH}?card=${encodeURIComponent(group.card.cardId)}`",
    );
  });

  it("says a distance short, and lets the filled icon say Messaged", async () => {
    const { shortMiles } = await import("@/lib/nearby/shared");
    expect(shortMiles(1)).toBe("Under 2 mi");
    expect(shortMiles(4)).toBe("4 mi");
    for (const file of [
      "mobile/src/wanted-near-you.tsx",
      "src/components/nearby/wanted-list.tsx",
    ]) {
      expect(read(file), file).toContain("shortMiles(person.miles)");
      expect(read(file), file).not.toContain('" · Messaged"');
    }
  });

  /*
   * The founder: "pressing the message button should immediately open
   * up a message in someone's inbox ... autofilled with 'I have (card
   * name here). If you're looking to trade for it?' ... the little pop
   * up is kinda weird." A conversation screen, the first line written;
   * nothing is sent - and nothing appears in their Messages - until Send.
   */
  it("opens a new conversation with the first line written, sent only on Send", async () => {
    const { answerDraft, newMessageHref } = await import("@/lib/nearby/shared");
    expect(answerDraft("Umbreon")).toBe(
      "I have Umbreon. Are you looking to trade for it?",
    );
    expect(newMessageHref({ kind: "want", id: "abc" })).toBe(
      "/local/new?kind=want&id=abc",
    );

    const sheet = read("mobile/src/screens/wanted.tsx");
    expect(sheet).toContain('navigation.navigate("NewMessage"');
    expect(sheet).toContain("draft: answerDraft(person.card.cardName)");
    const compose = read("mobile/src/screens/new-message.tsx");
    expect(compose).toContain("answerNearby(ask, body)");
    expect(compose).toContain('navigation.replace("LocalThread"');

    expect(read("src/components/nearby/wanted-list.tsx")).toContain(
      "newMessageHref(person.ask)",
    );
    const page = read("src/app/local/new/page.tsx");
    expect(page).toContain("draft={answerDraft(preview.cardName)}");
    const composer = read("src/components/nearby/new-message-composer.tsx");
    expect(composer).toContain("answerNearbyAction(ask, text)");
    expect(composer).toContain("router.replace(");

    /* No pop-up draft left on either. */
    for (const file of [
      "mobile/src/wanted-near-you.tsx",
      "mobile/src/screens/home.tsx",
      "src/components/nearby/wanted-list.tsx",
      "src/components/feed/wanted-message-button.tsx",
    ]) {
      expect(read(file), file).not.toMatch(/DraftBox|setDrafting/);
    }
  });
});
