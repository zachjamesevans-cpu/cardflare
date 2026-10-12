import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  BACKDROP_KEY,
  BACKDROP_SCRIPT,
  LOOK_HEADING,
  PURE_BLACK_LABEL,
  PURE_BLACK_LINE,
} from "@/lib/players/backdrop";

/**
 * Pure black, the Settings switch on both platforms. The founder
 * (2026-10-12): "add a dark mode toggle in settings to make our classic
 * green stuff just pure black. green highlights and green 'found' will
 * remain".
 */

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const appBackdrop = read("mobile/src/backdrop.ts");
const appTheme = read("mobile/src/theme.ts");
const css = read("src/app/globals.css");

function quoted(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"([^"]+)"`).exec(source);
  if (!match) throw new Error(`${name} not found`);
  return match[1];
}

describe("pure black", () => {
  it("is offered in the same words in the app and on the website", () => {
    expect(quoted(appBackdrop, "LOOK_HEADING")).toBe(LOOK_HEADING);
    expect(quoted(appBackdrop, "PURE_BLACK_LABEL")).toBe(PURE_BLACK_LABEL);
    expect(quoted(appBackdrop, "PURE_BLACK_LINE")).toBe(PURE_BLACK_LINE);
    expect(quoted(appBackdrop, "KEY")).toBe(BACKDROP_KEY);
  });

  it("draws the same four colours on both, and leaves the accent alone", () => {
    const block = /html\[data-backdrop="black"\] \{([^}]+)\}/.exec(css)?.[1] ?? "";
    const black = /black: \{([^}]+)\}/.exec(appTheme)?.[1] ?? "";
    const pairs: [string, string][] = [
      ["surface", "surface"],
      ["elevated", "elevated"],
      ["border", "border"],
      ["border-strong", "borderStrong"],
    ];
    for (const [web, app] of pairs) {
      const webValue = new RegExp(`--color-${web}: (#[0-9a-f]+);`).exec(block)?.[1];
      const appValue = new RegExp(`\\b${app}: "(#[0-9a-f]+)"`).exec(black)?.[1];
      expect(webValue, web).toBeDefined();
      expect(webValue).toBe(appValue);
    }
    expect(block).not.toMatch(/accent|success|text-/);
  });

  it("is put back before the first paint on the website", () => {
    expect(read("src/app/layout.tsx")).toContain("BACKDROP_SCRIPT");
    expect(BACKDROP_SCRIPT).toContain(JSON.stringify(BACKDROP_KEY));
  });

  it("is applied before the app's screens load", () => {
    const index = read("mobile/index.ts");
    expect(index).not.toMatch(/import App from/);
    expect(index).toMatch(/loadBackdrop\(\)\.then/);
    expect(index).toContain("require('./App')");
  });

  /*
   * A colour read at module load is frozen at whatever the backdrop was
   * then, so a switch in Settings would leave that panel green. Every
   * module-level read of the four goes through a getter.
   */
  it("is never frozen into an app stylesheet at load", () => {
    const names = new Set(["surface", "elevated", "border", "borderStrong"]);
    const files: string[] = [path.join(root, "mobile/App.tsx")];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) files.push(full);
      }
    };
    walk(path.join(root, "mobile/src"));

    const frozen: string[] = [];
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(file, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isPropertyAccessExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "colors" &&
          names.has(node.name.text)
        ) {
          let inside = false;
          for (let up = node.parent; up; up = up.parent) {
            if (ts.isFunctionLike(up)) {
              inside = true;
              break;
            }
          }
          if (!inside) {
            const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            frozen.push(`${path.relative(root, file)}:${line}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(frozen).toEqual([]);
  });
});
