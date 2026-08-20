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
    /* Our own, in either spelling - the server stamps art with the
       apex and the deployment redirects that to www, so a check
       against one string alone rejected our own files. */
    expect(film).toContain("API_BASE");
    expect(film).toMatch(/!siteOrigins\(\)\.includes\(parsed\.origin\)/);
    expect(film).not.toMatch(/parsed\.origin !== new URL\(API_BASE\)\.origin/);
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

describe("the origin whitelist", () => {
  /*
   * react-native-webview's whitelist logic, re-implemented VERBATIM
   * from WebViewShared so it can run here (the real module imports
   * react-native and cannot load under Node). If the library changes
   * this, the pin below against our source keeps us honest.
   */
  const extractOrigin = (url: string): string => {
    const result = /^[A-Za-z][A-Za-z0-9+\-.]+:(\/\/)?[^/]*/.exec(url);
    return result === null ? "" : result[0];
  };
  const escapeRe = (value: string) =>
    value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
  const passes = (whitelist: string[], url: string) =>
    ["about:blank", ...whitelist]
      .map((entry) => `^${escapeRe(entry).replace(/\\\*/g, ".*")}`)
      .some((pattern) => new RegExp(pattern).test(extractOrigin(url)));

  const API_BASE = "https://cardflare.gg";
  const player = `${API_BASE}/cosmetic-player?src=%2Fapi%2Favatars%2Fx.svg&kind=svg`;

  it("admits our own player page", () => {
    /* The app's whitelist is the BARE origin. This is what the source
       must keep computing. */
    expect(passes([new URL(API_BASE).origin], player)).toBe(true);
  });

  it("proves the '/*' form was the Safari bug", () => {
    /*
     * The library matches the whitelist against the URL's EXTRACTED
     * ORIGIN - no trailing slash - so a pattern ending in "/*" demands
     * a slash that is never there and admits nothing. And its answer
     * to a non-whitelisted URL is not "block": it is Linking.openURL.
     * That one character difference is why tapping Profile threw the
     * founder out of the app into Safari with a cosmetic in a tab.
     */
    expect(passes([`${API_BASE}/*`], player)).toBe(false);
  });

  /* Both spellings of our own host, which is what the app computes. */
  const ORIGINS = [API_BASE, "https://www.cardflare.gg"];

  it("proves one spelling of our host was the blank-ring bug", () => {
    /*
     * Found in the Simulator, on the founder's own profile: the border
     * drew nothing at all while every other part of the app was fine.
     *
     * `API_BASE` is the apex and the deployment answers it with a 308
     * to www. `fetch` follows that without comment, which is why the
     * API never noticed - but a redirect IS a navigation, the WebView
     * judges navigations by origin, and www was not on the list. The
     * library's answer to a URL that is not on the list is
     * Linking.openURL, the same cliff as the "/*" bug.
     */
    const redirected = player.replace(
      "https://cardflare.gg",
      "https://www.cardflare.gg",
    );

    expect(passes([new URL(API_BASE).origin], redirected)).toBe(false);
    expect(passes(ORIGINS, redirected)).toBe(true);
    /* And the apex still works, because the server stamps art with it. */
    expect(passes(ORIGINS, player)).toBe(true);
  });

  it("is the form the app actually ships", () => {
    const film = readFileSync(resolve(root, "mobile/src/cosmetic-film.tsx"), "utf8");

    /* Bare origins, computed in one place for the whitelist, the load
       gate and playerUrl alike - three copies of a host rule is how one
       of them ends up a redirect behind the others. */
    expect(film).toContain("originWhitelist={siteOrigins()}");
    expect(film).not.toMatch(/originWhitelist=\{\[[^\]]*\/\*/);
    expect(film).toContain("export function siteOrigins()");
    expect(film).toContain("siteOrigins().includes(parsed.origin)");

    /* And the load gate matches by prefix, never equality: iOS may
       re-serialise our query encoding, and refusing our own page draws
       nothing forever. */
    expect(film).toContain("request.url.startsWith(`${origin}/cosmetic-player`)");
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
