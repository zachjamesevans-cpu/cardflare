import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Card Kingdom posted an update", to the followers who did not write it.
 *
 * Every follower of the store hears once; the store's own staff never
 * do; and after the second post of a day the rest post quietly, so a
 * shop cannot buzz its followers ten times before lunch.
 */

type Response = Record<string, unknown>;

function chain(response: Response, calls: Record<string, unknown[][]>) {
  const c: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "gte", "insert", "delete"]) {
    c[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return c;
    });
  }
  c.maybeSingle = () => Promise.resolve(response);
  c.then = (resolve: (v: Response) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(response).then(resolve, reject);
  return c;
}

const queues: Record<string, Response[]> = {};
const calls: Record<string, Record<string, unknown[][]>> = {};

function queue(table: string, ...responses: Response[]) {
  (queues[table] ??= []).push(...responses);
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const response = queues[table]?.shift() ?? { data: null, error: null };
      return chain(response, (calls[table] ??= {}));
    },
    auth: { admin: { getUserById: () => Promise.resolve({ data: { user: null } }) } },
  }),
}));
vi.mock("@/lib/email/client", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/players/collection", () => ({ collectionAvailability: vi.fn() }));
vi.mock("@/lib/site", () => ({ siteUrl: () => "https://cardflare.gg" }));

const { notifyStorePost } = await import("@/lib/notifications/notify");

/** The store, today's post count, the followers and the staff. */
function queueStore(postsToday: number, followers: string[], staffUsers: string[]) {
  queue("stores", { data: { name: "Card Kingdom" }, error: null });
  queue("store_posts", { count: postsToday, error: null });
  queue("player_locals", {
    data: followers.map((player_id) => ({ player_id })),
    error: null,
  });
  queue("store_members", {
    data: staffUsers.map((user_id) => ({ user_id })),
    error: null,
  });
}

beforeEach(() => {
  for (const store of [queues, calls]) {
    for (const key of Object.keys(store)) delete store[key];
  }
});

describe("telling followers about a store post", () => {
  it("records one notice per follower, with the post's title as the body", async () => {
    queueStore(1, ["p1", "p2"], []);
    queue("notifications", { data: { id: "n1" }, error: null });
    queue("notifications", { data: { id: "n2" }, error: null });

    await notifyStorePost("store-1", "post-1", "OP-12 prerelease Saturday, 20 seats");

    const inserts = calls.notifications?.insert ?? [];
    expect(inserts).toHaveLength(2);
    expect(inserts.map((args) => (args[0] as { player_id: string }).player_id)).toEqual(
      ["p1", "p2"],
    );
    expect(inserts[0]?.[0]).toMatchObject({
      title: "Card Kingdom posted an update",
      body: "OP-12 prerelease Saturday, 20 seats",
      url: "/s/store-1",
      dedupe_key: "store-post:post-1:p1",
      actor_id: null,
    });
  });

  it("skips the store's own staff", async () => {
    queueStore(1, ["p1", "p-owner"], ["user-owner"]);
    queue("players", { data: [{ id: "p-owner" }], error: null });
    queue("notifications", { data: { id: "n1" }, error: null });

    await notifyStorePost("store-1", "post-1", "Restock");

    const inserts = calls.notifications?.insert ?? [];
    expect(inserts.map((args) => (args[0] as { player_id: string }).player_id)).toEqual(
      ["p1"],
    );
  });

  it("goes quiet after the second post of the day", async () => {
    queueStore(2, ["p1"], []);
    queue("notifications", { data: { id: "n1" }, error: null });
    await notifyStorePost("store-1", "post-2", "Second");
    expect(calls.notifications?.insert ?? []).toHaveLength(1);

    for (const key of Object.keys(calls)) delete calls[key];
    queueStore(3, ["p1"], []);
    await notifyStorePost("store-1", "post-3", "Third");
    expect(calls.notifications?.insert ?? []).toHaveLength(0);
  });

  it("does nothing for a store nobody follows", async () => {
    queueStore(1, [], []);
    await notifyStorePost("store-1", "post-1", "Restock");
    expect(calls.notifications?.insert ?? []).toHaveLength(0);
  });
});
