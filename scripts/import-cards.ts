/**
 * Imports card data from a JSON file.
 *
 *   npm run cards:import -- ./one-piece.json
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
 * environment. Idempotent — re-running upserts rather than duplicating, so it
 * is safe to run again after a correction.
 *
 * Deliberately a script and not a Server Action. Importing thousands of cards
 * is a deploy-time operation done by someone with the service-role key, not a
 * button in the app, and keeping it out of the request path means there is no
 * endpoint to protect.
 */
import { JsonCardProvider } from "../src/lib/cards/json-provider";
import { importCards } from "../src/lib/cards/importer";

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error("Usage: npm run cards:import -- <path-to-json>");
    process.exit(1);
  }

  for (const variable of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!process.env[variable]) {
      console.error(`${variable} is not set. Import needs the service-role key.`);
      process.exit(1);
    }
  }

  const provider = new JsonCardProvider(filePath);

  console.log(`Importing from ${provider.name}…`);
  const summary = await importCards(provider);

  console.log(
    [
      `  cards:     ${summary.cards}`,
      `  printings: ${summary.printings}`,
      `  aliases:   ${summary.aliases}`,
    ].join("\n"),
  );

  if (summary.skippedImages > 0) {
    // Not a warning to fix — the expected outcome until artwork is licensed.
    console.log(
      `\n  ${summary.skippedImages} image URL(s) ignored: this provider is not ` +
        `marked as licensed to supply artwork.`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
