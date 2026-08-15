import { z } from "zod";

/**
 * What the catalogue console may be asked to do, and the shapes it has to
 * arrive in. Free of server-only imports so the rules are unit-testable
 * without a database, the same discipline as every other schema here.
 */

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{2,40}$/, "Lower case letters, numbers and dashes only.");

export const cosmeticStatusSchema = z.object({
  slug,
  status: z.enum(["live", "draft"]),
});

export const deleteCosmeticSchema = z.object({ slug });

export const packSetSchema = z.object({
  slug,
  name: z.string().trim().min(1, "Give the set a name.").max(60),
  setNumber: z.coerce
    .number()
    .int("Whole numbers only.")
    .min(1, "Sets start at 1.")
    .max(999),
  description: z.string().trim().max(300).default(""),
  priceEmbers: z.coerce.number().int().min(0).max(100_000).default(300),
  slots: z.coerce
    .number()
    .int()
    .min(1, "A pack holds at least one.")
    .max(10, "Ten at most.")
    .default(3),
  /*
   * A date and time typed in the console, or blank for "not scheduled".
   * Kept as the raw string here and turned into an instant at the action,
   * because a schema that reaches for a timezone is a schema that cannot
   * be tested without one.
   */
  releaseAt: z.string().trim().max(40).default(""),
});

export const packSetEditSchema = packSetSchema.omit({ slug: true, setNumber: true });

export const packSetItemSchema = z.object({
  seriesSlug: slug,
  cosmeticSlug: slug,
  rarity: z.enum(["common", "uncommon", "rare", "epic", "legendary"]),
  weight: z.coerce
    .number()
    .min(0.001, "Give it some chance of appearing.")
    .max(100, "One item cannot be more than the whole pack."),
});

export const packSetRefSchema = z.object({ seriesSlug: slug });

export const packSetItemRefSchema = z.object({ seriesSlug: slug, cosmeticSlug: slug });

export const packSetStatusSchema = z.object({
  seriesSlug: slug,
  status: z.enum(["live", "draft"]),
});

export type CatalogState =
  | { status: "idle" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export const CATALOG_IDLE: CatalogState = { status: "idle" };

/** Suggests a slug from a typed name, so the founder never types one. */
export function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
