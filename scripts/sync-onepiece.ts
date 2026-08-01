/**
 * Synchronises the One Piece card catalog from the configured provider.
 *
 *   npm run cards:sync:onepiece -- --sample
 *   npm run cards:sync:onepiece -- --full --confirm
 *
 * Runs under `tsx --conditions=react-server`. The sync imports the service-role
 * Supabase client, which imports `server-only`; without that condition the
 * package throws on load and the command dies before doing anything. The npm
 * script sets it — invoking the file with bare `tsx` will not work.
 *
 * Server-side only. Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY, reads .env.local if present, and is never
 * reachable from the browser — there is no endpoint, so there is nothing for a
 * public user to trigger.
 *
 * Full mode requires --confirm. It is thousands of records against a free API,
 * and an accidental repeat is exactly the kind of thing that gets a courtesy
 * service withdrawn.
 */
import {
  MappingUnverifiedError,
  OptcgApiProvider,
} from "../src/lib/cards/providers/optcgapi/adapter";
import {
  MAPPING_STATUS,
  MAPPING_VERIFIED_ON,
} from "../src/lib/cards/providers/optcgapi/mapping";
import { syncCards } from "../src/lib/cards/sync";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npm run cards:sync:onepiece -- --sample",
      "  npm run cards:sync:onepiece -- --full --confirm",
      "",
      "  --sample   ~75-150 deterministic records for interface testing",
      "  --full     the provider's entire catalog (requires --confirm)",
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const sample = args.has("--sample");
  const full = args.has("--full");

  if (sample === full) usage();
  if (full && !args.has("--confirm")) {
    console.error(
      "Full sync pulls the provider's entire catalog. Re-run with --confirm " +
        "if that is what you want.",
    );
    process.exit(1);
  }

  for (const variable of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[variable]) {
      console.error(`${variable} is not set. Sync needs the service-role key.`);
      process.exit(1);
    }
  }

  const provider = new OptcgApiProvider({
    onProgress: (message) => console.log(`   ${message}`),
  });

  const mode = sample ? "sample" : "full";

  // Say what is about to happen before doing it.
  console.log(`Provider:      ${provider.displayName}`);
  console.log(`Mode:          ${mode}`);
  console.log(
    `Mapping:       ${MAPPING_STATUS}${MAPPING_VERIFIED_ON ? ` (verified ${MAPPING_VERIFIED_ON})` : ""}`,
  );
  console.log(`Supplies URLs: ${provider.suppliesImages ? "yes" : "no"}`);
  console.log(
    `Display flag:  NEXT_PUBLIC_ENABLE_CARD_IMAGES=${process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES ?? "unset (off)"}`,
  );
  console.log("Writes:        cards, card_printings, card_sync_runs");
  console.log("Deletes:       nothing, ever\n");

  try {
    const summary = await syncCards(provider, {
      mode,
      onProgress: (message) => console.log(message),
    });

    console.log("\nDone.");
    console.log(`  records seen:      ${summary.recordsSeen}`);
    console.log(`  unique cards:      ${summary.uniqueCards}`);
    console.log(`  cards upserted:    ${summary.cardsUpserted}`);
    console.log(`  printings upserted:${summary.printingsUpserted}`);
    console.log(`  records failed:    ${summary.recordsFailed}`);

    if (summary.recordsFailed > 0) {
      console.log(
        `\n  Failed records are in card_sync_failures for run ${summary.runId}.`,
      );
    }
  } catch (error) {
    if (error instanceof MappingUnverifiedError) {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
