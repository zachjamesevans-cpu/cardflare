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
  versionBases,
} from "../shared";

export const RIFTCODEX_KEY = "riftcodex";
export const RIFTCODEX_BASE_URL = "https://api.riftcodex.com";

/**
 * Riftbound, from the community Riftcodex API.
 *
 * Riot publishes a card gallery but no API. Riftcodex is the community
 * mirror of it — one unauthenticated endpoint returning every card,
 * each with its picture on Riot's own CDN — and is what the open-source
 * Riftbound tooling reads. Read 2 September 2026, under Riot's Legal
 * Jibber Jabber policy for fan projects.
 *
 * The whole game is one request of about 1,500 cards, so a set code
 * is a filter here rather than a requirement.
 */

const SAMPLE_CAP = 40;

const listSchema = z.array(z.record(z.string(), z.unknown()));

/** "UNL-131": the set and the number as printed, three digits wide. */
export function riftboundNumber(setId: string, collectorNumber: number): string {
  return `${setId.toUpperCase()}-${String(collectorNumber).padStart(3, "0")}`;
}

export class RiftcodexProvider implements CardDataProvider {
  readonly providerKey = RIFTCODEX_KEY;
  readonly displayName = "Riftcodex (riftcodex.com)";
  readonly game = "riftbound" as const;
  readonly suppliesImages = true;

  private readonly http: ProviderHttp;

  constructor(options: HttpOptions = {}) {
    this.http = new ProviderHttp(RIFTCODEX_BASE_URL, options);
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
    const setId = asString(record.setId);
    const collector = asInt(record.collectorNumber);
    const name = asString(record.name) ?? "";
    const supertype = asString(record.supertype);
    /* Set by fetchCards from `versionBases`: the collector number of
       the card this alternate art is a version of. */
    const baseCollector = asInt(record.__base_number) ?? collector;
    const { __base_number: _base, ...stored } = record;
    void _base;

    const candidate = {
      canonicalCardNumber:
        setId && baseCollector !== null ? riftboundNumber(setId, baseCollector) : "",
      exactName: name,
      cardType: asString(record.type)?.toLowerCase() ?? null,
      colors: asStringList(record.domains).map((domain) => domain.toLowerCase()),
      traits: asStringList(record.tags),
      cost: asInt(record.energy),
      power: asInt(record.might),
      counter: null,
      life: null,
      rarity: asString(record.rarity),
      attribute: null,
      effectText: asString(record.text),
      triggerText: null,
      providerExternalId: id,
      rawMetadata: stored,
      providerUpdatedAt: null,
      printings: [
        {
          providerExternalId: id ? `riftcodex:${id}` : "",
          imageId: null,
          source: "set" as const,
          setCode: setId?.toUpperCase() ?? null,
          setName: asString(record.setLabel),
          /* "OGN #300": the number rides the label so an alternate art
             reads apart from the card it sits under. */
          printingLabel:
            setId && collector !== null
              ? `${setId.toUpperCase()} #${String(collector).padStart(3, "0")}`
              : (setId?.toUpperCase() ?? null),
          /* The data's own word: "Signature" for a champion's signature
             printing; nothing otherwise. */
          variantType: supertype,
          rarity: asString(record.rarity),
          name,
          /* Stated by the record's own flags, never read off a name. */
          isAlternateArt: record.alternateArt === true ? true : null,
          isPromo: null,
          isParallel: null,
          isReprint: null,
          language: "en",
          imageUrl: asString(record.imageUrl),
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

  private async fetchAll(
    onProgress?: (message: string) => void,
  ): Promise<
    { records: Record<string, unknown>[] } | { failure: NormalizationFailure }
  > {
    onProgress?.("Fetching every Riftbound card from Riftcodex");

    let raw: unknown;
    try {
      raw = await this.http.getJson("/cards");
    } catch (error) {
      if (!(error instanceof ProviderHttpError)) throw error;
      return {
        failure: {
          providerExternalId: null,
          reason: `/cards is unavailable (${error.status ?? "network"}).`,
          raw: null,
        },
      };
    }

    const parsed = listSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        failure: {
          providerExternalId: null,
          reason: "/cards did not return a list of cards",
          raw: null,
        },
      };
    }

    return { records: parsed.data };
  }

  async fetchCards(options: CardFetchOptions = {}): Promise<{
    cards: NormalizedCard[];
    failures: NormalizationFailure[];
  }> {
    const cards: NormalizedCard[] = [];
    const failures: NormalizationFailure[] = [];
    const set = cleanSetCode(options.setCode);

    const fetched = await this.fetchAll(options.onProgress);
    if ("failure" in fetched) return { cards, failures: [fetched.failure] };

    const wanted = set
      ? fetched.records.filter(
          (record) => asString(record.setId)?.toUpperCase() === set,
        )
      : fetched.records;

    if (set && wanted.length === 0) {
      failures.push({
        providerExternalId: null,
        reason: `Riftcodex has no set called ${set}.`,
        raw: null,
      });
      return { cards, failures };
    }

    const records = options.sample ? wanted.slice(0, SAMPLE_CAP) : wanted;

    /* An alternate art is a version of the same-named card in its set:
       Riftcodex flags the alternate, the name links the two. */
    const bases = versionBases(wanted, {
      id: (record) => asString(record.id),
      set: (record) => asString(record.setId)?.toUpperCase() ?? null,
      name: (record) => asString(record.name),
      isVersion: (record) => record.alternateArt === true,
    });

    for (const record of records) {
      const base = bases.get(asString(record.id) ?? "");
      const baseNumber = base ? asInt(base.collectorNumber) : null;
      const result = this.normalizeCard(
        baseNumber !== null ? { ...record, __base_number: baseNumber } : record,
      );
      if (result.ok) cards.push(result.card);
      else failures.push(result.failure);
    }

    options.onProgress?.(
      `  ${records.length} record(s), ${failures.length} failure(s)`,
    );
    return { cards, failures };
  }

  async fetchCardByExternalId(id: string): Promise<NormalizedCard | null> {
    const fetched = await this.fetchAll();
    if ("failure" in fetched) return null;
    const record = fetched.records.find((entry) => asString(entry.id) === id);
    if (!record) return null;
    const result = this.normalizeCard(record);
    return result.ok ? result.card : null;
  }

  async fetchSets(): Promise<ProviderSet[]> {
    const fetched = await this.fetchAll();
    if ("failure" in fetched) return [];

    const sets = new Map<string, ProviderSet>();
    for (const record of fetched.records) {
      const code = asString(record.setId)?.toUpperCase();
      if (!code || sets.has(code)) continue;
      sets.set(code, {
        code,
        name: asString(record.setLabel),
        providerExternalId: code,
      });
    }
    return [...sets.values()];
  }
}
