import "server-only";

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import type { PlaceCandidate, PlacesProvider, PlacesSearch } from "./provider";

/**
 * Candidates a real discovery run already found, served to the console.
 *
 * The split the architecture forced. Overture Places is a parquet dataset
 * with no query API, so the SEARCH runs in a terminal
 * (`scripts/discover-stores.ts`); but IMPORT is a decision a human makes
 * in the admin console, and the console has to be able to see what the
 * search found. So a run writes a snapshot under `data/store-candidates`
 * and this reads it.
 *
 * A snapshot is not a listing. Nothing in the file exists in CardFlare
 * until somebody presses Import, and an import creates unclaimed drafts
 * that players cannot see either. The file also carries the licence and
 * attribution the records came with, so a store imported from it keeps
 * its provenance.
 */
interface Snapshot {
  area: string;
  radiusMiles: number;
  provider: string;
  release: string;
  license: string;
  attribution: string;
  searchedAt: string;
  candidates: PlaceCandidate[];
}

const DIRECTORY = resolve(process.cwd(), "data", "store-candidates");

/** Every snapshot on disk, newest search first. */
export function snapshots(): Snapshot[] {
  let files: string[];
  try {
    files = readdirSync(DIRECTORY).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }

  return files
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(resolve(DIRECTORY, name), "utf8")) as Snapshot];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.searchedAt.localeCompare(a.searchedAt));
}

/**
 * Serves a snapshot by area.
 *
 * The area is matched loosely because it is typed by hand in the console
 * and written by hand on the command line, and "austin, tx" and
 * "Austin TX" are the same search to everybody except a string compare.
 */
export class SnapshotPlacesProvider implements PlacesProvider {
  readonly name = "overture";

  async search(query: PlacesSearch): Promise<PlaceCandidate[]> {
    const all = snapshots();
    if (all.length === 0) return [];

    const wanted = normalise(query.area);
    const match =
      all.find((snapshot) => normalise(snapshot.area) === wanted) ??
      all.find((snapshot) => normalise(snapshot.area).includes(wanted)) ??
      null;

    return match?.candidates ?? [];
  }
}

const normalise = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
