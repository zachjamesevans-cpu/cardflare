import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app's typeface. The founder (2026-10-11): "can you try an
 * alternative font option for the app? something a little cleaner."
 * Inter, the website's face (BRAND.md), on every Text through one
 * switch, so going back to San Francisco is one word.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const typeface = read("mobile/src/typeface.tsx");

describe("the app's typeface", () => {
  it("is one switch between Inter and the system face", () => {
    expect(typeface).toContain('export const TYPEFACE: "inter" | "system" = "inter";');
    expect(typeface).toContain('if (installed || TYPEFACE !== "inter") return;');
  });

  it("is put on before the first render, and the first screen waits for it", () => {
    const index = read("mobile/index.ts");
    expect(index.indexOf("installTypeface();")).toBeGreaterThan(-1);
    expect(index.indexOf("installTypeface();")).toBeLessThan(
      index.indexOf("registerRootComponent(App);"),
    );
    expect(read("mobile/App.tsx")).toContain(
      'if (gate === "checking" || !fontsReady) {',
    );
  });

  it("draws each weight with its own face and leaves named families alone", () => {
    for (const face of [
      "Inter_400Regular",
      "Inter_500Medium",
      "Inter_600SemiBold",
      "Inter_700Bold",
      "Inter_800ExtraBold",
    ]) {
      expect(typeface).toContain(face);
    }
    /* Menlo for a card code, a worn name's art: their own family wins. */
    expect(typeface).toContain("if (flat.fontFamily) return style;");
    /* A span inside a Text with no weight of its own inherits it. */
    expect(typeface).toContain("useContext(Ancestor)");
  });

  it("patches the exports every file reads, not a namespace copy", () => {
    expect(typeface).toContain('const ReactNative = require("react-native")');
    expect(typeface).toContain("Object.defineProperty(ReactNative, name, {");
    expect(read("mobile/package.json")).toContain('"@expo-google-fonts/inter"');
  });
});
