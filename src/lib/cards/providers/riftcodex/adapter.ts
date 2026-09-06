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
 * mirror of it, built in Scryfall's image: unauthenticated, JSON, every
 * card with its picture on Riot's own CDN, and what the open-source
 * Riftbound tooling reads. Read 6 September 2026 from its documentation
 * (riftcodex.com/docs) and from the client the open-source RiftBuilder
 * project runs against it, under Riot's Legal Jibber Jabber policy for
 * fan projects.
 *
 * The shape is Riftcodex's own, not the flattened copy a Discord bot
 * once vendored: `/cards` answers a page, `{ items, total, page, size,
 * pages }`, of at most a hundred records whose fields are nested and
 * snake_case (`set.set_id`, `classification.domain`, `media.image_url`).
 * The whole game is around 1,500 cards, so a set code is a filter here
 * rather than a requirement, passed as `set_id` so the API does the
 * filtering.
 *
 * What must be present is a set and a collector number, because those
 * are the card's identity. Everything else is read defensively: the
 * docs mark the endpoint a work in progress, and a reshuffle should
 * cost a null picture rather than a rejected card.
 */

const PAGE_SIZE = 100;
const SAMPLE_CAP = 40;
/** More pages than the game could fill: a guard against a page count
    the API misreports, not a limit anyone should meet. */
const PAGE_CEILING = 200;

const recordSchema = z.record(z.string(), z.unknown());
const pageSchema = z.object({
  items: z.array(recordSchema),
  page: z.number().int().optional(),
  pages: z.number().int().optional(),
  total: z.number().int().optional(),
});
/** A page as documented, or a bare list should the API ever drop the envelope. */
const listingSchema = z.union([pageSchema, z.array(recordSchema)]);

/** "UNL-131": the set and the number as printed, three digits wide. */
export function riftboundNumber(setId: string, collectorNumber: number): string {
  return `${setId.toUpperCase()}-${String(collectorNumber).padStart(3, "0")}`;
}

/**
 * Why a Riftcodex request failed, in words an operator can act on.
 *
 * Riftcodex needs no key, so a 403 was never the API asking for one:
 * something in front of it refused the request, and whatever that
 * gateway said in its body is the only clue to which and why.
 */
