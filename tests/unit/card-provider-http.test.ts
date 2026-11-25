import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderHttp, ProviderHttpError } from "@/lib/cards/providers/http";

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
  return new ProviderHttp("https://api.scrydex.com", {
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

    await expect(client().getJson("/onepiece/v1/cards")).resolves.toEqual([
      { card_name: "Luffy" },
    ]);
  });

  it("identifies itself so the operator can see who is calling", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client().getJson("/onepiece/v1/cards");

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["user-agent"]).toContain(
      "cardflare",
    );
  });

  /*
   * Every request costs a credit. Retrying something that will never
   * succeed spends them for nothing.
   */
  it("does not retry a permanent failure", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "nope" }, 404));

    await expect(client().getJson("/onepiece/v1/cards")).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps what a refused response said, without its markup", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        "<html><head><title>Blocked</title><style>h1{}</style></head><body><h1>Sorry, you have been blocked</h1><script>x()</script></body></html>",
        { status: 403, headers: { "content-type": "text/html" } },
      ),
    );

    const error = await client()
      .getJson("/cards")
      .then(
        () => null,
        (thrown: unknown) => thrown,
      );
    expect(error).toBeInstanceOf(ProviderHttpError);
    expect((error as ProviderHttpError).status).toBe(403);
    expect((error as ProviderHttpError).detail).toBe(
      "Blocked Sorry, you have been blocked",
    );
  });

  it("retries a temporary failure and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse([{ ok: true }]));

    await expect(client().getJson("/onepiece/v1/cards")).resolves.toEqual([
      { ok: true },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse([]));

    await expect(client().getJson("/onepiece/v1/cards")).resolves.toEqual([]);
  });

  it("gives up after the attempt limit rather than looping", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));

    await expect(
      client({ maxAttempts: 3 }).getJson("/onepiece/v1/cards"),
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
      .getJson("/onepiece/v1/cards")
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
      "http://api.scrydex.com/onepiece/v1/cards",
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
      http.getJson("/onepiece/v1/cards"),
      http.getJson("/onepiece/v1/expansions"),
      http.getJson("/pokemon/v1/cards"),
    ]);

    expect(peak).toBe(1);
  });
});
