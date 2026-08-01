import { describe, expect, it } from "vitest";

import {
  describeCounts,
  fullSyncPermitted,
  parseSyncMode,
} from "@/lib/cards/sync-state";

describe("parseSyncMode", () => {
  it("accepts the two modes the enum names", () => {
    expect(parseSyncMode("sample")).toBe("sample");
    expect(parseSyncMode("full")).toBe("full");
  });

  /*
   * The action is a public POST endpoint. Defaulting an unrecognised value
   * would mean a malformed request picks a mode for us, and the wrong default
   * is thousands of calls to somebody else's free API.
   */
  it("rejects anything else rather than defaulting", () => {
    for (const value of ["", "FULL", "everything", null, undefined, 1, {}]) {
      expect(parseSyncMode(value)).toBeNull();
    }
  });
});

describe("fullSyncPermitted", () => {
  it("never asks a sample run to confirm", () => {
    expect(fullSyncPermitted("sample", undefined)).toBe(true);
    expect(fullSyncPermitted("sample", "")).toBe(true);
  });

  it("requires the confirmation for a full run", () => {
    expect(fullSyncPermitted("full", "on")).toBe(true);
    expect(fullSyncPermitted("full", "")).toBe(false);
    expect(fullSyncPermitted("full", undefined)).toBe(false);
    // An unchecked box sends nothing; a checked one sends exactly "on".
    expect(fullSyncPermitted("full", "true")).toBe(false);
  });
});

describe("describeCounts", () => {
  const counts = {
    recordsSeen: 5,
    uniqueCards: 3,
    cardsUpserted: 3,
    printingsUpserted: 4,
    recordsFailed: 0,
  };

  it("leads with what the database received", () => {
    expect(describeCounts(counts)).toBe(
      "5 records seen, 3 unique cards, 3 written, 4 printings",
    );
  });

  it("mentions rejects only when there are some", () => {
    expect(describeCounts(counts)).not.toContain("rejected");
    expect(describeCounts({ ...counts, recordsFailed: 2 })).toContain("2 rejected");
  });

  /*
   * A sample run that imports one card is a real outcome worth reading
   * cleanly, and "1 records seen" reads as a bug in the panel.
   */
  it("agrees in number", () => {
    expect(
      describeCounts({
        recordsSeen: 1,
        uniqueCards: 1,
        cardsUpserted: 1,
        printingsUpserted: 1,
        recordsFailed: 0,
      }),
    ).toBe("1 record seen, 1 unique card, 1 written, 1 printing");
  });
});
