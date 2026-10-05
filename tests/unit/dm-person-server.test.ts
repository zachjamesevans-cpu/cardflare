import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const flat = (text: string) => text.replace(/\s+/g, " ");

/**
 * One conversation per person, the server half. The founder, with
 * Instagram's Messages open: "Conversation should be person. Like this,
 * showing their profile pic."
 */

const lib = flat(read("src/lib/local/threads.ts"));
const pairs = flat(read("src/lib/local/pairs.ts"));
const trades = flat(read("src/lib/trades/thread-trades.ts"));
const migration = flat(
  read("supabase/migrations/20261104090000_one_conversation_per_person.sql"),
);

describe("every pair has one conversation", () => {
  it("finds the pair's direct thread either way round, and makes it once", () => {
    expect(pairs).toContain('.is("flare_id", null) .is("want_id", null)');
    expect(pairs).toContain(
      "and(author_player_id.eq.${approached},responder_player_id.eq.${opener}),and(author_player_id.eq.${opener},responder_player_id.eq.${approached})",
    );
    expect(pairs).toContain('error.code === "23505"');
  });

  it("resolves an anchor to the pair's conversation, and a direct thread to itself", () => {
    expect(pairs).toContain("if (!data.flare_id && !data.want_id) return data.id;");
    expect(pairs).toContain(
      "return pairThreadId(data.author_player_id, data.responder_player_id);",
    );
  });

  it("sends a card offer into the person's chat, carrying the card", () => {
    const flareOpen = lib.slice(lib.indexOf("export async function openFlareThread("));
    expect(flareOpen.slice(0, 4000)).toContain(
      "pairThreadId(authorPlayerId, responderPlayerId)",
    );
    expect(flareOpen.slice(0, 4000)).toContain("flareCardId: flare.card_id");
    const wantOpen = lib.slice(lib.indexOf("export async function openWantThread("));
    expect(wantOpen.slice(0, 3000)).toContain(
      "pairThreadId(want.player_id, responderPlayerId)",
    );
    expect(lib).toContain("card_id: cardIds[0] ?? null");
  });

  it("writes an old anchor link's message into the conversation", () => {
    expect(lib).toContain(
      "const conversation = (await conversationIdFor(threadId)) ?? threadId;",
    );
  });
});

describe("the list reads like Instagram's", () => {
  const list = lib.slice(lib.indexOf("export async function listThreads("));

  it("lists only the pair's conversation, with their face and who spoke last", () => {
    expect(list).toContain('.is("flare_id", null) .is("want_id", null)');
    expect(list).toContain("withAvatarUrl: avatarSrc(other?.avatar_url)");
    expect(list).toContain("fromYou: message.sender_player_id === playerId");
    expect(list).toContain("lastFromYou: last.fromYou");
  });
});

describe("reading the conversation", () => {
  const readFn = lib.slice(lib.indexOf("export async function readThread("));

  it("checks the id asked for, then reads the pair's chat", () => {
    expect(readFn.indexOf("threadForViewer(threadId, viewerId)")).toBeLessThan(
      readFn.indexOf("conversationIdFor(threadId)"),
    );
    expect(readFn).toContain('.eq("thread_id", conversationId)');
  });

  it("draws the newest messages oldest first, each with its card", () => {
    expect(readFn).toContain('.order("created_at", { ascending: false }) .limit(200)');
    expect(readFn).toContain("[...(messages ?? [])].reverse()");
    expect(readFn).toContain("card: cards[0] ?? null,");
  });

  it("clears a notice rung on the old anchor id as well", () => {
    expect(readFn).toContain("[...new Set([conversationId, threadId])]");
    expect(readFn).toContain('.in("dedupe_key", noticeKeys)');
  });

  it("hands the app absolute faces", () => {
    expect(read("src/lib/api/absolute.ts")).toContain('key === "withAvatarUrl"');
    expect(read("src/app/api/v1/local/threads/[threadId]/route.ts")).toContain(
      "Response.json(absoluteImageUrls(thread))",
    );
  });
});

describe("We traded lives on the conversation", () => {
  it("checks and writes the trade on the pair's chat", () => {
    expect(trades).toContain('.eq("thread_id", conversationId)');
    expect(trades).toContain("thread_id: conversationId,");
  });
});

describe("the migration folds every anchor into the pair's chat", () => {
  it("adds the card to a message", () => {
    expect(migration).toContain(
      "add column if not exists card_id uuid references public.cards (id) on delete set null",
    );
  });

  it("makes a conversation for pairs that only talked about a card", () => {
    expect(migration).toContain("insert into public.flare_threads");
    expect(migration).toContain("on conflict do nothing;");
  });

  it("tags each anchor's first message, then moves messages and trades", () => {
    expect(migration).toContain("set card_id = coalesce(f.card_id, w.card_id)");
    expect(migration).toContain(
      "update public.flare_messages m set thread_id = moves.pair_id",
    );
    expect(migration).toContain(
      "update public.trades tr set thread_id = moves.pair_id",
    );
    expect(migration.indexOf("set card_id = coalesce")).toBeLessThan(
      migration.indexOf("set thread_id = moves.pair_id"),
    );
  });
});
