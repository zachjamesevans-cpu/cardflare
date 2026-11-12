/**
 * Alphabet for join codes — Crockford's base32.
 *
 * Digits are kept and only the letters that collide with them are dropped:
 * I and L (which read as 1), O (as 0), and U (which turns random codes into
 * words nobody wants printed on a counter). Keeping the digit and dropping the
 * letter is what makes `normalizeJoinCode` possible — a mistyped `I` has
 * exactly one sensible correction. Excluding both halves of each pair would
 * read just as clearly and leave nothing to correct to.
 *
 * 32 symbols over 6 positions is a little over a billion codes.
 */
export const JOIN_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Two code spaces, told apart by length alone.
 *
 * A six-character code is one event; a seven-character code is a store's
 * permanent counter code. Both arrive through the same `/e/CODE` URL and the
 * same box on `/join`, and a player should never have to know which they are
 * holding — but the application must never confuse the two, because resolving
 * a store code as an event code would send somebody to the wrong room.
 *
 * Different lengths make that confusion impossible rather than unlikely.
 * Sharing one length and trusting two separate unique indexes would leave a
 * birthday collision between the tables, and its failure would be silent: a
 * store's laminated code quietly resolving to a stranger's event.
 *
 * Seven for the store because it is the code that never rotates. An event code
 * is printed for one night; a counter code is on a wall for a year, exposed to
 * far more guessing, so it gets the extra 32× of space.
 */
export const JOIN_CODE_LENGTH = 6;
export const STORE_CODE_LENGTH = 7;

/**
 * Eight for a card show. It outlives an event code (printed on banners and
 * shared in vendor group chats for weeks) and is guessed at by more
 * strangers than a counter code, so it takes the next 32× step — and the
 * third length keeps the namespace rule intact: nothing is ever told apart
 * by a lookup.
 */
export const SHOW_CODE_LENGTH = 8;

/** Each matches its column's check constraint exactly. */
export const JOIN_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;
export const STORE_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{7}$/;
export const SHOW_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** What a code refers to, decided by its shape rather than by a lookup. */
export type CodeKind = "event" | "store" | "show";

/**
 * Generates a join code.
 *
 * The platform's own cryptographic source rather than `Math.random`: a
 * guessable code is a way into an event room. And no modulo bias: the
 * alphabet is exactly 32 characters, so the low five bits of a random
 * byte pick one evenly. JOIN_CODE_ALPHABET's length is held at 32 by
 * tests/unit/join-code.test.ts for this reason.
 *
 * WEB CRYPTO, NOT `node:crypto`, and that is about weight, not taste.
 * This file's constants and patterns are read by forms that run in the
 * browser (through events/schema.ts), and an import of `node:crypto`
 * anywhere in a file a browser reads makes the bundler ship a 121 KB
 * polyfill of the whole module to every page that draws one of those
 * forms. `globalThis.crypto` is the same generator on the server and
 * needs no import at all.
 */
export function generateJoinCode(length: number = JOIN_CODE_LENGTH): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (const byte of bytes) {
    code += JOIN_CODE_ALPHABET[byte & (JOIN_CODE_ALPHABET.length - 1)];
  }
  return code;
}

/** A store's permanent counter code. */
export function generateStoreCode(): string {
  return generateJoinCode(STORE_CODE_LENGTH);
}

/** A card show's code. */
export function generateShowCode(): string {
  return generateJoinCode(SHOW_CODE_LENGTH);
}

/**
 * Cleans up a code a person typed.
 *
 * Accepts lowercase, and the spaces or hyphens people insert when copying
 * something off a poster. The letter-to-digit substitutions are the whole
 * reason for the alphabet: someone who reads `1` as `I` still gets into the
 * room instead of being sent back to the counter.
 *
 * Pure, so the same normalisation runs on the server as in tests.
 */
export function normalizeJoinCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/**
 * What a normalised code points at, or null if it is not a code at all.
 *
 * Callers switch on this rather than measuring length themselves, so the
 * reason the two spaces are separate stays in one place.
 */
export function classifyCode(input: string): CodeKind | null {
  if (JOIN_CODE_PATTERN.test(input)) return "event";
  if (STORE_CODE_PATTERN.test(input)) return "store";
  if (SHOW_CODE_PATTERN.test(input)) return "show";
  return null;
}

/** True for either kind of code. */
export function isValidJoinCode(input: string): boolean {
  return classifyCode(input) !== null;
}
