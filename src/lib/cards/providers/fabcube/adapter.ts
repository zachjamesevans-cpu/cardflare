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
import { asInt, asRecord, asString, asStringList, cleanSetCode } from "../shared";

export const FABCUBE_KEY = "fabcube";
export const FABCUBE_BASE_URL = "https://raw.githubusercontent.com";

const CARDS_PATH = "/the-fab-cube/flesh-and-blood-cards/develop/json/english/card.json";
const SETS_PATH = "/the-fab-cube/flesh-and-blood-cards/develop/json/english/set.json";

/**
 * Flesh and Blood, from the-fab-cube's open data set.
 *
 * Legend Story Studios publishes no public card API. The community's
 * flesh-and-blood-cards repository is the source every FaB tool reads
 * — open JSON, maintained against every release, with each printing's
 * image URL pointing at LSS's own gallery bucket. Read 2 September
 * 2026.
 *
 * One file carries the whole game (about 24 MB). It is fetched once
 * per import and filtered to the set asked for, so a set import costs
 * one download rather than a request per card; without a set code the
 * whole game goes in, which is a few thousand cards and fits.
 *
 * A FaB card's number is the printing's id ("MST131"), and the same
 * card reprinted in another set gets another id. cardflare keys a card
 * on its number, so a reprint is a second card row with its own
 * printings — the same shape a One Piece starter-deck reprint has.
 */

const SAMPLE_CAP = 40;

const cardListSchema = z.array(z.record(z.string(), z.unknown()));

/** LSS's foiling codes, spelt out the way a counter says them. */
const FOILINGS: Record<string, string> = {
  S: "Standard",
  R: "Rainbow Foil",
  C: "Cold Foil",
  G: "Gold Cold Foil",
};

/**
 * The primary type from a type text like "Ninja Action - Attack": the
 * last word before the dash. "Hero - Young" is a hero, "Equipment -
 * Head" is equipment, "Ninja Action - Attack" is an action.
 */
export function primaryType(typeText: string | null): string | null {
  if (!typeText) return null;
  const before = typeText.split(" - ")[0].trim();
  const word = before.split(/\s+/).filter(Boolean).pop();
  return word ? word.toLowerCase() : null;
}

export class FabCubeProvider implements CardDataProvider {
  readonly providerKey = FABCUBE_KEY;
  readonly displayName = "the-fab-cube (flesh-and-blood-cards)";
  readonly game = "flesh-and-blood" as const;
  readonly suppliesImages = true;

  private readonly http: ProviderHttp;

  constructor(options: HttpOptions = {}) {
    this.http = new ProviderHttp(FABCUBE_BASE_URL, options);
  }

  /**
   * One card record, reduced to the printings that share ONE id.
   *
   * The caller narrows `printings` to a single id before this runs (a
   * record with printings in two sets is two cardflare cards), and may
   * pass `setNames` so a printing can carry its set's name.
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

    const uniqueId = asString(record.unique_id);
    const name = asString(record.name) ?? "";
    const color = asString(record.color);
    const setNames = asRecord(record.__set_names) ?? {};

    const printings = Array.isArray(record.printings)
      ? record.printings.map(asRecord).filter((p): p is Record<string, unknown> => !!p)
      : [];
    const lead = printings[0] ?? null;
    const number = asString(lead?.id) ?? "";

    /* The stored copy is the card without its printings array: each
       printing carries its own record, and the file is large enough
       that storing both would double every row. */
    const { printings: _dropped, __set_names: _names, ...stored } = record;
    void _dropped;
    void _names;

