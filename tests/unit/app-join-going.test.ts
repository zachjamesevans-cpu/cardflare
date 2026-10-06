import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

/**
 * Two app doors into a night, held to what they promise.
 *
 * The pre-launch audit: the store page's "Join the room" opened the
 * Room screen without remembering the room it joined, so it showed the
 * last room the phone was in, and a failed join was swallowed. And
 * Going dropped the session token the server hands out once, so every
 * tap on a fresh install minted another room identity.
 */

describe("Join the room, from a store's page", () => {
  const store = read("mobile/src/screens/store-profile.tsx");
  const join = store.slice(store.indexOf("const join = async (code: string)"));

  it("joins, remembers that room, and only then opens it", () => {
    const joined = join.indexOf("await joinRoom(code);");
    const remembered = join.indexOf("await rememberRoom(");
    const opened = join.indexOf("openRoom(navigation);");
    expect(joined).toBeGreaterThan(-1);
    expect(remembered).toBeGreaterThan(joined);
    expect(opened).toBeGreaterThan(remembered);
  });

  it("says when the join failed instead of swallowing it", () => {
    expect(store).not.toContain("joinRoom(code).catch(() => {})");
    expect(join).toContain("setJoinError(");
    expect(store).toContain("<ErrorLine message={joinError} />");
  });
});

describe("Going, from the app", () => {
  const api = read("mobile/src/api.ts");
  const going = api.slice(api.indexOf("export async function setGoing("));

  it("keeps the session token the server hands out once", () => {
    expect(going).toContain("if (result.sessionToken) {");
    expect(going).toContain("await SecureStore.setItemAsync(SESSION_KEY, result.sessionToken);");
  });

  it("is the token the server sends", () => {
    const route = read("src/app/api/v1/nights/[eventId]/going/route.ts");
    expect(route).toContain("sessionToken: result.freshToken");
  });
});
