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
  cards: z.array(z.record(z.string(), z.unknown())),
});

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

    const candidate = {
      canonicalCardNumber:
        setCode && localId ? `${setCode}-${printedNumber(localId)}` : "",
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
      rawMetadata: record,
      providerUpdatedAt: null,
      printings: [
        {
          providerExternalId: id ? `tcgdex:${id}` : "",
          imageId: null,
          source: "set" as const,
          setCode,
          setName,
          printingLabel: setCode,
          variantType: null,
          rarity: asString(record.rarity),
          name,
          isAlternateArt: null,
          isPromo: null,
          isParallel: null,
          isReprint: null,
          language: "en",
          imageUrl: imageBase ? `${imageBase}/high.png` : null,
          rawMetadata: record,
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

      const result = this.normalizeCard({
        ...record,
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
