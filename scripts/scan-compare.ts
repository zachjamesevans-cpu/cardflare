/**
 * Runs one photo through the card reader with each model, and prints
 * what each one picked, how long it took and what it cost.
 *
 *   npm run scan:compare -- photo.jpg
 *   npm run scan:compare -- page.jpg --page
 *   npm run scan:compare -- page.jpg --page --models claude-sonnet-5-5,claude-opus-5-5
 *
 * The founder (2026-10-09): ChatGPT got a card right that we did not,
 * and three pages cost $2.79. This settles which model is worth what on
 * real photos, instead of on one guess.
 *
 * A page is cut the way the app cuts it: the whole photo at its long
 * edge, and nine pockets on the 3x3 grid with the same margin. Every
 * run spends real API credit, a few cents a page; the total is printed.
 *
 * Runs under `tsx --conditions=react-server` (the reader imports the
 * service-role client, which imports `server-only`). Needs
 * ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
 * read from .env.local; nothing is printed of any of them.
 */
import { readFileSync } from "node:fs";

import sharp, { type Sharp } from "sharp";

import { readCards, type ReaderPhoto } from "../src/lib/cards/page-reader";
import { withoutKeys } from "../src/lib/cards/scan";
import { pocketCrop, SCAN_LONG_EDGE } from "../src/lib/cards/scan-rules";

/* The app's own sizes: mobile/src/page-scan.ts PAGE_LONG_EDGE. */
const PAGE_LONG_EDGE = 1568;
const DEFAULT_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];

function usage(): never {
  console.error(
    "Usage: npm run scan:compare -- <photo> [--page] [--models a,b,c]\n" +
      `Models default to ${DEFAULT_MODELS.join(", ")}.`,
  );
  process.exit(1);
}

async function jpeg(image: Sharp, longEdge: number): Promise<ReaderPhoto> {
  const bytes = await image
    .resize({
      width: longEdge,
      height: longEdge,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 70 })
    .toBuffer();
  return { bytes: new Uint8Array(bytes), mediaType: "image/jpeg" };
}

async function main() {
  const args = process.argv.slice(2);
  const path = args.find((arg) => !arg.startsWith("--"));
  if (!path) usage();
  const isPage = args.includes("--page");
  const at = args.indexOf("--models");
  const models =
    at >= 0 ? (args[at + 1] ?? "").split(",").filter(Boolean) : DEFAULT_MODELS;
  if (models.length === 0) usage();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set (looked in .env.local).");
    process.exit(1);
  }

  /* Turned upright first, as the phone's camera does. */
  const source = sharp(readFileSync(path)).rotate();
  const { width = 0, height = 0 } = await sharp(
    await source.clone().toBuffer(),
  ).metadata();
  const upright = await source.clone().toBuffer();

  const page = isPage ? await jpeg(sharp(upright), PAGE_LONG_EDGE) : null;
  const pockets = isPage
    ? await Promise.all(
        Array.from({ length: 9 }, (_, slot) => {
          const cut = pocketCrop(slot, width, height);
          return jpeg(
            sharp(upright).extract({
              left: cut.x,
              top: cut.y,
              width: cut.width,
              height: cut.height,
            }),
            SCAN_LONG_EDGE,
          );
        }),
      )
    : [await jpeg(sharp(upright), SCAN_LONG_EDGE)];

  let total = 0;
  for (const model of models) {
    process.env.SCAN_AGENT_MODEL = model;
    const started = Date.now();
    const outcome = await readCards({
      mode: isPage ? "page" : "card",
      page,
      pockets,
      games: [],
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`\n=== ${model} (${seconds}s) ===`);
    if (!outcome.ok) {
      console.log(`  failed: ${outcome.reason}`);
      continue;
    }
    total += outcome.cents;
    for (const pocket of outcome.pockets) {
      if (pocket.state === "empty") {
        console.log(`  ${pocket.slot}: empty`);
      } else if (pocket.state === "found") {
        const top = pocket.matches[0];
        const printing = top.card.printings.find((p) => p.id === top.printingId);
        console.log(
          `  ${pocket.slot}: ${top.card.exactName} ${top.card.canonicalCardNumber}` +
            `${printing ? ` (${printing.setName ?? printing.setCode ?? "printing"})` : ""}` +
            `${pocket.sure ? "" : "  [unsure]"}${pocket.note ? `  "${pocket.note}"` : ""}`,
        );
      } else {
        const named = pocket.read?.englishName || pocket.read?.name || "?";
        const maybe = (pocket.suggestions ?? [])
          .map((match) => `${match.card.exactName} ${match.card.canonicalCardNumber}`)
          .join(", ");
        console.log(
          `  ${pocket.slot}: not placed, read as "${named}"` +
            `${maybe ? `; might be: ${maybe}` : ""}${pocket.note ? `  "${pocket.note}"` : ""}`,
        );
      }
    }
    console.log(`  cost: ${outcome.cents.toFixed(2)} cents`);
  }
  console.log(`\nTotal spent: ${total.toFixed(2)} cents`);
}

main().catch((error: unknown) => {
  console.error(withoutKeys(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
