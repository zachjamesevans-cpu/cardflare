/**
 * The Store Discovery run, from a terminal.
 *
 * Reads candidates out of Overture (via scripts/overture-places.py, which
 * is the only thing that can talk to a parquet dataset) and scores them
 * with THE SAME rules the console uses - `scoreRelevance` - so what an
 * admin reviews here and what they would see in the browser cannot
 * disagree.
 *
 * PRINTS. It does not write. Importing is a separate human decision, and
 * this script has no database connection to make one with.
 *
 *   npx tsx scripts/discover-stores.ts "Austin, TX" 30.2672 -97.7431 25
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { scoreRelevance } from "../src/lib/places/relevance";

interface Raw {
  id: string;
  name: string | null;
  category: unknown;
  confidence: number | null;
  operating_status: string | null;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
  website: string | null;
  phone: string | null;
  sources: unknown;
}

/** Whatever shape the release's category column has, as flat strings. */
function categoriesOf(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(categoriesOf);
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(categoriesOf);
  }
  return [];
}

function main(): void {
  const [area, lat, lon, radius] = process.argv.slice(2);
  if (!area || !lat || !lon || !radius) {
    console.error(
      'usage: discover-stores.ts "<area>" <lat> <lon> <radiusMiles> [rawJsonPath]',
    );
    process.exit(2);
  }

  const cached = process.argv[6];
  const json = cached
    ? readFileSync(cached, "utf8")
    : execFileSync(
        "python3",
        [resolve(import.meta.dirname, "overture-places.py"), lat, lon, radius],
        { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 },
      );

  const raw = JSON.parse(json) as Raw[];

  const scored = raw
    .filter((row): row is Raw & { name: string } => Boolean(row.name))
    .map((row) => {
      const categories = categoriesOf(row.category);
      return {
        id: row.id,
        name: row.name,
        categories,
        address: [row.address_line, row.city, row.region].filter(Boolean).join(", "),
        addressLine: row.address_line,
        city: row.city,
        region: row.region,
        postalCode: row.postal_code,
        country: row.country,
        latitude: row.lat,
        longitude: row.lon,
        website: row.website,
        phone: row.phone,
        confidence: row.confidence,
        operatingStatus: row.operating_status,
        relevance: scoreRelevance({
          name: row.name,
          categories,
          website: row.website,
          confidence: row.confidence,
          operatingStatus: row.operating_status,
        }),
      };
    })
    .filter((row) => row.relevance.verdict !== "unlikely")
    .sort((a, b) => {
      const rank = { likely: 0, possible: 1, unlikely: 2 } as const;
      const byVerdict = rank[a.relevance.verdict] - rank[b.relevance.verdict];
      return byVerdict !== 0 ? byVerdict : a.name.localeCompare(b.name);
    });

  console.log(`\n${area} · ${radius} miles · Overture Places 2026-08-19.0`);
  console.log(`${raw.length} places in the box, ${scored.length} worth reviewing\n`);

  for (const row of scored) {
    const mark = row.relevance.verdict === "likely" ? "LIKELY  " : "POSSIBLE";
    console.log(`${mark}  ${row.name}`);
    console.log(`          ${row.address || "no address on record"}`);
    console.log(`          ${row.relevance.reasons.join(" · ")}`);
    if (row.website) console.log(`          ${row.website}`);
    console.log(`          overture:${row.id}`);
    console.log("");
  }

  /*
   * The snapshot the console reads.
   *
   * Discovery runs here, in a terminal, because Overture is a parquet
   * dataset rather than an API - but IMPORT is a decision made in the
   * admin console, so the candidates have to get there. This writes them
   * as a reviewed set; the console's snapshot provider serves whatever is
   * in this directory. Nothing in the file is published, and nothing in
   * it exists in CardFlare until somebody presses Import.
   */
  const out = resolve(
    import.meta.dirname,
    "..",
    "data",
    "store-candidates",
    `${area
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}.json`,
  );

  mkdirSync(resolve(out, ".."), { recursive: true });
  writeFileSync(
    out,
    `${JSON.stringify(
      {
        area,
        radiusMiles: Number(radius),
        provider: "overture",
        release: "2026-08-19.0",
        license: "CDLA-Permissive-2.0 / Apache-2.0 / CC0-1.0 (Places is a mix)",
        attribution: "Overture Maps Foundation, overturemaps.org",
        searchedAt: new Date().toISOString(),
        candidates: scored.map((row) => ({
          providerPlaceId: row.id,
          name: row.name,
          addressLine: row.addressLine,
          city: row.city,
          region: row.region,
          postalCode: row.postalCode,
          country: row.country,
          latitude: row.latitude,
          longitude: row.longitude,
          website: row.website,
          phone: row.phone,
          categories: row.categories,
          confidence: row.confidence,
          operatingStatus: row.operatingStatus,
          license: "CDLA-Permissive-2.0",
          attribution: "Overture Maps Foundation, overturemaps.org",
        })),
      },
      null,
      2,
    )}\n`,
  );

  console.log(`Snapshot written to ${out}`);
  console.log("Nothing has been imported. Import is a decision in the console.\n");
}

main();
