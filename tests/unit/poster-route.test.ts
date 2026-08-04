import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The poster route's guards. It is public like /e/[code] and must expose
 * exactly as much: resolve by exact code, nothing for junk, and never a
 * database read for a code that is not even shaped like one.
 */

const findEventByJoinCode = vi.fn();
const findStoreByJoinCode = vi.fn();
const findShowByJoinCode = vi.fn();
const posterPdf = vi.fn();

vi.mock("next/headers", () => ({
  headers: async () => ({ get: () => "203.0.113.9" }),
}));

vi.mock("@/lib/events/repository", () => ({
  findEventByJoinCode: (...a: unknown[]) => findEventByJoinCode(...a),
  findStoreByJoinCode: (...a: unknown[]) => findStoreByJoinCode(...a),
  findShowByJoinCode: (...a: unknown[]) => findShowByJoinCode(...a),
}));

vi.mock("@/lib/events/poster-pdf", () => ({
  posterPdf: (...a: unknown[]) => posterPdf(...a),
}));

const { GET } = await import("@/app/poster/[code]/route");
const { resetRateLimits } = await import("@/lib/rate-limit");

function get(code: string) {
  return GET(new Request(`http://localhost/poster/${code}`), {
    params: Promise.resolve({ code }),
  });
}

beforeEach(() => {
  for (const fn of [
    findEventByJoinCode,
    findStoreByJoinCode,
    findShowByJoinCode,
    posterPdf,
  ]) {
    fn.mockReset();
  }
  resetRateLimits();
  findEventByJoinCode.mockResolvedValue(null);
  findStoreByJoinCode.mockResolvedValue(null);
  findShowByJoinCode.mockResolvedValue(null);
  posterPdf.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]));
});

describe("GET /poster/[code]", () => {
  it("serves a store's counter poster as an inline PDF", async () => {
    findStoreByJoinCode.mockResolvedValue({ id: "s1", name: "Grand Line Games" });

    const response = await get("K3M9PZQ");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("K3M9PZQ");
    expect(posterPdf).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Grand Line Games", kind: "counter" }),
    );
  });

  it("routes each code length to its own table, like /e/ does", async () => {
    findEventByJoinCode.mockResolvedValue({
      name: "Friday Locals",
      startsAt: "2026-09-12T23:00:00Z",
      endsAt: "2026-09-13T03:00:00Z",
      storeTimeZone: "America/Chicago",
    });

    const response = await get("K3M9PZ");

    expect(response.status).toBe(200);
    expect(findStoreByJoinCode).not.toHaveBeenCalled();
    expect(findShowByJoinCode).not.toHaveBeenCalled();
    expect(posterPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "event",
        subtitle: expect.stringMatching(/Sep/),
      }),
    );
  });

  it("404s an unknown code without minting a PDF", async () => {
    const response = await get("K3M9PZQ");

    expect(response.status).toBe(404);
    expect(posterPdf).not.toHaveBeenCalled();
  });

  it("404s junk before touching the database", async () => {
    const response = await get("not!a!code");

    expect(response.status).toBe(404);
    expect(findEventByJoinCode).not.toHaveBeenCalled();
    expect(findStoreByJoinCode).not.toHaveBeenCalled();
    expect(findShowByJoinCode).not.toHaveBeenCalled();
  });

  it("rate limits per network", async () => {
    findStoreByJoinCode.mockResolvedValue({ id: "s1", name: "Grand Line Games" });

    let last: Response | null = null;
    for (let i = 0; i < 21; i += 1) last = await get("K3M9PZQ");

    expect(last?.status).toBe(429);
  });
});
