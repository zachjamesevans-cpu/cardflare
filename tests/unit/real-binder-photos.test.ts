import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { SLOT_NAMES } from "@/lib/cards/page-geometry";
import { readPagePhoto } from "@/lib/cards/page-vision";

/**
 * The page finder on real photos of real binder pages. The founder
 * (2026-10-13): "We can test the scanner against real binder photographs,
 * not just synthetic ones." Photos and their answers live in
 * tests/fixtures/binder-photos (see its README); with none there, this
 * says so and skips rather than passing on nothing.
 */

const folder = resolve(import.meta.dirname, "../fixtures/binder-photos");
const photos = existsSync(folder)
  ? readdirSync(folder).filter((name) => /\.(jpe?g|png|webp)$/i.test(name))
  : [];

describe.skipIf(photos.length === 0)(
  "real binder photos (none in tests/fixtures/binder-photos yet)",
  () => {
    for (const name of photos) {
      it(`finds the pockets in ${name}`, { timeout: 60_000 }, async () => {
        const answers = join(folder, name.replace(/\.[^.]+$/, ".json"));
        const vision = await readPagePhoto(
          new Uint8Array(readFileSync(join(folder, name))),
        );
        /* Asking the player to line it up is a safe answer; a wrong grid is not. */
        if (vision.needsAlignment) return;
        if (!existsSync(answers)) return;
        const { pockets = [] } = JSON.parse(readFileSync(answers, "utf8")) as {
          pockets?: { slot: string | number; empty?: boolean }[];
        };
        for (const answer of pockets) {
          const slot =
            typeof answer.slot === "number"
              ? answer.slot
              : (SLOT_NAMES as readonly string[]).indexOf(
                  String(answer.slot).toUpperCase(),
                );
          const found = vision.pockets[slot];
          /* An empty pocket called a card costs one read; a card called empty is lost. */
          if (!answer.empty)
            expect(found.looksEmpty, `${SLOT_NAMES[slot]} holds a card`).toBe(false);
        }
      });
    }
  },
);
