import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DEMO_EMAILS, isProduction, seedScript } from "../../scripts/demo";

/**
 * The demo world for App Store screenshots (supabase/demo/README.md).
 * The founder (2026-10-11): "almost code test rooms that look real". What
 * matters most is what it must never do: touch production, leak a key,
 * or change a real build of the app.
 */

const root = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
const seed = read("supabase/demo/seed.sql");

describe("never production", () => {
  it("knows the production project in a URL or a connection string", () => {
    expect(isProduction("https://wfpxjqumrkyqcingazsp.supabase.co")).toBe(true);
    expect(
      isProduction(
        "postgres://postgres.wfpxjqumrkyqcingazsp:pw@pooler.supabase.com:5432/postgres",
      ),
    ).toBe(true);
    expect(isProduction("https://abcdefgh.supabase.co")).toBe(false);
    expect(isProduction(undefined)).toBe(false);
  });

  it("checks before every command connects", () => {
    const source = read("scripts/demo.ts");
    const main = source.slice(source.indexOf("async function main()"));
    expect(main.indexOf("settings()")).toBeLessThan(main.indexOf("migrate("));
    expect(source).toContain("if (isProduction(url) || isProduction(databaseUrl))");
  });

  it("keeps its settings out of git and never prints a connection string", () => {
    const ignore = read(".gitignore");
    expect(ignore).toContain(".env*");
    expect(ignore).toContain("!.env.demo.example");
    expect(read(".env.demo.example")).not.toMatch(/=(sk|eyJ|sb_secret)/);
    expect(read("scripts/demo.ts")).toContain('"postgres://[hidden]"');
  });
});

describe("the accounts and the seed agree", () => {
  it("creates the thirteen accounts the seed looks up", () => {
    expect(DEMO_EMAILS).toHaveLength(13);
    for (const email of DEMO_EMAILS) expect(seed).toContain(`'${email}'`);
  });

  it("sets the hero's name safely, whatever it is", () => {
    const script = seedScript("D'Arcy");
    expect(
      script.startsWith("select set_config('demo.hero_name', 'D''Arcy', false);"),
    ).toBe(true);
    expect(seedScript("   ")).toContain("'demo.hero_name', 'Zach'");
    expect(seed).toContain("current_setting('demo.hero_name', true)");
  });

  it("is one transaction of plain SQL, safe to run again", () => {
    expect(seed).toMatch(/^begin;/m);
    expect(seed).toMatch(/^commit;/m);
    /* Run through a driver as one string: no psql commands. */
    expect(seed).not.toMatch(/^\\/m);
    expect(seed).toContain("@demo.cardflare.gg");
  });

  it("follows the product's rules: no prices, no em dashes", () => {
    expect(seed).not.toMatch(/\$\s?\d/);
    expect(seed).not.toContain("—");
  });
});

describe("the app, pointed at the demo only when asked", () => {
  const require = createRequire(import.meta.url);
  const config = require(join(root, "mobile/app.config.js")) as (input: {
    config: Record<string, unknown>;
  }) => Record<string, unknown>;
  const base = JSON.parse(read("mobile/app.json")).expo as Record<string, unknown>;

  it("leaves every real build exactly as app.json says", () => {
    delete process.env.CARDFLARE_DEMO;
    expect(config({ config: base })).toBe(base);
  });

  it("points at this Mac's website and the demo project in the demo", () => {
    process.env.CARDFLARE_DEMO = "1";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo.supabase.co";
    try {
      const demo = config({ config: base }) as {
        extra: { apiBase: string; supabaseUrl: string; eas: unknown };
      };
      expect(demo.extra.apiBase).toBe("http://localhost:3000");
      expect(demo.extra.supabaseUrl).toBe("https://demo.supabase.co");
      expect(demo.extra.eas).toEqual((base.extra as { eas: unknown }).eas);
    } finally {
      delete process.env.CARDFLARE_DEMO;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    }
  });

  it("is started by the app's own demo script, reading the root's settings", () => {
    const scripts = JSON.parse(read("mobile/package.json")).scripts as Record<
      string,
      string
    >;
    expect(scripts.demo).toContain("--env-file=../.env.demo");
    expect(read(".env.demo.example")).toContain("CARDFLARE_DEMO=1");
  });
});

describe("the screenshots", () => {
  const flow = read("mobile/.maestro/app-store/shots.yaml");

  it("takes the five, in the store listing's order", () => {
    const shots = [...flow.matchAll(/takeScreenshot: shots\/app-store\/(\S+)/g)].map(
      (match) => match[1],
    );
    expect(shots).toEqual(["1-room", "2-feed", "3-binder", "4-profile", "5-trade"]);
  });

  it("taps the names the seed gives", () => {
    for (const name of ["One Piece Locals", "Trade binder", "Jordan Kim"]) {
      expect(flow).toContain(name);
      expect(seed).toContain(name);
    }
  });

  it("stays out of the visual pass, and keeps credentials out of the file", () => {
    expect(read("mobile/.maestro/config.yaml")).toContain('"0*.yaml"');
    /* Only the placeholder in the usage line, never a real one. */
    expect(flow).not.toMatch(/PASSWORD=(?!\.\.\.)\S/);
  });
});
