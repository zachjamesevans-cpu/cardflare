/**
 * Imports a game's cards from its public catalogue — one set, or every set.
 *
 *   npm run cards:import -- --game mtg --set MH3
 *   npm run cards:import -- --game mtg --all --confirm
 *   npm run cards:import -- --game pokemon --all --details --confirm
 *   npm run cards:import -- --game pokemon --all --confirm --from sv5
 *   npm run cards:import -- --game lorcana --all --confirm
 *
 * The same `syncCards` the admin console runs, without the console's
 * one-minute ceiling: a whole game is hundreds of sets and the console
 * cannot sit on a request that long, so this is the laptop's job. Each
 * set is its own run in `card_sync_runs`, which is what makes a run
 * that stops half way resumable — `--from` picks up at a set code.
 *
 * Runs under `tsx --conditions=react-server`. The sync imports the
 * service-role Supabase client, which imports `server-only`; without
 * that condition the package throws on load. The npm script sets it.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, reads
 * .env.local if present, and is reachable from nowhere but a terminal.
 *
 * --all requires --confirm: it is thousands of polite requests against
 * free services, and an accidental repeat is how a courtesy gets
 * withdrawn. --details asks the source for what its listing leaves out
 * (Pokémon rarity, type and HP), one request per card, which turns a
 * minute into an hour and is exactly what a laptop can do overnight.
 */
import {
  catalogueSource,
  providerForGame,
  CATALOGUE_SOURCES,
} from "../src/lib/cards/providers/registry";
import { cleanSetCode } from "../src/lib/cards/providers/shared";
import { syncCards, type SyncSummary } from "../src/lib/cards/sync";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npm run cards:import -- --game <game> --set <CODE>",
      "  npm run cards:import -- --game <game> --all --confirm [--from <CODE>] [--details]",
      "",
      `  --game     one of: ${CATALOGUE_SOURCES.map((source) => source.game).join(", ")}`,
      "  --set      one set, by the source's own code (MH3, sv1, MST, OGN, 1)",
      "  --all      every set the source lists, newest first (requires --confirm)",
      "  --from     with --all: skip sets until this code, to resume a stopped run",
      "  --details  fetch per-card details the listing leaves out (slow; Pokémon)",
    ].join("\n"),
  );
  process.exit(1);
}

function flag(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] ?? "";
}

function describe(summary: SyncSummary): string {
  return `${summary.uniqueCards} cards, ${summary.printingsUpserted} printings, ${summary.recordsFailed} rejected`;
}

async function main() {
  const args = process.argv.slice(2);
  const game = flag(args, "--game") ?? "";
  const set = flag(args, "--set");
  const all = args.includes("--all");
  const confirm = args.includes("--confirm");
  const detailed = args.includes("--details");
  const from = flag(args, "--from");

  const source = catalogueSource(game);
  if (!source) usage();
  if (Boolean(set) === all) usage();
  if (all && !confirm) {
    console.error(
      `--all pulls every ${source.sourceName} set. Re-run with --confirm if that is what you want.`,
    );
    process.exit(1);
  }

  for (const variable of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[variable]) {
      console.error(`${variable} is not set. The import needs the service-role key.`);
      process.exit(1);
    }
  }

  const provider = providerForGame(game);
  if (!provider) usage();

  console.log(`Game:      ${game}`);
  console.log(`Source:    ${provider.displayName}`);
  console.log(`Details:   ${detailed ? "per card (slow)" : "listing only"}`);
  console.log("Writes:    cards, card_printings, card_sync_runs");
  console.log("Deletes:   nothing, ever\n");

  const codes: { code: string; name: string | null }[] = [];

  if (set) {
    const code = cleanSetCode(set);
    if (!code) {
      console.error("A set code is letters, digits and dashes only.");
      process.exit(1);
    }
    codes.push({ code, name: null });
  } else {
    console.log(`Listing ${source.sourceName}'s sets…`);
    const sets = await provider.fetchSets();
    if (sets.length === 0) {
      console.error("The source listed no sets. Nothing to import.");
      process.exit(1);
    }
    let started = !from;
    const resumeAt = from ? cleanSetCode(from) : null;
    for (const entry of sets) {
      if (!started && entry.code === resumeAt) started = true;
      if (started) codes.push({ code: entry.code, name: entry.name });
    }
    if (!started) {
      console.error(`--from ${from} matched none of the ${sets.length} sets listed.`);
      process.exit(1);
    }
    console.log(`${codes.length} set(s) to import.\n`);
  }

  const done: string[] = [];
  const troubled: string[] = [];
  const startedAt = Date.now();

  for (const [index, entry] of codes.entries()) {
    const label = entry.name ? `${entry.code} · ${entry.name}` : entry.code;
    console.log(`[${index + 1}/${codes.length}] ${label}`);

    try {
      const summary = await syncCards(provider, {
        mode: "full",
        setCode: entry.code,
        detailed,
        onProgress: (message) => console.log(`   ${message}`),
      });
      console.log(`   → ${describe(summary)}`);
      if (summary.uniqueCards === 0 || summary.recordsFailed > summary.uniqueCards) {
        troubled.push(`${entry.code} (${describe(summary)})`);
      } else {
        done.push(entry.code);
      }
    } catch (error) {
      /* One set's trouble must not abandon the other three hundred. */
      const message = error instanceof Error ? error.message : String(error);
      console.error(`   ✗ ${message}`);
      troubled.push(`${entry.code} (${message.slice(0, 80)})`);
    }
  }

  const minutes = Math.round((Date.now() - startedAt) / 6000) / 10;
  console.log(`\nDone in ${minutes} min: ${done.length} set(s) imported.`);
  if (troubled.length > 0) {
    console.log(`\n${troubled.length} set(s) need a look:`);
    for (const line of troubled) console.log(`  ${line}`);
    console.log(
      "\nRejected records are in card_sync_failures. Re-run with --set <CODE> for any one of them.",
    );
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
