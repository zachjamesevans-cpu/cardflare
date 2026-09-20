import { z } from "zod";

/**
 * What a store may say about itself on its public page.
 *
 * The founder: "make a way and flow for stores to setup their store
 * account once they're subscribed to ultra so players can follow the
 * store." Until now the console could change a time zone and a plan and
 * nothing a player would ever read; the name, the address and the phone
 * were whatever checkout or the directory import left behind.
 *
 * A plain module, free of server-only imports, so the caps here are
 * unit-testable and the form can share them for its `maxLength`s. The
 * 280 on the description matches the column's check constraint in
 * `20261014090000_organizers_store_page_remote.sql`.
 */

export const STORE_NAME_MAX = 80;
export const STORE_PLACE_MAX = 60;
export const STORE_ADDRESS_MAX = 120;
export const STORE_PHONE_MAX = 30;
export const STORE_WEBSITE_MAX = 200;
export const STORE_DESCRIPTION_MAX = 280;

/** Newlines and runs of spaces become one space; the ends are trimmed. */
export function collapseWhitespace(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/**
 * The five digits, or null. The same rule as `normalisePostalCode` in
 * `@/lib/geo/zip`, copied rather than imported: that module carries the
 * whole centroid table, which a form schema has no business loading.
 */
export function normaliseStorePostalCode(raw: string): string | null {
  const digits = raw.trim().slice(0, 5);
  return /^\d{5}$/.test(digits) ? digits : null;
}

/** An optional line: blank becomes null, anything else is trimmed and capped. */
function optionalLine(max: number, label: string) {
  return z
    .string()
    .trim()
    .max(max, `${label} can be at most ${max} characters.`)
    .transform((value) => (value === "" ? null : value));
}

export const storePageSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "The store name needs at least 2 characters.")
    .max(STORE_NAME_MAX, `The store name can be at most ${STORE_NAME_MAX} characters.`),
  city: optionalLine(STORE_PLACE_MAX, "The city"),
  region: optionalLine(STORE_PLACE_MAX, "The state or region"),
  addressLine: optionalLine(STORE_ADDRESS_MAX, "The street address"),
  postalCode: z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const zip = normaliseStorePostalCode(value);
      if (!zip) {
        ctx.addIssue({ code: "custom", message: "Enter a five-digit ZIP code." });
        return z.NEVER;
      }
      return zip;
    }),
  phone: optionalLine(STORE_PHONE_MAX, "The phone number"),
  website: z
    .string()
    .trim()
    .max(
      STORE_WEBSITE_MAX,
      `The website can be at most ${STORE_WEBSITE_MAX} characters.`,
    )
    .transform((value, ctx) => {
      if (value === "") return null;
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "The website needs to be a full address, starting with https://.",
        });
        return z.NEVER;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        ctx.addIssue({
          code: "custom",
          message: "The website needs to start with http:// or https://.",
        });
        return z.NEVER;
      }
      return value;
    }),
  description: z
    .string()
    .transform(collapseWhitespace)
    .pipe(
      z
        .string()
        .max(
          STORE_DESCRIPTION_MAX,
          `The description can be at most ${STORE_DESCRIPTION_MAX} characters.`,
        ),
    )
    .transform((value) => (value === "" ? null : value)),
});

export type StorePageInput = z.input<typeof storePageSchema>;
export type StorePage = z.output<typeof storePageSchema>;

/** The page as the console reads it back: the fields, plus whose they are. */
export interface StorePageFields extends StorePage {
  storeId: string;
}

/**
 * The form's state, apart from the action.
 *
 * A `"use server"` module may export nothing but async functions, so the
 * idle value lives here. See `tests/unit/server-action-exports.test.ts`.
 */
export interface StorePageState {
  status: "idle" | "done" | "error";
  message: string | null;
}

export const STORE_PAGE_IDLE: StorePageState = { status: "idle", message: null };
