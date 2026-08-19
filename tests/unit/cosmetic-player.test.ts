import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { playablePath } from "../../src/app/cosmetic-player/page";

/**
 * The page that plays a Rive cosmetic for the app.
 *
 * A .riv file is not a picture. It is played BY a runtime, and that
 * runtime is script - so the app, which renders uploaded art with
 * JavaScript switched off, could not draw one at all and returned null
 * for the whole kind. A founder wearing a Rive ring saw a working
 * website and a bare avatar, and reported it as "animated profile
 * borders don't work" twice while two rounds of CSS ring work went past
 * the actual cause.
 *
 * This page is the answer, and the thing that makes it acceptable is
 * WHOSE CODE RUNS. The page is ours, the bundle is ours, the WASM is
 * ours; the uploaded file is data handed to it. Widening that - letting
 * this page play a file from somewhere else, or letting the app switch
 * scripting on for uploaded documents - turns it back into a hole, so
 * both halves are pinned here.
 */

const root = resolve(import.meta.dirname, "../..");

describe("what the player will play", () => {
  it("plays art served from our own origin", () => {
    expect(playablePath("/api/avatars/cosmetics/haki.riv")).toBe(
      "/api/avatars/cosmetics/haki.riv",
    );
    /* Art seeded by a migration ships in the repo instead of storage. */
    expect(playablePath("/cosmetics/ring-lightning.riv")).toBe(
      "/cosmetics/ring-lightning.riv",
    );
  });

  it("refuses anything that is not ours", () => {
    /* Otherwise the page is a general-purpose Rive loader wearing our
       domain, playing somebody else's file at our expense. */
    expect(playablePath("https://evil.example/x.riv")).toBeNull();
    expect(playablePath("http://evil.example/x.riv")).toBeNull();
    /* Scheme-relative: off-origin wearing a leading slash. */
    expect(playablePath("//evil.example/x.riv")).toBeNull();
    expect(playablePath("/etc/passwd")).toBeNull();
    expect(playablePath("data:text/html,<script>")).toBeNull();
    expect(playablePath(undefined)).toBeNull();
    expect(playablePath("")).toBeNull();
  });
});

describe("the app's side of it", () => {
  const film = readFileSync(
    resolve(root, "mobile/src/cosmetic-film.tsx"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("switches scripting on for the player and nothing else", () => {
    /*
     * The single most important line in this feature. `javaScriptEnabled`
     * must depend on whether we are showing OUR page - never a constant
     * true, and never keyed on anything an uploader controls.
     */
    expect(film).toContain('javaScriptEnabled={art.kind === "rive"}');
    expect(film).not.toMatch(/javaScriptEnabled=\{true\}/);
  });

  it("only ever builds a player URL on our own origin", () => {
    expect(film).toContain("API_BASE");
    expect(film).toMatch(/parsed\.origin !== new URL\(API_BASE\)\.origin/);
  });

  it("draws nothing rather than pointing the player somewhere else", () => {
    expect(film).toContain("if (failed || !player) return null;");
  });

  it("never builds a document of its own again", () => {
    /*
     * The bug this whole page exists for. Handing the WebView an HTML
     * STRING gives it an opaque origin on iOS, and an opaque-origin
     * document is not a reliable place to fetch an https subresource
     * from - so an uploaded SVG rendered on the website, rendered in
     * Chromium when tested, and drew nothing on the founder's phone.
     * The app points at a real URL now and never composes markup.
     */
    expect(film).not.toContain("<!doctype html");
    expect(film).not.toMatch(/source=\{\{\s*html/);
    expect(film).toContain("source={{ uri: player }}");
  });
});

describe("the page itself", () => {
  const page = readFileSync(resolve(root, "src/app/cosmetic-player/page.tsx"), "utf8");

  it("is not something a search engine should hold on to", () => {
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("paints nothing of its own", () => {
    /* It is drawn over somebody's face. A background here is a square
       on a profile picture. */
    expect(page).toMatch(/background:\s*transparent\s*!important/);
  });
});
