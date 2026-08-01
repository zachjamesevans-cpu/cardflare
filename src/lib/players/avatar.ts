/**
 * Deterministic player avatars.
 *
 * Generated, never uploaded. An upload would mean storage, moderation, and a
 * way to put an arbitrary image in front of strangers in a room — all of that
 * to distinguish six people at a counter, which initials and a colour already
 * do. It also keeps CardFlare's "no images we do not own" position intact.
 *
 * Pure and free of server-only imports, so the same avatar renders wherever it
 * is needed and the whole thing is directly testable.
 */

/** Must match the number of `--color-avatar-N` tokens in globals.css. */
export const AVATAR_HUE_COUNT = 6;

/**
 * Stable 32-bit hash (FNV-1a).
 *
 * Not security-relevant — it only picks a colour. It does need to be stable
 * across processes and deploys, which rules out anything seeded per-run.
 */
function hash(value: string): number {
  let result = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 0x01000193);
  }

  return result >>> 0;
}

/** 1-based, matching the token names. */
export function avatarHue(seed: string): number {
  return (hash(seed) % AVATAR_HUE_COUNT) + 1;
}

/**
 * Up to two initials from a display name.
 *
 * Uses `Intl.Segmenter` so an emoji or a non-Latin script yields one whole
 * character rather than half a surrogate pair — "🏴‍☠️ Zach" should not render
 * as a broken glyph. Falls back to a slice where the API is unavailable.
 */
export function initials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";

  const picked = words.length === 1 ? [words[0]] : [words[0], words[words.length - 1]];

  return picked
    .map((word) => firstCharacter(word))
    .join("")
    .toUpperCase();
}

function firstCharacter(word: string): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const first = segmenter.segment(word)[Symbol.iterator]().next();
    if (!first.done) return first.value.segment;
  }

  return [...word][0] ?? "";
}
