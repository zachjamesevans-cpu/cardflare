import { describe, expect, it } from "vitest";

import { readJsonPayload } from "@/lib/api/payload";

/**
 * The header transport exists because of a field-verified failure: on
 * some networks every app request with a body dies in transit while
 * bodyless ones arrive (the in-app connection matrix proved it under
 * every content-type). These tests pin the contract both clients rely
 * on: header wins when present, body still works for everyone else,
 * and garbage in either place degrades to null — the same value the
 * routes already treat as "no payload".
 */
describe("readJsonPayload", () => {
  const url = "https://cardflare.gg/api/v1/ping";

  it("reads URI-encoded JSON from the x-cf-payload header", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: {
        "x-cf-payload": encodeURIComponent(JSON.stringify({ displayName: "Nami" })),
      },
    });

    await expect(readJsonPayload(request)).resolves.toEqual({
      displayName: "Nami",
    });
  });

  it("survives characters a header cannot carry raw", async () => {
    const note = 'Wants the alt art — "Perona" ×2 🃏';
    const request = new Request(url, {
      method: "POST",
      headers: { "x-cf-payload": encodeURIComponent(JSON.stringify({ note })) },
    });

    await expect(readJsonPayload(request)).resolves.toEqual({ note });
  });

  it("prefers the header over a body when both arrive", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cf-payload": encodeURIComponent(JSON.stringify({ from: "header" })),
      },
      body: JSON.stringify({ from: "body" }),
    });

    await expect(readJsonPayload(request)).resolves.toEqual({ from: "header" });
  });

  it("falls back to the JSON body when no header is sent", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "body" }),
    });

    await expect(readJsonPayload(request)).resolves.toEqual({ from: "body" });
  });

  it("returns null for a mangled header, not an exception", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { "x-cf-payload": "%E0%A4%A" },
    });

    await expect(readJsonPayload(request)).resolves.toBeNull();
  });

  it("returns null for a header that decodes to non-JSON", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { "x-cf-payload": encodeURIComponent("not json") },
    });

    await expect(readJsonPayload(request)).resolves.toBeNull();
  });

  it("returns null when there is neither header nor body", async () => {
    const request = new Request(url, { method: "POST" });

    await expect(readJsonPayload(request)).resolves.toBeNull();
  });
});
