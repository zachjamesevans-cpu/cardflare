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

/** Scryfall set types an all-sets import leaves out. */
export const SKIPPED_SET_TYPES = new Set([
  "token",
  "memorabilia",
  "minigame",
  "alchemy",
  "vanguard",
]);
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

/**
 * Which printing is THE card, when a set prints it several ways.
 *
 * A showcase, borderless or extended-art version of a card carries its
 * own collector number, so keyed on number alone it landed as a second
 * card beside the first instead of a version under it — the founder:
 * "make sure if they have the same id that they get nested". Scryfall
 * names the shared identity: `oracle_id` is the same for every printing
 * of one card. Within one set, the printing with no treatment and the
 * lowest number is the base; the rest become its versions and keep
 * their own numbers on the printing.
 *
 * Returns, per record id, the collector number the card should be keyed
 * on. Records without an oracle id (tokens, art cards) are left alone.
 */
export function baseNumbersByRecord(
  records: readonly Record<string, unknown>[],
): Map<string, string> {
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const record of records) {
    const set = asString(record.set);
    const oracle = asString(record.oracle_id);
    if (!set || !oracle) continue;
    const key = `${set}:${oracle}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const chosen = new Map<string, string>();
  for (const group of groups.values()) {
    const base = [...group].sort((a, b) => {
      const plainA = isTreated(a) ? 1 : 0;
      const plainB = isTreated(b) ? 1 : 0;
      if (plainA !== plainB) return plainA - plainB;
      return compareCollector(
        asString(a.collector_number) ?? "",
        asString(b.collector_number) ?? "",
      );
    })[0];
    const number = asString(base.collector_number);
    if (!number) continue;
    for (const record of group) {
      const id = asString(record.id);
      if (id) chosen.set(id, number);
    }
  }
  return chosen;
}

/** Whether Scryfall marks the printing as a treatment of the card. */
function isTreated(record: Record<string, unknown>): boolean {
  return (
    asStringList(record.frame_effects).length > 0 ||
    asString(record.border_color) === "borderless" ||
    record.full_art === true ||
    asStringList(record.promo_types).length > 0
  );
}

/** "231" before "412", and "231" before "231s" or "231★". */
function compareCollector(a: string, b: string): number {
  const numA = Number.parseInt(a, 10);
  const numB = Number.parseInt(b, 10);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB)
    return numA - numB;
  return a.length - b.length || a.localeCompare(b);
}

/** Scryfall's own word for the treatment, or null for the plain card. */
export function treatmentOf(record: Record<string, unknown>): string | null {
  return (
    asStringList(record.frame_effects)[0] ??
    (asString(record.border_color) === "borderless" ? "borderless" : null) ??
    (record.full_art === true ? "full art" : null) ??
    asStringList(record.promo_types)[0] ??
    null
  );
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
    /* Set by fetchCards from `baseNumbersByRecord`: the number this
       printing's CARD is keyed on. Absent, the printing is its own card. */
    const baseNumber = asString(record.__base_number) ?? collector;
    const treatment = treatmentOf(record);
    const stored = without(record, [...DROPPED_FIELDS, "__base_number"]);

    const candidate = {
      canonicalCardNumber: set && baseNumber ? `${set}-${baseNumber}` : "",
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
          /* The number rides the label, so two versions of one card in
             one set read as "MH3 #231" and "MH3 #412" rather than twice
             the set code. */
          printingLabel: set && collector ? `${set} #${collector}` : set,
          /* Scryfall's own words for a treatment, e.g. "showcase",
             "borderless", "extendedart". */
          variantType: treatment,
          rarity: asString(record.rarity),
          name,
          /* Stated by Scryfall's frame, border, art and promo fields,
             not read off a name: a treated printing is the alternate
             art, the plain printing is unclassified. */
          isAlternateArt: treatment ? true : null,
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
    /* The whole set before any of it is normalised: which printing is
       the base of a card is only knowable once every printing is in. */
    const gathered: Record<string, unknown>[] = [];

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

      gathered.push(...records);

      options.onProgress?.(`  ${records.length} record(s) on page ${page}`);

      path =
        !options.sample && parsed.data.has_more && parsed.data.next_page
          ? parsed.data.next_page
          : null;
    }

    const bases = baseNumbersByRecord(gathered);
    for (const record of gathered) {
      const id = asString(record.id);
      const base = id ? bases.get(id) : undefined;
      const result = this.normalizeCard(
        base ? { ...record, __base_number: base } : record,
      );
      if (result.ok) cards.push(result.card);
      else failures.push(result.failure);
    }

    options.onProgress?.(
      `  ${gathered.length} printing(s), ${failures.length} failure(s)`,
    );

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
      /* Not cards anybody trades: token and memorabilia sets, the
         minigame inserts, Arena-only Alchemy, and the Vanguard oversize
         cards. Everything else, promos included, is somebody's hunt. */
      const type = asString(record.set_type) ?? "";
      if (SKIPPED_SET_TYPES.has(type)) return [];
      if ((asInt(record.card_count) ?? 0) === 0) return [];
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
