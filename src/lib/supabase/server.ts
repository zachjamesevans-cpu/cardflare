import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./types";

/**
 * Request-scoped Supabase client carrying the signed-in user's session.
 *
 * Unlike the admin client in `admin.ts`, this one is bound to whoever is
 * making the request and is fully subject to Row Level Security — which is
 * the point. Reach for this for anything on behalf of a user, and reserve the
 * service-role client for the few operations that must bypass RLS.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Sign-in and sign-out run
            // in Server Actions and Route Handlers, which can, so a refresh
            // that lands here is safely skipped rather than fatal.
          }
        },
      },
    },
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}
