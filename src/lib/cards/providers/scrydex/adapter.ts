import {
  normalizeName,
  normalizationFailure,
  normalizedCardSchema,
  type CardDataProvider,
  type CardFetchOptions,
  type NormalizationFailure,
  type NormalizedCard,
  type NormalizedCardResult,
  type ProviderSet,
} from "@/lib/cards/domain";
import type { GameSlug } from "@/lib/players/games-catalog";
import { ProviderHttp, type HttpOptions } from "../http";
import { asInt, asRecord, asString, asStringList, without } from "../shared";

/**
 * SCRYDEX: the one card source, for every game it carries.
 *
 * The founder (2026-11-25): "i would like to just use scrydex so it's all
 * the same system going forward and not these random cobbled together
 * websites." One adapter, one shape, six games. English only for now
 * (the founder's call), and never an online-only set: Scrydex lists the
 * Pokémon TCG Pocket digital sets beside the paper ones.
 *
 * - A Scrydex card is one of ours, keyed on its id ("OP18-022",
 *   "KTK-214", "RAD-1"), which is already unique per game.
 * - Each of its variants (normal, foil, altArt, ...) is one printing,
 *   with the variant's own art: an alt art is a printing of the card,
 *   never a second card, which is how the app counts "+N printings".
 * - Auth is two headers on every request, SCRYDEX_API_KEY and
 *   SCRYDEX_TEAM_ID. Each request costs one credit; images cost none.
 *
 * Docs: https://scrydex.com/docs. Scrydex says to keep the catalogue in
 * our own database, which is what the sync does.
 */

export const SCRYDEX_KEY = "scrydex";
export const SCRYDEX_BASE_URL = "https://api.scrydex.com";
export const SCRYDEX_IMAGE_HOST = "images.scrydex.com";

/** Our game slug -> Scrydex's path segment. Flesh and Blood: not carried. */
export const SCRYDEX_GAMES: Partial<Record<GameSlug, string>> = {
  "one-piece": "onepiece",
  pokemon: "pokemon",
  mtg: "magicthegathering",
  lorcana: "lorcana",
  riftbound: "riftbound",
  gundam: "gundam",
};

const PAGE_SIZE = 100;
const SAMPLE_CAP = 40;

/** Fields too big or too changeable to keep in raw_metadata. */
const DROPPED_FIELDS = [
  "prices",
  "rulings",
  "legalities",
  "marketplaces",
  "pop_reports",
];

const MTG_COLORS: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
};

/** "altArt" -> "Alt Art", "unlimitedHolofoil" -> "Unlimited Holofoil". */
export function variantLabel(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (first) => first.toUpperCase());
}

/** A plain print, not worth naming on the label. */
const PLAIN_VARIANTS = new Set(["normal", "regular", "default"]);

/** The two headers every request needs; empty when they are not set. */
function credentials(): Record<string, string> {
  const key = process.env.SCRYDEX_API_KEY?.trim();
  const team = process.env.SCRYDEX_TEAM_ID?.trim();
  return key && team ? { "x-api-key": key, "x-team-id": team } : {};
}

/** Said before a request goes, so a missing key is named, not a 401. */
function requireCredentials(): void {
  if (Object.keys(credentials()).length === 0) {
    throw new Error(
      "SCRYDEX_API_KEY and SCRYDEX_TEAM_ID must both be set (see docs/CARD_DATA.md).",
    );
  }
}

function largeImage(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  const front =
    images.map(asRecord).find((image) => asString(image?.type) === "front") ??
    asRecord(images[0]);
  return asString(front?.large) ?? asString(front?.medium) ?? null;
}

function text(value: unknown): string | null {
  if (Array.isArray(value)) {
    const lines = asStringList(value);
    return lines.length > 0 ? lines.join("\n") : null;
  }
  return asString(value);
}

/** An integer only when it fits the column; "5000" reads as 5000. */
function bounded(value: unknown, min: number, max: number): number | null {
  const parsed = asInt(value);
  return parsed !== null && parsed >= min && parsed <= max ? parsed : null;
}

/**
 * One id per printing. A card can list two variants under one name (two
 * alt arts, each "altArt"); the second and later get ":2", ":3", in the
 * order Scrydex lists them, so the ids stay stable from one import to
 * the next and the upsert never meets the same row twice.
 */
