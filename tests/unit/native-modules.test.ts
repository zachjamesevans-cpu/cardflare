import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Native modules, and why none of them may be imported at the top.
 *
 * The whole site went down for this. `src/lib/players/profile.ts` had
 * `import sharp from "sharp"` at module scope, and that file is
 * `ownProfile` and `publicProfile` - everything that READS a player. So
 * every player page, every store page and the sign-in flow depended on
 * a native image encoder being loadable at module-evaluation time.
 *
 * When the host could not load it - `libvips-cpp.so.8.18.3: cannot open
 * shared object file` - the failure was not "you cannot upload a
 * picture". It was every one of those pages answering "This page
 * couldn't load", from a codepath that never encodes anything.
 *
 * Two rules come out of that, and this pins both.
 */

const root = resolve(import.meta.dirname, "../..");

/** Every server-side source file, as text. */
function walk(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(resolve(root, directory), {
    withFileTypes: true,
  })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      found.push(path);
    }
  }
  return found;
}

const sources: { path: string; text: string }[] = walk("src").map((path) => ({
  path,
  text: readFileSync(resolve(root, path), "utf8"),
}));

describe("sharp", () => {
  it("is never imported at the top of a module", () => {
    /*
     * A dynamic `await import("sharp")` inside the function that
     * encodes is the rule. It costs nothing - the runtime caches the
     * module - and it confines a missing binary to the one operation
     * that needs it.
     */
    const offenders = sources
      .filter(({ text }) => /^import\s+.*\bfrom\s+"sharp"/m.test(text))
      .map(({ path }) => path);

    expect(offenders).toEqual([]);
  });

  it("is only reached through a guarded loader", () => {
    /* Every file that touches sharp should say what happens when it is
       not there, rather than throwing a linker error at a reader. */
    for (const { path, text } of sources) {
      if (!/import\("sharp"\)/.test(text)) continue;
      expect(text, path).toMatch(/failed to load/i);
    }
  });
});

describe("the sharp binaries", () => {
  const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));

  it("are pinned for the platform the site is deployed on", () => {
    /*
     * sharp ships its native code as OPTIONAL per-platform packages, and
     * an optional dependency is one npm is allowed to skip. Skipping the
     * linux-x64 pair on a linux-x64 host is exactly what happened, and
     * naming them as direct optionalDependencies is what stops npm
     * deciding they were not needed.
     *
     * Optional rather than required on purpose: they carry `os` and
     * `cpu` fields, so listing them as normal dependencies would make
     * `npm install` fail outright on a Mac.
     */
    const optional = pkg.optionalDependencies ?? {};

    expect(Object.keys(optional)).toContain("@img/sharp-linux-x64");
    expect(Object.keys(optional)).toContain("@img/sharp-libvips-linux-x64");
  });

  it("are pinned at the versions this sharp actually asks for", () => {
    /*
     * The error named the file: libvips-cpp.so.8.18.3. A libvips pinned
     * a minor behind ships a differently-named .so and fails in exactly
     * the same way, which would look like the fix had not worked.
     */
    const installed = lock.packages["node_modules/sharp"]?.version;
    const want = lock.packages["node_modules/@img/sharp-linux-x64"]?.version;

    expect(want).toBe(installed);
    expect(pkg.optionalDependencies["@img/sharp-linux-x64"]).toBe(installed);
  });
});
