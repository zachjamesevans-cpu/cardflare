import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ALL_ON,
  groupForKind,
  isPushGroup,
  PUSH_GROUPS,
  PUSH_HEADING,
  PUSH_LINE,
} from "@/lib/notifications/push-prefs";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The push round, server half: four switches the push honours, a
 * badge and a channel on every push, tickets kept for the receipts
 * pass, and a message tap that lands in its thread.
 */

describe("the four push switches", () => {
  it("are offers, messages, nights and social, all on by default", () => {
    expect(PUSH_GROUPS.map((group) => group.key)).toEqual([
      "offers",
      "messages",
      "nights",
      "social",
    ]);
    expect(ALL_ON).toEqual({
      offers: true,
      messages: true,
      nights: true,
      social: true,
    });
    expect(isPushGroup("nights")).toBe(true);
    expect(isPushGroup("email")).toBe(false);
    expect(PUSH_HEADING).toBe("Push notifications");
    expect(PUSH_LINE).toBe("On your phone. The Inbox keeps every notice either way.");
    for (const group of PUSH_GROUPS) {
      expect(group.label).not.toContain("—");
      expect(group.line).not.toContain("—");
    }
  });

  it("put every notice kind behind exactly one switch", () => {
    const kinds = [
      "offer-received",
      "trade-confirmed",
      "early-board",
      "board-open",
      "new-follower",
      "room-flare",
      "message-received",
      "nearby-match",
      "post-comment",
      "store-post",
      "night-match",
    ];
    for (const kind of kinds) expect(isPushGroup(groupForKind(kind))).toBe(true);
    expect(groupForKind("offer-received")).toBe("offers");
    expect(groupForKind("trade-confirmed")).toBe("offers");
    expect(groupForKind("nearby-match")).toBe("offers");
    expect(groupForKind("message-received")).toBe("messages");
    expect(groupForKind("board-open")).toBe("nights");
    expect(groupForKind("night-match")).toBe("nights");
    expect(groupForKind("room-flare")).toBe("nights");
    expect(groupForKind("new-follower")).toBe("social");
    expect(groupForKind("store-post")).toBe("social");
    expect(groupForKind("post-comment")).toBe("social");
  });

  it("live on the players row, with the tickets table beside them", () => {
    const migration = read("supabase/migrations/20261030090000_push_prefs.sql");
    for (const column of [
      "push_offers",
      "push_messages",
      "push_nights",
      "push_social",
    ]) {
      expect(migration).toContain(
        `add column if not exists ${column} boolean not null default true`,
      );
    }
    expect(migration).toContain("create table if not exists public.push_tickets");
    expect(migration).toContain(
      "references public.player_devices (id) on delete cascade",
    );
    expect(migration).toContain(
      "alter table public.push_tickets enable row level security;",
    );
    const types = read("src/lib/supabase/types.ts");
    expect(types).toContain("push_offers: boolean;");
    expect(types).toContain("push_tickets: Table<PushTicketRow, PushTicketInsert>;");
  });

  it("are read and flipped on the server, through one action and one route", () => {
    const server = read("src/lib/notifications/push-prefs-server.ts");
    expect(server).toContain('import "server-only";');
    expect(server).toContain("export async function pushPrefsFor(");
    expect(server).toContain("export async function setPushPref(");
    const actions = read("src/lib/notifications/push-actions.ts");
    expect(actions).toContain('"use server";');
    expect(actions).toContain("export async function setPushPrefAction(");
    expect(actions).toContain("isPushGroup(group)");
    const route = read("src/app/api/v1/me/push/route.ts");
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function PUT");
    expect(route).toContain("pushPrefsFor(player.playerId)");
  });
});

describe("the push itself", () => {
  const notify = read("src/lib/notifications/notify.ts");
  const sender = notify.slice(
    notify.indexOf("async function deliverByPush("),
    notify.indexOf("async function deliverByEmail("),
  );

  it("honours the switch for its kind before it reaches for a device", () => {
    expect(sender).toContain('kind: NotificationRow["kind"],');
    expect(sender).toContain("const prefs = await pushPrefsFor(playerId);");
    expect(sender).toContain("if (!prefs[groupForKind(kind)]) return;");
    expect(sender.indexOf("groupForKind(kind)")).toBeLessThan(
      sender.indexOf('.from("player_devices")'),
    );
  });

  it("carries the Inbox's unread count as the badge, and the Android channel", () => {
    expect(sender).toContain("unreadCount(playerId).catch(() => 0),");
    expect(sender).toContain("const [badge, actor] = await Promise.all([");
    expect(sender).toContain("badge,");
    expect(sender).toContain('channelId: "default",');
  });

  it("keeps a ticket per accepted send for the receipts pass", () => {
    expect(sender).toContain('.from("push_tickets").insert(tickets)');
    expect(sender).toContain('ticket?.status === "ok" && ticket.id');
  });

  it("names its kind at every call", () => {
    const calls = (notify.match(/deliverByPush\([^;]*?\);/g) ?? []).filter(
      (call) => !call.includes("playerId: string"),
    );
    expect(calls.length).toBeGreaterThanOrEqual(15);
    for (const call of calls) expect(call).toMatch(/"[a-z-]+",?(\s*[\w.]+,?)?\s*\)/);
  });

  it("sends a message tap to its thread", () => {
    const start = notify.indexOf("export async function notifyMessageReceived(");
    const message = notify.slice(start, notify.indexOf("\n}\n", start));
    expect(message).toContain(
      "const path = `/local?thread=${encodeURIComponent(threadId)}`;",
    );
    expect(message).not.toContain('const path = "/local";');
  });
});

describe("the receipts pass", () => {
  it("runs daily, reads receipts, prunes dead devices, and drops the tickets", () => {
    const route = read("src/app/api/cron/push-receipts/route.ts");
    expect(route).toContain("getReceipts");
    expect(route).toContain("process.env.CRON_SECRET");
    expect(route).toContain('"DeviceNotRegistered"');
    expect(route).toContain('.from("player_devices")');
    expect(route).toContain('.from("push_tickets")');
    const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string }[] };
    expect(vercel.crons.some((cron) => cron.path === "/api/cron/push-receipts")).toBe(
      true,
    );
  });
});
