import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trust and safety for launch (App Store guideline 1.2): a block hides
 * two people from each other everywhere, fails closed for anything
 * that reaches the other person, cuts their follows; a comment can be
 * reported and taken down; a reported conversation reaches the admins
 * with its messages.
 */

type Result = { data?: unknown; error?: unknown; count?: number | null };

function chain(response: Result, calls: Record<string, unknown[][]>) {
  const c: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "neq",
    "in",
    "is",
    "or",
    "not",
    "order",
    "limit",
    "insert",
    "update",
    "upsert",
    "delete",
  ]) {
    c[method] = vi.fn((...args: unknown[]) => {
      (calls[method] ??= []).push(args);
      return c;
    });
  }
  c.maybeSingle = () => Promise.resolve(response);
  c.single = () => Promise.resolve(response);
  c.then = (done: (v: Result) => unknown, fail: (e: unknown) => unknown) =>
    Promise.resolve(response).then(done, fail);
  return c;
}

const queues: Record<string, Result[]> = {};
const calls: Record<string, Record<string, unknown[][]>> = {};
function queue(table: string, ...responses: Result[]) {
  (queues[table] ??= []).push(...responses);
}

vi.mock("@/lib/supabase/admin", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      const response = queues[table]?.shift() ?? { data: null, error: null };
      return chain(response, (calls[table] ??= {}));
    },
  }),
}));

const conversationIdFor = vi.fn();
vi.mock("@/lib/local/pairs", () => ({
  conversationIdFor: (id: string) => conversationIdFor(id),
  pairThreadId: async () => null,
}));

const safety = await import("@/lib/players/safety");
const { mayDeleteComment, deleteComment } = await import("@/lib/feed/posts");
const { actorNotBlockedFilter } = await import("@/lib/notifications/inbox");
const { reportAlertMessage } = await import("@/lib/players/report-alerts");
const { unreadMessages } = await import("@/lib/local/threads");
const { searchPlayersByName } = await import("@/lib/players/search");

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

