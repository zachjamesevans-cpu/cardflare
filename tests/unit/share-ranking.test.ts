import { describe, expect, it } from "vitest";

import { rankShareTargets, SHARE_SUGGESTIONS } from "../../mobile/src/share-ranking";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

const follow = (id: string, partners = false) => ({
  playerId: id,
  displayName: id,
  avatarUrl: null,
  frame: null,
  partners,
});
const thread = (id: string, days: number, closed = false) => ({
  withPlayerId: id,
  withName: id,
  withAvatarUrl: null,
  lastMessageAt: ago(days),
  closed,
});

/*
 * The founder: "6 most recent peeps you talked to in messages, or recent
 * followers... like how when i click share on ig and it automatically
 * shows the person who i message most as number one".
 */
describe("who the share sheet offers first", () => {
  it("opens on six at most", () => {
    const following = Array.from({ length: 12 }, (_, i) => follow(`p${i}`));
    expect(rankShareTargets([], following, NOW)).toHaveLength(SHARE_SUGGESTIONS);
    expect(SHARE_SUGGESTIONS).toBe(6);
  });

  it("puts the person you talked to most recently first", () => {
    const ranked = rankShareTargets(
      [thread("old", 20), thread("today", 0), thread("week", 7)],
      [follow("old"), follow("week"), follow("today")],
      NOW,
    );
    expect(ranked.map((p) => p.playerId)).toEqual(["today", "week", "old"]);
  });

  it("ranks several conversations with someone above one", () => {
    const ranked = rankShareTargets(
      [thread("once", 1), thread("often", 1), thread("often", 2), thread("often", 3)],
      [],
      NOW,
    );
    expect(ranked[0].playerId).toBe("often");
  });

  it("puts anyone you talk to above anyone you only follow", () => {
    const ranked = rankShareTargets(
      [thread("chatted", 60)],
      [follow("partner", true), follow("newest")],
      NOW,
    );
    expect(ranked[0].playerId).toBe("chatted");
  });

  it("then trade partners, then the newest follows", () => {
    const ranked = rankShareTargets(
      [],
      [follow("newest"), follow("older"), follow("partner", true)],
      NOW,
    );
    expect(ranked.map((p) => p.playerId)).toEqual(["partner", "newest", "older"]);
  });

  it("leaves out closed conversations, and keeps a face for non-follows", () => {
    const ranked = rankShareTargets(
      [thread("gone", 0, true), thread("stranger", 1)],
      [],
      NOW,
    );
    expect(ranked.map((p) => p.playerId)).toEqual(["stranger"]);
    expect(ranked[0].displayName).toBe("stranger");
  });
});
