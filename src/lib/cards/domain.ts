import { z } from "zod";

import type { GameSlug } from "@/lib/players/games-catalog";

/**
 * cardflare's own card model. No provider's vocabulary appears here.
 *
 * Every adapter normalises into these types, and nothing downstream — search,
 * the UI, later Flares and matching — ever learns which provider the data came
 * from. Replacing the provider is a new adapter, not a rewrite.
 */

/* -------------------------------------------------------------------------- */
/* Name handling                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Builds the searchable form of a name.
 *
 * Lowercases, strips punctuation, collapses whitespace. Deliberately lossy —
 * that is what makes "monkey d luffy" match "Monkey D. Luffy". The exact name
 * is stored separately and is never replaced by this.
 *
 * NFKC, not NFKD. Decomposing splits a Japanese dakuten into a base character
 * plus a combining mark, and the punctuation strip below then removes the
 * mark — turning ゾ into ソ, a different character and a different name.
 * Composing keeps it whole. Accent folding is given up in exchange, which the
 * trigram index absorbs; silently altering a name does not get absorbed.
 */
export function normalizeName(exactName: string): string {
  return exactName
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips a card number to letters and digits.
 *
 * Lets "op01024", "OP01 024" and "OP01-024" all find the same card. Stored as
 * its own column rather than computed per query so it can be indexed.
 */
export function compactCardNumber(cardNumber: string): string {
  return cardNumber.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Deterministic fingerprint over a record's identifying parts.
 *
 * Used only as a last resort for a printing key, when the provider supplies no
 * image id and no stable record id. FNV-1a: not security-relevant, but it must
 * be stable across processes and deploys or every sync would create a new
 * printing row for the same card.
 */
export function stableFingerprint(parts: (string | null | undefined)[]): string {
  const input = parts.map((part) => part ?? "").join("\u0000");
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

/* -------------------------------------------------------------------------- */
/* Domain types                                                               */
/* -------------------------------------------------------------------------- */

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullish()
    .transform((value) => value ?? null);

/**
 * A printing, as cardflare stores it.
 *
 * The four booleans are `null` when the provider did not classify the printing.
 * That is not the same as `false`, and collapsing the two would record a guess
 * as a fact — the spec is explicit that uncertain classifications stay
 * uncertain.
 */
export const normalizedPrintingSchema = z.object({
  /**
   * The printing key. Composite, not the raw provider id.
   *
   * The same card number can appear as several printings — base art, alternate
   * art, a promo — and keying on the number alone would merge them, which the
   * brief explicitly forbids. Built from source + card number + image id, with
   * a deterministic fingerprint only when the provider gives neither an image
   * id nor a stable record id.
   */
  providerExternalId: trimmed(200),
  /** The provider's own image identifier, when it has one. */
  imageId: optionalText(120),
  source: z
    .enum(["set", "starter-deck", "promo", "don"])
    .nullish()
    .transform((value) => value ?? null),
  setCode: z
    .string()
    .trim()
    .max(32)
    .transform((value) => (value ? value.toUpperCase() : null))
    .nullish()
    .transform((value) => value ?? null),
  setName: optionalText(200),
  printingLabel: optionalText(200),
  /** The provider's own wording for the variant, when it has one. */
  variantType: optionalText(80),
  /**
   * Rarity of this printing.
   *
   * Also on the card, deliberately. The card-level value is what search ranks
   * on and is the rarity most people mean; this one exists because a base art
   * and an alternate art share a card number and do not share a rarity, and
   * merging by card number can only keep one of them.
   */
  rarity: optionalText(40),
  /**
   * The provider's name for this printing, verbatim.
   *
   * Two printings can share a set code *and* a rarity — EB01-001 has three,
   * two of them "EB-01 · L" — and then the name is the only thing that tells
   * them apart: "Kouzuki Oden" against "Kouzuki Oden (SPR)".
   */
  name: optionalText(200),
  isAlternateArt: z.boolean().nullish().default(null),
  isPromo: z.boolean().nullish().default(null),
  isParallel: z.boolean().nullish().default(null),
  isReprint: z.boolean().nullish().default(null),
  language: z
    .string()
    .trim()
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .default("en"),
  /**
   * Only ever a URL the provider returned. `https` is required here and again
   * as a check constraint; an `http` or malformed URL is dropped rather than
   * rewritten.
   */
  imageUrl: z
    .string()
    .trim()
    .url()
    .startsWith("https://")
    .nullish()
    .transform((value) => value ?? null)
    .catch(null),
  rawMetadata: z.unknown().nullish().default(null),
  providerUpdatedAt: z.string().nullish().default(null),
});

export type NormalizedPrinting = z.infer<typeof normalizedPrintingSchema>;

export const normalizedCardSchema = z.object({
  canonicalCardNumber: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .transform((value) => value.toUpperCase()),
  /** The provider's display name, verbatim. */
  exactName: trimmed(200),
  cardType: z
    .string()
    .trim()
    .max(40)
    .transform((value) => (value ? value.toLowerCase() : null))
    .nullish()
    .transform((value) => value ?? null),
  colors: z.array(trimmed(24)).default([]),
  traits: z.array(trimmed(64)).default([]),
  cost: z.number().int().min(0).max(99).nullish().default(null),
  power: z.number().int().min(-99999).max(99999).nullish().default(null),
  counter: z.number().int().min(0).max(99999).nullish().default(null),
  life: z.number().int().min(0).max(99).nullish().default(null),
  rarity: optionalText(40),
  /** One Piece attribute — Slash, Strike, Special, Wisdom, Ranged. */
  attribute: optionalText(40),
  effectText: optionalText(4000),
  triggerText: optionalText(2000),
  providerExternalId: optionalText(200),
  rawMetadata: z.unknown().nullish().default(null),
  providerUpdatedAt: z.string().nullish().default(null),
  printings: z.array(normalizedPrintingSchema).default([]),
});

export type NormalizedCard = z.infer<typeof normalizedCardSchema>;

/** A set or deck the provider knows about. */
export interface ProviderSet {
  code: string;
  name: string | null;
  providerExternalId: string;
}

/* -------------------------------------------------------------------------- */
/* Provider contract                                                          */
/* -------------------------------------------------------------------------- */

/** Which documented endpoint group a record came from. */
export type ProviderSource = "set" | "starter-deck" | "promo" | "don";

export interface CardFetchOptions {
  /** Sample mode: cap how much is pulled, for interface and schema testing. */
  sample?: boolean;
  /**
   * One set, for the providers whose whole catalogue is too large to
   * pull in one go (Magic is a hundred thousand printings). A provider
   * that cannot narrow ignores it; one that can pulls only that set.
   */
  setCode?: string;
  /** Called with human-readable progress. Never receives secrets. */
  onProgress?: (message: string) => void;
}

/**
 * One record the adapter could not use.
 *
 * Failures are collected rather than thrown so a single bad record does not
 * abandon a run of thousands — and are persisted, so a provider changing a
 * field becomes a query rather than an investigation.
 */
export interface NormalizationFailure {
  providerExternalId: string | null;
  reason: string;
  raw: unknown;
}

export type NormalizedCardResult =
  { ok: true; card: NormalizedCard } | { ok: false; failure: NormalizationFailure };

export interface CardDataProvider {
  /** Stable identifier stored on every row this provider produced. */
  readonly providerKey: string;
  /** Human-readable, for logs and the admin panel. */
  readonly displayName: string;
  /**
   * Which TCG every card from this provider belongs to — written on the
   * row, because `(game, canonical_card_number)` is a card's identity
   * and two games can print the same number.
   */
  readonly game: GameSlug;
  /**
   * Whether this provider is permitted to supply artwork URLs.
   *
   * The single gate on images at the data layer. Display is separately gated
   * by NEXT_PUBLIC_ENABLE_CARD_IMAGES, so artwork requires both.
   */
  readonly suppliesImages: boolean;

  fetchCards(options?: CardFetchOptions): Promise<{
    cards: NormalizedCard[];
    failures: NormalizationFailure[];
  }>;

  fetchCardByExternalId(id: string): Promise<NormalizedCard | null>;

  fetchSets(): Promise<ProviderSet[]>;

  /** Exposed separately so normalisation is testable against fixtures alone. */
  /**
   * `source` is which endpoint group the record came from. It participates in
   * the printing key, because the same card number legitimately appears in a
   * booster set and a starter deck as different products.
   */
  normalizeCard(input: unknown, source?: ProviderSource): NormalizedCardResult;
}

/** Turns a Zod failure into a `NormalizationFailure` without losing the record. */
export function normalizationFailure(
  raw: unknown,
  providerExternalId: string | null,
  error: z.ZodError,
): NormalizedCardResult {
  const reason = error.issues
    .map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`)
    .join("; ");

  return { ok: false, failure: { providerExternalId, reason, raw } };
}
