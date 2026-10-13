import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  evidenceFor,
  isAltPrinting,
  narrowPrintings,
  nameMatches,
  scoreEvidence,
  verdict,
  type Evidence,
} from "@/lib/cards/scan-confidence";
import { benchTotals, liveTotals, scoreRun } from "@/lib/cards/scan-bench-rules";

/**
 * The second scanner's server rules that need no network: the evidence
 * score, the printing narrowing, the bench arithmetic, prices, keys kept
 * out of logs, and migrations that leave every binder as it was.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const thresholds = { autoAccept: 0.75, reviewFloor: 0.35 };
const strong: Evidence = {
  number: "exact",
  nameMatches: true,
  traitsAgree: 4,
  traitsKnown: 4,
  only: true,
  art: "not-asked",
  readerSure: true,
  agreed: false,
};

describe("confidence from evidence", () => {
  it("matches on a number, a name and agreeing traits", () => {
    expect(
      verdict({ kind: "candidate", evidence: strong, printingOpen: false }, thresholds),
    ).toMatchObject({
      status: "matched",
      needsReview: false,
    });
  });

  it("never matches on the reader's word alone", () => {
    const word: Evidence = {
      ...strong,
      number: "unread",
      nameMatches: false,
      only: false,
      traitsKnown: 0,
      traitsAgree: 0,
    };
    const v = verdict(
      { kind: "candidate", evidence: word, printingOpen: false },
      thresholds,
    );
    expect(v.status).not.toBe("matched");
  });

  it("holds a known card with an open printing for the player", () => {
    const v = verdict(
      { kind: "candidate", evidence: strong, printingOpen: true },
      thresholds,
    );
    expect(v.status).toBe("ambiguous");
    expect(v.reasons).toContain("printing needs choosing");
  });

  it("counts two readers agreeing as a nudge, never as proof", () => {
    const bare: Evidence = {
      ...strong,
      number: "unread",
      nameMatches: false,
      traitsKnown: 0,
      traitsAgree: 0,
      only: false,
    };
    expect(
      scoreEvidence({ ...bare, agreed: true }).score - scoreEvidence(bare).score,
    ).toBeCloseTo(0.05);
    expect(
      verdict(
        { kind: "candidate", evidence: { ...bare, agreed: true }, printingOpen: false },
        thresholds,
      ).status,
    ).not.toBe("matched");
  });

  it("lets the pictures overrule", () => {
    expect(scoreEvidence({ ...strong, art: "rejected" }).score).toBeLessThan(
      scoreEvidence(strong).score,
    );
  });

  it("calls an empty pocket empty and a missing card unrecognized", () => {
    expect(verdict({ kind: "empty" }, thresholds).status).toBe("empty");
    expect(verdict({ kind: "none", readerSaw: true }, thresholds)).toMatchObject({
      status: "unrecognized",
      confidence: 0,
    });
  });

  it("builds evidence from the catalogue card, not the model", () => {
    const e = evidenceFor(
      {
        name: "Roronoa Zoro",
        englishName: "Roronoa Zoro",
        number: "OP06-118",
        setCode: "OP06",
        colors: ["purple"],
        power: 6000,
        cost: 5,
        cardType: "character",
        sure: true,
      },
      {
        exactName: "Roronoa Zoro",
        canonicalCardNumber: "OP06-118",
        colors: ["Purple"],
        power: 6000,
        cost: 5,
        cardType: "Character",
      },
      { only: true, art: "not-asked", agreed: false },
    );
    expect(e).toMatchObject({
      number: "exact",
      nameMatches: true,
      traitsAgree: 4,
      traitsKnown: 4,
    });
    expect(nameMatches({ name: "Zorro", englishName: "Zorro" }, "Roronoa Zoro")).toBe(
      false,
    );
  });
});

describe("narrowing printings", () => {
  const p = (id: string, more: Record<string, string | null> = {}) => ({
    id,
    setCode: "OP06",
    rarity: "SR",
    printingLabel: null,
    variantType: null,
    printingName: null,
    ...more,
  });
  const base = p("base");
  const alt = p("alt", { variantType: "Alternate Art" });
  const reprint = p("st", { setCode: "ST10", rarity: "C" });

  it("reads an alternate art from the catalogue's own labels", () => {
    expect(isAltPrinting(alt)).toBe(true);
    expect(isAltPrinting(base)).toBe(false);
    expect(isAltPrinting(p("x", { printingLabel: "Parallel" }))).toBe(true);
  });

  it("narrows by set code, rarity, then art, softly", () => {
    expect(
      narrowPrintings([base, alt, reprint], {
        setCode: "OP06",
        rarity: "SR",
        altArt: true,
      }).map((x) => x.id),
    ).toEqual(["alt"]);
    expect(
      narrowPrintings([base, alt, reprint], {
        setCode: "ST10",
        rarity: "",
        altArt: false,
      }).map((x) => x.id),
    ).toEqual(["st"]);
    /* A filter that would rule out everything is skipped. */
    expect(
      narrowPrintings([base, alt], { setCode: "OP99", rarity: "", altArt: false }).map(
        (x) => x.id,
      ),
    ).toEqual(["base"]);
    /* What the pictures choose between: the art word left out. */
    expect(
      narrowPrintings(
        [base, alt, reprint],
        { setCode: "OP06", rarity: "", altArt: false },
        { art: false },
      ).map((x) => x.id),
    ).toEqual(["base", "alt"]);
  });
});

