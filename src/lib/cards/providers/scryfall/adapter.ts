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

export const SCRYFALL_KEY = "scryfall";
export const SCRYFALL_BASE_URL = "https://api.scryfall.com";

/**
 * Magic: The Gathering, from Scryfall.
 *
 * Scryfall's terms, read 2 September 2026: card data and images are
 * free for building Magic software, may not be paywalled, must not be
 * cropped or altered, and `api.scryfall.com` asks for 50-100ms between
 * requests. cardflare's search is free to every account and the art is
 * drawn whole, so both are kept.
 *
 * ONE SET AT A TIME. Magic is a hundred thousand printings, and the
 * catalogue is pulled from an admin's browser inside a Server Action
 * with a minute to live. A set is two or three pages of 175 cards, which
 * fits; the whole game does not, and a provider that quietly tried
 * would time out half-written. `fetchCards` without a set says so.
 *
 * English printings only (Scryfall's default), because a card search
 * typed at an American counter is in English and every other language
 * would be nineteen more copies of every card in the results.
 */

const PAGE_SIZE_HINT = 175;
const SAMPLE_CAP = 40;

/** Scryfall's colour letters, spelt out the way a filter word is typed. */
const COLOR_WORDS: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
};

/** Dropped before storage: prices, legality tables and links. */
const DROPPED_FIELDS = [
  "prices",
  "legalities",
  "purchase_uris",
  "related_uris",
  "uri",
  "scryfall_uri",
  "rulings_uri",
  "prints_search_uri",
  "set_uri",
  "set_search_uri",
  "all_parts",
  "preview",
] as const;

const pageSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
  has_more: z.boolean().optional(),
  next_page: z.string().url().optional(),
});

const setListSchema = z.object({
  data: z.array(z.record(z.string(), z.unknown())),
});

/**
 * The primary type, from a type line like "Legendary Creature — Elf".
 *
 * The last word before the em dash: "Artifact Creature" is a creature
 * for filtering, "Legendary Sorcery" a sorcery. A double-faced card
 * uses its front face.
 */
export function primaryType(typeLine: string | null): string | null {
  if (!typeLine) return null;
  const front = typeLine.split("//")[0];
  const before = front.split("—")[0].trim();
  const word = before.split(/\s+/).filter(Boolean).pop();
  return word ? word.toLowerCase() : null;
}

