import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderHttp, ProviderHttpError } from "@/lib/cards/providers/http";
import { OptcgApiProvider } from "@/lib/cards/providers/optcgapi/adapter";
import {
  MAPPING_STATUS,
  MAPPING_VERIFIED_ON,
} from "@/lib/cards/providers/optcgapi/mapping";

/** Never sleeps, so backoff is exercised without the wall-clock cost. */
const noSleep = () => Promise.resolve();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

function client(overrides = {}) {
  return new ProviderHttp("https://optcgapi.com", {
    sleep: noSleep,
    spacingMs: 1,
    fetchImpl: fetchMock as unknown as typeof fetch,
    ...overrides,
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
});

describe("ProviderHttp", () => {
  it("returns parsed JSON on success", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ card_name: "Luffy" }]));

    await expect(client().getJson("/api/allSetCards/")).resolves.toEqual([
      { card_name: "Luffy" },
    ]);
  });

  it("identifies itself so the operator can see who is calling", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client().getJson("/api/allSetCards/");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["user-agent"]).toContain(
      "CardFlare",
    );
  });

  /*
   * A free service asked not to be hammered. Retrying something that will
   * never succeed is how that request gets ignored by accident.
   */
  it("does not retry a permanent failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "nope" }, 404));

    await expect(client().getJson("/api/allSetCards/")).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a temporary failure and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse([{ ok: true }]));

    await expect(client().getJson("/api/allSetCards/")).resolves.toEqual([
      { ok: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse([]));

    await expect(client().getJson("/api/allSetCards/")).resolves.toEqual([]);
  });

  it("gives up after the attempt limit rather than looping", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(
      client({ maxAttempts: 3 }).getJson("/api/allSetCards/"),
    ).rejects.toBeInstanceOf(ProviderHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("backs off for longer on each attempt", async () => {
    const waits: number[] = [];
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await client({
      maxAttempts: 4,
      spacingMs: 10,
      sleep: (ms: number) => {
        waits.push(ms);
        return Promise.resolve();
      },
    })
      .getJson("/api/allSetCards/")
      .catch(() => {});

    expect(waits).toEqual([20, 40, 80]);
  });

  /*
   * The sync runs server-side with network access, so a path that could
   * escape the provider's origin is a server-side request forgery primitive.
   */
  it("refuses a path that leaves the provider's origin", async () => {
    for (const path of [
      "https://evil.example/steal",
      "//evil.example/steal",
      "http://optcgapi.com/api/",
    ]) {
      await expect(client().getJson(path)).rejects.toThrow(/origin/i);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("paces requests rather than firing them together", async () => {
    let inFlight = 0;
    let peak = 0;

    fetchMock.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return jsonResponse([]);
    });

    const http = client();
    await Promise.all([
      http.getJson("/api/allSetCards/"),
      http.getJson("/api/allSTCards/"),
      http.getJson("/api/allPromoCards/"),
    ]);

    expect(peak).toBe(1);
  });
});

describe("the mapping gate", () => {
  /*
   * The gate held while nothing had been observed, and was released on
   * 2 August 2026 against a real /api/allSetCards/ record. Both halves matter:
   * "verified" is only meaningful if it carries the date somebody checked.
   */
  it("is verified, and records when", () => {
    expect(MAPPING_STATUS).toBe("verified");
    expect(MAPPING_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps normalisation free of the network, so fixtures alone can test it", () => {
    const provider = new OptcgApiProvider();

    expect(
      provider.normalizeCard({ card_set_id: "OP01-001", card_name: "Zoro" }).ok,
    ).toBe(true);
  });
});

/*
 * Found by pointing the endpoint list at the live API: /api/allPromoCards/
 * returns 404 despite being documented. Before this, that took the whole sync
 * down and imported nothing — while the other three endpoints had perfectly
 * good data sitting there.
 */
describe("a missing endpoint", () => {
  it("does not abandon the rest of the catalog", async () => {
    fetchMock = vi.fn(async (url: string) =>
      String(url).includes("allPromoCards")
        ? jsonResponse({ detail: "Not Found" }, 404)
        : jsonResponse([{ card_set_id: "OP01-024", card_name: "Monkey D. Luffy" }]),
    );

    const provider = new OptcgApiProvider({
      sleep: noSleep,
      spacingMs: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const { cards, failures } = await provider.fetchCards();

    expect(cards.length).toBeGreaterThan(0);
    expect(failures.some((f) => f.reason.includes("allPromoCards"))).toBe(true);
  });
});
