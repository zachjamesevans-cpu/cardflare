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
