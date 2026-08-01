/**
 * Field mapping for optcgapi.com.
 *
 * **Verified against a real `/api/allSetCards/` record on 2 August 2026.**
 * Every key below marked "observed" was read off that record. The starter-deck,
 * promo and DON!! endpoints have *not* been observed — the adapter records a
 * failure per unusable record rather than assuming they match, and
 * `npm run cards:probe` will confirm or correct them.
 *
 * The observed record:
 *
 *   card_set_id "OP01-077"   card_name "Perona"      card_type "Character"
 *   card_color "Blue"        card_cost "1" (string)  card_power "2000" (string)
 *   counter_amount 1000 (number)                     life null
 *   rarity "UC"              sub_types "Thriller Bark Pirates"
 *   attribute "Special"      set_id "OP-01"          set_name "Romance Dawn"
 *   card_text "[On Play] …"  date_scraped "2026-07-31"
 *   card_image_id "OP01-077" card_image "https://optcgapi.com/media/static/…"
 *
 * Three things that record settled, each of which changed the code:
 *
 *   1. **Bulk endpoints do carry images.** `card_image` is present on the bulk
 *      set endpoint, so no per-card image fan-out is needed. Host is
 *      `optcgapi.com`, which is already the allow-listed one.
 *   2. **`card_image_id` equals the card number.** It is therefore *not* a
 *      per-artwork discriminator, whatever its name suggests, and using it as
 *      one would give two artworks the same printing key.
 *   3. **There is no trigger field.** Trigger text, if present at all, is
 *      inside `card_text`. Nothing is mapped to `trigger_text` rather than
 *      guessing at a split.
 *
 * Numbers arrive inconsistently: `card_cost` and `card_power` are strings,
 * `counter_amount` is a number. The adapter coerces both.
 */

export type MappingStatus = "unverified" | "verified";

/**
 * Flip to "verified" only after a human has compared the mapping against real
 * responses. The sync reads this and refuses to run while it is "unverified".
 */
export const MAPPING_STATUS: MappingStatus = "verified";

/** Filled in when the mapping is confirmed, so staleness is visible. */
export const MAPPING_VERIFIED_ON: string | null = "2026-08-02";

/**
 * Candidate source keys per domain field, in priority order.
 *
 * Nothing here is authoritative. Treat every entry as a question the probe
 * output answers.
 */
export const CANDIDATE_FIELDS = {
  /*
   * Deliberately excludes a bare "id". It appears in `externalId` below, and
   * listing it here too meant a record with no card number silently adopted
   * its provider id as one — a card that looks real and matches nothing a
   * player would ever type. If the probe shows the real key is something else,
   * add that key; never fall back to a generic identifier.
   */
  // observed: card_set_id
  cardNumber: ["card_set_id", "card_number", "cardNumber", "card_id"],
  // observed: card_name
  name: ["card_name", "name", "cardName"],
  // observed: card_type
  cardType: ["card_type", "type", "cardType"],
  // observed: card_color
  color: ["card_color", "color", "colors", "cardColor"],
  // observed: card_cost
  cost: ["card_cost", "cost"],
  // observed: card_power
  power: ["card_power", "power"],
  // observed: counter_amount
  counter: ["counter_amount", "counter", "card_counter"],
  // observed: life
  life: ["life", "card_life"],
  // observed: rarity
  rarity: ["rarity", "card_rarity"],
  traits: ["sub_types", "subtypes", "traits", "card_traits"],
  // observed: attribute
  attribute: ["attribute", "card_attribute"],
  // observed: card_text
  effectText: ["card_text", "effect", "card_effect", "text"],
  // Not observed. The set endpoint has no trigger field; trigger text, where a
  // card has any, appears inside card_text. Left mapped in case another
  // endpoint splits it out, but expected to stay empty.
  triggerText: ["trigger", "card_trigger", "trigger_text"],
  // observed: set_id
  setCode: ["set_id", "set_code", "setId"],
  rarityLabel: ["rarity", "card_rarity"],
  // observed: set_name
  setName: ["set_name", "set", "setName"],
  /*
   * `card_image` and `card_image_id` are named in the provider's own
   * documentation and are the strongest candidates. Both are documented as
   * possibly absent, and the documentation suggests they may appear on the
   * individual-card endpoints rather than the bulk ones — which the probe
   * settles and the sync's sample-only image backfill accommodates.
   */
  // observed: card_image (present on the bulk endpoint, host optcgapi.com)
  imageUrl: ["card_image", "image_url", "imageUrl", "image"],
  // observed: card_image_id — but it repeats the card number, see above
  imageId: ["card_image_id", "image_id", "imageId"],
  externalId: ["id", "card_set_id", "uuid"],
  // observed: date_scraped — when the provider last scraped, not when the card
  // changed. Recorded as the provider timestamp because it is the only one
  // offered, and it is genuinely useful for spotting a stale catalog.
  updatedAt: ["date_scraped", "updated_at", "last_updated", "modified"],
} as const satisfies Record<string, readonly string[]>;

export type DomainField = keyof typeof CANDIDATE_FIELDS;

/** Reads the first candidate key present on a record. */
export function pick(record: Record<string, unknown>, field: DomainField): unknown {
  for (const key of CANDIDATE_FIELDS[field]) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/** Every source key this mapping would consult, for the probe's diff report. */
export function allCandidateKeys(): string[] {
  return [...new Set(Object.values(CANDIDATE_FIELDS).flat())].sort();
}
