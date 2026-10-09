import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import * as web from "@/lib/events/night-binder-rules";
import * as app from "../../mobile/src/night-binder-copy";

/**
 * Binders I'm Bringing in the app, read off the source.
 *
 * The founder (2026-10-09): "When someone RSVPs 'Going' to a Night,
 * they should have the option to select which of their existing
 * digital binders they're bringing to that event... one binder,
 * multiple binders, or none." And: "Do not automatically expose
 * private binders." These pin the app's words to the website's, the
 * picker after Going, the private binder's switch and the Done it
 * holds back, the night's own row, the attendee's section above their
 * trade binders, and the night carried on every brought binder's way
 * in. The website's half is tests/unit/night-binders-web.test.ts.
 * Nobody here has a renderer; what a phone draws is the visual pass.
 */

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, "../..", path), "utf8");

const appTsx = read("mobile/App.tsx");
const api = read("mobile/src/api.ts");
const sheet = read("mobile/src/bringing-sheet.tsx");
const going = read("mobile/src/going-button.tsx");
const row = read("mobile/src/your-binders.tsx");
const room = read("mobile/src/screens/room.tsx");
const player = read("mobile/src/screens/night-player.tsx");
const binderScreen = read("mobile/src/screens/binder.tsx");
const binderList = read("mobile/src/binder-list.tsx");
const roster = read("mobile/src/players-going.tsx");
const copySource = read("mobile/src/night-binder-copy.ts");

describe("the app's words are the website's", () => {
  it("mirrors every string night-binder-rules.ts exports", () => {
    const webStrings = Object.entries(web).filter(([, v]) => typeof v === "string");
    expect(webStrings.length).toBeGreaterThan(10);
    for (const [name, value] of webStrings) {
      expect((app as Record<string, unknown>)[name], name).toBe(value);
    }
    for (const [name, value] of Object.entries(app)) {
      if (typeof value === "string") {
        expect((web as Record<string, unknown>)[name], name).toBe(value);
      }
    }
  });

  it("says every refusal the same way", () => {
    expect(app.BRINGING_REFUSALS).toEqual(web.BRINGING_REFUSALS);
  });

  it("titles, counts and explains the same way", () => {
    for (const day of ["tonight", "Friday", "Oct 24"]) {
      expect(app.yourBindersTitle(day)).toBe(web.yourBindersTitle(day));
    }
    for (const [binders, cards] of [
      [0, 0],
      [1, 1],
      [1, 12],
      [2, 47],
      [5, 0],
    ]) {
      expect(app.bringingLine(binders, cards)).toBe(web.bringingLine(binders, cards));
    }
    expect(app.bringingLine(2, 47)).toBe("2 binders selected · 47 cards");
    for (const name of ["Playables", "Vintage Holos"]) {
      expect(app.eventOnlyHint(name)).toBe(web.eventOnlyHint(name));
      expect(app.nightSharedLine(name)).toBe(web.nightSharedLine(name));
    }
    for (const names of [["Vault"], ["Vault", "Grails"], ["A", "B", "C"]]) {
      expect(app.consentNeededLine(names)).toBe(web.consentNeededLine(names));
    }
    expect(web.consentNeededLine(["Vault", "Grails"])).toBe(
      "Turn on Show to this Night only for Vault and Grails, or untick them.",
    );
  });

  it("copies only the words, and imports nothing", () => {
    expect(copySource).not.toMatch(/^import /m);
    expect(copySource).not.toContain("checkPicks");
    expect(copySource).not.toContain("broughtVisible");
  });

  it("keeps the few words outside the rules file the website's too", () => {
    const webPicker = read("src/components/nights/bringing-picker.tsx");
    const webRow = read("src/components/nights/your-binders.tsx");
    const webRoster = read("src/components/events/players-going.tsx");
    const constant = (source: string, name: string) =>
      source.match(new RegExp(`export const ${name} = ("[^"]*")`))?.[1];
    for (const name of ["YOUR_BINDERS_LINK", "CLOSE"]) {
      expect(constant(sheet, name), name).toBeDefined();
      expect(constant(sheet, name), name).toBe(constant(webPicker, name));
    }
    expect(constant(row, "PICK_BINDERS")).toBe(constant(webRow, "PICK_BINDERS"));
    const tail = 'return `Bringing ${n} ${n === 1 ? "binder" : "binders"}`;';
    expect(roster).toContain(tail);
    expect(webRoster).toContain(tail);
  });
});

