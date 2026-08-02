import { z } from "zod";

import {
  compactCardNumber,
  stableFingerprint,
  type ProviderSource,
  normalizationFailure,
  normalizedCardSchema,
  type CardDataProvider,
  type CardFetchOptions,
  type NormalizationFailure,
  type NormalizedCard,
  type NormalizedCardResult,
  type ProviderSet,
} from "@/lib/cards/domain";
import { ProviderHttp, ProviderHttpError, type HttpOptions } from "../http";
import { MAPPING_STATUS, pick } from "./mapping";

export const OPTCGAPI_KEY = "optcgapi";
export const OPTCGAPI_BASE_URL = "https://optcgapi.com";

/**
 * The documented endpoint groups.
 *
 * Bulk endpoints only. Walking sets and requesting cards one at a time would
 * be thousands of requests against a free service to obtain the same data.
 */
export const OPTCGAPI_ENDPOINTS = {
  setCards: "/api/allSetCards/",
  starterDeckCards: "/api/allSTCards/",
  /*
   * `allPromos`, not `allPromoCards`. The latter was inferred from the naming
   * of its neighbours and 404s. Confirmed against the provider's own
   * documentation on 2 August 2026.
   */
  promoCards: "/api/allPromos/",
  donCards: "/api/allDonCards/",
  sets: "/api/allSets/",
  decks: "/api/allDecks/",
} as const;

/**
 * Endpoint groups that carry cards, and the source recorded against each.
 *
 * `sets` and `decks` are product listings rather than cards and are not synced
 * here. Filtered and pricing-history endpoints are deliberately unused: the
 * first duplicate what the bulk endpoints already return, and pricing is out
 * of scope for this milestone.
 *
 * `donCards` is deliberately absent — see DON_EXCLUSION below.
 */
const CARD_GROUPS = [
  ["setCards", "set"],
  ["starterDeckCards", "starter-deck"],
  ["promoCards", "promo"],
] as const;

/**
 * Why DON!! cards are not imported.
 *
 * A record from `/api/allDonCards/`, observed 2 August 2026:
 *
 *   { "don_id": null, "rarity": "DON!!", "card_name": "DON!! Card (Egghead)",
 *     "card_type": "DON!!", "card_image_id": "don_1",
 *     "optcg_don_name": "DON!! Card (Egghead) - The Azure Sea's Seven (OP14)" }
 *
 * There is no `card_set_id`, and no other field carries a card number —
 * because DON!! cards do not have one. That is not a mapping error to correct.
 * They were being rejected 187 at a time for a missing card number, which was
 * the right call made for the wrong-looking reason.
 *
 * Importing them anyway would mean putting something in
 * `canonical_card_number`, which is NOT NULL and half of a card's identity.
 * The only candidates are `card_image_id` ("don_1") or a string parsed out of
 * `optcg_don_name` — one would render "DON_1" beside the name as if Bandai
 * printed it there, the other is guesswork. Neither is a card number, and the
 * brief is explicit that identifiers are not invented.
 *
 * Supporting them properly means letting a card have no number and keying it
 * on the provider's identifier instead. That is a schema change, so it is a
 * decision to take deliberately rather than a side effect of a sync. Until
 * then the endpoint is not called and this is stated in the admin console
 * rather than surfacing as 187 mystery failures every run.
 */
export const DON_EXCLUSION =
  "DON!! cards are not imported: the provider's records carry no card number, " +
  "and CardFlare does not invent one.";

/** Sample mode caps per endpoint, chosen to land in the 75–150 band overall. */
const SAMPLE_CAPS: Record<keyof typeof OPTCGAPI_ENDPOINTS, number> = {
  setCards: 60,
  starterDeckCards: 30,
  promoCards: 20,
  donCards: 10,
  sets: 0,
  decks: 0,
};

/**
 * The only structural assumption made about the provider.
 *
 * Every documented endpoint returns a list of records. Field *names* are
 * deliberately not asserted here — that is what the probe establishes and what
 * `MAPPING_STATUS` gates. A record that is not an object is rejected outright.
 */
const rawListSchema = z.array(z.record(z.string(), z.unknown()));

/** Dropped before storage: pricing is out of scope for this milestone. */
const PRICE_FIELDS = new Set([
  "inventory_price",
  "market_price",
  "inventory_price_history",
  "market_price_history",
]);

export class MappingUnverifiedError extends Error {
  constructor() {
    super(
      "The optcgapi field mapping has not been verified against live responses. " +
        "Run `npm run cards:probe`, correct src/lib/cards/providers/optcgapi/mapping.ts, " +
        'then set MAPPING_STATUS to "verified".',
    );
    this.name = "MappingUnverifiedError";
  }
}

function asString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * Reads a number that may arrive as a string, and may be "-" or "" for
 * "not applicable" — a Leader has no cost, an Event has no power.
 */
