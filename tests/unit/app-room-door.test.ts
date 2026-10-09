import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app's Room screen, read off its source.
 *
 * The founder, on the old page: "There's just so many blocks... It's
 * all just disconnected and want it to flow better." And in Nights
 * round 2: "REMOVE REPEATED INFORMATION", "USE LESS CONTAINERIZATION",
 * "The current giant lime 'Post a Flare' bar is too visually
 * dominant." So the page is one compact header (the store with its
 * glyph, the night's name with two round icons at the end of its
 * line, when, one line of RSVP and attendance), the sections under it
 * divided by labels and hairlines, the board with players split by
 * hairlines, and a floating "+ Flare" button. These pins hold the
 * words and the shape; nobody here has a renderer, so what a phone
 * draws is not what they prove.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const room = read("mobile/src/screens/room.tsx");
const header = read("mobile/src/night-header.tsx");
const composer = read("mobile/src/screens/flare-composer.tsx");
const fab = read("mobile/src/flare-fab.tsx");
const app = read("mobile/App.tsx");

/** The night's screen, from the header to the end of the component. */
const joined = room.slice(
  room.indexOf("THE HEADER"),
  room.indexOf("/** The website's pledge arithmetic"),
);

describe("the header", () => {
  it("is the one NightHeader, with the remote and the help door at the name's end", () => {
    const top = joined.slice(0, joined.indexOf("THE BOARD:"));
    expect(top).toMatch(
      /<NightHeader[\s\S]*?right=\{[\s\S]*?<RemoteEntry \/>[\s\S]*?<DoorIconButton[\s\S]*?icon="help-circle-outline"[\s\S]*?label="How a night works"/,
    );
    expect(top).toContain("setTournamentHelp(true)");
    /* Both come from one place, so they cannot drift apart. */
    expect(room).toContain(
      'import { DoorIconButton, RemoteEntry } from "../remote-entry";',
    );
    /* The header draws the name uppercase by style, never in the data. */
    expect(header).toContain('textTransform: "uppercase"');
    expect(header).not.toContain("toUpperCase()");
  });

  it("says attendance once, on the header's line, and nowhere else", () => {
    expect(joined).toContain("playersCount={playersCount}");
    expect(header).toContain("{playersLine(playersCount)}");
    /* No "here now" (2026-10-09): it counted people browsing from home. */
    expect(joined).not.toContain("hereNow={hereNow}");
    expect(header).not.toContain("hereNowLine(");
    /* The old meta line, the people sheet and the roster card are gone. */
    expect(room).not.toContain('accessibilityLabel="Who\'s here"');
    expect(room).not.toContain("tonight ·");
    expect(room).not.toContain("RoomPeopleModal");
    expect(room).not.toContain("peopleOpen");
    expect(room).not.toContain("function RosterCard");
    /* People, not seats: an account in from two devices is one in the
       count, the website's room-door rule. */
    expect(room).toContain("dedupeParticipants(state.participants ?? [])");
    expect(room).not.toContain("const hereNow =");
  });

  it("has lost the old text link, counts and remote card", () => {
    expect(room).not.toContain("New to tournaments?");
    expect(room).not.toContain("Here's how a night works");
    expect(room).not.toContain("Open remote");
    expect(room).not.toContain("styles.nightName");
  });
});

describe("the board section", () => {
  const board = joined.slice(
    joined.indexOf("THE BOARD:"),
    joined.indexOf('label="Traded tonight"'),
  );

  it("is one section labelled Flares at this Night, players split by hairlines, with the filter on its line", () => {
    expect(board).toContain("label={FLARES_AT_THIS_NIGHT}");
    expect(board).toContain(
      "right={<FlareFilterRow value={filter} onChange={setFilter} />}",
    );
    expect(room).not.toContain("<Title>Flares in the room</Title>");
    expect(room).not.toContain("Newest first");
    /* The per-player groups are Views inside the one section. */
    expect(board).toMatch(/<View\s+key=\{sessionId\}/);
    expect(board).not.toMatch(/<Card key=\{sessionId\}/);
    expect(board).toContain("borderTopWidth: index === 0 ? 0 : 1");
    expect(board).toContain("borderTopColor: colors.border");
  });

  it("says the empty line inside the section, by filter", () => {
    expect(board).toContain(
      "Nothing posted yet. Yours would be the first one on the board tonight.",
    );
    expect(board).toContain(": emptyFilterLine(filter)}");
    expect(room).not.toContain("No Flares yet");
  });

  it("has no repost row: joining posted the viewer's Flares already", () => {
    expect(board).not.toContain("you are still after");
    expect(board).not.toContain("<WantRow");
    expect(board).not.toContain("repostOpen");
    expect(room).not.toContain("Still looking for these?");
  });

  it("keeps the open-to-trades toggle for guests only", () => {
    expect(board).toMatch(
      /\{guest && \(\s*<AsyncButton\s+label=\{youOpen \? "Open to trades ✓" : "I'm open to trades"\}/,
    );
    expect(board).toContain("setOpenToTrades(code, !youOpen)");
  });
});

describe("a long section folds", () => {
  /*
   * The founder asked what a hundred Flares does to the room. A
   * player's section shows six cards, then a control at its end says
   * "and N more" and opens the whole section in place; while open it
   * reads "Show less". The zoom shelf is still built from the whole
   * section, so swiping through a card pages everything, not only the
   * six the fold left showing. The website folds at the same count
   * with the same words.
   */
  const board = joined.slice(
    joined.indexOf("THE BOARD:"),
    joined.indexOf('label="Traded tonight"'),
  );

  it("names the count once, as SECTION_FOLD = 6", () => {
    expect(room.match(/^const SECTION_FOLD = 6;$/gm)).toHaveLength(1);
    expect(room).not.toMatch(/slice\(0, 6\)/);
  });

  it("says and N more while folded and Show less while open", () => {
    expect(board).toContain("`and ${total - SECTION_FOLD} more`");
    expect(board).toContain('"Show less"');
    /* One label, drawn by the rail's tile and the stacked list's row. */
    expect(board.match(/\{foldLabel\}/g)).toHaveLength(2);
    expect(board).toContain("style={styles.foldTile}");
    expect(board).toContain("style={styles.foldRow}");
  });

  it("folds per visit, per player, with the same animation as the chevron", () => {
    expect(room).toContain(
      "const [foldOpen, setFoldOpen] = useState<Record<string, boolean>>({});",
    );
    expect(board).toContain(
      "const folded = total > SECTION_FOLD && !foldOpen[sessionId];",
    );
    expect(board).toMatch(
      /const toggleFold = \(\) => \{\s*LayoutAnimation\.configureNext\(\s*LayoutAnimation\.Presets\.easeInEaseOut,?\s*\);\s*setFoldOpen/,
    );
  });

  it("cuts the rail and the stacked list, each in its own drawn order", () => {
    expect(board).toMatch(
      /const railShown = folded\s*\? orderedRail\.slice\(0, SECTION_FOLD\)\s*: orderedRail;/,
    );
    expect(board).toContain("{railWantsShown.map(tile)}");
    expect(board).toContain("{railShowcasesShown.map(tile)}");
    /* Deck folders count by cards, not folders: the stacked order is
       flattened before the cut, and a folder shows what survived it. */
    expect(board).toContain("...folders.flatMap((f) => f.flares),");
    expect(board).toContain("stackOrder.slice(0, SECTION_FOLD)");
    expect(board).toContain("flares: inStack(folder.flares),");
    expect(board).toContain("{foldersShown.map((folder) => (");
  });

  it("builds the zoom shelf from the whole section", () => {
    /* The shelf and its index come from `orderedRail`, never from the
       cut, and the cut is taken after both exist. */
    expect(board).toContain("const shelf: ZoomCard[] = orderedRail.map((f) => ({");
    expect(board).toContain(
      "const shelfAt = new Map(orderedRail.map((f, index) => [f.id, index]));",
    );
    expect(board).not.toContain("railShown.map((f) => ({");
    expect(board.indexOf("const shelfAt = new Map(orderedRail")).toBeLessThan(
      board.indexOf("const railShown ="),
    );
  });

  it("draws the controls in the theme's colours", () => {
    const styles = room.slice(room.indexOf("const styles = StyleSheet.create({"));
    expect(styles).toMatch(
      /foldTile: \{[^}]*borderStyle: "dashed",[^}]*borderColor: colors\.border,/,
    );
    expect(styles).toMatch(/foldText: \{[^}]*color: colors\.accent,/);
  });
});

describe("the profile popup", () => {
  it("still opens from a board header's face, and leaves for the profile screen", () => {
    expect(room).not.toContain("<Title>In this room</Title>");
    expect(room).not.toContain("rosterOpen");
    expect(room).toContain('import { dedupeParticipants } from "../room-people";');
    expect(room).toMatch(
      /<PlayerPeekModal[\s\S]*?playerId=\{peek\}[\s\S]*?navigation\.navigate\("PlayerProfile", \{ playerId \}\)/,
    );
    expect(room).toContain("setPeek(playerBySession.get(sessionId)!)");
  });
});

describe("the one button", () => {
  it("is the floating + Flare, carrying whether you are open to trades, and the bar is gone", () => {
    const foot = joined.slice(joined.indexOf("<FlareFab"));
    expect(foot).toContain(
      'navigation.navigate("PostFlare", { code, openToTrades: youOpen })',
    );
    expect(joined).toContain("{joined && writable ? (");
    expect(room).not.toContain("styles.actionBar");
    expect(room).not.toContain("ACTION_BAR_HEIGHT");
    expect(room).not.toContain('label="Post a Flare"');
    expect(fab).toContain("accessibilityLabel={POST_A_FLARE}");
    expect(fab).toContain('position: "absolute"');
    /* The undo rides above the floating button. */
    expect(joined).toContain("bottom={FAB_HEIGHT + bottomClear + spacing(6)}");
    /* One mention of the toggle on the whole screen: the guest row. */
    expect(joined.split("I'm open to trades")).toHaveLength(2);
  });

  it("has the toggle in the composer's foot, from a route param", () => {
    expect(app).toContain("PostFlare: { code: string; openToTrades?: boolean };");
    expect(app).toContain("openToTrades={route.params.openToTrades}");
    expect(composer).toContain("openToTrades?: boolean;");
    expect(composer).toContain("const [open, setOpen] = useState(openToTrades);");
    expect(composer).toMatch(
      /target\.kind === "room" \? \(\s*<AsyncButton\s+label=\{open \? "Open to trades ✓" : "I'm open to trades"\}/,
    );
    expect(composer).toContain("await setOpenToTrades(target.code, !open);");
    expect(composer).toContain("setOpen(!open);");
  });
});
