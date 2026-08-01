/**
 * Field mapping for optcgapi.com — **NOT YET VERIFIED AGAINST THE LIVE API**.
 *
 * Read this before changing anything here.
 *
 * The milestone brief is explicit: do not assume undocumented response fields,
 * and do not start an import until the response shape has been inspected. The
 * environment this was written in has no outbound network access — requests to
 * optcgapi.com and a control request to example.com fail identically at the
 * proxy — so the response shape could not be inspected here.
 *
 * Rather than guess field names and quietly produce a wrong catalog, the
 * mapping below is a *hypothesis* and the sync refuses to run while
 * `MAPPING_STATUS` is "unverified". Confirming it is a real step someone
 * performs with real responses:
 *
 *   1. npm run cards:probe
 *        Hits the documented endpoints, writes redacted fixtures to
 *        tests/fixtures/optcgapi/, and prints every field name it saw.
 *   2. Correct CANDIDATE_FIELDS below against that output.
 *   3. Set MAPPING_STATUS to "verified" and record the date and who checked.
 *   4. npm run cards:sync:onepiece -- --sample
 *
 * Each domain field lists several candidate source keys because casing and
 * naming conventions differ between endpoints even within one API. The first
 * key present on a record wins. That tolerance is a convenience for step 2 —
 * it is not a substitute for it, which is what the gate enforces.
 */

export type MappingStatus = "unverified" | "verified";

/**
 * Flip to "verified" only after a human has compared the mapping against real
 * responses. The sync reads this and refuses to run while it is "unverified".
 */
export const MAPPING_STATUS: MappingStatus = "unverified";

/** Filled in when the mapping is confirmed, so staleness is visible. */
export const MAPPING_VERIFIED_ON: string | null = null;

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
  cardNumber: ["card_set_id", "card_number", "cardNumber", "card_id"],
  name: ["card_name", "name", "cardName"],
  cardType: ["card_type", "type", "cardType"],
  color: ["card_color", "color", "colors", "cardColor"],
  cost: ["card_cost", "cost"],
  power: ["card_power", "power"],
  counter: ["counter_amount", "counter", "card_counter"],
  life: ["life", "card_life"],
  rarity: ["rarity", "card_rarity"],
  traits: ["sub_types", "subtypes", "traits", "card_traits", "attribute"],
  effectText: ["card_text", "effect", "card_effect", "text"],
  triggerText: ["trigger", "card_trigger", "trigger_text"],
  setCode: ["set_id", "set_code", "setId"],
  setName: ["set_name", "set", "setName"],
  imageUrl: ["image_url", "imageUrl", "card_image", "image"],
  externalId: ["id", "card_set_id", "uuid"],
  updatedAt: ["updated_at", "last_updated", "modified"],
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
