import { z } from "zod";

import {
  compactCardNumber,
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
import { asRecord, asString, asStringList, cleanSetCode } from "../shared";

export const TCGDEX_KEY = "tcgdex";
export const TCGDEX_BASE_URL = "https://api.tcgdex.net";

/**
 * Pokémon TCG, from TCGdex.
 *
 * Chosen over pokemontcg.io because it needs no API key and has no
 * published rate limit — an import that depends on a key in an admin's
 * clipboard is an import that stops working the day the key is lost —
 * and because its set endpoint returns every card in a set in ONE
 * request. Read 2 September 2026; open data, no terms beyond courtesy.
 *
 * What that one request carries is name, number and picture. Rarity,
 * type and HP live one request per card behind it, which for a
 * 200-card set is a minute of polite requests inside a Server Action
 * with a minute to live. So those stay null here, honestly, and the
 * search gets what it needs most: the name, the number and the art.
 *
 * Images: TCGdex documents the `image` field as a base to which the
 * caller appends a quality and an extension. That is their published
 * contract, not a pattern guessed at, so `/high.png` is added here.
 */

const SAMPLE_CAP = 40;

const setSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  /* How many cards the set officially has. Everything numbered past
     it is a secret rare: an illustration rare, a special illustration
     rare, a gold card — another version of a card inside the count. */
  cardCount: z
    .object({ official: z.number().optional(), total: z.number().optional() })
    .optional(),
  cards: z.array(z.record(z.string(), z.unknown())),
});

/**
 * Which base card each secret-rare version belongs under.
 *
 * Pokémon prints its alternate arts past the set's official count with
 * their own numbers: Charizard ex is 125/197 and again 223/197 as a
 * special illustration rare. Keyed on number alone the second landed
 * as a separate card. The set says how many cards it officially has,
 * and a card numbered past that with the same name as exactly one card
 * inside the count is that card's version. Two same-named cards inside
 * the count (three different Pikachus) make the match ambiguous, and
 * the secret rare stays its own card rather than guessing.
 *
 * Returns, per card id, the base card's local id.
 */
export function secretRareBases(
  cards: readonly Record<string, unknown>[],
  official: number | undefined,
): Map<string, string> {
  const bases = new Map<string, string>();
  if (!official || official <= 0) return bases;

  const numberOf = (card: Record<string, unknown>): number | null => {
    const local = asString(card.localId);
    return local && /^\d+$/.test(local) ? Number.parseInt(local, 10) : null;
  };

  const inCount = new Map<string, string[]>();
  for (const card of cards) {
    const number = numberOf(card);
    const name = asString(card.name);
    const local = asString(card.localId);
    if (number === null || number > official || !name || !local) continue;
    inCount.set(name, [...(inCount.get(name) ?? []), local]);
  }

  for (const card of cards) {
    const number = numberOf(card);
    const name = asString(card.name);
    const id = asString(card.id);
    if (number === null || number <= official || !name || !id) continue;
    const candidates = inCount.get(name) ?? [];
    if (candidates.length === 1) bases.set(id, candidates[0]);
  }

  return bases;
}

const setListSchema = z.array(z.record(z.string(), z.unknown()));

/**
 * The number as printed: "001" of "001/198", never "1".
 *
 * TCGdex's `localId` is "1" for the first card; the card itself says
 * 001, and so does anybody reading a number off one at a counter. Only
 * purely numeric ids are padded; "TG01" and "SV107" are left alone.
 */
export function printedNumber(localId: string): string {
  return /^\d+$/.test(localId) ? localId.padStart(3, "0") : localId.toUpperCase();
}

export class TcgdexProvider implements CardDataProvider {
  readonly providerKey = TCGDEX_KEY;
  readonly displayName = "TCGdex (tcgdex.net)";
  readonly game = "pokemon" as const;
  readonly suppliesImages = true;

  private readonly http: ProviderHttp;

  constructor(options: HttpOptions = {}) {
    this.http = new ProviderHttp(TCGDEX_BASE_URL, options);
  }

