import { randomInt } from "node:crypto";

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
export const JOIN_CODE_LENGTH = 6;

/** Matches the column's check constraint exactly. */
export const JOIN_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{6}$/;

/**
 * Generates a join code.
 *
 * `randomInt` rather than `Math.random`: a guessable code is a way into an
 * event room, and `randomInt` also rejects modulo bias, which matters because
 * 32 does not divide 256 evenly for every rejection scheme.
 */
export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
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

export function isValidJoinCode(input: string): boolean {
  return JOIN_CODE_PATTERN.test(input);
}
