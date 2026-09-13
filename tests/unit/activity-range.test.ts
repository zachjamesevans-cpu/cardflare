import { describe, expect, it } from "vitest";

import { rangeFor } from "@/lib/admin/activity-range";

const NOW = Date.parse("2026-09-12T15:30:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

describe("the report window", () => {
  it("defaults to the last thirty days", () => {
    const range = rangeFor({}, NOW);
    expect(range.period).toBe("30d");
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(30 * DAY);
    expect(range.to).toBe(new Date(NOW).toISOString());
  });

  it("starts today at midnight UTC", () => {
    const range = rangeFor({ period: "today" }, NOW);
    expect(range.from).toBe("2026-09-12T00:00:00.000Z");
  });

  it("covers custom dates whole, end date included", () => {
    const range = rangeFor(
      { period: "custom", from: "2026-09-01", to: "2026-09-07" },
      NOW,
    );
    expect(range.from).toBe("2026-09-01T00:00:00.000Z");
    expect(range.to).toBe("2026-09-08T00:00:00.000Z");
    expect(range.fromDate).toBe("2026-09-01");
    expect(range.toDate).toBe("2026-09-07");
  });

  it("falls back to thirty days when custom dates are missing, malformed or reversed", () => {
    for (const params of [
      { period: "custom" },
      { period: "custom", from: "yesterday", to: "2026-09-07" },
      { period: "custom", from: "2026-09-09", to: "2026-09-07" },
    ]) {
      const range = rangeFor(params, NOW);
      expect(range.period).toBe("30d");
      expect(Date.parse(range.to) - Date.parse(range.from)).toBe(30 * DAY);
    }
  });

  it("treats an unknown period as the default", () => {
    expect(rangeFor({ period: "1y" }, NOW).period).toBe("30d");
  });
});
