import { describe, expect, it } from "vitest";

import { DEFAULT_SIGNED_IN_PATH, safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it.each(["/store", "/admin", "/store/events/abc", "/admin?tab=stores"])(
    "keeps the in-site path %s",
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
  ])("falls back when the target is %s", (_label, value) => {
    expect(safeNextPath(value)).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  /*
   * An open redirect here would be a phishing page reached through a genuine
   * cardflare.gg sign-in link, wearing CardFlare's credibility.
   */
  it.each([
    ["absolute http", "http://evil.example"],
    ["absolute https", "https://evil.example/login"],
    ["protocol-relative", "//evil.example"],
    ["protocol-relative with path", "//evil.example/admin"],
    ["backslash trick", "/\\evil.example"],
    ["scheme-ish", "javascript:alert(1)"],
    ["data url", "data:text/html,<script>alert(1)</script>"],
    ["bare host", "evil.example"],
  ])("refuses to redirect off-site: %s", (_label, value) => {
    expect(safeNextPath(value)).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it("never returns something a browser reads as another origin", () => {
    const candidates = [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "\\\\evil.example",
    ];

    for (const candidate of candidates) {
      const resolved = safeNextPath(candidate);
      const url = new URL(resolved, "https://cardflare.gg");
      expect(url.origin).toBe("https://cardflare.gg");
    }
  });
});
