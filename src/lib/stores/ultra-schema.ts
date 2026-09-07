import { z } from "zod";

import { PASSWORD_MIN } from "@/lib/auth/signup-schema";

/**
 * What a store owner types to start cardflare Ultra.
 *
 * Deliberately short. A shop owner at a counter between customers gets
 * five fields, none of them optional except the two that place the
 * store on the map. Everything else, the counter code, the time zone,
 * the early-board window, already has a sensible default and its own
 * control on the console.
 */
export const ULTRA_PRICE_LABEL = "$50";
export const ULTRA_TRIAL_DAYS = 14;

export const ultraSignupSchema = z.object({
  storeName: z
    .string()
    .trim()
    .min(2, "What is the store called?")
    .max(120, "That name is longer than a store name needs to be."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("That email address does not look right.")
    .max(200),
  password: z
    .string()
    .min(PASSWORD_MIN, `At least ${PASSWORD_MIN} characters.`)
    .max(200, "That is longer than a password needs to be."),
  city: z.string().trim().max(80, "That city name is too long.").optional(),
  region: z.string().trim().max(80, "That state or region is too long.").optional(),
});

export type UltraSignupInput = z.infer<typeof ultraSignupSchema>;

export type UltraSignupState =
  | { status: "idle" }
  | { status: "error"; message: string; values: Partial<UltraSignupInput> };

export const ULTRA_SIGNUP_IDLE: UltraSignupState = { status: "idle" };
