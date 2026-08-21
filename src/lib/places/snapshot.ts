import "server-only";

import austinTx from "@/../data/store-candidates/austin-tx.json";
import eugeneOr from "@/../data/store-candidates/eugene-or.json";

import type { PlaceCandidate, PlacesProvider, PlacesSearch } from "./provider";

/**
 * Candidates a real discovery run already found, served to the console.
 *
 * The split the architecture forced. Overture Places is a parquet dataset
 * with no query API, so the SEARCH runs in a terminal
 * (`scripts/discover-stores.ts`); but IMPORT is a decision a human makes
 * in the admin console, and the console has to see what the search found.
 *
 * IMPORTED STATICALLY, NOT READ FROM DISK, and that is a deployment fact
 * rather than a style choice. The first cut used `readdirSync` over
 * `process.cwd()/data`, which works locally and silently fails on Vercel:
 * Next.js traces the files a serverless function needs by ANALYSING the
 * source, and it cannot see through a dynamic directory read. The folder
 * would simply be absent in production - `snapshots()` would return
 * nothing, `placesProvider()` would fall back to the fixtures, and the
 * console's Import button would write "Dragon's Hoard Games" and
 * "Walmart Supercenter" into the live database as real stores.
 *
 * So every snapshot is listed here by name. Adding a city is a code
 * change, which is right: a snapshot is a reviewed artifact, and the
 * review is the pull request that adds it.
 *
 * A snapshot is not a listing. Nothing in the file exists in CardFlare
 * until somebody presses Import, and an import creates unclaimed drafts
 * that players cannot see either.
 */
export interface Snapshot {
  area: string;
  radiusMiles: number;
  provider: string;
  release: string;
  license: string;
  attribution: string;
  searchedAt: string;
  candidates: PlaceCandidate[];
}

/** Every reviewed snapshot in the repository, newest search first. */
const SNAPSHOTS: Snapshot[] = [austinTx as Snapshot, eugeneOr as Snapshot];

export function snapshots(): Snapshot[] {
  return [...SNAPSHOTS].sort((a, b) => b.searchedAt.localeCompare(a.searchedAt));
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
