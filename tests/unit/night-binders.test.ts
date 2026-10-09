import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  bringingLine,
  broughtCounts,
  broughtVisible,
  checkPicks,
  yourBindersTitle,
} from "@/lib/events/night-binder-rules";
import { dayWordFor } from "@/lib/events/night-binders";
import { emptyLists, matchAttendees, notePrinting } from "@/lib/events/night-matches";

/**
 * Binders I'm Bringing, server side: who may see a brought binder, what
 * a pick may contain, and how a brought binder's cards reach a night's
 * matches. The founder (2026-10-09): "Do not automatically expose
 * private binders... Selecting a binder for one Night must not
 * automatically select it for every future event... Selections should
 * expire from active event visibility when the Night ends."
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** Comments out, so a pin on code cannot be satisfied by a remark. */
const spoken = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function filesUnder(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = `${dir}/${name}`;
    if (statSync(join(root, path)).isDirectory()) return filesUnder(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("what a pick may contain", () => {
  const owned = new Map([
    ["trade", { forTrade: true }],
    ["vault", { forTrade: false }],
  ]);

  it("takes a binder up for trade as it is, with no event-only flag", () => {
    expect(checkPicks([{ binderId: "trade", eventOnly: true }], owned)).toEqual({
      ok: true,
      rows: [{ binderId: "trade", eventOnly: false }],
    });
  });

  it("refuses a private binder without the explicit event-only choice", () => {
    expect(checkPicks([{ binderId: "vault", eventOnly: false }], owned)).toEqual({
      ok: false,
      reason: "needs-consent",
      binderId: "vault",
    });
  });

  it("keeps a private binder brought with event-only on", () => {
    expect(checkPicks([{ binderId: "vault", eventOnly: true }], owned)).toEqual({
      ok: true,
      rows: [{ binderId: "vault", eventOnly: true }],
    });
  });

  it("refuses somebody else's binder, and collapses duplicates", () => {
    expect(checkPicks([{ binderId: "theirs", eventOnly: true }], owned)).toMatchObject({
      ok: false,
      reason: "not-yours",
    });
    const twice = checkPicks(
      [
        { binderId: "trade", eventOnly: false },
        { binderId: "trade", eventOnly: false },
      ],
      owned,
    );
    expect(twice.ok && twice.rows).toHaveLength(1);
  });

  it("takes an empty list: not bringing any", () => {
    expect(checkPicks([], owned)).toEqual({ ok: true, rows: [] });
  });
});

describe("who may see a brought binder", () => {
  const base = {
    forTrade: false,
    eventOnly: true,
    viewerIsOwner: false,
    viewerAttending: true,
    nightOpen: true,
  };

  it("shows a binder up for trade to anyone who can see the night", () => {
    expect(broughtVisible({ ...base, forTrade: true, viewerAttending: false })).toBe(
      true,
    );
  });

  it("shows a private, event-only binder to an attendee only", () => {
    expect(broughtVisible(base)).toBe(true);
    expect(broughtVisible({ ...base, viewerAttending: false })).toBe(false);
  });

  it("never shows a private binder its owner did not choose to show", () => {
    expect(broughtVisible({ ...base, eventOnly: false })).toBe(false);
  });

  it("shows nobody else anything once the night is over, and always shows the owner", () => {
    expect(broughtVisible({ ...base, forTrade: true, nightOpen: false })).toBe(false);
    expect(broughtVisible({ ...base, nightOpen: false, viewerIsOwner: true })).toBe(
      true,
    );
  });

  it("counts in matching on the same rule", () => {
    expect(broughtCounts({ ...base, viewerAttending: false })).toBe(false);
    expect(broughtCounts(base)).toBe(true);
    expect(broughtCounts({ ...base, eventOnly: false })).toBe(false);
    /* Your own private binder made private after picking, without the
       choice, stops counting even for you: its own setting wins. */
    expect(broughtCounts({ ...base, eventOnly: false, viewerIsOwner: true })).toBe(
      false,
    );
  });
});

describe("the words", () => {
  it("says what is picked, and nudges when nothing is", () => {
    expect(bringingLine(2, 47)).toBe("2 binders selected · 47 cards");
    expect(bringingLine(1, 1)).toBe("1 binder selected · 1 card");
    expect(bringingLine(0, 0)).toBe("Pick the binders you're bringing");
    expect(yourBindersTitle("tonight")).toBe("Your binders for tonight");
  });

  it("names the night's day in the store's own zone", () => {
    /* Friday 2026-10-09, 10:00 in Chicago. */
    const now = Date.parse("2026-10-09T15:00:00Z");
    const zone = "America/Chicago";
    expect(dayWordFor("2026-10-10T00:30:00Z", zone, now)).toBe("tonight");
    expect(dayWordFor("2026-10-12T23:00:00Z", zone, now)).toBe("Monday");
    expect(dayWordFor("2026-10-30T23:00:00Z", zone, now)).toBe("Oct 30");
  });
});

describe("a brought binder's cards in a night's matches", () => {
  it("matches them and says which binder they come in", () => {
    const viewer = emptyLists();
    viewer.wants.add("shanks");
    const attendee = emptyLists();
    attendee.binderHaves.add("shanks");
    notePrinting(attendee.havePrintings, "shanks", null);
    attendee.brought = new Map([["shanks", "Grails"]]);

    const [matched] = matchAttendees(viewer, new Map([["p2", attendee]]));
    expect(matched.theyHave).toEqual([
      expect.objectContaining({ cardId: "shanks", bringingFrom: "Grails" }),
    ]);
  });

  it("marks your own brought cards in the other direction", () => {
    const viewer = emptyLists();
    viewer.binderHaves.add("luffy");
    viewer.brought = new Map([["luffy", "Playables"]]);
    const attendee = emptyLists();
    attendee.wants.add("luffy");

    const [matched] = matchAttendees(viewer, new Map([["p2", attendee]]));
    expect(matched.theyWant[0].bringingFrom).toBe("Playables");
  });
});

describe("the privacy rule lives in one place", () => {
  it("leaves night-matches.ts without a query against binder_cards", () => {
    expect(spoken(read("src/lib/events/night-matches.ts"))).not.toContain(
      "binder_cards",
    );
  });

  it("opens a binder past its privacy only from night-binders.ts", () => {
    const callers = filesUnder("src")
      .filter((path) => path !== "src/lib/binder/binder.ts")
      .filter((path) => spoken(read(path)).includes("readBinderForNight("));
    expect(callers).toEqual(["src/lib/events/night-binders.ts"]);
  });

  it("checks the roster, the pick and the rule before opening a brought binder", () => {
    const source = spoken(read("src/lib/events/night-binders.ts"));
    const open = source.slice(source.indexOf("export async function readNightBinder("));
    expect(open).toContain('.from("night_binders")');
    expect(open).toContain("roster.some((row) => row.playerId === ownerId)");
    expect(open).toContain("broughtVisible({");
    expect(open).toContain("blockState(viewerId, ownerId)");
  });

  it("saves only for a player on the roster of a night that still takes changes", () => {
    const source = spoken(read("src/lib/events/night-binders.ts"));
    const save = source.slice(
      source.indexOf("export async function saveNightBinders("),
    );
    expect(save).toContain(
      'if (!boardWritable(night.phase)) return { ok: false, reason: "not-open" };',
    );
    expect(save).toContain('return { ok: false, reason: "not-going" }');
    expect(save).toContain("checkPicks(");
  });
});

describe("the table", () => {
  const migration = read("supabase/migrations/20261110090000_night_binders.sql");

  it("points at the binder per night, and copies no cards", () => {
    expect(migration).toContain("primary key (event_id, binder_id)");
    expect(migration).toContain("references public.binders(id) on delete cascade");
    expect(migration).not.toMatch(/card_id/);
  });

  it("is service-role only, like every table a session writes", () => {
    expect(migration).toContain(
      "alter table public.night_binders enable row level security;",
    );
    expect(migration).not.toMatch(/create policy/i);
  });
});

describe("the doors in", () => {
  it("serves the app the picker and the save, validated", () => {
    const route = read("src/app/api/v1/nights/[eventId]/binders/route.ts");
    expect(route).toContain("nightBinderState(id.data, player.playerId)");
    expect(route).toContain(
      "saveNightBinders(id.data, player.playerId, parsed.data.picks)",
    );
    expect(route).toContain("z.object({ binderId: z.guid(), eventOnly: z.boolean() })");
  });

  it("gives the website the same save behind a rate limit", () => {
    const action = read("src/lib/events/night-binder-actions.ts");
    expect(action).toContain('"use server";');
    expect(action).toContain(
      "saveNightBinders(id.data, account.playerId, parsed.data)",
    );
    expect(action).toContain("checkRateLimit(");
  });

  it("opens a brought binder only through its night, on both doors", () => {
    expect(read("src/app/api/v1/binders/[binderId]/route.ts")).toContain(
      "readNightBinder(night.data, owner, id, player.playerId)",
    );
    expect(read("src/components/binder/public-binder.tsx")).toContain(
      "readNightBinder(nightId, playerId, binderId, me)",
    );
  });
});
