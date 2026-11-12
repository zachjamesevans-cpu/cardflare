import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Messages list finds every conversation's newest message in one
 * read, and asks one conversation at a time only for the ones that read
 * could not reach.
 *
 * It used to ask each conversation separately: up to fifty requests a
 * page, two hundred for a long list. Before that it read one window
 * across every conversation and nothing else, and a single busy chat
 * filled the window so quieter conversations lost their preview and
 * vanished. These tests hold both ends: the list is what the
 * one-at-a-time read produced, and it costs a handful of requests.
 *
 * The database here is a few arrays behind the query builder's own
 * methods, so the function under test runs unchanged.
 */

type Row = Record<string, unknown>;

const tables: Record<string, Row[]> = {};
/** Every read made, by table, with how it ended. */
const reads: { table: string; single: boolean; filters: string[] }[] = [];
/** Tables whose next awaited (not single) read fails. */
const failing = new Set<string>();

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const filters: string[] = [];
  let from = 0;
  let to = Number.POSITIVE_INFINITY;

  const run = () => rows.slice(from, to === Number.POSITIVE_INFINITY ? undefined : to);

  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push(`eq:${column}`);
      rows = rows.filter((row) => row[column] === value);
      return builder;
    },
    neq: (column: string, value: unknown) => {
      filters.push(`neq:${column}`);
      rows = rows.filter((row) => row[column] !== value);
      return builder;
    },
    in: (column: string, values: unknown[]) => {
      filters.push(`in:${column}`);
      rows = rows.filter((row) => values.includes(row[column]));
      return builder;
    },
    is: (column: string, value: unknown) => {
      filters.push(`is:${column}`);
      rows = rows.filter((row) => (row[column] ?? null) === value);
      return builder;
    },
    /* `a.eq.x,b.eq.y`: either column holds its value. */
    or: (expression: string) => {
      const terms = expression.split(",").map((term) => {
        const [column, , value] = term.split(".");
        return { column, value };
      });
      rows = rows.filter((row) =>
        terms.some(({ column, value }) => row[column] === value),
      );
      return builder;
    },
    order: (column: string, options: { ascending: boolean }) => {
      rows = [...rows].sort((a, b) => {
        const left = String(a[column]);
        const right = String(b[column]);
        if (left === right) return 0;
        return (left < right ? -1 : 1) * (options.ascending ? 1 : -1);
      });
      return builder;
    },
    range: (start: number, end: number) => {
      from = start;
      to = end + 1;
      return builder;
    },
    limit: (count: number) => {
      to = from + count;
      return builder;
    },
    maybeSingle: () => {
      reads.push({ table, single: true, filters });
      return Promise.resolve({ data: run()[0] ?? null, error: null });
    },
    then: (
      done: (value: { data: Row[] | null; error: unknown }) => unknown,
      fail: (reason: unknown) => unknown,
    ) => {
      reads.push({ table, single: false, filters });
      const result = failing.delete(table)
        ? { data: null, error: { message: "down" } }
        : { data: run(), error: null };
      return Promise.resolve(result).then(done, fail);
    },
  };
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (table: string) => query(table) }),
}));

vi.mock("@/lib/local/pairs", () => ({
  conversationIdFor: async () => null,
  pairThreadId: async () => null,
}));

const { listThreads, newestPerThread } = await import("@/lib/local/threads");

const ME = "me";

/** An ISO time `minutes` after a fixed start, so order is exact. */
const at = (minutes: number) =>
  new Date(Date.UTC(2026, 9, 1, 12, 0, 0) + minutes * 60_000).toISOString();

function thread(id: string, other: string, lastMinute: number, mine = false): Row {
  return {
    id,
    author_player_id: mine ? ME : other,
    responder_player_id: mine ? other : ME,
    last_message_at: at(lastMinute),
    flare_id: null,
    want_id: null,
  };
}

let messageSerial = 0;
function message(threadId: string, sender: string, minute: number, body: string): Row {
  messageSerial += 1;
  return {
    id: `m${messageSerial}`,
    thread_id: threadId,
    sender_player_id: sender,
    body,
    created_at: at(minute),
    read_at: null,
  };
}

/** What asking each conversation by itself would have answered. */
function oneAtATime(threadId: string): Row | undefined {
  return [...tables.flare_messages]
    .filter((row) => row.thread_id === threadId)
    .sort((a, b) => (String(a.created_at) < String(b.created_at) ? 1 : -1))[0];
}

const messageReads = () =>
  reads.filter((read) => read.table === "flare_messages" && !read.single);
