import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  countTradePartners,
  tradePartnersLine,
  type PartnerTradeRow,
} from "@/lib/trades/partner-rules";
import { tradePartnersLine as appLine } from "../../mobile/src/trade-partners";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const row = (over: Partial<PartnerTradeRow>): PartnerTradeRow => ({
  requester_player_id: null,
  holder_player_id: null,
  requester_session_id: null,
  holder_session_id: null,
  acknowledged_at: "2026-11-01T00:00:00Z",
  disputed_at: null,
  ...over,
});

describe("how many players somebody has traded with", () => {
  const none = new Map<string, string>();

  it("counts people, not trades: forty with one friend is one", () => {
    const rows = Array.from({ length: 40 }, () =>
      row({ requester_player_id: "me", holder_player_id: "friend" }),
    );
    expect(countTradePartners(rows, "me", none)).toBe(1);
  });

  it("counts a partner from either chair", () => {
    const rows = [
      row({ requester_player_id: "me", holder_player_id: "a" }),
      row({ requester_player_id: "b", holder_player_id: "me" }),
    ];
    expect(countTradePartners(rows, "me", none)).toBe(2);
  });

  it("leaves out a trade the other side never confirmed", () => {
    const rows = [
      row({
        requester_player_id: "me",
        holder_player_id: "a",
        acknowledged_at: null,
      }),
    ];
    expect(countTradePartners(rows, "me", none)).toBe(0);
  });

  it("leaves out a disputed trade", () => {
    const rows = [
      row({
        requester_player_id: "me",
        holder_player_id: "a",
        disputed_at: "2026-11-02T00:00:00Z",
      }),
    ];
    expect(countTradePartners(rows, "me", none)).toBe(0);
  });

  it("reads a room trade through its sessions", () => {
    const accounts = new Map([
      ["s-me", "me"],
      ["s-a", "a"],
    ]);
    const rows = [row({ requester_session_id: "s-me", holder_session_id: "s-a" })];
    expect(countTradePartners(rows, "me", accounts)).toBe(1);
  });

  it("does not count a guest, who is a new stranger on every scan", () => {
    const accounts = new Map([["s-me", "me"]]);
    const rows = [
      row({ requester_session_id: "s-me", holder_session_id: "guest-1" }),
      row({ requester_session_id: "s-me", holder_session_id: "guest-2" }),
    ];
    expect(countTradePartners(rows, "me", accounts)).toBe(0);
  });

  it("counts the same person once across a room and a conversation", () => {
    const accounts = new Map([
      ["s-me", "me"],
      ["s-a", "a"],
    ]);
    const rows = [
      row({ requester_session_id: "s-me", holder_session_id: "s-a" }),
      row({ requester_player_id: "a", holder_player_id: "me" }),
    ];
    expect(countTradePartners(rows, "me", accounts)).toBe(1);
  });

  it("never counts the player as their own partner", () => {
    const accounts = new Map([
      ["s-1", "me"],
      ["s-2", "me"],
    ]);
    const rows = [row({ requester_session_id: "s-1", holder_session_id: "s-2" })];
    expect(countTradePartners(rows, "me", accounts)).toBe(0);
  });
});

describe("the line on the profile", () => {
  it("says nothing until there is one", () => {
    expect(tradePartnersLine(0)).toBeNull();
    expect(tradePartnersLine(Number.NaN)).toBeNull();
  });

  it("counts in the singular and the plural", () => {
    expect(tradePartnersLine(1)).toBe("Traded with 1 player");
    expect(tradePartnersLine(7)).toBe("Traded with 7 players");
  });

  it("reads the same in the app, which also survives an older server", () => {
    for (const count of [0, 1, 2, 7, 120]) {
      expect(appLine(count)).toBe(tradePartnersLine(count));
    }
    expect(appLine(undefined)).toBeNull();
  });

  it("is drawn by both headers, under the bio and not as a fourth number", () => {
    const web = read("src/components/players/profile-header.tsx");
    const app = read("mobile/src/profile-header.tsx");
    expect(web).toContain("tradePartnersLine(stats.tradePartners)");
    expect(app).toContain("tradePartnersLine(stats?.tradePartners)");
    expect(web).toContain('<div className="grid flex-1 grid-cols-3 gap-2">');
  });

  it("only reads trades both sides confirmed and nobody disputed", () => {
    const server = read("src/lib/trades/partners.ts");
    expect(server).toContain('.not("acknowledged_at", "is", null)');
    expect(server).toContain('.is("disputed_at", null)');
  });
});
