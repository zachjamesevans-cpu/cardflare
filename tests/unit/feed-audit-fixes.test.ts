import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { agoFrom } from "../../mobile/src/ago";
import { feedKeys } from "../../mobile/src/feed-keys";

/* The type, without importing api.ts: it needs app packages. */
type FeedItem = Parameters<typeof feedKeys>[0][number];
import { postSubject as appPostSubject } from "../../mobile/src/flare-copy";
import { agoFrom as webAgoFrom } from "@/components/feed/flare-feed-card";
import { postSubject as webPostSubject } from "@/lib/feed/card-copy";

/**
 * The pre-launch audit's Feed findings, pinned so they stay fixed: the
 * cache's account pointer, the Feed's first run, likes, the post screen,
 * the "View all" sheet, and the small ones.
 */
const read = (path: string) => readFileSync(path, "utf8");

describe("the cache's account pointer", () => {
  const cache = read("mobile/src/cache.ts");
  const writeCache = cache.slice(
    cache.indexOf("export async function writeCache"),
    cache.indexOf("export async function clearCache"),
  );

  it("is never moved by a write, which may be under somebody else's id", () => {
    /* A peeked profile is cached under its owner's id. */
    expect(writeCache).not.toContain("LAST_ACCOUNT_KEY");
    expect(read("mobile/src/player-peek.tsx")).toContain('writeCache("peek", playerId');
  });

  it("is set from the signed-in player's own /me", () => {
    const home = read("mobile/src/screens/home.tsx");
    const me = home.slice(home.indexOf("const fresh = await getMe();"));
    expect(me.slice(0, 400)).toContain("void rememberAccount(fresh.player.id);");
  });
});

describe("the Feed's first run", () => {
  const home = read("mobile/src/screens/home.tsx");

  it("waits for the first fetch before saying there is nothing", () => {
    expect(home).toContain("const feedReady = hydrated && feedSettled && !feedFailed;");
    for (const tab of ["following", "mine", "nearby"]) {
      expect(home).toContain(
        `{!guest && feedReady && shown.length === 0 && tab === "${tab}" && (`,
      );
    }
    expect(home).not.toContain("{hydrated && shown.length === 0 && tab");
  });

  it("says a failed first load failed, with a way to try again", () => {
    expect(home).toContain("{feedFailed && shown.length === 0 && (");
    expect(home).toContain('label="Try again"');
    expect(home).toContain("setFeedFailed(feedRef.current.length === 0)");
  });

  it("lets only the newest load write", () => {
    expect(home).toContain("const seq = ++loadSeq.current;");
    expect(home).toContain("seq === loadSeq.current");
    /* Pull to refresh goes through the same loader. */
    expect(home).toContain("await load(() => true);");
  });

  it("keys rows by what they are, not where they sit", () => {
    expect(home).not.toContain("key={`entry-${index}`}");
    expect(home).toContain("key={shownKeys[index]}");
  });
});