const singleReads = () =>
  reads.filter((read) => read.table === "flare_messages" && read.single);

beforeEach(() => {
  for (const key of Object.keys(tables)) delete tables[key];
  reads.length = 0;
  failing.clear();
  tables.player_blocks = [];
  tables.players = [
    { id: "ana", display_name: "Ana", avatar_url: null },
    { id: "ben", display_name: "Ben", avatar_url: null },
    { id: "cat", display_name: "Cat", avatar_url: null },
  ];
});

describe("newestPerThread", () => {
  it("keeps the first message met for each conversation", () => {
    const picked = newestPerThread([
      { thread_id: "a", body: "a newest" },
      { thread_id: "b", body: "b newest" },
      { thread_id: "a", body: "a older" },
      { thread_id: "b", body: "b older" },
      { thread_id: "c", body: "c only" },
    ]);

    expect([...picked.keys()]).toEqual(["a", "b", "c"]);
    expect(picked.get("a")?.body).toBe("a newest");
    expect(picked.get("b")?.body).toBe("b newest");
    expect(picked.get("c")?.body).toBe("c only");
  });

  it("answers nothing for nothing", () => {
    expect(newestPerThread([]).size).toBe(0);
  });
});

describe("the Messages list, in one read", () => {
  it("lists every conversation with its own newest message, most recent talk first", async () => {
    tables.flare_threads = [
      thread("t-ana", "ana", 30),
      thread("t-ben", "ben", 50, true),
      thread("t-cat", "cat", 10),
    ];
    tables.flare_messages = [
      message("t-ana", "ana", 5, "ana first"),
      message("t-ana", ME, 30, "my reply to ana"),
      message("t-ben", "ben", 50, "ben newest"),
      message("t-ben", "ben", 49, "ben older"),
      message("t-cat", "cat", 10, "cat only"),
    ];

    const list = await listThreads(ME);

    expect(list.map((row) => row.threadId)).toEqual(["t-ben", "t-ana", "t-cat"]);
    expect(list.map((row) => row.lastMessagePreview)).toEqual([
      "ben newest",
      "my reply to ana",
      "cat only",
    ]);
    expect(list.map((row) => row.lastFromYou)).toEqual([false, true, false]);
    expect(list.map((row) => row.withName)).toEqual(["Ben", "Ana", "Cat"]);
    expect(list.map((row) => row.role)).toEqual(["author", "responder", "responder"]);
    expect(list.map((row) => row.unread)).toEqual([2, 1, 1]);

    /* One read for the newest messages and one for the unread ones;
       no conversation was asked by itself. */
    expect(messageReads()).toHaveLength(2);
    expect(singleReads()).toHaveLength(0);
  });

  it("asks nobody by themselves for a conversation never written in", async () => {
    tables.flare_threads = [
      thread("t-ana", "ana", 30),
      thread("t-empty", "ben", 60),
      thread("t-cat", "cat", 10),
    ];
    tables.flare_messages = [
      message("t-ana", "ana", 30, "ana"),
      message("t-cat", "cat", 10, "cat"),
    ];

    const list = await listThreads(ME);

    expect(list.map((row) => row.threadId)).toEqual(["t-ana", "t-cat"]);
    expect(singleReads()).toHaveLength(0);
  });

  it("does not list a conversation with somebody blocked", async () => {
    tables.flare_threads = [thread("t-ana", "ana", 30), thread("t-ben", "ben", 20)];
    tables.flare_messages = [
      message("t-ana", "ana", 30, "ana"),
      message("t-ben", "ben", 20, "ben"),
    ];
    tables.player_blocks = [{ blocker_id: "ben", blocked_id: ME }];

    const list = await listThreads(ME);

    expect(list.map((row) => row.threadId)).toEqual(["t-ana"]);
  });
});

