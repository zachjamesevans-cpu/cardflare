import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { groupForKind } from "@/lib/notifications/push-prefs";
import { nightReminderCopy } from "@/lib/notifications/notify";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * Nights polish, the server half: matches graded by printing, a Flare
 * posted after Going following onto the night's board, and the
 * reminder on the day.
 */

describe("Flares follow you onto the nights you are going to", () => {
  const helper = read("src/lib/events/follow-on.ts");

  it("honours the auto-post switch, skips the board already posted to, and only writable boards", () => {
    expect(helper).toContain("if (!(await autoPostFor(input.playerId))) return NONE;");
    expect(helper).toContain("if (seat.event_id === input.skipEventId) continue;");
    expect(helper).toContain("if (!boardWritable(phase)) continue;");
    expect(helper).toContain('.eq("kind", "scheduled")');
    expect(helper).toContain('.is("cancelled_at", null)');
    expect(helper).toContain("addFlareBatch(");
  });

  it("is called from both doors a Feed post comes in by, after the answer", () => {
    const route = read("src/app/api/v1/flares/publish/route.ts");
    expect(route).toContain("afterResponse(() =>\n      followOntoNights({");
    expect(route).toContain("if (!body.code) {");
    const action = read("src/lib/flares/publish-actions.ts");
    expect(action).toContain("void followOntoNights({");
    expect(action).toContain("if (!input.toRoom) {");
  });
});

describe("the reminder on the day", () => {
  it("says the time, the matches and what to bring, or nudges a Flare", () => {
    const base = {
      eventName: "Friday Locals",
      storeName: "Card Cavern",
      when: "Fri 7:00 PM",
    };
    expect(nightReminderCopy({ ...base, matches: 3, bring: 2 })).toEqual({
      title: "Friday Locals is today at Card Cavern",
      body: "Fri 7:00 PM. 3 matches on the board, 2 cards to bring.",
    });
    expect(nightReminderCopy({ ...base, matches: 1, bring: 0 }).body).toBe(
      "Fri 7:00 PM. 1 match on the board.",
    );
    expect(nightReminderCopy({ ...base, matches: 2, bring: 1 }).body).toBe(
      "Fri 7:00 PM. 2 matches on the board, 1 card to bring.",
    );
    expect(nightReminderCopy({ ...base, matches: 0, bring: 0 }).body).toBe(
      "Fri 7:00 PM. Nothing matched yet. Post a Flare so people know what to bring.",
    );
  });

  it("is a kind of its own, behind the Nights switch, in the database's list", () => {
    expect(groupForKind("night-reminder")).toBe("nights");
    expect(read("src/lib/supabase/types.ts")).toContain('| "night-reminder"');
    const migration = read("supabase/migrations/20261101090000_night_reminder.sql");
    expect(migration).toContain("'night-reminder'");
    expect(migration).toContain("'night-match'");
    expect(migration).toMatch(/^begin;/m);
    expect(migration).toMatch(/^commit;/m);
    expect(migration).not.toMatch(/create table/i);
  });

  it("is sent once per night per player, with nobody's face on it", () => {
    const notify = read("src/lib/notifications/notify.ts");
    const start = notify.indexOf("export async function notifyNightReminder(");
    const body = notify.slice(start, notify.indexOf("\n}\n", start));
    expect(body).toContain('kind: "night-reminder"');
    expect(body).toContain("dedupeKey: `reminder:${entry.eventId}:${entry.playerId}`");
    expect(body).toContain("actorId: null");
    expect(body).toContain('"night-reminder");');
  });

  it("rides a half-hourly cron in the hours before doors, bounded by time, fail-closed", () => {
    const route = read("src/app/api/cron/night-reminder/route.ts");
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain("const HORIZON_MS = 3 * 60 * 60 * 1000;");
    expect(route).toContain("const TIME_BUDGET_MS = 45 * 1000;");
    expect(route).not.toContain("NOTICE_CAP");
    /* The sent-marker: whoever already has the reminder is skipped. */
    expect(route).toContain("const reminded = await alreadyReminded(event.id, players);");
    expect(route).toContain("if (reminded.has(playerId)) continue;");
    expect(route).toContain("if (!boardReadable(phase)) continue;");
    expect(route).toContain("nightMatches(event.id, playerId)");
    expect(route).toContain("matches: matches.summary.total,");
    expect(route).toContain("bring: matches.bring.length,");
    const vercel = JSON.parse(read("vercel.json")) as {
      crons: { path: string; schedule: string }[];
    };
    const cron = vercel.crons.find(
      (entry) => entry.path === "/api/cron/night-reminder",
    );
    expect(cron?.schedule).toBe("*/30 * * * *");
  });
});

describe("nights that have ended", () => {
  it("are closed by a fail-closed cron on a short clock", () => {
    const route = read("src/app/api/cron/close-nights/route.ts");
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain("if (!secret ||");
    expect(route).toContain("await sweepEndedScheduledEvents(new Date().toISOString());");
    const vercel = JSON.parse(read("vercel.json")) as {
      crons: { path: string; schedule: string }[];
    };
    expect(vercel.crons).toContainEqual({
      path: "/api/cron/close-nights",
      schedule: "*/15 * * * *",
    });
  });

  it("refuse trades and open-to-trades once the room has ended", () => {
    const trades = read("src/app/api/v1/rooms/[code]/trades/route.ts");
    const open = read("src/app/api/v1/rooms/[code]/open/route.ts");
    for (const route of [trades, open]) {
      expect(route).toContain('if (roomPhase(resolved.room) === "finished") {');
      expect(route).toContain('{ error: "room-ended" }');
    }
  });

  it("never paint as live in the app's Nights list", () => {
    const nights = read("mobile/src/screens/nights.tsx");
    expect(nights).toContain("export function phaseOf(night: NightItem");
    expect(nights).toContain('if (phaseOf(night, now) === "finished") return "past";');
    expect(nights).toContain("const phase = phaseOf(night);");
  });
});

describe("matches graded by printing", () => {
  it("reads the printing on every list and names the wanted one on the card", () => {
    const matches = read("src/lib/events/night-matches.ts");
    expect(matches).toContain('.select("card_id, printing_id")');
    expect(matches).toContain('.select("player_session_id, card_id, printing_id")');
    expect(matches).toContain('.select("player_id, card_id, printing_id")');
    expect(matches).toContain(
      '.select("event_id, player_session_id, card_id, printing_id, intent")',
    );
    expect(matches).toContain("export function matchCardFor(");
    expect(matches).toContain(
      "printingLabel: printing ? printingLabel(printing, named.name) : null,",
    );
  });
});
