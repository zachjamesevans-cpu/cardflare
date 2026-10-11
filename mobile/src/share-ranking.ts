/**
 * Who the share sheet offers first, before anything is typed.
 *
 * Instagram's sheet opens on the people you talk to most, the top one
 * first; the founder asked for the same and for six of them at most: "6
 * most recent peeps you talked to in messages, or recent followers...
 * like how when i click share on ig and it automatically shows the
 * person who i message most as number one".
 *
 * The thread list carries no message counts, so "most" is read from
 * what it does carry: how recently you last talked (the heaviest term,
 * halving every week) and how many conversations you share. After them
 * come trade partners (you follow each other) and then whoever you
 * followed most recently. Anyone with a conversation outranks anyone
 * without one.
 */

export interface ShareCandidate {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  frame: string | null;
  ring?: string | null;
  aura?: string | null;
}

interface ThreadLike {
  withPlayerId: string;
  withName: string;
  withAvatarUrl: string | null;
  lastMessageAt: string;
  closed?: boolean;
}

interface FollowLike extends ShareCandidate {
  partners: boolean;
}

/** How many faces the sheet opens on. */
export const SHARE_SUGGESTIONS = 6;

const WEEK = 7 * 24 * 60 * 60 * 1000;

export function rankShareTargets(
  threads: readonly ThreadLike[],
  following: readonly FollowLike[],
  now: number = Date.now(),
  limit: number = SHARE_SUGGESTIONS,
): ShareCandidate[] {
  const scores = new Map<string, number>();
  const people = new Map<string, ShareCandidate>();

  /* Follows first, for their faces and frames; a thread fills in anyone
     you talk to but do not follow. */
  following.forEach((person, index) => {
    people.set(person.playerId, person);
    const recentFollow = Math.max(0, 10 - index);
    scores.set(person.playerId, (person.partners ? 20 : 0) + recentFollow);
  });

  const talked = new Map<string, { last: number; count: number }>();
  for (const thread of threads) {
    if (thread.closed || !thread.withPlayerId) continue;
    const at = Date.parse(thread.lastMessageAt);
    const seen = talked.get(thread.withPlayerId);
    talked.set(thread.withPlayerId, {
      last: Math.max(seen?.last ?? 0, Number.isNaN(at) ? 0 : at),
      count: (seen?.count ?? 0) + 1,
    });
    if (!people.has(thread.withPlayerId)) {
      people.set(thread.withPlayerId, {
        playerId: thread.withPlayerId,
        displayName: thread.withName,
        avatarUrl: thread.withAvatarUrl,
        frame: null,
      });
    }
  }

  for (const [playerId, { last, count }] of talked) {
    const age = Math.max(0, now - last);
    const recency = 1000 * Math.pow(0.5, age / WEEK);
    const often = 50 * Math.min(count, 5);
    /* 100 floor: any conversation beats any follow alone. */
    scores.set(playerId, (scores.get(playerId) ?? 0) + 100 + recency + often);
  }

  return [...people.values()]
    .sort((a, b) => (scores.get(b.playerId) ?? 0) - (scores.get(a.playerId) ?? 0))
    .slice(0, limit);
}
