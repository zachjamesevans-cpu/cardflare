/**
 * Real binder photos through the page scanner, from the command line.
 *
 *   npm run scan:compare -- page.jpg                     every mode
 *   npm run scan:compare -- photos/*.jpg --vision-only   pockets only, free
 *   npm run scan:compare -- page.jpg --modes hybrid
 *   npm run scan:compare -- page.jpg --corners 0.1,0.1,0.9,0.1,0.9,0.9,0.1,0.9
 *
 * The founder (2026-10-13): "We can test the scanner against real binder
 * photographs, not just synthetic ones." This runs exactly what a player's
 * page goes through (page-vision.ts finds and cuts the pockets,
 * page-reader.ts reads them), with the read cache off so every mode pays
 * for its own reads, and prints each pocket, the time and the cost.
 *
 * The right answers, when you have them, go beside the photo as
 * `page.json` (the photo's name with .json):
 *
 *   { "pockets": [
 *       { "slot": "A1", "number": "OP01-120" },
 *       { "slot": "A2", "empty": true },
 *       { "slot": "B2", "number": "OP06-118", "printing": "<printing id, optional>" }
 *   ] }
 *
 * and each mode's exact-card, printing, placement and empty-pocket scores
 * are printed against them (scan-bench-rules.ts, the same arithmetic as
 * /admin/scanner). Nothing is claimed without them.
 *
 * --vision-only needs no keys and no database: it says how the pockets
 * were found and how surely, which pockets look empty, and where the
 * glare is, and writes the nine cut-out cards next to the photo as
 * `page.pocket-A1.jpg` and so on, to look at.
 *
 * Otherwise it needs ANTHROPIC_API_KEY (and OPENAI_API_KEY for the OpenAI
 * and hybrid modes), NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY,
 * read from .env.local; nothing is printed of any of them. Every run
 * spends real API credit, a few cents a page; the total is printed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

import type { Quad } from "../src/lib/cards/page-geometry";
import { SLOT_NAMES } from "../src/lib/cards/page-geometry";
import { readPagePhoto } from "../src/lib/cards/page-vision";
import {
  BENCH_MODES,
  scoreRun,
  type BenchMode,
  type BenchRun,
  type BenchTruth,
} from "../src/lib/cards/scan-bench-rules";

function usage(): never {
  console.error(
    "Usage: npm run scan:compare -- <photo> [more photos] [--vision-only] [--modes anthropic,openai,hybrid] [--corners x1,y1,...,x4,y4]",
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? "") : null;
};
const values = new Set([flag("--modes"), flag("--corners")].filter(Boolean));
const photos = args.filter((arg) => !arg.startsWith("--") && !values.has(arg));
if (photos.length === 0) usage();
const visionOnly = args.includes("--vision-only");
const modes = (flag("--modes") ?? BENCH_MODES.join(","))
  .split(",")
  .filter((m): m is BenchMode => (BENCH_MODES as readonly string[]).includes(m));
const cornerNumbers = flag("--corners")?.split(",").map(Number) ?? null;
const corners: Quad | undefined =
  cornerNumbers && cornerNumbers.length === 8 && cornerNumbers.every(Number.isFinite)
    ? ([0, 2, 4, 6].map((i) => ({
        x: cornerNumbers[i],
        y: cornerNumbers[i + 1],
      })) as Quad)
    : undefined;

const percent = (part: number, whole: number) =>
  whole > 0 ? `${part}/${whole} (${Math.round((part / whole) * 100)}%)` : "-";

async function main() {
  let total = 0;
  for (const path of photos) {
    const started = Date.now();
    const vision = await readPagePhoto(new Uint8Array(readFileSync(path)), corners);
    console.log(
      `\n### ${path}\npockets found by ${vision.method}, ${Math.round(vision.confidence * 100)}% sure` +
        `${vision.needsAlignment ? ", WOULD ASK THE PLAYER TO LINE IT UP" : ""}` +
        `${vision.blurry ? ", blurry" : ""} (${Date.now() - started} ms, ${vision.width}x${vision.height})`,
    );
    console.log(
      `  looks empty: ${
        vision.pockets
          .filter((p) => p.looksEmpty)
          .map((p) => SLOT_NAMES[p.slot])
          .join(" ") || "none"
      }` +
        `; glare: ${
          vision.pockets
            .filter((p) => p.glare)
            .map((p) => SLOT_NAMES[p.slot])
            .join(" ") || "none"
        }` +
        `; card outlines in: ${
          vision.pockets
            .filter((p) => p.cardSeen)
            .map((p) => SLOT_NAMES[p.slot])
            .join(" ") || "none"
        }`,
    );
    if (visionOnly) {
      const base = path.replace(/\.[^.]+$/, "");
      for (const pocket of vision.pockets) {
        writeFileSync(`${base}.pocket-${SLOT_NAMES[pocket.slot]}.jpg`, pocket.jpeg);
      }
      continue;
    }

    /* Loaded only when reading: they need the database and the keys. */
    const [{ readCrops }, { cardByNumber }, { scannerSettings }] = await Promise.all([
      import("../src/lib/cards/page-reader"),
      import("../src/lib/cards/scan-bench"),
      import("../src/lib/cards/scan-settings"),
    ]);
    const settings = await scannerSettings();
    const truth = await labelsFor(path, cardByNumber);
    const crops = vision.pockets.map((p) => ({
      slot: p.slot,
      bytes: p.jpeg,
      mediaType: "image/jpeg" as const,
      looksEmpty: p.looksEmpty,
      cardSeen: p.cardSeen,
      glare: p.glare,
    }));
    for (const mode of modes) {
      const outcome = await readCrops(crops, {
        games: [],
        settings,
        mode,
        cache: false,
      });
      const run = outcome.run;
      total += run.cents;
      console.log(
        `\n  === ${mode}: ${(run.ms / 1000).toFixed(1)}s, ${run.cents.toFixed(3)} cents, ` +
          `${run.calls.length} calls${run.escalated.length ? `, ${run.escalated.length} sent to OpenAI` : ""}`,
      );
      if (!outcome.ok) {
        console.log(`    failed: ${outcome.reason}`);
        continue;
      }
      const pockets: BenchRun["pockets"] = [];
      for (const pocket of outcome.pockets) {
        const top = pocket.state === "found" ? pocket.matches[0] : null;
        const read = pocket.state === "empty" ? null : pocket.read;
        const printing = top?.card.printings.find((p) => p.id === top.printingId);
        pockets.push({
          slot: pocket.slot,
          status: pocket.status ?? "unrecognized",
          cardId: top?.card.id ?? null,
          printingId: top?.printingId ?? null,
          name: top?.card.exactName ?? "",
          number: top?.card.canonicalCardNumber ?? "",
        });
        console.log(
          `    ${SLOT_NAMES[pocket.slot]} ${(pocket.status ?? "").padEnd(12)} ` +
            (top
              ? `${top.card.exactName} ${top.card.canonicalCardNumber}` +
                `${printing ? ` [${printing.printingLabel ?? printing.setName ?? printing.setCode ?? "printing"}]` : " [printing to choose]"}`
              : read
                ? `read as "${read.englishName || read.name}" ${read.number}`
                : "") +
            `${pocket.reasons?.length ? `  (${pocket.reasons.join("; ")})` : ""}`,
        );
      }
      if (truth) {
        const score = scoreRun({ pockets }, truth);
        console.log(
          `    against the labels: exact card ${percent(score.exact, score.cards)}, ` +
            `printing ${percent(score.printingRight, score.printings)}, ` +
            `right pocket ${percent(score.placedRight, score.found)}, ` +
            `empty or not ${percent(score.emptyRight, score.pockets)}`,
        );
      }
    }
  }
  if (!visionOnly) console.log(`\nTotal spent: ${total.toFixed(3)} cents`);
}