export function describeRefusal(path: string, error: ProviderHttpError): string {
  const said = error.detail ? ` It said: "${error.detail}"` : "";
  if (error.status === 403) {
    return (
      `${path} refused the request (403 Forbidden). Riftcodex needs no API key, ` +
      `so the refusal came from a gateway in front of it, most often a bot ` +
      `filter judging the server this import ran from.${said}`
    );
  }
  return `${path} is unavailable (${error.status ?? "network"}).${said}`;
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
    const set = asRecord(record.set);
    const setId = asString(set?.set_id);
    const collector = asInt(record.collector_number);
    const name = asString(record.name) ?? "";
    const classification = asRecord(record.classification);
    const attributes = asRecord(record.attributes);
    const text = asRecord(record.text);
    const media = asRecord(record.media);
    const metadata = asRecord(record.metadata);
    const supertype = asString(classification?.supertype);
    /* Set by fetchCards from `versionBases`: the collector number of
       the card this alternate art is a version of. */
    const baseCollector = asInt(record.__base_number) ?? collector;
    const { __base_number: _base, ...stored } = record;
    void _base;

    const candidate = {
      canonicalCardNumber:
        setId && baseCollector !== null ? riftboundNumber(setId, baseCollector) : "",
      exactName: name,
      cardType: asString(classification?.type)?.toLowerCase() ?? null,
      colors: asStringList(classification?.domain).map((domain) =>
        domain.toLowerCase(),
      ),
      traits: asStringList(record.tags),
      cost: asInt(attributes?.energy),
      power: asInt(attributes?.might),
      counter: null,
      life: null,
      rarity: asString(classification?.rarity),
      attribute: null,
      effectText: asString(text?.plain) ?? asString(text?.rich),
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
          setName: asString(set?.label),
          /* "OGN #300": the number rides the label so an alternate art
             reads apart from the card it sits under. */
          printingLabel:
            setId && collector !== null
              ? `${setId.toUpperCase()} #${String(collector).padStart(3, "0")}`
              : (setId?.toUpperCase() ?? null),
          /* The data's own word: "Signature" for a champion's signature
             printing; nothing otherwise. */
          variantType: supertype,
          rarity: asString(classification?.rarity),
          name,
          /* Stated by the record's own flags, never read off a name. */
          isAlternateArt: metadata?.alternate_art === true ? true : null,
          isPromo: null,
          isParallel: null,
          isReprint: null,
          language: "en",
          imageUrl: asString(media?.image_url),
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

  /**
   * Every card, or every card of one set, page by page in collector
   * order. `cap` stops after enough for a sample.
   */
  private async fetchListing(
    set: string | null,
    cap: number | null,
    onProgress?: (message: string) => void,
  ): Promise<
    { records: Record<string, unknown>[] } | { failure: NormalizationFailure }
  > {
    onProgress?.(
      set
        ? `Fetching Riftbound set ${set} from Riftcodex`
        : "Fetching every Riftbound card from Riftcodex",
    );

    const records: Record<string, unknown>[] = [];
    const size = cap === null ? PAGE_SIZE : Math.min(cap, PAGE_SIZE);

    for (let page = 1; page <= PAGE_CEILING; page += 1) {
      const query = new URLSearchParams({
        page: String(page),
        size: String(size),
        sort: "collector_number",
        dir: "1",
      });
      /* The docs spell the filter lower-case: set_id=ogn. */
      if (set) query.set("set_id", set.toLowerCase());
      const path = `/cards?${query.toString()}`;

      let raw: unknown;
      try {
        raw = await this.http.getJson(path);
      } catch (error) {
        if (!(error instanceof ProviderHttpError)) throw error;
        return {
          failure: {
            providerExternalId: null,
            reason: describeRefusal("/cards", error),
            raw: null,
          },
        };
      }

      const parsed = listingSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          failure: {
            providerExternalId: null,
            reason: "/cards did not return a page of cards",
            raw: null,
          },
        };
      }

      const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
      records.push(...items);

      if (Array.isArray(parsed.data)) break;
      if (items.length === 0) break;
      if (cap !== null && records.length >= cap) break;
      const pages = parsed.data.pages ?? 1;
      if ((parsed.data.page ?? page) >= pages) break;
      onProgress?.(`  page ${page} of ${pages}, ${records.length} record(s) so far`);
    }

    return { records: cap === null ? records : records.slice(0, cap) };
  }

  async fetchCards(options: CardFetchOptions = {}): Promise<{
    cards: NormalizedCard[];
    failures: NormalizationFailure[];
  }> {
    const cards: NormalizedCard[] = [];
    const failures: NormalizationFailure[] = [];
    const set = cleanSetCode(options.setCode);

    const fetched = await this.fetchListing(
      set,
      options.sample ? SAMPLE_CAP : null,
      options.onProgress,
    );
    if ("failure" in fetched) return { cards, failures: [fetched.failure] };

    /* The API filtered by set; this only keeps a record that came back
       under another set's code from being written under this one. */
    const records = set
      ? fetched.records.filter(
          (record) => asString(asRecord(record.set)?.set_id)?.toUpperCase() === set,
        )
      : fetched.records;

    if (set && records.length === 0) {
      failures.push({
        providerExternalId: null,
        reason: `Riftcodex has no set called ${set}.`,
        raw: null,
      });
      return { cards, failures };
    }

    /* An alternate art is a version of the same-named card in its set:
       Riftcodex flags the alternate, the name links the two. */
    const bases = versionBases(records, {
      id: (record) => asString(record.id),
      set: (record) => asString(asRecord(record.set)?.set_id)?.toUpperCase() ?? null,
      name: (record) => asString(record.name),
      isVersion: (record) => asRecord(record.metadata)?.alternate_art === true,
    });

    for (const record of records) {
      const base = bases.get(asString(record.id) ?? "");
      const baseNumber = base ? asInt(base.collector_number) : null;
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
    let raw: unknown;
    try {
      raw = await this.http.getJson(`/cards/${encodeURIComponent(id)}`);
    } catch (error) {
      if (!(error instanceof ProviderHttpError)) throw error;
      return null;
    }
    const result = this.normalizeCard(raw);
    return result.ok ? result.card : null;
  }

  async fetchSets(): Promise<ProviderSet[]> {
    const sets = new Map<string, ProviderSet>();

    for (let page = 1; page <= PAGE_CEILING; page += 1) {
      let raw: unknown;
      try {
        raw = await this.http.getJson(`/sets?page=${page}&size=${PAGE_SIZE}`);
      } catch (error) {
        if (!(error instanceof ProviderHttpError)) throw error;
        return [];
      }
      const parsed = listingSchema.safeParse(raw);
      if (!parsed.success) return [];

      const items = Array.isArray(parsed.data) ? parsed.data : parsed.data.items;
      for (const record of items) {
        const code = asString(record.set_id)?.toUpperCase();
        if (!code || sets.has(code)) continue;
        sets.set(code, {
          code,
          name: asString(record.label) ?? asString(record.name),
          providerExternalId: asString(record.id) ?? code,
        });
      }

      if (Array.isArray(parsed.data) || items.length === 0) break;
      if ((parsed.data.page ?? page) >= (parsed.data.pages ?? 1)) break;
    }

    return [...sets.values()];
  }
}
