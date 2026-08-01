import { z } from "zod";

/**
 * The shape CardFlare stores, independent of wherever the data came from.
 *
 * Every provider normalises into this. Nothing downstream — search, Flares,
 * matching — knows which source is behind it, so replacing the source is one
 * new implementation of `CardProvider` rather than a rewrite.
 *
 * There is no `effectText` and no `imageUrl` on the card itself, and that is
 * deliberate rather than incomplete. See the migration and PRODUCT.md.
 */
export const CARD_CATEGORIES = [
  "leader",
  "character",
  "event",
  "stage",
  "don",
] as const;

export type CardCategory = (typeof CARD_CATEGORIES)[number];

const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** Uppercased on the way in, because the column requires it. */
const code = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .transform((value) => value.toUpperCase());

export const printingSchema = z.object({
  setCode: code,
  rarity: trimmed(32).nullish().default(null),
  /** Null means the base printing. */
  variant: trimmed(60).nullish().default(null),
  /**
   * Only ever populated by a provider that is licensed to supply artwork.
   * `https` is enforced here and again as a check constraint.
   */
  imageUrl: z.url().startsWith("https://").nullish().default(null),
});

export const providedCardSchema = z.object({
  code,
  name: trimmed(120),
  category: z.enum(CARD_CATEGORIES),
  colors: z.array(trimmed(24)).default([]),
  types: z.array(trimmed(48)).default([]),
  cost: z.number().int().min(0).max(99).nullish().default(null),
  power: z.number().int().min(-9999).max(99999).nullish().default(null),
  counter: z.number().int().min(0).max(9999).nullish().default(null),
  life: z.number().int().min(0).max(99).nullish().default(null),
  attribute: trimmed(32).nullish().default(null),
  /** Lowercased: the column requires it, and matching is case-insensitive. */
  aliases: z
    .array(z.string().trim().min(1).max(80))
    .default([])
    .transform((values) => [
      ...new Set(values.map((value) => value.toLowerCase()).filter(Boolean)),
    ]),
  printings: z.array(printingSchema).default([]),
});

export type ProvidedCard = z.infer<typeof providedCardSchema>;

/** What a provider can do, so callers can degrade rather than assume. */
export interface ProviderCapabilities {
  /** True only when the provider is permitted to supply artwork. */
  images: boolean;
}

export interface CardProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  /** Every card the provider knows about, already normalised. */
  fetchCards(): Promise<ProvidedCard[]>;
}

export type ParsedCards =
  { ok: true; cards: ProvidedCard[] } | { ok: false; errors: string[] };

/**
 * Validates a provider's raw output.
 *
 * Reports every bad record rather than throwing on the first: an import of a
 * few thousand cards where one row is malformed should tell you which row, not
 * stop at it. A card that fails is dropped, never silently coerced — wrong card
 * data is worse than missing card data when someone is hunting a trade.
 */
export function parseProvidedCards(raw: unknown): ParsedCards {
  if (!Array.isArray(raw)) {
    return { ok: false, errors: ["Expected an array of cards."] };
  }

  const cards: ProvidedCard[] = [];
  const errors: string[] = [];

  raw.forEach((entry, index) => {
    const result = providedCardSchema.safeParse(entry);

    if (!result.success) {
      const identifier =
        typeof (entry as { code?: unknown })?.code === "string"
          ? (entry as { code: string }).code
          : `index ${index}`;

      for (const issue of result.error.issues) {
        errors.push(
          `${identifier}: ${issue.path.join(".") || "card"} — ${issue.message}`,
        );
      }
      return;
    }

    cards.push(result.data);
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, cards };
}
