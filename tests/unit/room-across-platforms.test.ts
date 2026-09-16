import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/**
 * A room you are in is a room you are in, on whichever thing you pick up.
 *
 * The founder: "if i join a room on my computer, it prompts me to join
 * with my username. but really, if i open that same room in app, it
 * should skip the whole join thing. it should all be consistent and
 * trasnfer over. if im in a room... it should just be persistent across
 * platforms."
 *
 * A room identity is a `player_sessions` row, and a client could only
 * ever find one by holding its token - the browser its cookie, the app
 * its stored token, neither knowing the other's. The account link that
 * ties them has existed all along; nothing ever looked it up.
 */
const read = (path: string) => readFile(path, "utf8");

describe("a room follows the account, not the device", () => {
  it("looks the seat up by account when the token misses", async () => {
    const auth = await read("src/lib/api/auth.ts");

    /* The token still wins - it is cheaper and it is what a client that
       has one should use. The lookup is the fallback. */
    expect(auth).toContain("sessionInEventForPlayer(account.playerId, eventId)");
    expect(auth).toContain("if (!eventId) return null;");

    /* Only ever the caller's OWN seat: the bearer token says who is
       asking and the lookup is keyed on that id, so this can never
       reach somebody else's session. */
    expect(auth).toContain("const account = await apiPlayer(request);");
    expect(auth).toContain("if (!account) return null;");
  });

  it("asks every room route for its room", async () => {
    /*
     * The fallback needs to know WHICH room, so each route resolves it
     * before the session rather than after. A route left on the old
     * order still works for a client holding a token and quietly fails
     * for one that is not - which is the bug, back again, on one
     * endpoint.
     */
    for (const path of [
      "src/app/api/v1/rooms/[code]/flares/route.ts",
      "src/app/api/v1/rooms/[code]/offers/route.ts",
      "src/app/api/v1/rooms/[code]/open/route.ts",
      "src/app/api/v1/rooms/[code]/trades/route.ts",
    ]) {
      const source = await read(path);
      expect(source, `${path} still resolves its session room-blind`).not.toMatch(
        /apiSession\(request\)/,
      );
      expect(source).toMatch(/apiSession\(request, resolved\.room\.id\)/);
    }

    const room = await read("src/app/api/v1/rooms/[code]/route.ts");
    expect(room).toContain("apiSession(request, room.id)");
  });

  it("keeps the JOIN itself token-only, so a fresh install gets a token", async () => {
    /*
     * The one place the fallback would be wrong. This handler decides
     * whether to MINT a token by asking whether the device already has
     * an identity; an account-resolved session answers yes for a device
     * holding nothing, and the fresh install would be told "you are in"
     * and handed no way to act. Caught by the rooms test, not by
     * reasoning - hence a guard of its own.
     */
    const room = await read("src/app/api/v1/rooms/[code]/route.ts");
    const post = room.slice(room.indexOf("export async function POST"));
    expect(post).toContain("let session = await apiSession(request);");
  });

  it("adopts the seat once rather than on every poll", async () => {
    /*
     * The room answers `joined` on a phone that never held a token, and
     * that is enough to draw the board - but it costs an account lookup
     * per request. One silent join mints a token for the session that
     * is already there, and the polls after it are ordinary.
     */
    const screen = await read("mobile/src/screens/room.tsx");
    expect(screen).toContain("if (fresh.joined && !(await storedSessionToken()))");
    expect(screen).toContain("await joinRoom(code).catch(() => {})");
  });

  it("finds the newest seat, and only a live session", async () => {
    const participants = await read("src/lib/events/participants.ts");
    const fn = participants.slice(
      participants.indexOf("export async function sessionInEventForPlayer"),
    );
    /* An expired session is not a seat. */
    expect(fn).toContain('.gt("expires_at"');
    /* Two live sessions in one room is a merge that has not happened
       yet; the one last seen is the one the person is actually on. */
    expect(fn).toContain('.order("last_seen_at", { ascending: false })');
  });
});
