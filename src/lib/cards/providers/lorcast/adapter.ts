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
import {
  asInt,
  asRecord,
  asString,
  asStringList,
  cleanSetCode,
  without,
} from "../shared";

export const LORCAST_KEY = "lorcast";
export const LORCAST_BASE_URL = "https://api.lorcast.com";

/**
 * Disney Lorcana, from Lorcast.
 *
 * Ravensburger publishes no card API. Lorcast is the Lorcana search
 * site built in Scryfall's image — free, no key, a sets endpoint and a
 * cards-in-set endpoint, pictures on its own CDN in three sizes — and
 * the source the community's Lorcana tools read. Read 2 September 2026
 * from its documentation; the API is marked beta there.
 *
 * Shape is read defensively on purpose: the picture is taken from
 * `image_uris.digital.normal` where the docs put it, with the flat
 * `image_uris.normal` accepted too, so a beta reshuffle costs a null
 * picture rather than a rejected card. What must be present is a set
 * and a collector number, because those are the card's identity.
 *
 * A Lorcana set is around 220 cards in ONE request, and the whole game
 * is a dozen sets, so no set code means every set.
 */

const SAMPLE_CAP = 40;

const listSchema = z.array(z.record(z.string(), z.unknown()));
const setsSchema = z.object({ results: z.array(z.record(z.string(), z.unknown())) });

/** Dropped before storage: prices and legality tables. */
const DROPPED_FIELDS = ["prices", "legalities"] as const;

/** "1-042": the set code and the collector number three digits wide. */
export function lorcanaNumber(setCode: string, collector: string): string {
  const number = /^\d+$/.test(collector) ? collector.padStart(3, "0") : collector;
  return `${setCode.toUpperCase()}-${number.toUpperCase()}`;
}

export class LorcastProvider implements CardDataProvider {
  readonly providerKey = LORCAST_KEY;
  readonly displayName = "Lorcast (lorcast.com)";
  readonly game = "lorcana" as const;
  readonly suppliesImages = true;

  private readonly http: ProviderHttp;

  constructor(options: HttpOptions = {}) {
    this.http = new ProviderHttp(LORCAST_BASE_URL, options);
  }

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
    const set = asRecord(record.set);
    const setCode = asString(set?.code) ?? asString(record.set_code);
    const collector = asString(record.collector_number);
    const version = asString(record.version);
    /* "Elsa - Snow Queen": the name and the version together are what
       a player says, and what tells one Elsa from the other seven. */
    const name = [asString(record.name), version].filter(Boolean).join(" - ");

    const images = asRecord(record.image_uris);
    const digital = asRecord(images?.digital);
    const imageUrl =
      asString(digital?.normal) ??
      asString(digital?.large) ??
      asString(images?.normal) ??
      asString(images?.large);

    const rarity = asString(record.rarity);
    const stored = without(record, DROPPED_FIELDS);

    const candidate = {
      canonicalCardNumber:
        setCode && collector ? lorcanaNumber(setCode, collector) : "",
      exactName: name,
      cardType: asStringList(record.type)[0]?.toLowerCase() ?? null,
      colors: (() => {
        const ink = asString(record.ink);
        return ink ? [ink.toLowerCase()] : [];
      })(),
      traits: asStringList(record.classifications),
      cost: asInt(record.cost),
      power: asInt(record.strength),
      counter: null,
      /* Willpower fits the column's ceiling; lore is on the record. */
      life: asInt(record.willpower),
      rarity,
      attribute: null,
      effectText: asString(record.text),
      triggerText: null,
      providerExternalId: id,
      rawMetadata: stored,
      providerUpdatedAt: asString(record.released_at),
      printings: [
        {
          providerExternalId: id ? `lorcast:${id}` : "",
          imageId: null,
          source: "set" as const,
          setCode: setCode?.toUpperCase() ?? null,
          setName: asString(set?.name),
          printingLabel: setCode?.toUpperCase() ?? null,
          /* Lorcast's own word for a treatment ("Enchanted" is a rarity
             there, and an Enchanted card is the alternate art). */
          variantType: rarity?.toLowerCase() === "enchanted" ? "Enchanted" : null,
          rarity,
          name,
          isAlternateArt: rarity?.toLowerCase() === "enchanted" ? true : null,
          isPromo: null,
          isParallel: null,
          isReprint: null,
          language: "en",
          imageUrl,
          rawMetadata: stored,
          providerUpdatedAt: asString(record.released_at),
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

  private async fetchSet(
    code: string,
    options: CardFetchOptions,
    cards: NormalizedCard[],
    failures: NormalizationFailure[],
  ): Promise<void> {
    const path = `/v0/sets/${encodeURIComponent(code.toLowerCase())}/cards`;
    options.onProgress?.(`Fetching set ${code} from Lorcast`);

    let raw: unknown;
    try {
      raw = await this.http.getJson(path);
    } catch (error) {
      if (!(error instanceof ProviderHttpError)) throw error;
      failures.push({
        providerExternalId: null,
        reason:
          error.status === 404
            ? `Lorcast has no set called ${code}.`
            : `${path} is unavailable (${error.status ?? "network"}).`,
        raw: null,
      });
      return;
    }

    /* The docs show a bare array; a wrapped {results: [...]} is
       accepted too, for the same beta reason as the picture. */
    const wrapped = asRecord(raw);
    const list = listSchema.safeParse(Array.isArray(raw) ? raw : wrapped?.results);
    if (!list.success) {
      failures.push({
        providerExternalId: null,
        reason: `${path} did not return a list of cards`,
        raw,
      });
      return;
    }

    const records = options.sample ? list.data.slice(0, SAMPLE_CAP) : list.data;
    for (const record of records) {
      const result = this.normalizeCard(record);
      if (result.ok) cards.push(result.card);
      else failures.push(result.failure);
    }

    options.onProgress?.(
      `  ${records.length} record(s) from ${code}, ${failures.length} failure(s)`,
    );
  }

  async fetchCards(options: CardFetchOptions = {}): Promise<{
    cards: NormalizedCard[];
    failures: NormalizationFailure[];
  }> {
    const cards: NormalizedCard[] = [];
    const failures: NormalizationFailure[] = [];

    const set = cleanSetCode(options.setCode);
    const codes = set ? [set] : (await this.fetchSets()).map((entry) => entry.code);

    if (codes.length === 0) {
      failures.push({
        providerExternalId: null,
        reason: "Lorcast listed no sets.",
        raw: null,
      });
      return { cards, failures };
    }

    for (const code of codes) {
      await this.fetchSet(code, options, cards, failures);
      if (options.sample && cards.length >= SAMPLE_CAP) break;
    }

    return { cards, failures };
  }

  async fetchCardByExternalId(id: string): Promise<NormalizedCard | null> {
    if (!/^[a-z0-9_-]{1,64}$/i.test(id)) return null;
    const raw = await this.http.getJson(`/v0/cards/${encodeURIComponent(id)}`);
    const result = this.normalizeCard(raw);
    return result.ok ? result.card : null;
  }

  async fetchSets(): Promise<ProviderSet[]> {
    const raw = await this.http.getJson("/v0/sets");
    const parsed = setsSchema.safeParse(raw);
    if (!parsed.success) return [];

    return parsed.data.results.flatMap((record) => {
      const code = asString(record.code);
      if (!code) return [];
      return [
        {
          code: code.toUpperCase(),
          name: asString(record.name),
          providerExternalId: asString(record.id) ?? code,
        },
      ];
    });
  }
}
