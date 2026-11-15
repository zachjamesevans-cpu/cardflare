import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The app's room while the night is on. The founder (2026-11-15): "When
 * someone scans into a room I feel like it should be dead simple imo.
 * This is so much info." These read the screen and fail if a planning
 * block comes back into the room, or your own Flares unfold by default.
 */
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const room = read("mobile/src/screens/room.tsx");
const header = read("mobile/src/night-header.tsx");

describe("the app's room while the night is on", () => {
  it("decides the view from the shared rule", () => {
    expect(room).toContain('const inRoom = roomViewFor(phase) === "in-room";');
    expect(room).toContain('from "../room-view";');
  });

  it("keeps the header to the store, the name and how many players", () => {
    expect(room).toContain("inRoom={inRoom}");
    expect(room).toContain("youreIn={joined || Boolean(going?.youGoing)}");
    /* No date line in the room. */
    expect(header).toContain("{startsAt && !inRoom ? (");
    /* The Going chip only as the way in for somebody not in yet. */
    expect(header).toMatch(/phase !== "finished" && !\(inRoom && youreIn\)/);
  });

  it("puts one match line first, and nothing when there is nothing", () => {
    expect(room).toMatch(/inRoom \? \(\s*(\/\*[\s\S]*?\*\/\s*)?<RoomMatchLine/);
    expect(room).toContain("line={roomMatchLine(matches?.summary)}");
    expect(room).toMatch(/function RoomMatchLine[\s\S]*?if \(!line\) return null;/);
  });

  it("leaves the planning blocks for before the night", () => {
    expect(room).toContain("going?.youGoing && !finished && !inRoom ? (");
    expect(room).toContain("!finished && !inRoom && bring.length > 0 ? (");
    expect(room).toMatch(/\{inRoom \? null : \(\s*<>\s*<PlayersGoing/);
  });

  it("folds your own Flares to one line unless somebody has offered on one", () => {
    expect(room).toContain(
      "const [yoursOpen, setYoursOpen] = useState<boolean | null>(null);",
    );
    expect(room).toMatch(
      /\(yoursOpen \?\?\s*group\.flares\.some\(\(flare\) => flare\.offers\.length > 0\)\)/,
    );
    expect(room).toMatch(/if \(mine && !yoursShown\) \{/);
    expect(room).toContain("{yourFlaresLine(count)}");
    /* A row a thumb can hit. */
    expect(room).toMatch(/function YourFlaresRow[\s\S]*?minHeight: 44/);
  });

  it("draws the whole board, with no filter", () => {
    expect(room).not.toContain("FlareFilterRow");
    expect(room).toContain("const flares = state.flares ?? [];");
  });
});