/** The photo's answer file, if there is one, with numbers turned into catalogue cards. */
async function labelsFor(
  path: string,
  cardByNumber: (number: string) => Promise<string | null>,
): Promise<BenchTruth[] | null> {
  const file = path.replace(/\.[^.]+$/, ".json");
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    pockets?: {
      slot: string | number;
      empty?: boolean;
      number?: string;
      printing?: string;
    }[];
  };
  const truth: BenchTruth[] = [];
  for (const entry of raw.pockets ?? []) {
    const slot =
      typeof entry.slot === "number"
        ? entry.slot
        : (SLOT_NAMES as readonly string[]).indexOf(String(entry.slot).toUpperCase());
    if (slot < 0 || slot > 8) continue;
    if (entry.empty) {
      truth.push({ slot, empty: true, cardId: null, printingId: null });
      continue;
    }
    const cardId = entry.number ? await cardByNumber(entry.number) : null;
    if (!cardId) {
      console.log(
        `  (label ${SLOT_NAMES[slot]}: no single card numbered ${entry.number}; left out)`,
      );
      continue;
    }
    truth.push({ slot, empty: false, cardId, printingId: entry.printing ?? null });
  }
  return truth;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  /* Never a key, whatever the error quoted. */
  console.error(
    message
      .replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-[hidden]")
      .replace(/Bearer\s+\S+/g, "Bearer [hidden]"),
  );
  process.exit(1);
});