describe("the bench's arithmetic", () => {
  const truth = [
    { slot: 0, empty: false, cardId: "a", printingId: "a1" },
    { slot: 1, empty: false, cardId: "b", printingId: null },
    { slot: 2, empty: true, cardId: null, printingId: null },
  ];
  const pocket = (
    slot: number,
    cardId: string | null,
    printingId: string | null = null,
  ) => ({
    slot,
    status: cardId ? ("matched" as const) : ("empty" as const),
    cardId,
    printingId,
    name: "",
    number: "",
  });

  it("scores exact card, printing, placement and empty pockets against the labels only", () => {
    const score = scoreRun(
      { pockets: [pocket(0, "a", "a2"), pocket(1, null), pocket(2, "b")] },
      truth,
    );
    expect(score).toMatchObject({
      cards: 2,
      exact: 1,
      printings: 1,
      printingRight: 0,
      /* b was named, but in the wrong pocket. */
      found: 2,
      placedRight: 1,
      pockets: 3,
      /* A1 rightly not empty; A2 wrongly empty; A3 wrongly a card. */
      emptyRight: 1,
    });
  });

  it("claims nothing without labels", () => {
    const totals = benchTotals([
      {
        runs: {
          anthropic: {
            mode: "anthropic",
            ok: true,
            reason: null,
            ms: 4000,
            cents: 0.3,
            input: 1,
            output: 1,
            calls: 1,
            escalated: 0,
            pockets: [],
          },
        },
        truth: null,
      },
    ]);
    const anthropic = totals.find((t) => t.mode === "anthropic");
    expect(anthropic).toMatchObject({
      photos: 1,
      labelled: 0,
      exactCard: null,
      averageCents: 0.3,
      averageMs: 4000,
    });
    expect(totals.find((t) => t.mode === "openai")).toMatchObject({
      photos: 0,
      averageCents: null,
    });
  });

  it("counts corrections only on pages that were placed", () => {
    const [hybrid] = liveTotals([
      {
        mode: "hybrid",
        cents: 0.4,
        ms: 9000,
        matched: 7,
        review: 1,
        unrecognized: 1,
        corrections: 2,
      },
      {
        mode: "hybrid",
        cents: 0.2,
        ms: 7000,
        matched: 9,
        review: 0,
        unrecognized: 0,
        corrections: null,
      },
    ]);
    expect(hybrid.pages).toBe(2);
    expect(hybrid.correctionRate).toBeCloseTo(2 / 9);
    expect(hybrid.averageCents).toBeCloseTo(0.3);
  });
});

