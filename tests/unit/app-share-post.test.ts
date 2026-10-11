import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  postLink,
  previewWithoutPostLink,
  splitPostLink,
} from "../../mobile/src/post-link";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const POST = "4f9b1c2e-8a3d-4b6f-9c1e-2d3a4b5c6d7e";

/*
 * The Feed's paper plane is Instagram's share sheet: the people you
 * follow as round faces, tick one or several, write a note, Send. The
 * founder: "the exact share option for sharing posts on instagram in
 * little circles of their profile pics", and then, when the first try
 * arrived as plain words: "it needs to be a clickable post".
 */
describe("sharing a post from the Feed", () => {
  const sheet = read("mobile/src/share-post-sheet.tsx");
  const home = read("mobile/src/screens/home.tsx");
  const thread = read("mobile/src/screens/thread.tsx");
  const bubble = read("mobile/src/shared-post-bubble.tsx");

  it("lists the people you follow as faces, and finds anyone by name", () => {
    expect(sheet).toContain("getFollowing()");
    expect(sheet).toContain("searchPlayersByName(term)");
    expect(sheet).toContain("<PlayerAvatar");
    expect(sheet).toContain('width: "33.333%"');
  });

  it("sends each person their own message carrying the post", () => {
    expect(sheet).toContain("openDirectThread(person.playerId)");
    expect(sheet).toContain("const link = postLink(post.postId);");
    expect(sheet).toContain("sendLocalMessage(opened.threadId, body)");
    expect(sheet).toContain('"Send separately"');
    expect(sheet).toContain('placeholder="Write a message..."');
  });

  it("is what the plane opens on both Feed views", () => {
    expect(home.match(/onShare=\{\(\) =>\n\s+setSharing\(/g)?.length).toBe(2);
    expect(home).toContain("<SharePostSheet post={sharing}");
  });

  it("draws the post in the chat, and a tap opens it", () => {
    expect(thread).toContain("const shared = splitPostLink(item.body);");
    expect(thread).toContain("<SharedPostBubble");
    expect(thread).toContain('navigation.navigate("FlarePost", { postId })');
    expect(bubble).toContain("getPost(postId)");
  });
});

describe("the post line inside a message", () => {
  it("rides on its own last line and comes back off whole", () => {
    expect(splitPostLink(`look at this\n${postLink(POST)}`)).toEqual({
      text: "look at this",
      postId: POST,
    });
    expect(splitPostLink(postLink(POST))).toEqual({ text: "", postId: POST });
    expect(splitPostLink("just words")).toEqual({ text: "just words", postId: null });
  });

  it("reads as the words, or Sent a post, on the Messages list", () => {
    expect(previewWithoutPostLink(`look at this ${postLink(POST)}`)).toBe("look at this");
    expect(previewWithoutPostLink("cardflare://post/4f9b1c2e-8a3d")).toBe("Sent a post");
    expect(previewWithoutPostLink("hey")).toBe("hey");
  });
});