  /**
   * One brief card from a set listing, with the set it came from
   * supplied by the caller as `set: { id, name }` on the record.
   */
  normalizeCard(input: unknown): NormalizedCardResult {
    const record = asRecord(input);
    if (!record) {
      return {
        ok: false,
        failure: {
          providerExternalId: null,
          reason: "Record is not an object",
          raw: input,
        },
      };
    }

    const id = asString(record.id);
    const localId = asString(record.localId);
    const set = asRecord(record.set);
    const setCode = asString(set?.id)?.toUpperCase() ?? null;
    const setName = asString(set?.name);
    const name = asString(record.name) ?? "";
    const imageBase = asString(record.image);
    /* Set by fetchCards from `secretRareBases`: the local id of the
       card this printing is a version of. Absent, it is its own card. */
    const baseLocal = asString(record.__base_local) ?? localId;
    const isVersion = Boolean(asString(record.__base_local));
    const { __base_local: _base, ...stored } = record;
    void _base;

    const candidate = {
      canonicalCardNumber:
        setCode && baseLocal ? `${setCode}-${printedNumber(baseLocal)}` : "",
      exactName: name,
      cardType: asString(record.category)?.toLowerCase() ?? null,
      /* Energy types, when the detailed record carries them. HP stays
         in the record: it runs past the column's ceiling of 99. */
      colors: asStringList(record.types).map((type) => type.toLowerCase()),
      traits: asString(record.stage) ? [asString(record.stage) as string] : [],
      cost: null,
      power: null,
      counter: null,
      life: null,
      rarity: asString(record.rarity),
      attribute: null,
      effectText: null,
      triggerText: null,
      providerExternalId: id,
      rawMetadata: stored,
      providerUpdatedAt: null,
      printings: [
        {
          providerExternalId: id ? `tcgdex:${id}` : "",
          imageId: null,
          source: "set" as const,
          setCode,
          setName,
          /* "SV3 #223": the number rides the label so two versions of
             one card read apart in the dropdown. */
          printingLabel:
            setCode && localId ? `${setCode} #${printedNumber(localId)}` : setCode,
          /* The rarity is the treatment's name in Pokémon ("Illustration
             rare"); known only when the details were fetched. */
          variantType: isVersion ? asString(record.rarity) : null,
          rarity: asString(record.rarity),
          name,
          /* A card numbered past the set's official count, carrying the
             name of one card inside it: the set's own numbering says
             this is that card's other version. */
          isAlternateArt: isVersion ? true : null,
          isPromo: null,
          isParallel: null,
          isReprint: null,
          language: "en",
          imageUrl: imageBase ? `${imageBase}/high.png` : null,
          rawMetadata: stored,
          providerUpdatedAt: null,
        },
      ],
    };

    const parsed = normalizedCardSchema.safeParse(candidate);
    if (!parsed.success) return normalizationFailure(record, id, parsed.error);

    if (!compactCardNumber(parsed.data.canonicalCardNumber)) {
      return {
        ok: false,
        failure: {
          providerExternalId: id,
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
    const cards: NormalizedCard[] = [];
    const failures: NormalizationFailure[] = [];

    const set = cleanSetCode(options.setCode);
    if (!set) {
      failures.push({
        providerExternalId: null,
        reason:
          "TCGdex imports one set at a time. Give a set code such as sv1 or swsh12.",
        raw: null,
      });
      return { cards, failures };
    }

    /* TCGdex spells its set ids in lower case: sv1, swsh12, base1. */
    const path = `/v2/en/sets/${encodeURIComponent(set.toLowerCase())}`;
    options.onProgress?.(`Fetching ${set} from TCGdex`);

    let raw: unknown;
    try {
      raw = await this.http.getJson(path);
    } catch (error) {
      if (!(error instanceof ProviderHttpError)) throw error;
      failures.push({
        providerExternalId: null,
        reason:
          error.status === 404
            ? `TCGdex has no set called ${set}.`
            : `${path} is unavailable (${error.status ?? "network"}).`,
        raw: null,
      });
      return { cards, failures };
    }

    const parsed = setSchema.safeParse(raw);
    if (!parsed.success) {
      failures.push({
        providerExternalId: null,
        reason: `${path} did not return a set with cards`,
        raw,
      });
      return { cards, failures };
    }

    const listing = options.sample
      ? parsed.data.cards.slice(0, SAMPLE_CAP)
      : parsed.data.cards;

    /* Worked out over the WHOLE set, sample or not: a version's base is
       only findable when the base is in the list. */
    const bases = secretRareBases(parsed.data.cards, parsed.data.cardCount?.official);

    let index = 0;
    for (const brief of listing) {
      index += 1;
      let record: Record<string, unknown> = brief;

      /*
       * The details behind the listing: rarity, category, energy types,
       * HP, the illustrator. One request each, so a 200-card set is
       * about a minute at the polite pace — the laptop command's job,
       * and progress says where it is so a long run is not a silent one.
       */
      if (options.detailed) {
        const id = asString(brief.id);
        if (id && /^[a-z0-9.-]{1,40}$/i.test(id)) {
          try {
            const detail = asRecord(
              await this.http.getJson(`/v2/en/cards/${encodeURIComponent(id)}`),
            );
            if (detail) record = { ...brief, ...detail };
          } catch (error) {
            if (!(error instanceof ProviderHttpError)) throw error;
            /* The listing's facts still stand; only the extras are missing. */
          }
          if (index % 25 === 0) {
            options.onProgress?.(`  ${index}/${listing.length} detailed`);
          }
        }
      }

      const baseLocal = bases.get(asString(brief.id) ?? "");
      const result = this.normalizeCard({
        ...record,
        ...(baseLocal ? { __base_local: baseLocal } : {}),
        set: { id: parsed.data.id, name: parsed.data.name ?? null },
      });
      if (result.ok) cards.push(result.card);
      else failures.push(result.failure);
    }

    options.onProgress?.(
      `  ${listing.length} record(s) from ${set}, ${failures.length} failure(s)`,
    );

    return { cards, failures };
  }

  async fetchCardByExternalId(id: string): Promise<NormalizedCard | null> {
    if (!/^[a-z0-9.-]{1,40}$/i.test(id)) return null;
    const raw = await this.http.getJson(`/v2/en/cards/${encodeURIComponent(id)}`);
    const result = this.normalizeCard(raw);
    return result.ok ? result.card : null;
  }

  async fetchSets(): Promise<ProviderSet[]> {
    const raw = await this.http.getJson("/v2/en/sets");
    const parsed = setListSchema.safeParse(raw);
    if (!parsed.success) return [];

    return parsed.data.flatMap((record) => {
      const code = asString(record.id);
      if (!code) return [];
      return [
        {
          code: code.toUpperCase(),
          name: asString(record.name),
          providerExternalId: code,
        },
      ];
    });
  }
}
