import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkRiveFile,
  looksLikeRive,
  RIVE_MAX_BYTES,
  RIVE_REJECTION_COPY,
} from "@/lib/admin/rive-file";
import { redundantCosmeticWord, tidyCosmeticName } from "@/lib/players/cosmetic-names";
import { slugFromName } from "@/lib/admin/catalog-schema";

/**
 * Dropping a file in has to be safe before it is convenient.
 *
 * The founder's goal is that a .riv "just works" the moment it lands,
 * which means the door has to refuse everything that would not: a
 * screenshot renamed to .riv, a 40 MB export, an empty pick. And a
 * cosmetic made this way is still a cosmetic, so it still obeys the
 * naming rule that every other one obeys.
 */

/** The first four bytes of every .riv file, then some payload. */
function riveBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x52, 0x49, 0x56, 0x45]); // "RIVE"
  return bytes;
}

describe("what counts as a Rive file", () => {
  it("accepts a file carrying the RIVE fingerprint", () => {
    expect(looksLikeRive(riveBytes())).toBe(true);
    expect(checkRiveFile(riveBytes())).toBeNull();
  });

  it("refuses a PNG renamed to .riv", () => {
    /* The real PNG magic: nothing about the name is consulted. */
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
    expect(looksLikeRive(png)).toBe(false);
    expect(checkRiveFile(png)).toBe("not-rive");
  });

  it("refuses an empty pick and an oversized export", () => {
    expect(checkRiveFile(new Uint8Array(0))).toBe("empty");
    expect(checkRiveFile(riveBytes(RIVE_MAX_BYTES + 1))).toBe("too-big");
  });

  it("has a plain sentence for every refusal", () => {
    for (const reason of ["empty", "too-big", "not-rive"] as const) {
      const said = RIVE_REJECTION_COPY[reason];
      expect(said.length).toBeGreaterThan(10);
      /* House style: no em dashes in anything a person reads. */
      expect(said).not.toContain("—");
    }
  });

  it("a four byte file is not a Rive file, fingerprint or not", () => {
    /* Nothing to play: the header IS the whole file. */
    expect(looksLikeRive(new Uint8Array([0x52, 0x49, 0x56, 0x45]))).toBe(false);
  });
});

describe("a dropped-in cosmetic is still a cosmetic", () => {
  it("the naming rule applies to it, same as every other", () => {
    /* The founder's standing instruction, applied at the new door. */
    expect(redundantCosmeticWord("ring", "Frost Border")).not.toBeNull();
    expect(tidyCosmeticName("ring", "Frost Border")).toBe("Frost");
    expect(tidyCosmeticName("ring", "Frost")).toBe("Frost");
  });

  it("its slug carries its category, like every seeded one", () => {
    /* createCosmetic builds `${prefix}-${slugFromName(name)}`; these are
       the two halves it is made of, checked where they can be tested
       without a database. */
    expect(slugFromName("Frost Bite")).toBe("frost-bite");
    expect(`ring-${slugFromName("Frost")}`).toBe("ring-frost");
    expect(`name-${slugFromName("Gold Rush")}`).toBe("name-gold-rush");
  });
});

describe("the art-kind rule reaches the database", () => {
  const sql = readdirSync(join(process.cwd(), "supabase/migrations"))
    .map((file) =>
      readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"),
    )
    .join("\n");

  it("a Rive cosmetic cannot exist without a file, or CSS with one", () => {
    expect(sql).toContain("cosmetics_rive_art_check");
    expect(sql).toContain("art_kind = 'rive' and rive_path is not null");
    expect(sql).toContain("art_kind = 'css' and rive_path is null");
  });

  it("the runtime's WASM is served from our own origin, never a CDN", () => {
    const component = readFileSync(
      join(process.cwd(), "src/components/players/rive-art.tsx"),
      "utf8",
    );
    expect(component).toContain('setWasmUrl("/rive/rive.wasm")');
    expect(component).toContain("setWasmFallbackUrl(null)");
    expect(component).not.toContain("unpkg");
  });
});

/**
 * The founder, on the lightning ring: "the ring kinda digs into the
 * profile pic a bit too much. Please don't ever do that again with
 * these." The promise is kept by geometry, so it is checked as
 * geometry: one rule, used by everything that wears one.
 */
describe("worn ring art never lands on the picture", () => {
  const css = readFileSync(join(process.cwd(), "src/app/cosmetic-art.css"), "utf8");
  const rule = css.slice(css.indexOf(".cfx-ring-film"));

  it("sizes the film so radius 148 meets the avatar's edge", () => {
    /* 400/296: art radius 148 in a 400 box, on an avatar of diameter
       296 of those units. Anything smaller puts the band on the face. */
    expect(rule).toContain("inset: -17.568%");
    expect((400 / 296 - 1) / 2).toBeCloseTo(0.17568, 5);
  });

  it("punches the picture out of the layer, glow and all", () => {
    /* A glow has no edge to line up, so clipping is what actually
       holds the promise. 74% of the film's half-width is radius 148. */
    expect(rule).toContain("mask: radial-gradient(farthest-side, transparent 73.5%");
    expect(rule).toContain("-webkit-mask: radial-gradient(");
  });

  it("the app scales its film by the same 400/296", () => {
    /* React Native has no CSS mask, so the app keeps the same promise
       by drawing the film UNDER an opaque face. Different mechanism,
       identical geometry - and if one side's number moves, this
       fails.

       The constant lives in mobile/src/avatar-geometry.ts rather than
       in the component, because a worn ring drawn from arithmetic
       inside a component is exactly how the CATALOGUE rings ended up
       stroked inside the avatar and invisible. Same reason, one file
       later; see tests/unit/app-avatar-geometry.test.ts. */
    const geometry = readFileSync(
      join(process.cwd(), "mobile/src/avatar-geometry.ts"),
      "utf8",
    );
    const avatar = readFileSync(
      join(process.cwd(), "mobile/src/player-avatar.tsx"),
      "utf8",
    );
    expect(geometry).toContain("export const FILM_SCALE = 400 / 296");
    expect(avatar).toContain('from "./avatar-geometry"');
    /* Drawn before the face in JSX, which is what puts it behind. */
    expect(avatar.indexOf("ringArt && (")).toBeLessThan(
      avatar.indexOf("{face}\n        {auraArt"),
    );
  });

  it("the app never lets uploaded art run code either", () => {
    const film = readFileSync(
      join(process.cwd(), "mobile/src/cosmetic-film.tsx"),
      "utf8",
    );
    /*
     * JavaScript off is the containment. The origin whitelist is NOT:
     * an empty one blocks the art itself, which is what kept any ring
     * from appearing in the app at all - see the animated-avatar
     * tests, where that regression is pinned.
     */
    expect(film).toContain("javaScriptEnabled={false}");
    expect(film).not.toContain("javaScriptEnabled={true}");
    expect(film).toContain("domStorageEnabled={false}");
  });

  it("is the one rule both the avatar and the editor use", () => {
    for (const file of [
      "src/components/players/player-avatar.tsx",
      "src/components/players/avatar-form.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).toContain('className="cfx-ring-film"');
      /* No hand-placed inset beside it: two copies drift. */
      expect(source).not.toContain("inset-[-15.8%]");
    }
  });
});