function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const cleaned = value.replace(/[^\d-]/g, "");
  if (!cleaned || cleaned === "-") return null;

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Splits a list that may arrive as an array or a delimited string. */
function asList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];

  return value
    .split(/[/,;|]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * Colours, split on whitespace as well as punctuation.
 *
 * The provider writes a multicolour card as one space-separated string:
 * `"Blue Green Purple Red Black Yellow"`. Left whole that is 34 characters,
 * past the 24-character limit on a colour, so every rainbow Leader was
 * rejected — and had it fitted, it would have been one meaningless colour that
 * no colour filter could ever match.
 *
 * Safe for colours and nowhere else. One Piece has six colours and each is a
 * single word. `sub_types` is space-separated too, but its values are not:
 * "Straw Hat Crew The Four Emperors" is two traits, and splitting on
 * whitespace would shred it into six. Traits keep the punctuation-only split,
 * and the fact that they arrive unseparated stays a known limitation rather
 * than something guessed at here.
 */
function asColors(value: unknown): string[] {
  return asList(value)
    .flatMap((entry) => entry.split(/\s+/))
    .filter(Boolean);
}

/**
 * Adapter for optcgapi.com.
 *
 * `suppliesImages` is true because the API is documented as returning image
 * URLs — but only URLs it actually returns are ever stored, they are never
 * constructed from a pattern, and display is separately gated by
 * NEXT_PUBLIC_ENABLE_CARD_IMAGES. Both gates must be open for artwork to
 * appear.
 */
export class OptcgApiProvider implements CardDataProvider {
  readonly providerKey = OPTCGAPI_KEY;
  readonly displayName = "OPTCG API (optcgapi.com)";
  readonly suppliesImages = true;

  private readonly http: ProviderHttp;

  constructor(options: HttpOptions = {}) {
    this.http = new ProviderHttp(OPTCGAPI_BASE_URL, options);
  }

  /**
   * Turns one provider record into a CardFlare card.
   *
   * Failures are returned, never thrown: one malformed record in a bulk
   * response must not abandon the rest of the run. The record is carried on
   * the failure so it can be persisted and inspected later.
   */
  normalizeCard(input: unknown, source: ProviderSource = "set"): NormalizedCardResult {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return {
        ok: false,
        failure: {
          providerExternalId: null,
          reason: "Record is not an object",
          raw: input,
        },
      };
    }

    const record = input as Record<string, unknown>;

    /*
     * The provider returns `inventory_price` and `market_price`. Pricing is out
     * of scope for this milestone, so it is stripped before the record is kept
     * as raw_metadata — storing prices we never display would leave stale
     * figures in the database waiting to be surfaced by accident.
     */
    const stored = Object.fromEntries(
      Object.entries(record).filter(([key]) => !PRICE_FIELDS.has(key)),
    );
    const externalId = asString(pick(record, "externalId"));
    const cardNumber = asString(pick(record, "cardNumber"));
    const setCode = asString(pick(record, "setCode"));
    const imageId = asString(pick(record, "imageId"));
    const rarity = asString(pick(record, "rarity"));

    /*
     * The printing key: source + card number + the best discriminator we have.
     *
     * Card number alone would merge an alternate art into its base printing —
     * the exact thing the brief forbids. Source keeps the same number appearing
     * in a booster and in a starter deck as two products.
     *
     * A discriminator only counts if it actually discriminates. On the observed
     * record `card_image_id` is "OP01-077" — identical to the card number,
     * despite the name — and `card_set_id` is a candidate for both the number
     * and the record id. Either one, used blindly, would give two artworks the
     * same key. Both are ignored when they merely repeat the number, leaving
     * the fingerprint, which includes the image URL: the one value that must
     * differ between two arts of the same card.
     */
    const discriminating = (value: string | null) =>
      value && value !== cardNumber ? value : null;

    const printingKey = [
      source,
      cardNumber ?? "unknown",
      discriminating(imageId) ??
        discriminating(externalId) ??
        stableFingerprint([
          cardNumber,
          asString(pick(record, "name")),
          rarity,
          setCode,
          asString(pick(record, "imageUrl")),
        ]),
    ].join(":");

    const candidate = {
      canonicalCardNumber: cardNumber ?? "",
      exactName: asString(pick(record, "name")) ?? "",
      cardType: asString(pick(record, "cardType")),
      colors: asColors(pick(record, "color")).map((c) => c.toLowerCase()),
      traits: asList(pick(record, "traits")),
      cost: asNumber(pick(record, "cost")),
      power: asNumber(pick(record, "power")),
      counter: asNumber(pick(record, "counter")),
      life: asNumber(pick(record, "life")),
      rarity,
      attribute: asString(pick(record, "attribute")),
      effectText: asString(pick(record, "effectText")),
      triggerText: asString(pick(record, "triggerText")),
      providerExternalId: externalId,
      rawMetadata: stored,
      providerUpdatedAt: asString(pick(record, "updatedAt")),
      printings: [
        {
          providerExternalId: printingKey,
          imageId,
          source,
          setCode,
          setName: asString(pick(record, "setName")),
          /*
           * The provider's own words, never a classification of our own.
           * `variant_type` stays null when it says nothing, and the four
           * boolean flags stay null throughout — this adapter does not infer
           * "alternate art" from a name suffix or a rarity code, because the
           * brief forbids guessing variant classifications and a wrong guess
           * would split one card into two or merge two into one.
           */
          printingLabel: setCode,
          variantType: null,
          isAlternateArt: null,
          /*
           * The one classification the provider actually states.
           *
           * This is not inference from a name suffix or a rarity code — the
           * record came from the promos endpoint, so the provider has said it
           * is a promo. Everything else stays null.
           *
           * `null` rather than `false` elsewhere: a set card is not thereby
           * known not to be a promo, only unclassified. Collapsing those two
           * would record a guess as a fact.
           */
          isPromo: source === "promo" ? true : null,
          isParallel: null,
          isReprint: null,
          language: "en",
          imageUrl: asString(pick(record, "imageUrl")),
          rawMetadata: stored,
          providerUpdatedAt: asString(pick(record, "updatedAt")),
        },
      ],
    };

    const parsed = normalizedCardSchema.safeParse(candidate);

    if (!parsed.success) {
      return normalizationFailure(record, externalId, parsed.error);
    }

    // The database requires this and it is derived, never provider-supplied.
    if (!compactCardNumber(parsed.data.canonicalCardNumber)) {
      return {
        ok: false,
        failure: {
          providerExternalId: externalId,
          reason: "Card number contains no letters or digits",
          raw: record,
        },
      };
    }

    return { ok: true, card: parsed.data };
  }

  async fetchCards(options: CardFetchOptions = {}): Promise<{
    cards: NormalizedCard[];
    failures: NormalizationFailure[];
  }> {
    if (MAPPING_STATUS !== "verified") throw new MappingUnverifiedError();

    const cards: NormalizedCard[] = [];
    const failures: NormalizationFailure[] = [];

    for (const [group, source] of CARD_GROUPS) {
      const path = OPTCGAPI_ENDPOINTS[group];
      options.onProgress?.(`Fetching ${group} from ${path}`);

      /*
       * One missing endpoint must not abandon the whole catalog.
       *
       * `/api/allPromoCards/` returns 404 in practice despite being listed in
       * the documentation. Letting that propagate meant a single retired or
       * renamed endpoint took the entire sync down and imported nothing, when
       * the other three had perfectly good data. The gap is recorded as a
       * failure and the run continues.
       */
      let raw: unknown;
      try {
        raw = await this.http.getJson(path);
      } catch (error) {
        if (!(error instanceof ProviderHttpError)) throw error;

        failures.push({
          providerExternalId: null,
          reason: `${path} is unavailable (${error.status ?? "network"}). Skipped.`,
          raw: null,
        });
        options.onProgress?.(`  ${path} unavailable — skipped`);
        continue;
      }

      const parsed = rawListSchema.safeParse(raw);

      if (!parsed.success) {
        failures.push({
          providerExternalId: null,
          reason: `${path} did not return a list of objects`,
          raw,
        });
        continue;
      }

      // Sample mode takes a deterministic prefix, not a random selection, so
      // two sample runs produce the same catalog and a bug is reproducible.
      const records = options.sample
        ? parsed.data.slice(0, SAMPLE_CAPS[group])
        : parsed.data;

      for (const record of records) {
        const result = this.normalizeCard(record, source);
        if (result.ok) cards.push(result.card);
        else failures.push(result.failure);
      }

      options.onProgress?.(
        `  ${records.length} record(s) from ${group}, ${failures.length} failure(s) so far`,
      );
    }

    return { cards, failures };
  }

  async fetchCardByExternalId(id: string): Promise<NormalizedCard | null> {
    if (MAPPING_STATUS !== "verified") throw new MappingUnverifiedError();

    // Path segment, so it must not be able to escape into another route.
    const raw = await this.http.getJson(`/api/sets/card/${encodeURIComponent(id)}/`);

    const record = Array.isArray(raw) ? raw[0] : raw;
    if (!record) return null;

    const result = this.normalizeCard(record);
    return result.ok ? result.card : null;
  }

  async fetchSets(): Promise<ProviderSet[]> {
    if (MAPPING_STATUS !== "verified") throw new MappingUnverifiedError();

    const raw = await this.http.getJson(OPTCGAPI_ENDPOINTS.sets);
    const parsed = rawListSchema.safeParse(raw);
    if (!parsed.success) return [];

    return parsed.data.flatMap((record) => {
      const code = asString(pick(record, "setCode"));
      if (!code) return [];

      return [
        {
          code: code.toUpperCase(),
          name: asString(pick(record, "setName")),
          providerExternalId: asString(pick(record, "externalId")) ?? code,
        },
      ];
    });
  }
}
