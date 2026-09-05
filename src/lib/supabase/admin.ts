import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

/**
 * Service-role Supabase client.
 *
 * This key bypasses Row Level Security, so this module must never be reachable
 * from a client bundle — the `server-only` import above turns that into a build
 * error rather than a silent leak.
 */
let cached: SupabaseClient<Database> | null = null;

const QUERY_DEADLINE_MS = 12_000;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  cached = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      /*
       * A deadline on every call. With none, a slow database held each
       * render until the function's own timeout while the room's
       * twelve-second ticker queued more behind it. Twelve seconds is
       * long enough for a large upsert or a picture upload and short
       * enough that a stuck query fails while the page can still say so.
       * A caller's own signal, when it passes one, is honoured too.
       */
      fetch: (input, init) => {
        const deadline = AbortSignal.timeout(QUERY_DEADLINE_MS);
        const signal = init?.signal
          ? AbortSignal.any([init.signal, deadline])
          : deadline;
        return fetch(input, { ...init, signal });
      },
    },
  });

  return cached;
}
