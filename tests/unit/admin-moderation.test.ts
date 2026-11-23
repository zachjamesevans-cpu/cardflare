import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Taking down one reported post or comment from the admin queue, and
 * holding a comment in the app for its menu (2026-11-22). The Terms
 * promise objectionable content comes down within 24 hours; before this
 * the only tools were deleting the whole account or hand-editing rows.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const lib = read("src/lib/admin/moderation.ts");
const actions = read("src/lib/admin/moderation-actions.ts");
const queue = read("src/components/admin/report-queue.tsx");
const safety = read("src/lib/players/safety.ts");
const post = read("mobile/src/screens/flare-post.tsx");

describe("the admin's Remove", () => {
  it("is admin-only, checked before anything else in each action", () => {
    expect(actions.startsWith('"use server";')).toBe(true);
    for (const name of ["removeReportedPostAction", "removeReportedCommentAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`));
      expect(body.split("\n")[1]).toContain("await requireAdmin();");
    }
  });

  it("takes a post down the way its owner does, and closes its reports", () => {
    expect(lib).toContain("await withdrawFlares(post.player_id, { postId });");
    expect(lib).toContain('closeReportsOn("post", postId, adminUserId)');
  });

  it("deletes exactly one comment, and closes its reports", () => {
    expect(lib).toMatch(
      /\.from\("flare_post_comments"\)\s*\.delete\(\)\s*\.eq\("id", commentId\)/,
    );
    expect(lib).toContain('closeReportsOn("comment", commentId, adminUserId)');
  });

  it("closes only the open reports on that one target", () => {
    const close = lib.slice(lib.indexOf("async function closeReportsOn"));
    expect(close).toContain('.eq("status", "open")');
    expect(close).toContain('.eq("target_kind", kind)');
    expect(close).toContain('.eq("target_id", targetId)');
  });

  it("is a button on post and comment reports in the queue, beside Resolved", () => {
    expect(queue).toContain(
      '(report.kind === "post" || report.kind === "comment") && (',
    );
    expect(queue).toContain(
      'report.kind === "post" ? "Remove post" : "Remove comment"',
    );
    expect(queue).toContain('variant="danger"');
    expect(queue).toContain("resolveReportAction");
  });

  it("opens a reported post or comment on the post itself", () => {
    expect(safety).toContain("postHref(row.target_id)");
    expect(safety).toContain("postHref(postOfComment.get(row.target_id)!)");
  });
});

describe("holding a comment in the app", () => {
  it("opens the same menu as its ⋯, with a tick, and VoiceOver can reach it", () => {
    expect(post).toContain("onLongPress={");
    expect(post).toContain("setCommentMenu(comment);");
    expect(post).toContain("delayLongPress={350}");
    expect(post).toContain("Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)");
    expect(post).toContain("accessibilityActions={");
    /* The ⋯ stays for anyone who does not know to hold. */
    expect(post).toContain('label="More about this comment"');
  });
});
