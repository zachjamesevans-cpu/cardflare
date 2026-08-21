import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Every `/api/v1` write reads its payload the way the app sends one.
 *
 * The app sends writes in the `x-cf-payload` header and NO BODY AT ALL -
 * a field-found workaround for a network that kills bodied requests in
 * transit (see src/lib/api/payload.ts). A route that calls
 * `request.json()` directly therefore reads `null` from every app
 * request and carries on as though the player had sent nothing.
 *
 * That is not a crash, which is what makes it worth a test. The route
 * added for the ZIP code did exactly this: an app player typing five
 * digits would have had their location CLEARED and been told it saved.
 * It was caught by reading the transport, not by using the feature.
 */
async function routeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return routeFiles(path);
      return entry.name === "route.ts" ? [path] : [];
    }),
  );

  return found.flat();
}

describe("api/v1 payload transport", () => {
  it("never reads a request body without the header first", async () => {
    const files = await routeFiles("src/app/api/v1");
    expect(files.length).toBeGreaterThan(5);

    const offenders: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      /* A route may mention request.json() only inside readJsonPayload's
         own fallback, which lives in the lib rather than here. */
      if (source.includes("request.json()") && !source.includes("readJsonPayload")) {
        offenders.push(file);
      }
    }

    expect(offenders, "these read a body the app never sends").toEqual([]);
  });

  it("the header wins over a body, and bad input is null rather than a throw", async () => {
    const { readJsonPayload } = await import("@/lib/api/payload");

    const withHeader = new Request("https://cardflare.gg/x", {
      method: "PUT",
      headers: { "x-cf-payload": encodeURIComponent(JSON.stringify({ a: 1 })) },
    });
    expect(await readJsonPayload(withHeader)).toEqual({ a: 1 });

    const broken = new Request("https://cardflare.gg/x", {
      method: "PUT",
      headers: { "x-cf-payload": "%%%not-json%%%" },
    });
    expect(await readJsonPayload(broken)).toBeNull();
  });
});
