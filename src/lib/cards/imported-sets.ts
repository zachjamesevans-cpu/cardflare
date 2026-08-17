import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { IMPORT_PROVIDERS } from "./import-schema";

/**
 * Sets that came in by hand rather than from a provider.
 *
 * The console's answer to "what in here is a placeholder?". Counting the
 * printings that actually carry art alongside the total is the number
 * that matters: an import which stored forty of two hundred pictures
 * looks identical to a complete one until somebody opens a board.
 */

export interface ImportedSet {
  providerKey: string;
  setCode: string;
  setName: string | null;
  printings: number;
  withArt: number;
}

export async function listImportedSets(): Promise<ImportedSet[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("card_printings")
    .select("provider_key, set_code, set_name, image_url")
    .in("provider_key", [...IMPORT_PROVIDERS]);

  if (error) {
    console.error("Could not list the imported sets", error);
    return [];
  }

  const sets = new Map<string, ImportedSet>();

  for (const row of data ?? []) {
    const setCode = row.set_code ?? "—";
    const key = `${row.provider_key}::${setCode}`;

    const existing = sets.get(key) ?? {
      providerKey: row.provider_key,
      setCode,
      setName: row.set_name,
      printings: 0,
      withArt: 0,
    };

    existing.printings += 1;
    if (row.image_url) existing.withArt += 1;

    sets.set(key, existing);
  }

  return [...sets.values()].sort((a, b) => a.setCode.localeCompare(b.setCode));
}
