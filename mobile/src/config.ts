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

export const authConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
