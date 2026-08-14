import type { SeriesManifest } from "./manifest";
import { origin } from "./origin";

export * from "./manifest";

/** Every set that exists. New sets are new folders, registered here. */
export const SERIES: Record<string, SeriesManifest> = {
  origin,
};

export function seriesOrNull(id: string): SeriesManifest | null {
  return SERIES[id] ?? null;
}
