import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A function exported from a "use client" file cannot be CALLED from a
 * server-rendered file. Next lets the import compile and only throws
 * when the call runs: "Attempted to call cardCountLabel() from the
 * server but cardCountLabel is on the client." The Feed went down in
 * production that way, on the first single-card post, after every
 * gate was green - the previews only ever drew three-card posts.
 *
 * So this walks every server-side source file and refuses a named
 * import from a client module unless it is a component (PascalCase) or
 * a type. A helper both sides need lives in a plain module under
 * src/lib, the way cardCountLabel does now.
 */

const SRC = resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function isClientModule(path: string): boolean {
  return /^\s*(["'])use client\1/.test(readFileSync(path, "utf8"));
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(from, "..", spec)
      : null;
  if (!base) return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* next */
    }
  }
  return null;
}

const IMPORT = /^import\s+(type\s+)?\{([^}]*)\}\s+from\s+["']([^"']+)["']/gm;

describe("client boundary", () => {
  const files = walk(SRC);
  const clientModules = new Set(files.filter(isClientModule));

  it("no server file calls a function that lives in a client module", () => {
    const offences: string[] = [];
    for (const file of files) {
      if (clientModules.has(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(IMPORT)) {
        const [, typeOnly, names, spec] = match;
        if (typeOnly) continue;
        const target = resolveImport(file, spec);
        if (!target || !clientModules.has(target)) continue;
        for (const raw of names.split(",")) {
          const name = raw.trim().replace(/^type\s+/, "");
          if (!name || raw.trim().startsWith("type ")) continue;
          const imported = name.split(/\s+as\s+/)[0];
          if (/^[A-Z]/.test(imported)) continue;
          offences.push(
            `${file.slice(SRC.length + 1)} imports ${imported} from ${spec}`,
          );
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it("cardCountLabel is a plain module, imported from src/lib", () => {
    const copy = readFileSync(join(SRC, "lib/feed/card-copy.ts"), "utf8");
    expect(copy).not.toMatch(/^\s*["']use client["']/);
    expect(copy).toMatch(/export function cardCountLabel/);
    for (const file of [
      "components/feed/flare-feed-card.tsx",
      "components/feed/flare-carousel.tsx",
      "components/feed/flare-cards-sheet.tsx",
    ]) {
      expect(readFileSync(join(SRC, file), "utf8")).toMatch(
        /import \{ cardCountLabel \} from "@\/lib\/feed\/card-copy"/,
      );
    }
  });
});