describe("feedKeys", () => {
  const hunt = (postId: string) => ({ kind: "hunt", postId }) as unknown as FeedItem;

  it("follows the item when the list shifts", () => {
    const before = feedKeys([hunt("a"), hunt("b")]);
    const after = feedKeys([hunt("new"), hunt("a"), hunt("b")]);
    expect(after.slice(1)).toEqual(before);
  });

  it("never repeats, even for kinds with no id", () => {
    const keys = feedKeys([
      { kind: "suggest", players: [] },
      { kind: "suggest", players: [] },
      hunt("a"),
      { kind: "start", topic: "deck" },
    ] as FeedItem[]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("agoFrom, one copy per platform", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");

  it("says nothing for a time that does not parse, never NaN", () => {
    expect(agoFrom("not a date", now)).toBe("");
    expect(agoFrom(null, now)).toBe("");
    expect(webAgoFrom("not a date")).toBe("");
  });

  it("reads the rest as before", () => {
    expect(agoFrom("2026-10-06T11:59:30Z", now)).toBe("now");
    expect(agoFrom("2026-10-06T11:55:00Z", now)).toBe("5m ago");
    expect(agoFrom("2026-10-06T09:00:00Z", now)).toBe("3h ago");
    expect(agoFrom("2026-10-04T12:00:00Z", now)).toBe("2d ago");
  });

  it("is not defined twice in the app", () => {
    expect(read("mobile/src/screens/home.tsx")).not.toContain("function agoFrom");
    expect(read("mobile/src/flare-feed-card.tsx")).not.toContain("function agoFrom");
  });
});

describe("the paper plane on a post of several cards", () => {
  for (const [platform, postSubject] of [
    ["app", appPostSubject],
    ["web", webPostSubject],
  ] as const) {
    it(`names the post, not its first card (${platform})`, () => {
      const cards = [{ cardName: "Nami" }, { cardName: "Zoro" }];
      expect(postSubject({ total: 1, cards: [{ cardName: "Nami" }] })).toBe("Nami");
      expect(postSubject({ total: 2, cards, hunt: { name: "Straw Hats" } })).toBe(
        "Straw Hats Flare",
      );
      expect(postSubject({ total: 25, cards })).toBe("Flare of 25 cards");
    });
  }

  it("is what both Feeds message with", () => {
    expect(read("mobile/src/screens/home.tsx")).not.toContain(
      'cardName: item.cards[0]?.cardName ?? "your card"',
    );
    expect(read("src/components/feed/flare-feed-card.tsx")).toContain(
      "cardName: postSubject(item)",
    );
  });
});

describe("likes", () => {
  it("sends one heart at a time per post, and says when it was refused", () => {
    const social = read("mobile/src/post-social.tsx");
    expect(social).toContain("if (inFlight.current) return;");
    expect(social).toContain("caught.status === 429");
    expect(social).toContain("<ErrorLine message={error} />");
  });

  it("does not rebuild the website's Feed for every heart", () => {
    const actions = read("src/lib/feed/post-actions.ts");
    const like = actions.slice(
      actions.indexOf("export async function togglePostLikeAction"),
      actions.indexOf("export async function loadPostCardsAction"),
    );
    expect(like).not.toMatch(/revalidatePath\(/);
  });
});

describe("the post screen and the website's comments", () => {
  it("only calls a post taken down when the server says 404", () => {
    const post = read("mobile/src/screens/flare-post.tsx");
    expect(post).toContain("caught instanceof ApiError && caught.status === 404");
    expect(post).not.toContain("It may have been taken down");
    /* A failed refresh keeps the post and offers the read again. */
    expect(post).toContain("{loadError ? (");
    expect(post).toContain('label="Retry"');
  });

  it("shows a comment that did not send, and stops the spinner", () => {
    const social = read("src/components/feed/post-social.tsx");
    expect(social).toContain("Couldn't post that comment");
    expect(social).toContain("Couldn't load comments");
  });
});

describe("View all lists every card", () => {
  it("reads the whole post when the rail was capped, on both", () => {
    const app = read("mobile/src/flare-cards-sheet.tsx");
    expect(app).toContain("getPost(openPostId)");
    expect(app).toContain("(open.total ?? 0) > open.cards.length");
    expect(read("mobile/src/screens/home.tsx")).toContain("total: item.total,");

    const web = read("src/components/feed/flare-cards-sheet.tsx");
    expect(web).toContain("loadPostCardsAction(postId)");
    expect(web).toContain("const partial = total > railCards.length;");
  });

  it("never splits a batch at the area read's limit", () => {
    const repository = read("src/lib/feed/repository.ts");
    expect(repository).toContain("if (flares && flares.length >= RECENT_READ) {");
    expect(repository).toContain('.in("posted_batch", batches)');
  });
});

describe("card search", () => {
  it("does not search twice when it remembers the game", () => {
    const select = read("mobile/src/card-select.tsx");
    expect(select).toContain("rememberedRef.current !== scopedGame");
    expect(select).toContain("}, [query, scopedGame, scope.locked]);");
  });
});
