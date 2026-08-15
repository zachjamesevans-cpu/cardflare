import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  TEST_NOTICE_KINDS,
  TEST_NOTICE_LABELS,
  testNoticeSchema,
} from "@/lib/admin/grant-schema";

/**
 * The notification kinds, pinned to the database that has to accept them.
 *
 * A kind the check constraint has never heard of does not fail loudly:
 * `record` swallows the insert error and returns null, so the phone
 * simply never buzzes and nobody finds out until a Friday night. This
 * keeps the code's list and the migration's list one list.
 */

const migrationSql = readdirSync(join(process.cwd(), "supabase/migrations"))
  .map((file) => readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"))
  .join("\n");

/** The kinds the newest constraint allows, read straight out of the SQL. */
const allowedByMigrations = (() => {
  const blocks = [
    ...migrationSql.matchAll(
      /notifications_kind_check\s+check \(kind in \(([^)]+)\)\)/g,
    ),
  ];
  const last = blocks.at(-1);
  if (!last) throw new Error("No notifications_kind_check found in the migrations");
  return [...last[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
})();

describe("notification kinds", () => {
  it("every testable kind is one the database will accept", () => {
    for (const kind of TEST_NOTICE_KINDS) {
      expect(allowedByMigrations, kind).toContain(kind);
    }
  });

  it("the two new social kinds reached the schema", () => {
    expect(allowedByMigrations).toContain("new-follower");
    expect(allowedByMigrations).toContain("room-flare");
  });

  it("every testable kind has a label for the console's picker", () => {
    for (const kind of TEST_NOTICE_KINDS) {
      expect(TEST_NOTICE_LABELS[kind]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("refuses a kind nobody defined", () => {
    const parsed = testNoticeSchema.safeParse({
      playerId: "3f1d9a2e-1c4b-4f5a-9d3e-2b7c8a1f0e6d",
      kind: "made-up",
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a real kind with a real player id", () => {
    const parsed = testNoticeSchema.safeParse({
      playerId: "3f1d9a2e-1c4b-4f5a-9d3e-2b7c8a1f0e6d",
      kind: "new-follower",
    });
    expect(parsed.success).toBe(true);
  });
});
