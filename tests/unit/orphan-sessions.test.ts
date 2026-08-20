import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rescuing Flares posted before somebody signed in.
 *
 * A Flare records the SESSION that posted it, and an account link lives
 * on that session's `player_id`. Post as a guest, sign up afterwards, and
 * those Flares hang off a session that is nobody: initials and no ring on
 * the board and in the Feed, and never counted toward the profile, the
 * follows, or the Embers a trade would pay.
 *
 * Reported by the founder off the deployed feed - an account that plainly
 * has a picture, drawn as a "W". The rule itself is right and written down
 * in participants.ts ("guests are simply absent from this map"); what was
 * missing was any way out of it, because `linkSessionToPlayer` refuses
 * once an account already has a room identity, and every account has
 * exactly one by construction.
 */
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const lib = read("src/lib/admin/orphan-sessions.ts");
const action = read("src/lib/admin/orphan-actions.ts");
const page = read("src/app/admin/players/page.tsx");

describe("attaching a guest session to an account", () => {
  it("folds into the account's identity when it already has one", () => {
    /* Not a second link: a partial unique index makes that impossible,
       and merge_player_sessions is the one thing that moves a binder
       without splitting it across two identities halfway through. */
    expect(lib).toContain("mergePlayerSessions(sessionId, existing.id)");
    expect(lib).toContain("linkSessionToPlayer(sessionId, playerId)");
  });

  it("only offers sessions that are carrying something", () => {
    /* A guest who joined and posted nothing has nothing to rescue, and a
       console list is for acting on rather than browsing. */
    expect(lib).toContain("row.flares > 0 || row.rooms > 0");
    expect(lib).toContain('.is("player_id", null)');
  });

  it("is behind the admin guard", () => {
    /* This hands one person's Flares, binder and room history to an
       account - the most consequential thing the console can do. */
    expect(action).toContain("await requireAdmin();");
  });

  it("is reachable from the console", () => {
    expect(page).toContain("<OrphanSessions");
  });
});