export function uniquePrintings<T extends { providerExternalId: string }>(
  printings: readonly T[],
): T[] {
  const count = new Map<string, number>();
  return printings.map((printing) => {
    const seen = (count.get(printing.providerExternalId) ?? 0) + 1;
    count.set(printing.providerExternalId, seen);
    return seen === 1
      ? printing
      : { ...printing, providerExternalId: `${printing.providerExternalId}:${seen}` };
  });
}

export class ScrydexProvider implements CardDataProvider {
  readonly providerKey = SCRYDEX_KEY;
  readonly displayName = "Scrydex (scrydex.com)";
  readonly suppliesImages = true;
  private readonly segment: string;
  private readonly http: ProviderHttp;

  constructor(
    readonly game: GameSlug,
    options: HttpOptions = {},
  ) {
    const segment = SCRYDEX_GAMES[game];
    if (!segment) throw new Error(`Scrydex does not carry ${game}.`);
    this.segment = segment;
    this.http = new ProviderHttp(SCRYDEX_BASE_URL, {
      /* 100 requests a second is the limit; a tenth of it is plenty. */
      spacingMs: 100,
      ...options,
      headers: { ...credentials(), ...options.headers },
    });
  }

  private path(rest: string): string {
    return `/${this.segment}/v1/${rest}`;
  }

  /** Every page of a list endpoint. */
  private async all(rest: string, cap = Number.POSITIVE_INFINITY): Promise<unknown[]> {
    const out: unknown[] = [];
    for (let page = 1; ; page += 1) {
      const join = rest.includes("?") ? "&" : "?";
      const body = asRecord(
        await this.http.getJson(
          `${this.path(rest)}${join}page=${page}&page_size=${PAGE_SIZE}`,
        ),
      );
      const data = Array.isArray(body?.data) ? body.data : [];
      out.push(...data);
      const total = asInt(body?.total_count ?? body?.totalCount) ?? 0;
      if (data.length < PAGE_SIZE || out.length >= total || out.length >= cap) break;
    }
    return out;
  }

  /** English, paper sets only, newest first (Scrydex's own order). */
  async fetchSets(): Promise<ProviderSet[]> {
    requireCredentials();
    /* Every set, filtered here: Scrydex's q filter answers nothing for
       some games' sets (Lorcana), though each set says its language. */
    const sets = await this.all("expansions");
    return sets.flatMap((raw) => {
      const set = asRecord(raw);
      const id = asString(set?.id);
      if (!set || !id || set.is_online_only === true) return [];
      if ((asString(set.language_code) ?? "EN").toUpperCase() !== "EN") return [];
      return [{ code: id, name: asString(set.name), providerExternalId: id }];
    });
  }

  async fetchCards(
    options: CardFetchOptions = {},
  ): Promise<{ cards: NormalizedCard[]; failures: NormalizationFailure[] }> {
    requireCredentials();
    const progress = options.onProgress ?? (() => {});
    let codes: string[];
    if (options.setCode) codes = [options.setCode];
    else {
      const sets = await this.fetchSets();
      codes = (options.sample ? sets.slice(0, 1) : sets).map((set) => set.code);
    }

    const cards: NormalizedCard[] = [];
    const failures: NormalizationFailure[] = [];
    const seen = new Set<string>();
    for (const code of codes) {
      const raw = await this.all(
        `expansions/${encodeURIComponent(code)}/cards`,
        options.sample ? SAMPLE_CAP : Number.POSITIVE_INFINITY,
      );
      progress(`${code}: ${raw.length} card(s) from Scrydex`);
      for (const record of raw) {
        const result = this.normalizeCard(record);
        if (!result.ok) failures.push(result.failure);
        /* A card listed twice in one answer is one card: the upsert
           refuses to touch a row twice in a statement. */
        else if (!seen.has(result.card.canonicalCardNumber)) {
          seen.add(result.card.canonicalCardNumber);
          cards.push(result.card);
        }
      }
    }
    return { cards, failures };
  }

  async fetchCardByExternalId(id: string): Promise<NormalizedCard | null> {
    requireCredentials();
    const body = asRecord(
      await this.http.getJson(this.path(`cards/${encodeURIComponent(id)}`)),
    );
    const result = this.normalizeCard(body?.data ?? body);
    return result.ok ? result.card : null;
  }

