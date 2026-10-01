import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app's Room tab after the redesign, read off its source.
 *
 * The founder: "There's just so many blocks... moving the remote from a
 * big block to a small little remote icon if they have access to it.
 * It's all just disconnected and want it to flow better." The page is
 * two cards now: the door (store, night's name with two round icons,
 * a meta line that opens the people list) and the board (every Flare,
 * players separated by hairlines, a foot row for what you are still
 * after), with one button under them. These pins hold the words and
 * the shape; nobody here has a renderer, so what a phone draws is not
 * what they prove.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const room = read("mobile/src/screens/room.tsx");
const people = read("mobile/src/room-people.tsx");
const composer = read("mobile/src/screens/flare-composer.tsx");
const app = read("mobile/App.tsx");

/** The joined room's screen, from the door card to the action bar. */
const joined = room.slice(
  room.indexOf("THE DOOR CARD"),
  room.indexOf("/** The website's pledge arithmetic"),
);

describe("the door card", () => {
  it("puts the remote and the help door on the night's name line", () => {
    const door = joined.slice(0, joined.indexOf("THE BOARD CARD"));
    /* Name and icons share one row: the name first, then the two. */
    expect(door).toMatch(
      /<Text style=\{styles\.nightName\}>\{room\.name\}<\/Text>[\s\S]*?<RemoteEntry \/>[\s\S]*?<DoorIconButton[\s\S]*?icon="help-circle-outline"[\s\S]*?label="How a night works"/,
    );
    expect(door).toContain("setTournamentHelp(true)");
    /* Both come from one place, so they cannot drift apart. */
    expect(room).toContain(
      'import { DoorIconButton, RemoteEntry } from "../remote-entry";',
    );
  });

  it("has a meta line that opens the people list", () => {
    const door = joined.slice(0, joined.indexOf("THE BOARD CARD"));
    expect(door).toContain('accessibilityLabel="Who\'s here"');
    expect(door).toContain("setPeopleOpen(true)");
    expect(door).toContain("here now");
    expect(door).toContain("tonight");
    /* Up to three present faces, tiny and overlapping, present first. */
    expect(room).toContain(
      "const faces = participants.filter((p) => p.present).slice(0, 3);",
    );
    expect(door).toMatch(/marginLeft: index === 0 \? 0 : -6/);
    expect(door).toMatch(/<PlayerAvatar[\s\S]*?size=\{22\}/);
  });

  it("has lost the old text link, counts and remote card", () => {
    expect(room).not.toContain("New to tournaments?");
    expect(room).not.toContain("Here's how a night works");
    expect(room).not.toContain("Open remote");
    /* The remote is on the door card now, not a block above it. */
    expect(joined.indexOf("<RemoteEntry />")).toBeGreaterThan(
      joined.indexOf("styles.nightName"),
    );
  });
});

describe("the board card", () => {
  const board = joined.slice(
    joined.indexOf("THE BOARD CARD"),
    joined.indexOf("<Title>Traded tonight</Title>"),
  );

  it("is one card headed Flares in the room, players split by hairlines", () => {
    expect(board).toContain("<Title>Flares in the room</Title>");
    expect(room).not.toContain("Newest first");
    /* The per-player groups are Views inside the one card. */
    expect(board).toMatch(/<View\s+key=\{sessionId\}/);
    expect(board).not.toMatch(/<Card key=\{sessionId\}/);
    expect(board).toContain("borderTopWidth: index === 0 ? 0 : 1");
    expect(board).toContain("borderTopColor: colors.border");
  });

  it("says the empty line inside the card", () => {
    expect(board).toContain(
      "Nothing posted yet. Yours would be the first one on the board tonight.",
    );
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
    joined.indexOf("THE BOARD CARD"),
    joined.indexOf("<Title>Traded tonight</Title>"),
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
      /const toggleFold = \(\) => \{\s*LayoutAnimation\.configureNext\(LayoutAnimation\.Presets\.easeInEaseOut\);\s*setFoldOpen/,
    );
  });

  it("cuts the rail and the stacked list, each in its own drawn order", () => {
    expect(board).toContain(
      "const railShown = folded ? orderedRail.slice(0, SECTION_FOLD) : orderedRail;",
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
      /foldTile: \{[^}]*borderStyle: "dashed",[^}]*borderColor: colors\.border,/s,
    );
    expect(styles).toMatch(/foldText: \{[^}]*color: colors\.accent,/s);
  });
});

describe("the people list", () => {
  it("replaces the In this room card with a Who's here modal", () => {
    expect(room).not.toContain("<Title>In this room</Title>");
    expect(room).not.toContain("rosterOpen");
    expect(room).toContain('import { RoomPeopleModal } from "../room-people";');
    expect(room).toMatch(
      /<RoomPeopleModal[\s\S]*?open=\{peopleOpen\}[\s\S]*?onPeek=\{setPeek\}/,
    );

    expect(people).toContain("Who&rsquo;s here");
    expect(people).toContain('import { SheetBackdrop } from "./action-menu";');
    expect(people).toContain("<SheetBackdrop />");
    expect(people).toContain('animationType="fade"');
    expect(people).toContain('accessibilityLabel="Close"');
    /* The rows the fold drew: present first, dimmed away, the tag. */
    expect(people).toContain("Number(b.present) - Number(a.present)");
    expect(people).toContain("dimmed={!p.present}");
    expect(people).toContain("<OpenToTradesTag />");
    expect(people).toContain("onPeek(p.playerId!)");
  });
});

describe("the one button", () => {
  it("is Post a Flare, carrying whether you are open to trades", () => {
    const bar = joined.slice(joined.indexOf("styles.actionBar"));
    expect(bar).toContain('label="Post a Flare"');
    expect(bar).toContain(
      'navigation.navigate("PostFlare", { code, openToTrades: youOpen })',
    );
    expect(bar).not.toContain("I'm open to trades");
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
