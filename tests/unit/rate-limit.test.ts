import { beforeEach, describe, expect, it } from "vitest";

import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

const WINDOW = 60_000;

beforeEach(() => {
  resetRateLimits();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(checkRateLimit("ip", 3, WINDOW, 1000).allowed).toBe(true);
    }
  });

  it("blocks the request after the limit is exceeded", () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      checkRateLimit("ip", 3, WINDOW, 1000);
    }

    const result = checkRateLimit("ip", 3, WINDOW, 1000);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("tracks keys independently", () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      checkRateLimit("noisy", 3, WINDOW, 1000);
    }

    expect(checkRateLimit("noisy", 3, WINDOW, 1000).allowed).toBe(false);
    expect(checkRateLimit("quiet", 3, WINDOW, 1000).allowed).toBe(true);
  });

  it("starts a fresh window once the old one expires", () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      checkRateLimit("ip", 3, WINDOW, 1000);
    }
    expect(checkRateLimit("ip", 3, WINDOW, 1000).allowed).toBe(false);

    expect(checkRateLimit("ip", 3, WINDOW, 1000 + WINDOW + 1).allowed).toBe(true);
  });

  it("reports how long to wait before retrying", () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      checkRateLimit("ip", 3, WINDOW, 0);
    }

    const result = checkRateLimit("ip", 3, WINDOW, 30_000);

    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(30);
  });
});
