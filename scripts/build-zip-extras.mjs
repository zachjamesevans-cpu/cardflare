#!/usr/bin/env node
/*
 * Builds data/geo/zip-extras.json: the real US ZIP codes the Census
 * table (zcta-centroids.json) does not have - PO-box-only ZIPs, single
 * organisations, ZIPs newer than the 2023 Gazetteer - each with a
 * point, so a player whose mailing ZIP is one of them is not told "We
 * don't know that ZIP code".
 *
 * Source: GeoNames postal codes, US.txt from
 * https://download.geonames.org/export/zip/US.zip (CC BY 4.0, credited
 * on the website's privacy page and in data/geo/README.md).
 *
 *   node scripts/build-zip-extras.mjs path/to/US.txt
 *
 * Only ZIPs missing from the Census table are written: where both have
 * one, the Census centroid of the area is the better point.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/build-zip-extras.mjs path/to/US.txt");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const census = JSON.parse(
  readFileSync(path.join(root, "data/geo/zcta-centroids.json"), "utf8"),
);

const round = (value) => Math.round(value * 10_000) / 10_000;
const extras = {};

for (const line of readFileSync(source, "utf8").split("\n")) {
  const fields = line.split("\t");
  /* country, postal code, place, admin1 name, admin1 code, admin2 name,
     admin2 code, admin3 name, admin3 code, latitude, longitude, accuracy */
  if (fields[0] !== "US") continue;
  const zip = fields[1];
  if (!/^\d{5}$/.test(zip) || census[zip]) continue;
  const latitude = Number(fields[9]);
  const longitude = Number(fields[10]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
  if (latitude === 0 && longitude === 0) continue;
  extras[zip] = [round(latitude), round(longitude)];
}

const sorted = Object.fromEntries(
  Object.entries(extras).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(
  path.join(root, "data/geo/zip-extras.json"),
  `${JSON.stringify(sorted)}\n`,
);
console.log(`${Object.keys(sorted).length} ZIPs added beyond the Census table`);
