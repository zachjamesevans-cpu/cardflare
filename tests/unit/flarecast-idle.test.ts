import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACTIVE_POLL_MS,
  CLOSED_POLL_MS,
  checkIdlePanels,
  IDLE_POLL_MS,
  idleSlides,
  isOpenNow,
  pollDelayMs,
  tradesCaption,
  type IdleInfo,
} from "@/lib/event-hub/idle-rules";

/**
 * FlareCast's idle mode. The founder (2026-10-11): "if they're not
 * showing a tournament timer or anything - maybe it'll show some
 * valuable cardflare info, what time it is, when next event is, prior
 * cards people were looking for there", and "would it be expensive to
 * always have this up?" It was: the screen asked every three seconds all
 * day. Now it asks every thirty with no timer on it, and every five
 * minutes after hours.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/* A week of 11:00 to 21:00, Friday and Saturday to 01:00, Monday shut. */
const HOURS = [
  { open: "11:00", close: "21:00" },
  null,
  { open: "11:00", close: "21:00" },
  { open: "11:00", close: "21:00" },
  { open: "11:00", close: "21:00" },
  { open: "11:00", close: "01:00" },
  { open: "11:00", close: "01:00" },
];
const CHICAGO = "America/Chicago";
/** An instant at a given local time in Chicago (UTC-5 in October). */
const at = (iso: string) => new Date(`${iso}-05:00`).getTime();

describe("how often the screen asks", () => {
  it("every 3 seconds with a timer, 30 without, 5 minutes after hours", () => {
    expect(pollDelayMs({ timers: 1, idleMode: true, open: true })).toBe(ACTIVE_POLL_MS);
    expect(pollDelayMs({ timers: 1, idleMode: true, open: false })).toBe(
      ACTIVE_POLL_MS,
    );
    expect(pollDelayMs({ timers: 0, idleMode: true, open: true })).toBe(IDLE_POLL_MS);
    expect(pollDelayMs({ timers: 0, idleMode: true, open: false })).toBe(
      CLOSED_POLL_MS,
    );
    expect([ACTIVE_POLL_MS, IDLE_POLL_MS, CLOSED_POLL_MS]).toEqual([
      3_000, 30_000, 300_000,
    ]);
  });

  it("is the screen it always was with idle mode off", () => {
    expect(pollDelayMs({ timers: 0, idleMode: false, open: false })).toBe(
      ACTIVE_POLL_MS,
    );
  });

  it("waits as long as the last answer said, with a timeout it clears", () => {
    const clock = read("src/components/event-hub/display-clock.ts");
    expect(clock).toContain("delay.current = fresh.pollMs || POLL_MS;");
    expect(clock).toContain("}, delay.current);");
    expect(clock).toContain("clearTimeout(pollTimer);");
    expect(clock).not.toContain("setInterval(poll, POLL_MS)");
  });

  it("is told by the server, so a change of plan needs no new screen", () => {
    expect(read("src/lib/event-hub/display-payload.ts")).toContain(
      "pollMs: pollDelayMs({",
    );
  });
});

describe("open or closed, on the store's own clock", () => {
  it("follows the posted hours", () => {
    expect(isOpenNow(HOURS, CHICAGO, at("2026-10-14T12:00:00"))).toBe(true);
    expect(isOpenNow(HOURS, CHICAGO, at("2026-10-14T22:30:00"))).toBe(false);
    expect(isOpenNow(HOURS, CHICAGO, at("2026-10-14T09:00:00"))).toBe(false);
    /* Monday, shut all day. */
    expect(isOpenNow(HOURS, CHICAGO, at("2026-10-12T15:00:00"))).toBe(false);
  });

  it("runs a late night past midnight into the next morning", () => {
    /* Friday's 01:00 close, read at 00:30 on Saturday. */
    expect(isOpenNow(HOURS, CHICAGO, at("2026-10-17T00:30:00"))).toBe(true);
    expect(isOpenNow(HOURS, CHICAGO, at("2026-10-17T02:00:00"))).toBe(false);
  });

  it("counts unknown hours as open: a screen never goes dark over a skipped form", () => {
    expect(isOpenNow(null, CHICAGO, at("2026-10-14T03:00:00"))).toBe(true);
    expect(isOpenNow(Array(7).fill(null), CHICAGO, at("2026-10-14T03:00:00"))).toBe(
      true,
    );
  });

  it("stays awake for a room running late past the hours", () => {
    const payload = read("src/lib/event-hub/display-payload.ts");
    expect(payload).toContain(
      'storeOpen = live.outcome === "room" && live.room.status === "open";',
    );
  });
});

