import { describe, expect, it } from "vitest";

import {
  messagePreview,
  previewWithoutPostLink,
  splitSharedPost,
} from "@/lib/notifications/preview";

const ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";

describe("a shared post inside a message", () => {
  it("never shows the raw link in a push notice", () => {
    expect(messagePreview(`cardflare://post/${ID}`)).toBe("Sent a post");
    expect(messagePreview(`look at this\ncardflare://post/${ID}`)).toBe("look at this");
    expect(messagePreview("plain words")).toBe("plain words");
  });

  it("splits the words from the post on the website", () => {
    expect(splitSharedPost(`hi\ncardflare://post/${ID}`)).toEqual({
      text: "hi",
      postId: ID,
    });
    expect(splitSharedPost("hi")).toEqual({ text: "hi", postId: null });
  });

  it("reads a list preview cut part-way through the link", () => {
    expect(previewWithoutPostLink("cardflare://post/3f2a1b4c-5d")).toBe("Sent a post");
    expect(previewWithoutPostLink("hey cardflare://po")).toBe("hey");
  });
});
