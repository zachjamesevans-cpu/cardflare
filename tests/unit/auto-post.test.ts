import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Joining a room posts your Flares to it.
 *
 * The founder: "I wonder if it's best to just join a room and all the
 * flares immediately get posted. That's kinda the whole point of
 * cardflare." These pins hold the three ways into a room to that, keep
 * the one switch, and keep the old "post all N to this room" row from
 * coming back on either platform.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("every way into a room posts the player's Flares", () => {
  it("has one module that does it, wants and offerings, never throwing", () => {
    const auto = read("src/lib/events/auto-post.ts");
    expect(auto).toContain("export async function postFlaresOnJoin(");
    expect(auto).toContain("listWants(playerId)");
    expect(auto).toContain("listOfferings(playerId)");
    expect(auto).toContain('"want"');
    expect(auto).toContain('"showcase"');
    expect(auto).toContain("if (!(await autoPostFor(playerId))) return NOTHING;");
    expect(auto).toMatch(/catch \(error\) \{[\s\S]*return NOTHING;/);
    /* What did not fit is counted, never swallowed. */
    expect(auto).toContain(
      "skipped: Math.max(0, wants.length + offerings.length - posted.length)",
    );
  });

  it("runs on the website's join, the app's join, and a guest signing in mid-night", () => {
    for (const path of [
      "src/lib/events/join-event-actions.ts",
      "src/app/api/v1/rooms/[code]/route.ts",
      "src/app/e/[code]/page.tsx",
    ]) {
      expect(read(path)).toContain(
        "postFlaresOnJoin(event.id, session, accountPlayerId)",
      );
    }
  });

  it("lands a Feed post on the board of the room you are standing in", () => {
    expect(read("src/lib/flares/publish-actions.ts")).toContain(
      "if (input.toRoom || (await autoPostFor(playerId)))",
    );
    expect(read("src/app/api/v1/flares/publish/route.ts")).toContain(
      "else if (await autoPostFor(player.playerId))",
    );
  });
});

describe("the one switch", () => {
  it("is a column that defaults to on", () => {
    const migration = read("supabase/migrations/20261018090000_auto_post_flares.sql");
    expect(migration).toContain("auto_post_flares boolean not null default true");
    expect(read("src/lib/supabase/types.ts")).toContain("auto_post_flares: boolean;");
  });

  it("is read and written through the app API and the website action", () => {
    const profile = read("src/app/api/v1/profile/route.ts");
    expect(profile).toContain('action: z.literal("set-auto-post"), on: z.boolean()');
    expect(profile).toContain("autoPostFlares: await autoPostFor(player.playerId)");
    expect(read("src/app/api/v1/me/route.ts")).toContain("autoPostFlares: autoPost");
    expect(read("src/lib/events/auto-post-actions.ts")).toContain(
      "export async function setAutoPostAction(",
    );
  });

  it("is drawn in settings on both platforms, with the same words", () => {
    const web = read("src/components/players/auto-post-toggle.tsx");
    const app = read("mobile/src/screens/settings.tsx");
    for (const source of [web, app]) {
      expect(source).toContain("Post my Flares when I join a room");
      expect(source).toContain(
        "When you join a room, your open Flares go up on its board.",
      );
    }
    expect(read("src/app/profile/settings/page.tsx")).toContain("<AutoPostToggle");
    expect(app).toContain("setAutoPost(data.me.player.autoPostFlares ?? true)");
    expect(read("mobile/src/api.ts")).toContain('action: "set-auto-post"');
  });
});

describe("the old row is gone", () => {
  it("on both platforms, with its action", () => {
    expect(read("src/app/e/[code]/page.tsx")).not.toContain("RepostWants");
    expect(read("src/lib/players/account-actions.ts")).not.toContain(
      "repostWantsAction",
    );
    expect(read("mobile/src/screens/room.tsx")).not.toContain("you are still after");
    expect(read("mobile/src/screens/room.tsx")).not.toContain("to this room`");
  });
});