beforeEach(() => {
  for (const store of [queues, calls]) {
    for (const key of Object.keys(store)) delete store[key];
  }
  conversationIdFor.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("a block", () => {
  it("cuts the follow edges in both directions", async () => {
    queue("player_blocks", { data: null, error: null });
    queue("player_follows", { data: null, error: null });

    expect(await safety.blockPlayer("me", "them")).toBe(true);

    expect(calls.player_follows.delete).toHaveLength(1);
    expect(calls.player_follows.or).toEqual([
      [
        "and(follower_id.eq.me,followed_id.eq.them),and(follower_id.eq.them,followed_id.eq.me)",
      ],
    ]);
  });

  it("fails CLOSED for anything that reaches the other person", async () => {
    queue("player_blocks", { data: null, error: { message: "down" } });
    expect(await safety.blockedBetween("me", "them")).toBe(true);
  });

  it("reads open when nobody blocked anybody", async () => {
    queue("player_blocks", { data: [], error: null });
    expect(await safety.blockedBetween("me", "them")).toBe(false);
  });

  it("names which side blocked, for drawing a profile", async () => {
    queue("player_blocks", {
      data: [{ blocker_id: "them", blocked_id: "me" }],
      error: null,
    });
    expect(await safety.blockState("me", "them")).toEqual({
      blocked: false,
      blockedBy: true,
    });
  });

  it("hides a profile: a missing player to the blocked, Unblock to the blocker", async () => {
    expect(safety.profileHiddenBy({ blocked: false, blockedBy: false })).toBeNull();

    const blockedBy = safety.profileHiddenBy({ blocked: false, blockedBy: true });
    expect(blockedBy?.status).toBe(404);
    expect(await blockedBy?.json()).toEqual({ error: "No such player." });

    const blocker = safety.profileHiddenBy({ blocked: true, blockedBy: false });
    expect(blocker?.status).toBe(404);
    expect(await blocker?.json()).toMatchObject({ error: "blocked", blocked: true });
  });

  it("is applied to the profile, its lists, follow, search and the night view", () => {
    const route = read("src/app/api/players/[playerId]/route.ts");
    expect(route).toContain("const hidden = profileHiddenBy(block);");
    expect(route).toContain(
      'if (action === "follow" && (await blockedBetween(me, playerId))) {',
    );
    expect(read("src/app/api/players/[playerId]/people/route.ts")).toContain(
      "listFollowers(playerId, me)",
    );
    expect(read("src/app/p/[playerId]/page.tsx")).toContain(
      "if (block.blockedBy && !block.blocked) notFound();",
    );
    expect(read("src/lib/notifications/notify.ts")).toContain(
      "if (await blockedBetween(followerId, followedId)) return;",
    );
    expect(read("src/lib/events/night-matches.ts")).toContain(
      "if (block.blocked || block.blockedBy) return null;",
    );
    expect(read("src/lib/events/night-matches.ts")).toContain(
      "playerSessionId: viewerId === playerId ? seat.playerSessionId : null,",
    );
  });
});

describe("player search", () => {
  it("leaves out everyone blocked either way with the viewer", async () => {
    queue("player_blocks", {
      data: [
        { blocker_id: "me", blocked_id: "a" },
        { blocker_id: "b", blocked_id: "me" },
      ],
      error: null,
    });
    queue("players", { data: [], error: null });

    await searchPlayersByName("kai", "me");

    expect(calls.players.not).toEqual([["id", "in", "(a,b)"]]);
  });

  it("filters nothing for a guest", async () => {
    queue("players", { data: [], error: null });
    await searchPlayersByName("kai", null);
    expect(calls.players.not).toBeUndefined();
  });
});

describe("the inbox", () => {
  it("drops notices from anyone blocked, and keeps ones nobody sent", () => {
    expect(actorNotBlockedFilter(new Set())).toBeNull();
    expect(actorNotBlockedFilter(new Set(["a", "b"]))).toBe(
      "actor_id.is.null,actor_id.not.in.(a,b)",
    );
  });
});

describe("the Messages dot", () => {
  it("does not count a conversation with somebody blocked", async () => {
    queue("flare_threads", {
      data: [
        { id: "t-ok", author_player_id: "me", responder_player_id: "friend" },
        { id: "t-bad", author_player_id: "blocked", responder_player_id: "me" },
      ],
      error: null,
    });
    queue("player_blocks", {
      data: [{ blocker_id: "me", blocked_id: "blocked" }],
      error: null,
    });
    queue("flare_messages", { data: null, error: null, count: 2 });

    expect(await unreadMessages("me")).toBe(2);
    expect(calls.flare_messages.in).toEqual([["thread_id", ["t-ok"]]]);
  });

  it("returns a blocked flag and shows the plain line in place of the composer", () => {
    expect(read("src/lib/local/threads.ts")).toContain(
      "const blocked = block.blocked || block.blockedBy;",
    );
    expect(read("mobile/src/screens/thread.tsx")).toContain(
      "<Muted>You can't message this person.</Muted>",
    );
    expect(read("src/components/local/local-screen.tsx")).toContain(
      "You can&rsquo;t message this person.",
    );
  });
});

describe("comments", () => {
  it("may be deleted by their author or the post's owner, nobody else", () => {
    expect(mayDeleteComment("me", "me", "owner")).toBe(true);
    expect(mayDeleteComment("owner", "me", "owner")).toBe(true);
    expect(mayDeleteComment("stranger", "me", "owner")).toBe(false);
    expect(mayDeleteComment("stranger", "me", null)).toBe(false);
  });

  it("refuses an id that is not under the post named", async () => {
    queue("flare_post_comments", {
      data: { id: "c1", post_id: "other-post", player_id: "me" },
      error: null,
    });
    expect(await deleteComment("post-1", "c1", "me")).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("lets the author take their own line down", async () => {
    queue(
      "flare_post_comments",
      { data: { id: "c1", post_id: "post-1", player_id: "me" }, error: null },
      { data: null, error: null },
    );
    expect(await deleteComment("post-1", "c1", "me")).toEqual({ ok: true });
    expect(calls.flare_post_comments.delete).toHaveLength(1);
  });

  it("refuses a stranger", async () => {
    queue("flare_post_comments", {
      data: { id: "c1", post_id: "post-1", player_id: "author" },
      error: null,
    });
    /* The post: one Flare owned by somebody else again. */
    queue("flares", {
      data: [
        {
          id: "f1",
          card_id: "card",
          status: "open",
          event_id: null,
          player_session_id: null,
          player_id: "owner",
          deck_label: null,
          printing_id: null,
          quantity: 1,
          found_quantity: 0,
          hunt_request_id: null,
          note: null,
          intent: "want",
        },
      ],
      error: null,
    });
    expect(await deleteComment("post-1", "c1", "stranger")).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(calls.flare_post_comments.delete).toBeUndefined();
  });

  it("are refused, and ring nobody, across a block", () => {
    const posts = read("src/lib/feed/posts.ts");
    expect(posts).toContain("(await blockedBetween(context.ownerPlayerId, playerId))");
    expect(read("src/lib/notifications/notify.ts")).toContain(
      "if (await blockedBetween(authorId, commenterId)) return;",
    );
  });

  it("carry Report and Delete on both platforms", () => {
    const app = read("mobile/src/screens/flare-post.tsx");
    expect(app).toContain('setReport({ kind: "comment", targetId: comment.id })');
    expect(app).toContain("deletePostComment(post.postId, comment.id)");
    const web = read("src/components/feed/post-social.tsx");
    expect(web).toContain('kind="comment"');
    expect(web).toContain("deletePostCommentAction(postId, commentId)");
  });
});

describe("a report", () => {
  it("can name a comment, and keeps its words", async () => {
    queue("flare_post_comments", {
      data: { id: "c1", player_id: "author", body: "rude words" },
      error: null,
    });
    queue("player_reports", { data: null, error: null });

    expect(
      await safety.reportTarget("me", "comment", "c1", "harassment", null),
    ).toEqual({ ok: true });
    expect(calls.player_reports.insert[0][0]).toMatchObject({
      target_kind: "comment",
      target_id: "c1",
      target_player_id: "author",
      target_excerpt: "rude words",
    });
  });

  it("files a conversation under the pair's chat, for the admins to read", async () => {
    queue("flare_threads", {
      data: { id: "anchor", author_player_id: "them", responder_player_id: "me" },
      error: null,
    });
    queue("player_reports", { data: null, error: null });
    conversationIdFor.mockResolvedValue("chat-1");

    await safety.reportTarget("me", "thread", "anchor", "harassment", null);

    expect(calls.player_reports.insert[0][0]).toMatchObject({
      target_kind: "thread",
      target_id: "chat-1",
      target_player_id: "them",
    });
  });

  it("shows a reported conversation's messages in the queue", async () => {
    queue("player_reports", {
      data: [
        {
          id: "r1",
          created_at: "2026-10-06T00:00:00Z",
          target_kind: "thread",
          target_id: "chat-1",
          target_player_id: "them",
          reason: "harassment",
          note: null,
          reporter_id: "me",
          target_excerpt: null,
        },
      ],
      error: null,
    });
    queue("players", {
      data: [
        { id: "me", display_name: "Kaito" },
        { id: "them", display_name: "Rex" },
      ],
      error: null,
    });
    queue("flare_messages", {
      data: [
        { id: "m2", sender_player_id: "them", body: "second", created_at: "2" },
        { id: "m1", sender_player_id: "me", body: "first", created_at: "1" },
      ],
      error: null,
    });

    const [report] = await safety.listOpenReports();

    expect(calls.flare_messages.eq).toEqual([["thread_id", "chat-1"]]);
    expect(report.messages.map((message) => message.body)).toEqual(["first", "second"]);
    expect(report.messages[1]).toMatchObject({
      senderName: "Rex",
      fromReporter: false,
    });
  });

  it("allows a comment in the database, and alerts the admins by email", () => {
    expect(read("supabase/migrations/20261109090000_report_comments.sql")).toContain(
      "check (target_kind in ('post', 'player', 'thread', 'comment'))",
    );
    expect(reportAlertMessage("comment", "spam", "https://x/admin")).toEqual({
      subject: "New report: a comment (spam)",
      text: "A player reported a comment for spam.\nOpen the queue: https://x/admin",
    });
  });
});
