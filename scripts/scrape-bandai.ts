/**
 * Collects a set from the official Bandai card list into a manifest and
 * a folder of pictures, ready for /admin/cards/import.
 *
 *   npm run cards:scrape:bandai -- discover --url "https://en.onepiece-cardgame.com/cardlist/?series=569117"
 *   npm run cards:scrape:bandai -- collect  --url "https://en.onepiece-cardgame.com/cardlist/?series=569117" --out ./op14
 *
 * Run discover FIRST. It fetches nothing but the page and prints what
 * the parser understood — cards found, fill rates per field, parallel
 * count. When every number looks right, run collect with the same URL.
 *
 * Runs on a laptop, never on the server, like every collector here: a
 * page's markup changes without warning, and collection belongs on a
 * machine somebody is watching. The founder is an official One Piece
 * judge with Bandai's permission to collect from the site — and the
 * politeness delay stays anyway, because permission to read is not
 * permission to hammer.
 *
 * If the page will not fetch from your network, save it from the
 * browser (File → Save Page As → HTML only) and pass --file page.html
 * with the original --url beside it so image paths still resolve.
 *
 * Options:
 *   --url       the cardlist page (required; also the base for images)
 *   --file      read the page from a saved HTML file instead of fetching
 *   --out       output folder for collect (required for collect)
 *   --set       set code, e.g. OP-14. Default: implied by the card numbers
 *   --set-name  set name. Default: the page's own series title
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  discoverReport,
  imageFileName,
  impliedSetCode,
  parseBandaiCardlist,
  parseSeriesTitle,
  toImportManifest,
  type BandaiCard,
} from "../src/lib/cards/bandai-page";

/** Politeness. Permission to read the page is not permission to hammer it. */
const DELAY_MS = 400;

/* An honest browser-shaped UA: the site serves plain HTML to browsers,
   and a bare "node" UA is exactly what edge caches turn away. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) cardflare-collector/1.0";

function usage(): never {
  console.error(
    [
      "Usage:",
      '  npm run cards:scrape:bandai -- discover --url "<cardlist url>"',
      '  npm run cards:scrape:bandai -- collect --url "<cardlist url>" --out ./op14',
      "",
      "  --file page.html   parse a browser-saved copy instead of fetching",
      "  --set OP-14        override the set code implied by the card numbers",
      '  --set-name "..."   override the set name read off the page',
    ].join("\n"),
  );
  process.exit(1);
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return undefined;
  return args[index + 1];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(
      `The page answered ${response.status}. If your network is the problem, ` +
        "save the page from a browser and pass --file page.html.",
    );
  }

  return response.text();
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadImages(
  cards: BandaiCard[],
  pageUrl: string,
  folder: string,
): Promise<{ saved: number; skipped: number; failed: string[] }> {
  await mkdir(folder, { recursive: true });

  let saved = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const card of cards) {
    if (!card.imageUrl) {
      failed.push(`${card.slug} (no image on the page)`);
      continue;
    }

    const path = join(folder, imageFileName(card));

    /* Resume for free: a run that died halfway re-downloads nothing. */
    if (await exists(path)) {
      skipped += 1;
      continue;
    }

    try {
      const response = await fetch(card.imageUrl, {
        headers: { "user-agent": USER_AGENT, referer: pageUrl },
      });
      if (!response.ok) throw new Error(`answered ${response.status}`);

      await writeFile(path, Buffer.from(await response.arrayBuffer()));
      saved += 1;
      process.stdout.write(`\r  ${saved + skipped} of ${cards.length} pictures`);
    } catch (error) {
      failed.push(`${card.slug} (${error instanceof Error ? error.message : error})`);
    }

    await wait(DELAY_MS);
  }

  process.stdout.write("\n");
  return { saved, skipped, failed };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  if (mode !== "discover" && mode !== "collect") usage();

  const url = flag(args, "--url");
  const file = flag(args, "--file");
  if (!url) usage();

  const html = file ? await readFile(file, "utf8") : await fetchPage(url);
  const cards = parseBandaiCardlist(html, url);

  if (cards.length === 0) {
    console.error(
      "No card blocks found. Either the URL is not a cardlist page or the " +
        "markup has changed shape — open the page in a browser, save it, and " +
        "send scripts/scrape-bandai.ts the saved file with --file so the " +
        "parser can be fixed against what the page really looks like.",
    );
    process.exit(1);
  }

  const seriesTitle = parseSeriesTitle(html);
  const setCode = flag(args, "--set")?.toUpperCase() ?? impliedSetCode(cards);
  const setName = flag(args, "--set-name") ?? seriesTitle;

  console.log(`\nSeries title on the page: ${seriesTitle ?? "(none found)"}`);
  console.log(`Set code: ${setCode ?? "(none — pass --set)"}\n`);
  for (const line of discoverReport(cards)) console.log(line);

  if (mode === "discover") {
    console.log("\nIf those numbers look like the set, run collect with the same URL.");
    return;
  }

  const out = flag(args, "--out");
  if (!out) usage();
  if (!setCode) {
    console.error("\nNo set code could be implied. Pass --set, e.g. --set OP-14.");
    process.exit(1);
  }
  if (!setName) {
    console.error('\nNo set name found on the page. Pass --set-name "…".');
    process.exit(1);
  }

  console.log(`\nCollecting into ${out} …`);
  const images = await downloadImages(cards, url, join(out, "images"));

  const manifest = toImportManifest(cards, { setCode, setName });
  await writeFile(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    [
      "",
      `Wrote ${join(out, "manifest.json")}: ${manifest.cards.length} printings.`,
      `Pictures: ${images.saved} downloaded, ${images.skipped} already there.`,
      ...(images.failed.length > 0
        ? [
            `Missing: ${images.failed.join(", ")}`,
            "Re-run the same command to retry just those.",
          ]
        : []),
      "",
      "Next: cardflare.gg/admin/cards/import — choose the manifest, then the",
      "images folder, and the console does the rest.",
    ].join("\n"),
  );
}

await main();
