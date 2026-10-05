import Constants from "expo-constants";

/**
 * Deployment configuration, read from `app.json` → `expo.extra`.
 *
 * The Supabase URL and anon key are the same public values the website
 * ships in its browser bundle — they identify the project; RLS and the
 * API's server-side checks are what protect the data. Nothing secret
 * belongs in this file or in `extra`.
 */
type Extra = {
  apiBase?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

const extra: Extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const API_BASE = extra.apiBase ?? "https://cardflare.gg";
export const SUPABASE_URL = extra.supabaseUrl ?? "";
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? "";

export const authConfigured = (): boolean => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/**
 * The public website, for links meant for people rather than for the
 * API: what a share sheet hands on. Fixed, not read from `extra`, so a
 * build pointed at a test server still shares links that open for the
 * person they are sent to. The www host, because the apex answers with
 * a 308 to it (see cosmetic-film.tsx) and Apple will not follow a
 * redirect to read the universal-links file: www.cardflare.gg is the
 * host the app's claim actually works on.
 */
export const SITE_URL = "https://www.cardflare.gg";

/**
 * A binder's share link: https://www.cardflare.gg/b/<binderId>. Opens the
 * binder on the website for anyone, and in the app on a phone that has
 * it (App.tsx routes `b/:binderId` to the Binder screen).
 */
export const binderShareUrl = (binderId: string): string =>
  `${SITE_URL}/b/${encodeURIComponent(binderId)}`;