    const candidate = {
      canonicalCardNumber: number,
      exactName: name,
      cardType: primaryType(asString(record.type_text)),
      colors: color ? [color.toLowerCase()] : [],
      traits: asStringList(record.types),
      cost: asInt(record.cost),
      power: asInt(record.power),
      counter: null,
      life: asInt(record.health),
      rarity: asString(lead?.rarity),
      attribute: null,
      effectText:
        asString(record.functional_text_plain) ?? asString(record.functional_text),
      triggerText: null,
      providerExternalId: uniqueId,
      rawMetadata: stored,
      providerUpdatedAt: null,
      printings: printings.map((printing) => {
        const foiling = asString(printing.foiling);
        const artVariations = asStringList(printing.art_variations);
        const setCode = asString(printing.set_id)?.toUpperCase() ?? null;
        return {
          providerExternalId: `fab:${asString(printing.unique_id) ?? ""}`,
          imageId: null,
          source: "set" as const,
          setCode,
          setName: setCode ? (asString(setNames[setCode]) ?? null) : null,
          printingLabel: setCode,
          variantType: foiling ? (FOILINGS[foiling] ?? foiling) : null,
          rarity: asString(printing.rarity),
          name,
          /* Stated by the data, not inferred from a name: the record
             lists art variations explicitly. */
          isAlternateArt: artVariations.length > 0 ? true : null,
          isPromo: null,
          isParallel: null,
          isReprint: null,
          language: "en",
          imageUrl: asString(printing.image_url),
          rawMetadata: printing,
          providerUpdatedAt: null,
        };
      }),
    };

    const parsed = normalizedCardSchema.safeParse(candidate);
    if (!parsed.success) return normalizationFailure(record, uniqueId, parsed.error);

    if (!compactCardNumber(parsed.data.canonicalCardNumber)) {
      return {
        ok: false,
        failure: {
          providerExternalId: uniqueId,
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

    options.onProgress?.(
      `Fetching the whole Flesh and Blood card file${set ? ` for ${set}` : ""}`,
    );

    let raw: unknown;
    let setNames: Record<string, string> = {};
    try {
      setNames = Object.fromEntries(
        (await this.fetchSets()).map((entry) => [entry.code, entry.name ?? ""]),
      );
      raw = await this.http.getJson(CARDS_PATH);
    } catch (error) {
      if (!(error instanceof ProviderHttpError)) throw error;
      failures.push({
        providerExternalId: null,
        reason: `${CARDS_PATH} is unavailable (${error.status ?? "network"}).`,
        raw: null,
      });
      return { cards, failures };
    }

    const parsed = cardListSchema.safeParse(raw);
    if (!parsed.success) {
      failures.push({
        providerExternalId: null,
        reason: `${CARDS_PATH} did not return a list of cards`,
        raw: null,
      });
      return { cards, failures };
    }

    if (set && !(set in setNames)) {
      failures.push({
        providerExternalId: null,
        reason: `the-fab-cube has no set called ${set}.`,
        raw: null,
      });
      return { cards, failures };
    }

    let seen = 0;
    for (const record of parsed.data) {
      const printings = Array.isArray(record.printings)
        ? record.printings
            .map(asRecord)
            .filter((p): p is Record<string, unknown> => !!p)
        : [];

      /* One cardflare card per printing id: the printings that share a
         number (its foilings) travel together; another set's printing
         of the same card is another number and another card. */
      const byId = new Map<string, Record<string, unknown>[]>();
      for (const printing of printings) {
        const setCode = asString(printing.set_id)?.toUpperCase();
        if (set && setCode !== set) continue;
        const id = asString(printing.id);
        if (!id) continue;
        byId.set(id, [...(byId.get(id) ?? []), printing]);
      }

      for (const group of byId.values()) {
        if (options.sample && seen >= SAMPLE_CAP) break;
        seen += 1;
        const result = this.normalizeCard({
          ...record,
          printings: group,
          __set_names: setNames,
        });
        if (result.ok) cards.push(result.card);
        else failures.push(result.failure);
      }
      if (options.sample && seen >= SAMPLE_CAP) break;
    }

    options.onProgress?.(`  ${cards.length} card(s), ${failures.length} failure(s)`);
    return { cards, failures };
  }

  async fetchCardByExternalId(id: string): Promise<NormalizedCard | null> {
    /* No per-card endpoint: the data set is one file. */
    const { cards } = await this.fetchCards();
    return cards.find((card) => card.providerExternalId === id) ?? null;
  }

  async fetchSets(): Promise<ProviderSet[]> {
    const raw = await this.http.getJson(SETS_PATH);
    const parsed = cardListSchema.safeParse(raw);
    if (!parsed.success) return [];

    return parsed.data.flatMap((record) => {
      const code = asString(record.id);
      if (!code) return [];
      return [
        {
          code: code.toUpperCase(),
          name: asString(record.name),
          providerExternalId: asString(record.unique_id) ?? code,
        },
      ];
    });
  }
}