describe("one busy chat does not hide the quiet ones", () => {
  it("reads again for the conversations a full window did not reach", async () => {
    tables.flare_threads = [
      thread("t-busy", "ana", 1000),
      thread("t-ben", "ben", 20, true),
      thread("t-cat", "cat", 10),
      thread("t-empty", "cat", 5, true),
    ];
    tables.flare_messages = [
      message("t-ben", ME, 20, "ben, from me"),
      message("t-ben", "ben", 19, "ben older"),
      message("t-cat", "cat", 10, "cat only"),
      /* Three hundred messages, every one newer than the quiet chats. */
      ...Array.from({ length: 300 }, (_, index) =>
        message("t-busy", index % 2 === 0 ? "ana" : ME, 100 + index, `busy ${index}`),
      ),
    ];

    const list = await listThreads(ME);

    expect(list.map((row) => row.threadId)).toEqual(["t-busy", "t-ben", "t-cat"]);
    for (const row of list) {
      const expected = oneAtATime(row.threadId);
      expect(row.lastMessagePreview).toBe(expected?.body);
      expect(row.lastFromYou).toBe(expected?.sender_player_id === ME);
    }
    expect(list[0].lastMessagePreview).toBe("busy 299");

    /* The full window, the window for the three it missed, and the
       unread read. Nobody asked by themselves. */
    expect(messageReads()).toHaveLength(3);
    expect(singleReads()).toHaveLength(0);
  });

  it("asks one at a time only for what a few rounds still did not reach", async () => {
    const busy = ["t-b1", "t-b2", "t-b3", "t-b4"];
    tables.flare_threads = [
      ...busy.map((id, index) => thread(id, "ana", 5000 - index * 1000)),
      thread("t-ben", "ben", 20),
      thread("t-cat", "cat", 10),
      thread("t-empty", "cat", 5),
    ];
    tables.flare_messages = [
      message("t-ben", "ben", 20, "ben only"),
      message("t-cat", "cat", 10, "cat only"),
      /* Four chats, each a full window newer than everything after it. */
      ...busy.flatMap((id, chat) =>
        Array.from({ length: 250 }, (_, index) =>
          message(id, "ana", 5000 - chat * 1000 - index, `${id} ${index}`),
        ),
      ),
    ];

    const list = await listThreads(ME);

    expect(list.map((row) => row.threadId)).toEqual([...busy, "t-ben", "t-cat"]);
    for (const row of list) {
      expect(row.lastMessagePreview).toBe(oneAtATime(row.threadId)?.body);
    }

    /* Three windows reached three busy chats; the fourth, the two
       quiet ones and the empty one were each asked. */
    expect(messageReads()).toHaveLength(4);
    expect(singleReads()).toHaveLength(4);
    expect(singleReads().every((read) => read.filters.includes("eq:thread_id"))).toBe(
      true,
    );
  });

  it("asks every conversation when the one read fails", async () => {
    tables.flare_threads = [thread("t-ana", "ana", 30), thread("t-ben", "ben", 20)];
    tables.flare_messages = [
      message("t-ana", "ana", 30, "ana"),
      message("t-ben", "ben", 20, "ben"),
    ];

    /* The thread page is read from flare_threads; the first awaited
       read of flare_messages is the window. */
    failing.add("flare_messages");
    const list = await listThreads(ME);

    expect(list.map((row) => row.lastMessagePreview)).toEqual(["ana", "ben"]);
    expect(singleReads()).toHaveLength(2);
  });
});

describe("the list is what asking one at a time produced", () => {
  it("agrees on every row for a long, uneven list", async () => {
    /* Seventy conversations: more than a page, a third never written
       in, and a few loud enough to fill a window on their own. */
    const threads: Row[] = [];
    const messages: Row[] = [];
    for (let index = 0; index < 70; index += 1) {
      const other = ["ana", "ben", "cat"][index % 3];
      const id = `t${String(index).padStart(2, "0")}`;
      const last = 10_000 - index * 7;
      threads.push(thread(id, other, last, index % 2 === 0));
      if (index % 3 === 1) continue;
      const count = index % 10 === 0 ? 120 : 1 + (index % 4);
      for (let step = 0; step < count; step += 1) {
        messages.push(
          message(
            id,
            step % 2 === 0 ? other : ME,
            last - step * 0.01 - index * 0.001,
            `${id} ${step}`,
          ),
        );
      }
    }
    tables.flare_threads = threads;
    tables.flare_messages = messages;

    const list = await listThreads(ME);

    const written = threads
      .filter((row) => oneAtATime(String(row.id)))
      .sort((a, b) => (String(a.last_message_at) < String(b.last_message_at) ? 1 : -1))
      .slice(0, 50);

    expect(list.map((row) => row.threadId)).toEqual(written.map((row) => row.id));
    for (const row of list) {
      const expected = oneAtATime(row.threadId);
      expect(row.lastMessagePreview).toBe(expected?.body);
      expect(row.lastFromYou).toBe(expected?.sender_player_id === ME);
      expect(row.lastMessageAt).toBe(
        threads.find((entry) => entry.id === row.threadId)?.last_message_at,
      );
    }

    /* A handful of reads, where it used to be one per conversation. */
    expect(singleReads()).toHaveLength(0);
    expect(messageReads().length).toBeLessThanOrEqual(6);
  });
});
