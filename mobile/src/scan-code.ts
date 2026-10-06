/**
 * What a scanned QR code says, if it is one of ours.
 *
 * A cardflare code is either the poster's URL (https://cardflare.gg/e/CODE,
 * with or without www, maybe carrying ?g=game) or a bare code typed onto a
 * sign: six characters for a night, seven for a store's counter, eight for
 * a show, all in the Crockford alphabet the server mints them from
 * (src/lib/events/join-code.ts). Anything else, including some other
 * site's URL that happens to contain /e/X, is not ours and is refused by
 * name rather than guessed at.
 */

const CODE = /^[0-9A-HJKMNP-TV-Z]{6,8}$/;

/* A regex rather than URL: React Native's URL leaves hostname and
   pathname unimplemented, and this is the whole grammar we accept. */
const OUR_URL =
  /^https?:\/\/(?:www\.)?cardflare\.gg\/e\/([A-Za-z0-9]+)\/?(\?[^#]*)?(?:#.*)?$/i;

export type ScannedCode =
  | { kind: "code"; code: string; game: string | null }
  | { kind: "foreign" };

export function readScannedCode(raw: string): ScannedCode {
  const data = raw.trim();

  const bare = data.toUpperCase();
  if (CODE.test(bare)) return { kind: "code", code: bare, game: null };

  const match = OUR_URL.exec(data);
  if (!match) return { kind: "foreign" };
  const code = match[1].toUpperCase();
  if (!CODE.test(code)) return { kind: "foreign" };

  /* A tournament screen's code carries its game (?g=one-piece). Absent
     means the counter's universal code, which clears any old scope. */
  const game = /[?&]g=([a-z][a-z0-9-]{1,30})(?:&|$)/.exec(match[2] ?? "")?.[1] ?? null;
  return { kind: "code", code, game };
}

export const FOREIGN_CODE = "That isn't a cardflare code";