describe("the picker", () => {
  it("is a swipe-away sheet titled and explained by the shared words", () => {
    expect(sheet).toContain("<SwipeToClose");
    expect(sheet).toContain("<Title>{BRINGING_PICKER_TITLE}</Title>");
    expect(sheet).toContain("{BRINGING_PICKER_HINT}");
    expect(sheet).toContain("<Loading />");
  });

  it("draws every binder with its own cover, name and count", () => {
    expect(sheet).toMatch(
      /<BinderCover\s+cover=\{binder\.cover\}\s+label=\{binder\.name\}\s+size="sm"/,
    );
    expect(sheet).toContain("{binder.name}");
    expect(sheet).toContain("binderCardsLine(binder.count)");
  });

  it("shows selection with the accent ring, the check, and to VoiceOver", () => {
    expect(sheet).toContain('borderColor: on ? colors.accent : "transparent"');
    expect(sheet).toContain('name="checkmark"');
    expect(sheet).toContain("accessibilityState={{ selected: on }}");
    expect(sheet).toContain('on ? "selected" : null');
  });

  it("tags a private binder and asks before it goes out", () => {
    expect(sheet).toContain("binder.forTrade ? null : PRIVATE_TAG");
    expect(sheet).toMatch(
      /privatePicked = picked\.filter\(\(binder\) => !binder\.forTrade\)/,
    );
    expect(sheet).toContain("{EVENT_ONLY_LABEL}");
    expect(sheet).toContain("{eventOnlyHint(binder.name)}");
    expect(sheet).toContain("<Switch");
    expect(sheet).toContain("trackColor={{ true: colors.accent");
    /* Off to begin with: a fresh pick carries no consent. */
    expect(sheet).toContain("{ selected: false, eventOnly: false }");
  });

  it("holds Done back while a private pick lacks its switch", () => {
    expect(sheet).toMatch(
      /waiting = privatePicked\.filter\(\(binder\) => !choices\[binder\.id\]\?\.eventOnly\)/,
    );
    expect(sheet).toMatch(
      /label=\{BRINGING_DONE\}[\s\S]{0,120}disabled=\{waiting\.length > 0\}/,
    );
    expect(sheet).toContain(
      "eventOnly: !binder.forTrade && (choices[binder.id]?.eventOnly ?? false)",
    );
  });

  it("saves an empty list for Not bringing any, and promises nothing", () => {
    expect(sheet).toMatch(
      /label=\{BRINGING_SKIP\}[\s\S]{0,160}onPress=\{\(\) => save\(\[\]\)\}/,
    );
    expect(sheet).toContain("{BRINGING_PROMISE}");
  });

  it("sends a player with no binders to their binders, with a way out", () => {
    expect(sheet).toContain("{BRINGING_NO_BINDERS}");
    expect(sheet).toContain('navigation.navigate("Binders")');
    expect(sheet).toContain("label={CLOSE}");
  });

  it("shows a refusal in the sheet, in the server's words, and stays open", () => {
    expect(sheet).toContain(
      "BRINGING_REFUSALS[caught.code as keyof typeof BRINGING_REFUSALS]",
    );
    expect(sheet).toMatch(
      /catch \(caught\) \{\s*setError\(refusalOf\(caught\)\);\s*\}/,
    );
  });

  it("talks to the night's binders route", () => {
    expect(api).toContain("/api/v1/nights/${encodeURIComponent(eventId)}/binders");
    expect(api).toMatch(/saveNightBinders[\s\S]{0,200}"PUT"[\s\S]{0,120}\{ picks \}/);
    expect(api).toContain("export interface NightBinderState");
    expect(api).toContain("export interface BroughtBinder");
    expect(api).toContain("bringing?: BroughtBinder[];");
    expect(api).toContain("bringing?: RosterBinder[];");
  });
});

describe("after Going", () => {
  it("offers the picker only on a confirmed Going", () => {
    expect(going).toMatch(
      /if \(next && answer\.youGoing\) \{\s*void offerBringingAfterGoing\(eventId/,
    );
  });

  it("never nags a player with no binders or with picks already", () => {
    expect(sheet).toContain(
      "if (state.binders.length === 0 || state.selectedCount > 0) return;",
    );
    expect(sheet).toContain("if (!state.editable || !state.going) return;");
  });

  it("draws the sheet from the root, so a header swap cannot take it away", () => {
    expect(appTsx).toContain("<BringingHost />");
    expect(appTsx.indexOf("<BringingHost />")).toBeLessThan(
      appTsx.indexOf("</NavigationContainer>"),
    );
  });
});

describe("the night's own row", () => {
  it("says the title and the line from the shared words", () => {
    expect(row).toContain("yourBindersTitle(state.dayWord)");
    expect(row).toContain("bringingLine(state.selectedCount, state.selectedCards)");
    expect(row).toContain("any ? BRINGING_EDIT : PICK_BINDERS");
    expect(row).toContain(
      "if (!state || !state.editable || !state.going) return null;",
    );
  });

  it("fans up to three picked covers, then +N", () => {
    expect(row).toContain("const STACK = 3;");
    expect(row).toContain('size="xs"');
    expect(row).toContain("`+${more}`");
  });

  it("sits just above Matches for you, for a player going", () => {
    const at = room.indexOf("<YourBinders");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(room.indexOf("<MatchesForYou"));
    expect(room).toMatch(/going\?\.youGoing && !finished \? \(\s*<YourBinders/);
    expect(room).toContain("onChanged={() => void refresh({ matches: true })}");
  });
});

describe("on an attendee's page", () => {
  it("draws Binders they're bringing above, and apart from, Trade binders", () => {
    const bringing = player.indexOf("label={BINDERS_THEYRE_BRINGING}");
    expect(bringing).toBeGreaterThan(0);
    expect(bringing).toBeLessThan(player.indexOf("label={TRADE_BINDERS}"));
    expect(player).toMatch(
      /bringing\.length > 0 \? \(\s*<NightSection label=\{BINDERS_THEYRE_BRINGING\}>/,
    );
    expect(player).toContain("<BinderList");
  });

  it("opens a brought binder through the night", () => {
    expect(player).toContain("nightId: night.eventId");
    expect(appTsx).toContain("nightId?: string");
    expect(appTsx).toContain("nightId={route.params?.nightId}");
    expect(binderScreen).toContain("getBroughtBinder(playerId, id, nightId)");
    expect(api).toContain("?night=${encodeURIComponent(nightId)}");
  });

  it("marks a private one This Night only", () => {
    expect(player).toContain("binder.eventOnly");
    expect(binderList).toContain("eventOnly?.has(binder.id)");
    expect(binderList).toContain("{EVENT_ONLY_TAG}");
  });
});

describe("on the roster", () => {
  it("says how many binders a player is bringing", () => {
    expect(roster).toContain("bringingCountLine(p.bringing.length)");
  });
});
