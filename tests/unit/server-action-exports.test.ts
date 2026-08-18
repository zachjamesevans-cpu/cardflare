import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A "use server" module may export only async functions.
 *
 * Next enforces this at the server-action boundary, but not always at
 * build time — a constant exported from an actions file can compile
 * clean and then take the whole page down at request time with "page
 * couldn't load". That is not a theoretical failure mode: it shipped
 * twice. The Event Hub's form state did it and the build caught it;
 * `ADMIN_ACCOUNT_IDLE` did it and the build did NOT catch it, so the
 * founder found it by trying to rename a player and watching the admin
 * console crash.
 *
 * The rule was already written down in profile-schema.ts — "an actions
 * module may export only async functions" — and written rules that
 * nothing enforces get broken by whoever wrote them. This walks every
 * "use server" file in src and fails on any export that is not an
 * async function, so the third time dies in CI instead of in the
 * console.
 */

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.tsx?$/.test(name)) found.push(path);
  }
  return found;
}

const SRC = resolve(import.meta.dirname, "../../src");

/** Files whose FIRST statement is the directive — comments aside. */
const actionFiles = walk(SRC).filter((path) => {
  const head = readFileSync(path, "utf8").slice(0, 500);
  return /^(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*["']use server["']/.test(head);
});

describe("use-server modules", () => {
  it("found the action files (the walk itself works)", () => {
    expect(actionFiles.length).toBeGreaterThan(10);
  });

  it.each(actionFiles.map((path) => [path.slice(SRC.length + 1)] as const))(
    "%s exports only async functions",
    (relative) => {
      const source = readFileSync(join(SRC, relative), "utf8");

      /* Every export that is not `export async function` and not a
         type-only export. Types are erased before the boundary exists,
         so they are fine; values are not. */
      const offending = [...source.matchAll(/^export\s+(?!async function)(\w+)/gm)]
        .map((match) => match[1])
        .filter((keyword) => keyword !== "type" && keyword !== "interface");

      expect(offending, `non-async exports in ${relative}`).toEqual([]);
    },
  );
});