describe("prices and keys", () => {
  it("prices from the settings, an unknown model as the dearest", async () => {
    const { callCents } = await import("@/lib/cards/scan-providers");
    const prices = {
      "claude-haiku-5-5": [0.1, 0.5, 0.01] as [number, number, number],
      "gpt-5.4-mini": [0.75, 4.5, 0.075] as [number, number, number],
    };
    expect(
      callCents(prices, "gpt-5.4-mini", { input: 1_000_000, output: 0, cached: 0 }),
    ).toBeCloseTo(75);
    expect(
      callCents(prices, "gpt-5.4-mini", {
        input: 1_000_000,
        output: 0,
        cached: 1_000_000,
      }),
    ).toBeCloseTo(7.5);
    expect(
      callCents(prices, "something-new", { input: 0, output: 1_000_000, cached: 0 }),
    ).toBeGreaterThanOrEqual(450);
  });

  it("keeps keys from both providers out of anything logged", async () => {
    const { withoutKeys } = await import("@/lib/cards/scan");
    const line = withoutKeys(
      "failed: sk-ant-api03-abcdefghijklmnop and sk-proj-ABCDEFGHIJKLMNOPQRSTUVWX with Authorization: Bearer sk-ABCDEFGHIJKLMNOPQRSTUV",
    );
    expect(line).not.toMatch(/abcdefghijklmnop|ABCDEFGHIJKLMNOPQRSTUV/);
  });

  it("reads keys from the server's environment only, and never sends them to a page", () => {
    expect(read("src/lib/cards/scan-providers.ts")).toMatch(/^import "server-only";/);
    expect(read("src/lib/cards/scan-settings.ts")).toContain("Never the key itself.");
    expect(read("src/app/admin/scanner/page.tsx")).not.toContain("process.env");
  });

  it("asks OpenAI at full resolution for a strict answer and keeps nothing there", () => {
    const providers = read("src/lib/cards/scan-providers.ts");
    expect(providers).toContain('detail: "original"');
    expect(providers).toMatch(
      /type: "json_schema",\s*name: "binder_pockets",\s*schema: OPENAI_SCHEMA,\s*strict: true/,
    );
    expect(providers).toContain("store: false");
  });
});

describe("the migrations keep every binder as it was", () => {
  const scanner = read("supabase/migrations/20261120090000_scanner_v2.sql");
  const copies = read("supabase/migrations/20261120091000_binder_pocket_copies.sql");

  it("add, never take away", () => {
    for (const sql of [scanner, copies]) {
      expect(sql).not.toMatch(/drop\s+table/i);
      expect(sql).not.toMatch(/truncate/i);
      expect(sql).not.toMatch(/drop\s+column/i);
    }
    /* Outside the functions, no binder row is touched. */
    const topLevel = (sql: string) => sql.replace(/\$\$[\s\S]*?\$\$/g, "");
    for (const sql of [scanner, copies]) {
      expect(topLevel(sql)).not.toMatch(/(delete from|update)\s+public\.binder_cards/i);
    }
  });

  it("lets a binder hold the same card in several pockets", () => {
    expect(copies).toContain(
      "drop index if exists public.binder_cards_one_per_printing;",
    );
    expect(copies).toContain("create index if not exists binder_cards_card_idx");
  });

  it("takes logged trades' copies from the last pocket first, and adds to the first", () => {
    const fn = copies.slice(
      copies.indexOf("create or replace function public.binder_card_adjust("),
    );
    expect(fn).toContain("order by position desc nulls first, created_at desc");
    expect(fn).toContain("order by position nulls last, created_at");
  });

  it("counts the Have list over every pocket of a binder", () => {
    const binder = read("src/lib/binder/binder.ts");
    expect(binder).toContain(
      "byBinder.set(row.binder_id, (byBinder.get(row.binder_id) ?? 0) + row.quantity);",
    );
  });
});
