import "server-only";

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The page scanner's settings: which AI does the reading, how sure a card
 * has to be to go in without a check, how much a page may spend, and what
 * each model costs. One database row, changed from /admin/scanner; these
 * defaults stand until it is.
 *
 * The founder (2026-10-13): "Use the hybrid configuration as an initial
 * candidate for production, but allow us to change the default after
 * benchmarking", and "Calculate estimated USD costs from configurable model
 * pricing rather than hardcoded assumptions."
 */

export type ScanMode = "anthropic" | "openai" | "hybrid";
export const SCAN_MODES: readonly ScanMode[] = ["anthropic", "openai", "hybrid"];

/** USD per million tokens: input, output, cached input. */
export type ModelPrice = [number, number, number];

export interface ScannerSettings {
  mode: ScanMode;
  /** At or above this, a card goes in without a check (green). */
  autoAccept: number;
  /** Below this, a card with no strong candidate is "unable to identify" (red). */
  reviewFloor: number;
  /** The most one page may spend, in US cents, before it stops asking. */
  pageCapCents: number;
  prices: Record<string, ModelPrice>;
}

export const ANTHROPIC_SCAN_MODEL = "claude-haiku-5-5";
export const OPENAI_SCAN_MODEL = "gpt-5.4-mini";

/**
 * The prices the settings row starts from, as published when this was
 * written. The admin page edits them; the row's values win.
 */
export const DEFAULT_PRICES: Record<string, ModelPrice> = {
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-opus-5-5": [4, 20, 0.2],
  "gpt-5.4-mini": [0.75, 4.5, 0.075],
};

export const DEFAULT_SETTINGS: ScannerSettings = {
  mode: "hybrid",
  autoAccept: 0.75,
  reviewFloor: 0.35,
  pageCapCents: 5,
  prices: DEFAULT_PRICES,
};

/** Read again at most this often: settings change rarely, scans often. */
const FRESH_MS = 60_000;
let cached: { at: number; settings: ScannerSettings } | null = null;

export async function scannerSettings(): Promise<ScannerSettings> {
  if (cached && Date.now() - cached.at < FRESH_MS) return cached.settings;
  let settings = DEFAULT_SETTINGS;
  if (isSupabaseConfigured()) {
    const { data, error } = await getSupabaseAdmin()
      .from("scanner_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    /* Missing before the migration runs: the defaults, quietly. */
    if (!error && data) {
      settings = {
        mode: SCAN_MODES.includes(data.mode) ? data.mode : DEFAULT_SETTINGS.mode,
        autoAccept: Number(data.auto_accept),
        reviewFloor: Number(data.review_floor),
        pageCapCents: Number(data.page_cap_cents),
        prices: { ...DEFAULT_PRICES, ...cleanPrices(data.prices) },
      };
    }
  }
  cached = { at: Date.now(), settings };
  return settings;
}

/** Only well-formed price rows: three non-negative numbers per model. */
export function cleanPrices(value: unknown): Record<string, ModelPrice> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, ModelPrice> = {};
  for (const [model, price] of Object.entries(value as Record<string, unknown>)) {
    if (
      Array.isArray(price) &&
      price.length === 3 &&
      price.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)
    ) {
      out[model] = price as ModelPrice;
    }
  }
  return out;
}

/** Saves the admin's changes; the next read sees them. */
export async function saveScannerSettings(
  next: ScannerSettings,
  userId: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const { error } = await getSupabaseAdmin().from("scanner_settings").upsert({
    id: 1,
    mode: next.mode,
    auto_accept: next.autoAccept,
    review_floor: next.reviewFloor,
    page_cap_cents: next.pageCapCents,
    prices: next.prices,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });
  if (error) {
    console.error("Could not save the scanner settings", error);
    return false;
  }
  cached = null;
  return true;
}

/** Whether each provider has a key on this server. Never the key itself. */
export function providerKeys(): { anthropic: boolean; openai: boolean } {
  return {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };
}
