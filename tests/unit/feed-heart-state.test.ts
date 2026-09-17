import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The founder: "I open app and it says I hearted that flare, as if I
 * went in and liked it or something. Which didn't even happen."
 *
 * The rows were keyed by position and the heart kept its own state
 * from first mount. The moment a new post landed on top, every row
 * below came to hold a different post while its heart still remembered
 * the old one. Two rules, both platforms: a post row is keyed by the
 * post, and the heart resets when the server's word changes.
 */
const read = (path: string) => readFileSync(resolve(__dirname, "../..", path), "utf8");

describe("a heart belongs to its post", () => {
  it("the app keys post rows by the post", () => {
    const home = read("mobile/src/screens/home.tsx");
    expect(home).not.toContain("key={`hunt-${index}`}");
    expect(home).toContain("key={`hunt-${item.postId}`}");
  });

  it("the website keys post rows by the post", () => {
    const page = read("src/app/feed/page.tsx");
    expect(page).toContain('item.kind === "hunt" ? `hunt-${item.postId}`');
  });

  it("both hearts follow the server's word when it changes", () => {
    for (const path of [
      "mobile/src/post-social.tsx",
      "src/components/feed/post-social.tsx",
    ]) {
      const source = read(path);
      expect(source).toContain(
        "if (seen.liked !== initialLiked || seen.likes !== initialLikes) {",
      );
      expect(source).toContain("setLiked(initialLiked);");
    }
  });
});