describe("the panels", () => {
  const info: IdleInfo = {
    nights: [
      {
        name: "One Piece Locals",
        startsAt: "2026-10-16T23:30:00Z",
        live: false,
        flaresOpen: true,
        going: 7,
      },
    ],
    wanted: [
      {
        cardId: "a",
        cardName: "Shanks",
        cardNumber: "OP01-120",
        imageUrl: null,
        people: 3,
      },
    ],
    trades: 0,
    post: null,
  };

  it("skips a panel with nothing to say, in the store's order", () => {
    const slides = idleSlides(["wanted", "trades", "nights", "posts"], info, []);
    expect(slides.map((slide) => slide.panel)).toEqual(["wanted", "nights"]);
  });

  it("shows only the panels the store chose", () => {
    expect(idleSlides(["nights"], info, []).map((slide) => slide.panel)).toEqual([
      "nights",
    ]);
    expect(idleSlides([], info, [])).toEqual([]);
  });

  it("puts a room open right now ahead of last week", () => {
    const live = [
      {
        cardId: "b",
        cardName: "Nami",
        cardNumber: "OP01-016",
        imageUrl: null,
        people: 1,
      },
    ];
    const [wanted] = idleSlides(["wanted"], info, live);
    expect(wanted).toMatchObject({ panel: "wanted", live: true });
    expect(wanted.panel === "wanted" && wanted.cards[0].cardId).toBe("b");
  });

  it("keeps only the panels we know, once each, in our order", () => {
    expect(checkIdlePanels(["posts", "bogus", "nights", "posts"])).toEqual([
      "nights",
      "posts",
    ]);
  });

  it("says the trades plainly, one or many", () => {
    expect(tradesCaption(1)).toBe("trade made here in the last 30 days");
    expect(tradesCaption(23)).toBe("trades made here in the last 30 days");
  });
});

describe("the wall's rules hold on the idle screen", () => {
  const info = read("src/lib/event-hub/idle-info.ts");
  const rules = read("src/lib/event-hub/idle-rules.ts");

  it("counts wanted cards from wants only, never what people let go", () => {
    expect(info).toContain('.eq("intent", "want")');
    expect(info).not.toContain('"showcase"');
  });

  it("carries cards and counts, never a person's name or a price", () => {
    const shapes = rules.slice(
      rules.indexOf("export interface IdleNight"),
      rules.indexOf("export type IdleSlide"),
    );
    expect(shapes).not.toMatch(/displayName|playerId|handle|price/i);
    expect(read("src/components/event-hub/idle-screen.tsx")).not.toMatch(
      /price|\$\{?\d/i,
    );
  });

  it("has its own route, read-only, asked every five minutes", () => {
    const route = read("src/app/api/display/[token]/idle/route.ts");
    expect(route).toContain("export async function GET(");
    expect(route).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(route).toContain("{ status: 404 }");
    expect(route).toContain("{ status: 402 }");
    expect(rules).toContain("export const IDLE_INFO_MS = 300_000;");
  });

  it("drifts a few pixels a minute so nothing burns in", () => {
    expect(read("src/components/event-hub/idle-screen.tsx")).toContain(
      "const minute = Math.floor(now / 60_000);",
    );
  });

  it("is set from the console, on with every panel by default", () => {
    const migration = read("supabase/migrations/20261114090000_flarecast_idle.sql");
    expect(migration).toContain(
      "add column if not exists idle_mode boolean not null default true",
    );
    expect(migration).toContain("default '{nights,wanted,trades,posts}'");
    expect(read("src/components/event-hub/display-settings.tsx")).toContain(
      '<input type="hidden" name="idlePanels" value="" />',
    );
    expect(read("src/lib/event-hub/actions.ts")).toContain(
      'formData.getAll("idlePanels")',
    );
  });

  it("shows the idle screen only with no timer, and only when it is on", () => {
    expect(read("src/components/event-hub/display-screen.tsx")).toContain(
      "if (timers.length === 0 && payload.idleMode) {",
    );
  });
});
