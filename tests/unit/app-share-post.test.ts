import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/*
 * The Feed's paper plane is Instagram's share sheet: the people you
 * follow as round faces, tick one or several, write a note, Send. The
 * founder: "the exact share option for sharing posts on instagram in
 * little circles of their profile pics".
 */
describe("sharing a post from the Feed", () => {
  const sheet = read("mobile/src/share-post-sheet.tsx");
  const home = read("mobile/src/screens/home.tsx");
  const route = read("src/app/api/v1/local/threads/[threadId]/route.ts");
  const threads = read("src/lib/local/threads.ts");

  it("lists the people you follow as faces, and finds anyone by name", () => {
    expect(sheet).toContain("getFollowing()");
    expect(sheet).toContain("searchPlayersByName(term)");
    expect(sheet).toContain("<PlayerAvatar");
    expect(sheet).toContain('width: "33.333%"');
  });

  it("sends each person their own message with the post on it", () => {
    expect(sheet).toContain("openDirectThread(person.playerId)");
    expect(sheet).toContain("sendLocalMessage(opened.threadId, body, post.postId)");
    expect(sheet).toContain('"Send separately"');
    expect(sheet).toContain('placeholder="Write a message..."');
  });

  it("is what the plane opens on both Feed views", () => {
    expect(home.match(/onShare=\{\(\) =>\n\s+setSharing\(/g)?.length).toBe(2);
    expect(home).toContain("<SharePostSheet post={sharing}");
  });

  it("hangs the post's cards on the message, as the sender sees the post", () => {
    expect(route).toContain("postId: z.string().uuid().optional()");
    expect(threads).toContain("await postDetail(postId, senderId)");
    expect(threads).toContain("cardIds: cards.map((card) => card.cardId)");
  });
});