  normalizeCard(input: unknown): NormalizedCardResult {
    const record = asRecord(input);
    const id = asString(record?.id);
    if (!record || !id) {
      return {
        ok: false,
        failure: { providerExternalId: id, reason: "record: no id", raw: input },
      };
    }
    if ((asString(record.language_code) ?? "EN").toUpperCase() !== "EN") {
      return {
        ok: false,
        failure: { providerExternalId: id, reason: "record: not English", raw: null },
      };
    }

    const expansion = asRecord(record.expansion);
    const setCode = (
      asString(expansion?.code) ??
      asString(expansion?.id) ??
      ""
    ).toUpperCase();
    const setName = asString(expansion?.name);
    const rarity = asString(record.rarity);
    const cardArt = largeImage(record.images);
    const variants = Array.isArray(record.variants)
      ? record.variants.map(asRecord).filter((variant) => variant !== null)
      : [];

    const label = (variant: string | null) =>
      [
        setCode || null,
        rarity,
        variant && !PLAIN_VARIANTS.has(variant) ? variantLabel(variant) : null,
      ]
        .filter(Boolean)
        .join(" · ") || null;

    const printing = (variant: Record<string, unknown> | null) => {
      const name = variant ? asString(variant.name) : null;
      return {
        providerExternalId: name ? `${id}:${name}` : id,
        setCode: setCode || null,
        setName,
        printingLabel: label(name),
        variantType: name,
        rarity,
        isAlternateArt: name ? /alt/i.test(name) : false,
        isPromo: record.is_promo === true || /promo/i.test(rarity ?? ""),
        language: "en",
        imageUrl: (variant && largeImage(variant.images)) ?? cardArt,
        rawMetadata: variant ? without(variant, DROPPED_FIELDS) : null,
      };
    };

    const parsed = normalizedCardSchema.safeParse({
      canonicalCardNumber: id,
      exactName: asString(record.name),
      cardType: this.cardType(record)?.slice(0, 40) ?? null,
      colors: this.colors(record).map((color) => color.slice(0, 24)),
      traits: asStringList(record.subtypes).map((trait) => trait.slice(0, 64)),
      cost: bounded(record.cost ?? record.mana_value, 0, 99),
      power: bounded(
        record.power ?? record.attack_points ?? record.might,
        -99999,
        99999,
      ),
      counter: bounded(record.counter, 0, 99999),
      /* One Piece's leader life; a Pokémon's HP is not a life total. */
      life: bounded(record.life, 0, 99),
      rarity: rarity?.slice(0, 40) ?? null,
      attribute: asString(record.attribute)?.slice(0, 40) ?? null,
      effectText:
        (
          text(record.rules) ??
          text(record.oracle_text) ??
          text(record.effect) ??
          text(record.effects)
        )?.slice(0, 4000) ?? null,
      providerExternalId: id,
      rawMetadata: without(record, [...DROPPED_FIELDS, "variants"]),
      printings: uniquePrintings(
        variants.length > 0 ? variants.map(printing) : [printing(null)],
      ),
    });

    if (!parsed.success) return normalizationFailure(input, id, parsed.error);
    /* A name with no letters or digits ("_____", an Unhinged card) cannot
       be searched for, and the database refuses it: one card refused, not
       its whole set. */
    if (!normalizeName(parsed.data.exactName)) {
      return {
        ok: false,
        failure: {
          providerExternalId: id,
          reason: "exactName: nothing searchable",
          raw: null,
        },
      };
    }
    return { ok: true, card: parsed.data };
  }

  private cardType(record: Record<string, unknown>): string | null {
    switch (this.game) {
      case "mtg":
        return asStringList(record.types)[0] ?? asString(record.type);
      case "pokemon":
      case "lorcana":
        return asString(record.supertype);
      default:
        return asString(record.type);
    }
  }

  private colors(record: Record<string, unknown>): string[] {
    switch (this.game) {
      case "mtg":
        return asStringList(record.colors).map(
          (letter) => MTG_COLORS[letter] ?? letter,
        );
      case "pokemon":
        return asStringList(record.types);
      case "lorcana":
        return asStringList(record.ink_types);
      case "riftbound":
        return asStringList(record.domains);
      default:
        return asStringList(record.colors);
    }
  }
}
