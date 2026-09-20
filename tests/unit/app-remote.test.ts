import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { REMOTE_OPS } from "../../mobile/src/remote-wire";

/**
 * The app's timer remote, read off its source.
 *
 * The founder: "having someone being able to control the round timers
 * on the phone app... like a 'remote' in a way." The server refuses any
 * op that is not in REMOTE_OPS, so a button whose word drifted from the
 * list would be a button that 400s at the counter. This walks every op
 * the screen can send and holds it against the list, and pins the
 * plumbing around it: the screen is registered, it polls and controls
 * through remote-api, the silence banner exists, the entry card stays
 * away from non-staff, and both profile screens draw the TO chip.
 *
 * Read off the source because the test runner is Node with no renderer.
 * This proves the words are still WRITTEN, not that a phone drew them.
 */

const mobile = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../../mobile", path), "utf8");

const app = mobile("App.tsx");
const screen = mobile("src/screens/remote.tsx");
const entry = mobile("src/remote-entry.tsx");
const api = mobile("src/remote-api.ts");
const own = mobile("src/screens/profile.tsx");
const theirs = mobile("src/screens/player-profile.tsx");

/** Every op string the screen hands to a button, in source order. */
function opsSent(source: string): string[] {
  const ops: string[] = [];
  /* `button("Label", "op", ...)` builds one control; the second
     argument is the op it sends through press(). */
  for (const match of source.matchAll(/button\(\s*"[^"]+",\s*"([a-z-]+)"/g)) {
    ops.push(match[1]);
  }
  /* And any direct press(timer, "op"), controlTimer(id, "op") or
     onPress("op") call, however a later edit spells it. */
  for (const match of source.matchAll(
    /(?:press|controlTimer)\([^,()]+,\s*"([a-z-]+)"/g,
  )) {
    ops.push(match[1]);
  }
  for (const match of source.matchAll(/onPress\(\s*"([a-z-]+)"\s*\)/g)) {
    ops.push(match[1]);
  }
  return ops;
}

describe("the timer remote in the app", () => {
  it("is registered as the Remote stack screen with an optional storeId", () => {
    expect(app).toMatch(/Remote: \{ storeId\?: string \} \| undefined;/);
    expect(app).toContain('name="Remote"');
    expect(app).toContain("<RemoteScreen storeId={route.params?.storeId} />");
  });

  it("polls the hub and controls timers through remote-api only", () => {
    expect(api).toContain("export const getHub");
    expect(api).toContain("export const controlTimer");
    expect(api).toContain("/api/v1/stores/${encodeURIComponent(storeId)}/hub");
    expect(api).toContain("/api/v1/timers/${encodeURIComponent(timerId)}");

    expect(screen).toContain("getHub(picked)");
    expect(screen).toContain("controlTimer(timer.id, op)");
    /* Five seconds while focused, ticking once a second from the phone. */
    expect(screen).toContain("const POLL_MS = 5_000");
    expect(screen).toContain("useFocusEffect(");
    expect(screen).toContain("readRoomTimer(timer.wire, now)");
    /* Never a hand-rolled fetch. */
    expect(screen).not.toMatch(/\bfetch\(/);
  });

  it("sends only ops the server knows", () => {
    const sent = opsSent(screen);
    expect(sent.length).toBeGreaterThan(0);
    for (const op of sent) {
      expect(REMOTE_OPS, `"${op}" is not a remote op`).toContain(op);
    }
  });

  it("has a button for every control the founder asked for", () => {
    const sent = new Set(opsSent(screen));
    for (const op of [
      "start",
      "pause",
      "call-time",
      "add-minute",
      "subtract-minute",
      "start-overtime",
      "next-turn",
      "previous-turn",
      "next-round",
      "auto-hold",
      "auto-resume",
      "auto-extend",
      "auto-start-now",
      "reset",
      "complete",
    ]) {
      expect(sent, `no button sends "${op}"`).toContain(op);
    }
    /* Auto Mode is switched on and off at the counter, not from a pocket. */
    expect(sent.has("auto-on")).toBe(false);
    expect(sent.has("auto-off")).toBe(false);
  });

  it("asks before Reset and Complete, and says what Reset resets to", () => {
    expect(screen).toMatch(
      /Alert\.alert\(\s*`Reset to \$\{regulationMinutes\} minutes\?`/,
    );
    expect(screen).toMatch(/Alert\.alert\(\s*"Complete this round\?"/);
  });

  it("says out loud when the server has gone quiet", () => {
    expect(screen).toContain("const STALE_MS = 30_000");
    expect(screen).toContain(
      "Not hearing from the server. The wall keeps counting on its own.",
    );
  });

  it("keeps the phone awake while the remote is open", () => {
    expect(screen).toContain('import { useKeepAwake } from "expo-keep-awake"');
    expect(screen).toContain("useKeepAwake();");
    expect(
      JSON.parse(mobile("package.json")).dependencies["expo-keep-awake"],
    ).toBeTruthy();
  });

  it("draws the entry card only for staff, and opens the Remote screen", () => {
    expect(entry).toContain("if (staff.length === 0) return null;");
    expect(entry).toContain("me.staff ?? []");
    expect(entry).toContain("Timer remote");
    expect(entry).toContain("Run the round clocks from here, no trip to the counter");
    expect(entry).toContain('label="Open remote"');
    expect(entry).toMatch(/navigation\.navigate\(\s*"Remote"/);
  });

  it("draws the TO chip under the name on both profile screens", () => {
    expect(entry).toContain("export function OrganizerChips");
    expect(entry).toContain(
      'navigation.navigate("StoreProfile", { storeId: store.storeId })',
    );
    expect(entry).toContain("if (stores.length === 0) return null;");
    /* Inside the one ProfileHeader, under the handle, so both screens
       get it from one place and neither can forget it. */
    const header = mobile("src/profile-header.tsx");
    expect(header).toContain('import { OrganizerChips } from "./remote-entry";');
    expect(header).toContain("<OrganizerChips stores={organizerAt} />");
    for (const source of [own, theirs]) {
      expect(source).not.toContain("OrganizerChips");
      expect(source).toMatch(
        /<ProfileHeader[\s\S]*?organizerAt=\{profile\.organizerAt\}[\s\S]*?\/>/,
      );
    }
  });
});
