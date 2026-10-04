import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Conversations act like DMs: nothing ends one but a block. The
 * founder, locked out of writing to a friend: "Messages should act more
 * like instagram DM's. I can't even message her again because it says
 * the convo is closed."
 */

describe("a conversation never ends", () => {
  const lib = read("src/lib/local/threads.ts");

  it("refuses a message only for a block, never for an old end", () => {
    expect(lib).toContain("NOTHING ENDS A CONVERSATION BUT A BLOCK.");
    expect(lib).not.toMatch(/closed_at\) return \{ ok: false/);
    expect(lib).not.toContain("if (thread.closed) return");
    expect(lib).toContain(
      'if (await blockedBetween(senderId, recipient)) return { ok: false, reason: "closed" };',
    );
  });

  it("answers the old End endpoint without ending anything, for builds already out", () => {
    const start = lib.indexOf("export async function closeThread(");
    const body = lib.slice(start, lib.indexOf("\n}\n", start));
    expect(body).not.toContain(".update(");
    expect(body).toContain("return { ok: true };");
  });

  it("counts unread across every conversation", () => {
    const start = lib.indexOf("export async function unreadMessages(");
    const body = lib.slice(start, lib.indexOf("\n}\n", start));
    expect(body).not.toContain("closed_at");
  });

  it("reopens every ended conversation", () => {
    const migration = read(
      "supabase/migrations/20261103090000_conversations_reopen.sql",
    );
    expect(migration).toContain("set closed_at = null,");
    expect(migration).toContain("where closed_at is not null;");
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/^commit;/m);
  });

  it("says a block plainly, without saying who blocked", () => {
    for (const path of [
      "src/lib/local/actions.ts",
      "src/app/api/v1/local/threads/route.ts",
      "mobile/src/api.ts",
    ]) {
      const source = read(path);
      expect(source, path).toContain("You can't message this player.");
      expect(source, path).not.toContain("This conversation was ended.");
    }
  });
});

describe("Block where End used to be, on both platforms", () => {
  const web = read("src/components/local/local-screen.tsx");
  const app = read("mobile/src/screens/thread.tsx");

  it("has no End button and no ended state", () => {
    for (const source of [web, app]) {
      expect(source).not.toMatch(/>\s*End this conversation\s*</);
      expect(source).not.toContain('label="End conversation"');
      expect(source).not.toContain("Ended conversations stay ended");
      expect(source).not.toContain("Conversation ended");
    }
    expect(read("mobile/src/screens/local.tsx")).not.toContain("Conversation ended");
  });

  it("asks with the profile's words, then blocks the other person", () => {
    expect(web).toContain('Block {withName ?? "them"}?');
    expect(web).toContain(
      "You will not see their posts, and neither of you can message the other.",
    );
    expect(web).toContain("await blockPlayerAction(withPlayerId)");
    expect(app).toContain("`Block ${name}?`");
    expect(app).toContain(
      "You will not see their posts, and neither of you can message the other. They are not told.",
    );
    expect(app).toContain("blockPlayer(withPlayerId)");
    for (const source of [web, app]) {
      expect(source).toContain("Blocked. Neither of you can message the other.");
    }
  });
});
