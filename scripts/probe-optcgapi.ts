/**
 * Inspects the live OPTCG API and reports its actual response shape.
 *
 *   npm run cards:probe
 *
 * This exists because the field mapping must be verified against real
 * responses before any import runs, and whoever wrote the adapter could not
 * reach the network. It does the inspection the brief asks for and writes the
 * artefacts:
 *
 *   - tests/fixtures/optcgapi/<endpoint>.json   a few redacted records each
 *   - a printed report of every field name observed, with types and a sample
 *   - which mapping candidates matched, and which domain fields matched nothing
 *
 * Read-only. It writes nothing to the database and needs no credentials.
 *
 * Redaction: only the first few records per endpoint are kept, and any value
 * that looks like a key or token is masked. Card data is not secret, but a
 * fixture committed to a public repository should not carry anything else.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ProviderHttp } from "../src/lib/cards/providers/http";
import {
  OPTCGAPI_BASE_URL,
  OPTCGAPI_ENDPOINTS,
} from "../src/lib/cards/providers/optcgapi/adapter";
import {
  CANDIDATE_FIELDS,
  type DomainField,
} from "../src/lib/cards/providers/optcgapi/mapping";

const FIXTURE_DIR = resolve(import.meta.dirname, "../tests/fixtures/optcgapi");
const RECORDS_PER_FIXTURE = 3;

const SECRET_LIKE = /(key|token|secret|password|authorization)/i;

function redact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) =>
      SECRET_LIKE.test(key) ? [key, "[redacted]"] : [key, value],
    ),
  );
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  return typeof value;
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return "";
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

interface FieldReport {
  type: Set<string>;
  presentIn: number;
  sample: string;
}

async function probeEndpoint(
  http: ProviderHttp,
  name: string,
  path: string,
): Promise<Map<string, FieldReport> | null> {
  process.stdout.write(`\n── ${name}  ${path}\n`);

  let raw: unknown;
  try {
    raw = await http.getJson(path);
  } catch (error) {
    console.log(`   FAILED: ${error instanceof Error ? error.message : error}`);
    return null;
  }

  if (!Array.isArray(raw)) {
    console.log(`   Returned ${describe(raw)}, expected an array. Inspect manually.`);
    return null;
  }

  console.log(`   ${raw.length} record(s)`);
  if (raw.length === 0) return new Map();

  const fields = new Map<string, FieldReport>();

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;

    for (const [key, value] of Object.entries(entry)) {
      const report = fields.get(key) ?? {
        type: new Set<string>(),
        presentIn: 0,
        sample: preview(value),
      };
      report.type.add(describe(value));
      report.presentIn += 1;
      fields.set(key, report);
    }
  }

  console.log(`   ${fields.size} distinct field(s):\n`);
  const width = Math.max(...[...fields.keys()].map((k) => k.length));

  for (const [key, report] of [...fields].sort()) {
    // A field missing from some records is exactly what the brief means by
    // "report any inconsistent or missing fields".
    const coverage =
      report.presentIn === raw.length ? "always" : `${report.presentIn}/${raw.length}`;

    console.log(
      `     ${key.padEnd(width)}  ${[...report.type].join("|").padEnd(12)} ` +
        `${coverage.padEnd(9)} ${report.sample}`,
    );
  }

  const fixture = raw
    .slice(0, RECORDS_PER_FIXTURE)
    .map((entry) => redact(entry as Record<string, unknown>));

  const file = resolve(FIXTURE_DIR, `${name}.json`);
  await writeFile(file, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  console.log(`\n   wrote ${fixture.length} record(s) to ${file}`);

  return fields;
}

/** Says plainly which guesses in the mapping were right and which were not. */
function reportMapping(observed: Set<string>) {
  console.log("\n\n══ Mapping check ══\n");

  const unmatched: DomainField[] = [];

  for (const [field, candidates] of Object.entries(CANDIDATE_FIELDS)) {
    const hit = candidates.find((key) => observed.has(key));

    if (hit) {
      console.log(`  ✓ ${field.padEnd(14)} → ${hit}`);
    } else {
      unmatched.push(field as DomainField);
      console.log(`  ✗ ${field.padEnd(14)} → none of: ${candidates.join(", ")}`);
    }
  }

  if (unmatched.length > 0) {
    console.log(
      `\n  ${unmatched.length} domain field(s) matched nothing. Add the real key ` +
        `to CANDIDATE_FIELDS in src/lib/cards/providers/optcgapi/mapping.ts.`,
    );
  }

  const mapped = new Set<string>(
    Object.values(CANDIDATE_FIELDS).flatMap((keys) => [...keys]),
  );
  const unused = [...observed].filter((key) => !mapped.has(key)).sort();

  if (unused.length > 0) {
    console.log(
      `\n  Fields the API returns that the mapping ignores:\n    ${unused.join(", ")}`,
    );
  }
}

async function main() {
  console.log(`Probing ${OPTCGAPI_BASE_URL}`);
  console.log("Read-only. No database writes, no credentials needed.");

  await mkdir(FIXTURE_DIR, { recursive: true });

  const http = new ProviderHttp(OPTCGAPI_BASE_URL, {
    spacingMs: 800,
    onProgress: (message) => console.log(`   ${message}`),
  });

  const observed = new Set<string>();
  let reachable = 0;

  for (const [name, path] of Object.entries(OPTCGAPI_ENDPOINTS)) {
    const fields = await probeEndpoint(http, name, path);
    if (!fields) continue;

    reachable += 1;
    for (const key of fields.keys()) observed.add(key);
  }

  if (reachable === 0) {
    console.log("\nNo endpoint responded. Nothing was written.");
    process.exitCode = 1;
    return;
  }

  reportMapping(observed);

  console.log(
    '\n\nNext: correct CANDIDATE_FIELDS, set MAPPING_STATUS to "verified" with ' +
      "today's date, then run `npm run cards:sync:onepiece -- --sample`.\n",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
