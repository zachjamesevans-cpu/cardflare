import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * What a website-side test may import out of the app.
 *
 * Vercel installs the ROOT package.json and nothing else. `mobile` has
 * its own dependency tree and its own node_modules, and the website's
 * tsconfig excludes the folder for exactly that reason — but a real
 * `import` from a test drags the file back into the type graph anyway,
 * and TypeScript then goes looking for whatever that file imports.
 *
 * That is how a test asserting cache lifetimes broke the website's
 * deploy on `@react-native-async-storage/async-storage`. It passed
 * every local check, because locally `mobile/node_modules` exists.
 *
 * So the rule: a test may import an app module only if that module is
 * pure TypeScript — no bare package specifiers at all. `handle.ts`,
 * `deck-list.ts` and `avatar-geometry.ts` qualify and are shared this
 * way on purpose, because a rule written twice is a rule that drifts.
 * Anything touching React Native gets read as text instead.
 *
 * Reproduce the failure with:  mv mobile/node_modules /tmp && npm run build
 */
const MOBILE_IMPORT = /(?:from|import\()\s*"(\.\.\/\.\.\/mobile\/[^"]+)"/g;

async function testFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  const found = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return testFiles(path);
      return entry.name.endsWith(".ts") || entry.name.endsWith(".tsx") ? [path] : [];
    }),
  );

  return found.flat();
}

/** Every bare package a module imports — "react-native", not "./theme". */
function bareImports(source: string): string[] {
  const bare: string[] = [];

  for (const [, spec] of source.matchAll(/(?:from|import\()\s*"([^"]+)"/g)) {
    if (!spec.startsWith(".") && !spec.startsWith("@/")) bare.push(spec);
  }

  return bare;
}

describe("tests that reach into mobile/", () => {
  it("only import app modules that need no app dependencies", async () => {
    const files = await testFiles("tests");
    const offences: string[] = [];

    for (const file of files) {
      const source = await readFile(file, "utf8");

      for (const [, spec] of source.matchAll(MOBILE_IMPORT)) {
        const target = spec.replace("../../", "");

        /* Resolve the extension the same way the bundler would. */
        let imported: string | null = null;
        for (const suffix of ["", ".ts", ".tsx"]) {
          try {
            imported = await readFile(`${target}${suffix}`, "utf8");
            break;
          } catch {
            /* keep trying */
          }
        }

        if (imported === null) {
          offences.push(`${file} imports ${spec}, which does not exist`);
          continue;
        }

        const packages = bareImports(imported);
        if (packages.length > 0) {
          offences.push(
            `${file} imports ${spec}, which needs ${packages.join(", ")} — ` +
              "read it as text instead, or the website's build fails on Vercel",
          );
        }
      }
    }

    expect(offences).toEqual([]);
  });
});
