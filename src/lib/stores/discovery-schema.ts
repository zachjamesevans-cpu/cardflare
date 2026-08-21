import type { StoreCandidate } from "@/lib/stores/discovery";

/**
 * The discovery form's state, apart from the actions.
 *
 * A `"use server"` module may export nothing but async functions, so the
 * idle values and their types live here. See
 * `tests/unit/server-action-exports.test.ts`.
 */
export interface DiscoverState {
  status: "idle" | "found" | "error";
  area: string;
  radiusMiles: number;
  candidates: StoreCandidate[];
  message: string | null;
}

export const DISCOVER_IDLE: DiscoverState = {
  status: "idle",
  area: "",
  radiusMiles: 25,
  candidates: [],
  message: null,
};

export interface ImportState {
  status: "idle" | "done" | "error";
  message: string | null;
}

export const IMPORT_IDLE: ImportState = { status: "idle", message: null };

/** The radii the console offers. Small on purpose: one metro at a time. */
export const RADIUS_CHOICES = [5, 10, 25, 50] as const;
