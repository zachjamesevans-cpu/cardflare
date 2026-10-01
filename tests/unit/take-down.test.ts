import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { editEventSchema, NO_TIMEZONE } from "@/lib/events/schema";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * The audit of 2026-10-01, server side.
 *
 * "Remove" on a Flare marked it found and told followers; a store on
 * the UTC default got its 6 PM night at 11 AM; a night could be neither
 * edited nor cancelled; your own Flare said you could answer it. These
 * pin the fixes where they live.
 */
describe("a Flare has two exits", () => {
  const lib = read("src/lib/flares/withdraw.ts");
  const migration = read("supabase/migrations/20261020090000_take_down_and_cancel.sql");
  const posts = read("src/app/api/v1/posts/[postId]/route.ts");
  const room = read("src/app/api/v1/rooms/[code]/flares/route.ts");

  it("take down withdraws and stamps, and never marks found", () => {
    expect(lib).toContain('status: "cancelled", withdrawn_at: now');
    expect(lib).not.toContain("found_quantity");
    expect(migration).toContain("add column if not exists withdrawn_at timestamptz");
  });

  it("the undo reopens only the same player's rows from the last minute", () => {
    expect(lib).toContain("export const UNDO_WINDOW_MS = 60 * 1000;");
    expect(lib).toContain('.gte("withdrawn_at", since)');
    expect(lib).toContain(".or(owned)");
  });

  it("both doors are open to the app, and the old one still means found", () => {
    expect(posts).toContain('z.literal("take-down")');
    expect(posts).toContain('z.literal("restore")');
    expect(room).toContain(
      'mode: z.enum(["found", "take-down", "restore"]).default("found")',
    );
  });
});

describe("a night can be changed and cancelled", () => {
  const repository = read("src/lib/events/repository.ts");
  const actions = read("src/lib/events/actions.ts");
  const migration = read("supabase/migrations/20261020090000_take_down_and_cancel.sql");

  it("edits the same fields the night was made with", () => {
    const parsed = editEventSchema.safeParse({
      eventId: "3f2a1b7c-9d4e-4f61-8a2b-5c6d7e8f9a0b",
      name: "  Friday   Locals ",
      startsAt: "2026-10-03T18:00",
      endsAt: "2026-10-03T21:00",
      repeatWeekly: "on",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Friday Locals");
      expect(parsed.data.repeatWeekly).toBe(true);
    }
  });

  it("deletes an untouched draft and stamps anything else", () => {
    expect(repository).toContain(
      'event.status === "draft" && (people ?? 0) === 0 && (flares ?? 0) === 0',
    );
    expect(repository).toContain(
      'status: "closed", cancelled_at: new Date().toISOString()',
    );
    expect(migration).toContain("add column if not exists cancelled_at timestamptz");
  });

  it("a cancelled night does not spawn next week", () => {
    const start = actions.indexOf("export async function cancelEventAction");
    const end = actions.indexOf("export async function", start + 1);
    const cancel = actions.slice(start, end === -1 ? undefined : end);
    expect(cancel).not.toContain("settleClosedOccurrences");
    expect(cancel).toContain("cancelNoShowFlares(event.id, event.starts_at)");
  });
});

describe("no zone, no night", () => {
  const actions = read("src/lib/events/actions.ts");

  it("refuses to make or change a night while the store sits on UTC", () => {
    expect(NO_TIMEZONE).toContain("timezone");
    expect(actions.match(/store\.timezone === "UTC"/g)).toHaveLength(2);
  });
});

describe("your own post", () => {
  it("is never something you can answer", () => {
    const feed = read("src/lib/feed/repository.ts");
    expect(feed).toContain(
      'ordered[0]?.flare.intent === "showcase" || key.split("::")[0] === viewerId',
    );
  });
});