/** The subtypes after the em dash: "Elf Warrior" → ["Elf", "Warrior"]. */
export function subtypes(typeLine: string | null): string[] {
  if (!typeLine) return [];
  const front = typeLine.split("//")[0];
  const [, after] = front.split("—");
  return (after ?? "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export class ScryfallProvider implements CardDataProvider {
  readonly providerKey = SCRYFALL_KEY;
  readonly displayName = "Scryfall (scryfall.com)";
  readonly game = "mtg" as const;
  readonly suppliesImages = true;

  private readonly http: ProviderHttp;

  constructor(options: HttpOptions = {}) {
    this.http = new ProviderHttp(SCRYFALL_BASE_URL, options);
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
    const set = asString(record.set)?.toUpperCase() ?? null;
    const collector = asString(record.collector_number);
    const name = asString(record.name) ?? "";

    /* A double-faced card keeps its text and art on the faces. */
    const faces = Array.isArray(record.card_faces)
      ? record.card_faces
          .map(asRecord)
          .filter((face): face is Record<string, unknown> => !!face)
      : [];
    const front = faces[0] ?? null;

    const typeLine = asString(record.type_line) ?? asString(front?.type_line);
    const colors = asStringList(record.colors ?? front?.colors ?? []);
    const oracle =
      asString(record.oracle_text) ??
      (faces.length > 0
        ? faces
            .map((face) => asString(face.oracle_text))
            .filter(Boolean)
            .join("\n//\n") || null
        : null);

    const imageUris = asRecord(record.image_uris) ?? asRecord(front?.image_uris);
    const imageUrl = asString(imageUris?.normal) ?? asString(imageUris?.large);

    const lang = asString(record.lang) ?? "en";
    const stored = without(record, DROPPED_FIELDS);

    const candidate = {
      canonicalCardNumber: set && collector ? `${set}-${collector}` : "",
      exactName: name,
      cardType: primaryType(typeLine),
      colors: colors.map((letter) => COLOR_WORDS[letter] ?? letter.toLowerCase()),
      traits: subtypes(typeLine),
      cost: asInt(record.cmc),
      power: asInt(record.power ?? front?.power),
      counter: null,
      life: null,
      rarity: asString(record.rarity),
      attribute: null,
      effectText: oracle,
      triggerText: null,
      providerExternalId: id,
      rawMetadata: stored,
      providerUpdatedAt: asString(record.released_at),
      printings: [
        {
          /* Scryfall's id names one printing in one language: the
             whole key, no fingerprint needed. */
          providerExternalId: id ? `scryfall:${id}` : "",
          imageId: null,
          source: "set" as const,
          setCode: set,
          setName: asString(record.set_name),
          printingLabel: set,
          /* Scryfall's own words for a treatment, e.g. "showcase",
             "borderless", "extendedart". */
          variantType: asStringList(record.frame_effects)[0] ?? null,
          rarity: asString(record.rarity),
          name,
          isAlternateArt: null,
          isPromo: record.promo === true ? true : null,
          isParallel: null,
          isReprint:
            record.reprint === true ? true : record.reprint === false ? false : null,
          language: /^[a-z]{2}$/.test(lang) ? lang : "en",
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
          "Scryfall imports one set at a time. Give a set code such as MH3 or FDN.",
        raw: null,
      });
      return { cards, failures };
    }

    /*
     * `unique=prints` so every printing in the set arrives, including
     * the showcase and borderless treatments the base card shares a
     * number range with. Digital-only cards (Arena) are left out: a
     * card nobody can hold cannot be traded at a counter.
     */
    const query = `set:${set.toLowerCase()} -is:digital`;
    let path: string | null =
      `/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=set`;
    let page = 0;

    while (path) {
      page += 1;
      options.onProgress?.(`Fetching ${set} page ${page} from Scryfall`);

      let raw: unknown;
      try {
        raw = await this.http.getJson(path);
      } catch (error) {
        if (!(error instanceof ProviderHttpError)) throw error;
        failures.push({
          providerExternalId: null,
          reason:
            error.status === 404
              ? `Scryfall has no set called ${set}.`
              : `${path} is unavailable (${error.status ?? "network"}).`,
          raw: null,
        });
        break;
      }

      const parsed = pageSchema.safeParse(raw);
      if (!parsed.success) {
        failures.push({
          providerExternalId: null,
          reason: `${path} did not return a page of cards`,
          raw,
        });
        break;
      }

      const records = options.sample
        ? parsed.data.data.slice(0, SAMPLE_CAP)
        : parsed.data.data;

      for (const record of records) {
        const result = this.normalizeCard(record);
        if (result.ok) cards.push(result.card);
        else failures.push(result.failure);
      }

      options.onProgress?.(
        `  ${records.length} record(s) on page ${page}, ${failures.length} failure(s) so far`,
      );

      path =
        !options.sample && parsed.data.has_more && parsed.data.next_page
          ? parsed.data.next_page
          : null;
    }

    if (cards.length > PAGE_SIZE_HINT * 12) {
      options.onProgress?.(`  ${set} is unusually large (${cards.length} printings)`);
    }

    return { cards, failures };
  }

  async fetchCardByExternalId(id: string): Promise<NormalizedCard | null> {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const raw = await this.http.getJson(`/cards/${id}`);
    const result = this.normalizeCard(raw);
    return result.ok ? result.card : null;
  }

  async fetchSets(): Promise<ProviderSet[]> {
    const raw = await this.http.getJson("/sets");
    const parsed = setListSchema.safeParse(raw);
    if (!parsed.success) return [];

    return parsed.data.data.flatMap((record) => {
      const code = asString(record.code);
      if (!code || record.digital === true) return [];
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
