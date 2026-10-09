import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Binders I'm Bringing, on the website: the picker, where it opens, the
 * night's own row, and the attendee's section. The founder
 * (2026-10-09): "Add an attractive binder selection interface within
 * the existing Night RSVP experience... Do not automatically expose
 * private binders. If private binders can be selected, require an
 * explicit, clearly explained event-only visibility choice." The app's
 * half is night-binders-app.test.ts.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Comments out, so a pin on code cannot be satisfied by a remark. */
const spoken = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const web = {
  picker: spoken(read("src/components/nights/bringing-picker.tsx")),
  yourBinders: spoken(read("src/components/nights/your-binders.tsx")),
  going: spoken(read("src/components/nights/going-button.tsx")),
  room: spoken(read("src/app/e/[code]/page.tsx")),
  nightPlayer: spoken(read("src/components/events/night-player.tsx")),
  playerPage: spoken(read("src/app/e/[code]/p/[playerId]/page.tsx")),
  list: spoken(read("src/components/binder/binder-list.tsx")),
  playersGoing: spoken(read("src/components/events/players-going.tsx")),
};

function expectInOrder(source: string, markers: string[], label: string) {
  const positions = markers.map((marker) => source.indexOf(marker));
  markers.forEach((marker, index) => {
    expect(positions[index], `${label} is missing ${marker}`).toBeGreaterThan(-1);
  });
  expect(
    [...positions].sort((a, b) => a - b),
    `${label} draws out of order`,
  ).toEqual(positions);
}

describe("the picker", () => {
  it("is a sheet of the player's binders, drawn with the profile's own cover", () => {
    expect(web.picker).toContain('"use client"');
    expect(web.picker).toContain("<Sheet");
    expect(web.picker).toContain("title={BRINGING_PICKER_TITLE}");
    expect(web.picker).toContain("{BRINGING_PICKER_HINT}");
    expect(web.picker).toContain("<BinderCover");
    expect(web.picker).toContain('size="sm"');
    expect(web.picker).toContain("binderCardsLine(binder.count)");
  });

  it("toggles each binder as a pressed button, ringed and checked in the accent", () => {
    expect(web.picker).toContain("aria-pressed={on}");
    expect(web.picker).toContain('on ? "selected" : null');
    expect(web.picker).toContain("ring-accent");
    expect(web.picker).toContain("<Check");
  });

  it("asks before a private binder goes out, and holds Done until it is answered", () => {
    expect(web.picker).toContain("{PRIVATE_TAG}");
    expect(web.picker).toContain("{EVENT_ONLY_LABEL}");
    expect(web.picker).toContain("eventOnlyHint(binder.name)");
    expect(web.picker).toContain('role="switch"');
    /* The switch starts off: a fresh pick carries no consent. */
    expect(web.picker).toContain("{ selected: false, eventOnly: false }");
    expect(web.picker).toContain(
      "privatePicked.filter((binder) => !choices[binder.id]?.eventOnly)",
    );
    expect(web.picker).toContain("disabled={pending || waiting.length > 0}");
    expect(web.picker).toContain("eventOnly: !binder.forTrade &&");
  });

  it("saves through the server action, says the server's refusal, and promises nothing", () => {
    expect(web.picker).toContain("saveNightBindersAction(eventId, picks, code)");
    expect(web.picker).toContain("setError(result.message)");
    expect(web.picker).toContain("onClick={() => save([])}");
    expect(web.picker).toContain("{BRINGING_SKIP}");
    expect(web.picker).toContain("{BRINGING_DONE}");
    expect(web.picker).toContain("{BRINGING_PROMISE}");
    expect(web.picker).toContain("router.refresh()");
    expect(web.picker).toContain("<Spinner");
  });

  it("points a player with no binders at their binders instead", () => {
    expect(web.picker).toContain("{BRINGING_NO_BINDERS}");
    expect(web.picker).toContain('href="/profile/binders"');
  });
});

describe("after Going", () => {
  it("offers the picker once the server has the player going, with a binder and nothing picked", () => {
    expect(web.going).toContain("if (nextGoing && result.youGoing) offerBinders();");
    expect(web.going).toContain("nightBinderStateAction(eventId)");
    expect(web.going).toContain(
      "state.editable && state.binders.length > 0 && state.selectedCount === 0",
    );
    expect(web.going).toContain("<BringingPicker");
  });
});

describe("the night's own row", () => {
  it("reads the state only for a player going, and draws above Matches for you", () => {
    expect(web.room).toContain(
      "going?.youGoing ? nightBinderState(event.id, accountPlayerId)",
    );
    expect(web.room).toContain(
      "accountPlayerId && night?.youGoing && binderState?.editable && (",
    );
    expectInOrder(web.room, ["<YourBinders", "<MatchesForYou"], "the night page");
  });

  it("says how many binders and cards, fans the covers, and opens the picker", () => {
    expect(web.yourBinders).toContain("yourBindersTitle(current.dayWord)");
    expect(web.yourBinders).toContain(
      "bringingLine(current.selectedCount, current.selectedCards)",
    );
    expect(web.yourBinders).toContain('size="xs"');
    expect(web.yourBinders).toContain("+{more}");
    expect(web.yourBinders).toContain(
      "current.selectedCount > 0 ? BRINGING_EDIT : PICK_BINDERS",
    );
    expect(web.yourBinders).toContain("<BringingPicker");
  });
});

describe("the attendee's page", () => {
  it("draws Binders they're bringing above, and apart from, the trade binders", () => {
    expectInOrder(
      web.nightPlayer,
      ["{BINDERS_THEYRE_BRINGING}", "{TRADE_BINDERS}"],
      "the website's night player",
    );
    expect(web.nightPlayer).toContain("view.bringing.length > 0 && (");
    expect(web.playerPage).toContain("eventId={event.id}");
  });

  it("opens a brought binder through the night, tagged when it is this Night only", () => {
    expect(web.nightPlayer).toContain("query={`?night=${eventId}`}");
    expect(web.list).toContain("href={`${base}/binders/${binder.id}${query}`}");
    expect(web.list).toContain("eventOnly?.has(binder.id)");
    expect(web.list).toContain("{EVENT_ONLY_TAG}");
  });
});

describe("the roster", () => {
  it("says who is bringing binders on the line that counts their trade cards", () => {
    expect(web.playersGoing).toContain("{player.bringing.length > 0 &&");
    expect(web.playersGoing).toContain("bringingCountLine(player.bringing.length)");
    expect(web.playersGoing).toContain(
      '`Bringing ${n} ${n === 1 ? "binder" : "binders"}`',
    );
  });
});

describe("the new files", () => {
  it("use tokens only and no em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const [name, path] of [
      ["picker", "src/components/nights/bringing-picker.tsx"],
      ["yourBinders", "src/components/nights/your-binders.tsx"],
    ]) {
      const source = read(path);
      expect(source, `${name} has a hex colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source, `${name} has an em dash`).not.toContain(emDash);
    }
  });
});
