import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { normalizeName } from "@/lib/cards/domain";
import {
  type ScanRead,
  type ScanRefusal,
  type ScanTraits,
  FREE_SCANS_PER_DAY,
  SCAN_GAMES,
  SCAN_MATCHES,
  SCAN_MAX_BYTES,
  POCKETS_PER_PAGE,
  collectorValue,
  compactCode,
  narrowByTraits,
  photoType,
  rankScan,
  scanScore,
  suggestedPrinting,
} from "@/lib/cards/scan-rules";

/* Kept importable from here for the routes and jobs that read photos. */
export { photoType };
import type { CardResult } from "@/lib/cards/schema";
import { cardResultsByIds, searchCards } from "@/lib/cards/search";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { tierAllows } from "@/lib/tiers";

/**
 * The card scanner, server side: who may scan, reading a photo, and
 * finding the card it shows in our catalogue.
 *
 * The model only READS. It is asked what is printed on the card, and
 * our catalogue decides which card that is, the same way a pasted list
 * is looked up; the player then confirms before anything goes in a
 * binder. A card id never comes from the model, so a misread can only
 * ever produce a wrong guess the player can see and decline.
 *
 * The photo is sent, read and dropped. Nothing about it is stored.
 */

const SCAN_MODEL = "claude-haiku-5-5";

/** Whether the scanner can run at all: a key, and somewhere to look cards up. */
export function scannerConfigured(): boolean {
  return Boolean(scannerKey()) && isSupabaseConfigured();
}

/**
 * The key, with any whitespace taken out. A real key never holds a space
 * or a line break, and one pasted into Vercel across several lines was
 * refused before it left the server: a line break is not allowed in a
 * request header.
 */
export function scannerKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? "").replace(/\s+/g, "");
}

/**
 * An error's sentence with anything shaped like a key blanked out. The
 * founder's first failed scan logged the whole key: the runtime quotes a
 * header it refuses, word for word. Nothing logged here may do that.
 */
export function withoutKeys(text: string): string {
  return text.replace(/sk-ant-[A-Za-z0-9_\-\s]+/g, "sk-ant-[hidden]");
}

/**
 * Open to everyone, or admins only. Admins tried it first; setting
 * CARD_SCANNER_OPEN (or the older CARD_SCANNER_FOR_PRO) to "on" in Vercel
 * opens it with no code change: single cards free up to ten a day,
 * unlimited and whole pages for Pro.
 */
function scannerOpen(): boolean {
  return (
    process.env.CARD_SCANNER_OPEN === "on" || process.env.CARD_SCANNER_FOR_PRO === "on"
  );
}

/**
 * What a player may scan. `singles` is "on", "used-up" (the day's free
 * scans are gone) or null (nothing drawn); `singlesLeft` is the free
 * scans left today, null when there is no limit; `pages` is "on", the
 * door to Pro, or null. Never a button that cannot work.
 */
export interface ScanRights {
  singles: "on" | "used-up" | null;
  singlesLeft: number | null;
  pages: "on" | "pro-door" | null;
}

const NO_RIGHTS: ScanRights = { singles: null, singlesLeft: null, pages: null };
const ALL_RIGHTS: ScanRights = { singles: "on", singlesLeft: null, pages: "on" };

/** Free scans this account has used in the last day. */
async function freeScansToday(playerId: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("card_scans")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  return count ?? 0;
}

export async function scanRights(who: {
  playerId: string;
  userId: string;
}): Promise<ScanRights> {
  if (!scannerConfigured()) return NO_RIGHTS;
  const admin = getSupabaseAdmin();
  const [{ data: adminRow }, { data: player }] = await Promise.all([
    admin.from("admin_users").select("user_id").eq("user_id", who.userId).maybeSingle(),
    admin.from("players").select("tier").eq("id", who.playerId).maybeSingle(),
  ]);
  if (adminRow) return ALL_RIGHTS;
  if (!scannerOpen()) return NO_RIGHTS;
  if (tierAllows(player?.tier ?? null, "cardScanner")) return ALL_RIGHTS;
  const left = Math.max(0, FREE_SCANS_PER_DAY - (await freeScansToday(who.playerId)));
  return { singles: left > 0 ? "on" : "used-up", singlesLeft: left, pages: "pro-door" };
}

/**
 * The older builds' single switch for the whole scanner: "on" for those
 * who may scan pages (Pro, admins), the door for everyone else once it is
 * open. Kept so an app from before free singles still behaves.
 */
export type ScanAccess = "on" | "pro-door" | null;

export async function scannerAccess(who: {
  playerId: string;
  userId: string;
}): Promise<ScanAccess> {
  return (await scanRights(who)).pages;
}

/** One guess: the card, and the printing the set code points at. */
export interface ScanMatch {
  card: CardResult;
  printingId: string | null;
}

export type ScanOutcome =
  | {
      ok: true;
      read: ScanRead;
      matches: ScanMatch[];
      /** Set when the careful reader took a second look. */
      sure?: boolean;
      note?: string;
    }
  | { ok: false; reason: ScanRefusal; read?: ScanRead };

/*
 * Ceilings on a paid call, counted per card read: a page is nine. Ten
 * pages in ten minutes is a real binder session; these stop a stuck loop
 * or a script, and the day's ceiling bounds what one account can cost
 * (fifteen hundred reads is under fifty cents).
 */
const BURST = { limit: 150, windowMs: 10 * 60 * 1000 };
const DAILY = { limit: 1500, windowMs: 24 * 60 * 60 * 1000 };

/** Takes `reads` from both ceilings; false when either has run out. */
function allowReads(playerId: string, reads: number): boolean {
  for (let i = 0; i < reads; i += 1) {
    if (
      !checkRateLimit(`card-scan:${playerId}`, BURST.limit, BURST.windowMs).allowed ||
      !checkRateLimit(`card-scan-day:${playerId}`, DAILY.limit, DAILY.windowMs).allowed
    ) {
      return false;
    }
  }
  return true;
}

/** A scan, start to finish: the gate, the ceilings, the read, the lookup. */
export async function scanCard(
  who: { playerId: string; userId: string },
  bytes: Uint8Array,
): Promise<ScanOutcome> {
  const rights = await scanRights(who);
  if (rights.singles === null) return { ok: false, reason: "not-allowed" };
  if (rights.singles === "used-up") return { ok: false, reason: "daily-singles" };

  if (bytes.length === 0 || bytes.length > SCAN_MAX_BYTES) {
    return { ok: false, reason: "too-big" };
  }
  const mediaType = photoType(bytes);
  if (!mediaType) return { ok: false, reason: "no-card" };

  if (!allowReads(who.playerId, 1)) return { ok: false, reason: "limit" };

  const looked = await readCard(bytes, mediaType);
  if (!looked) return { ok: false, reason: "unavailable" };
  /* A whole page: the client sends it as a page when the player may scan
     pages, and shows the door to Pro when not. Not counted as a free
     scan: no card was read. */
  if (looked.layout === "binder-page") {
    return { ok: false, reason: "is-page", read: looked.read };
  }
  if (rights.singlesLeft !== null) {
    const { error } = await getSupabaseAdmin()
      .from("card_scans")
      .insert({ player_id: who.playerId });
    if (error) console.error("Could not count a free scan", error.message);
  }
  const read = looked.read;
  if (!read.found) return { ok: false, reason: "no-card", read };
  if (read.game === "other") return { ok: false, reason: "not-carried", read };

  const matches = await findScanned(read);
  /* Sure when the number read names the top card. Anything less gets
     the careful reader's second look, which costs a few cents and only
     happens when the quick look could be wrong. */
  const certain =
    matches.length > 0 && scanScore(read, matches[0].card.canonicalCardNumber) >= 2;
  if (!certain) {
    const careful = await secondLook(who.playerId, { bytes, mediaType }, read, matches);
    if (careful) return careful;
  }
  if (matches.length === 0) return { ok: false, reason: "not-found", read };
  return { ok: true, read, matches };
}

/**
 * The page reader's look at one card the quick reader was unsure of:
 * the stronger model describes it, the catalogue narrows by what it saw,
 * and the cheap tiebreak compares pictures when that leaves a few. Its
 * pick first, then the quick reader's guesses. Null when it found
 * nothing either, or could not run.
 */
async function secondLook(
  playerId: string,
  photo: { bytes: Uint8Array; mediaType: "image/jpeg" | "image/png" | "image/webp" },
  read: ScanRead,
  quick: ScanMatch[],
): Promise<Extract<ScanOutcome, { ok: true }> | null> {
  if (!allowReads(playerId, 1)) return null;
  /* Loaded when needed: the reader imports this module back. */
  const [{ readCards }, { listPlayerGames }] = await Promise.all([
    import("@/lib/cards/page-reader"),
    import("@/lib/players/games"),
  ]);
  const outcome = await readCards({
    mode: "card",
    page: null,
    pockets: [photo],
    games: await listPlayerGames(playerId),
  });
  if (!outcome.ok) return null;
  const pocket = outcome.pockets[0];
  if (!pocket || pocket.state === "empty") return null;
  const careful =
    pocket.state === "found" ? pocket.matches : (pocket.suggestions ?? []);
  if (careful.length === 0) return null;

  const matches = [...careful];
  for (const match of quick) {
    if (!matches.some((each) => each.card.id === match.card.id)) matches.push(match);
  }
  const seen = pocket.read;
  return {
    ok: true,
    read: {
      ...read,
      name: read.name || seen?.name || "",
      englishName: read.englishName || seen?.englishName || "",
      number: read.number || seen?.number || "",
    },
    matches: matches.slice(0, SCAN_MATCHES),
    sure: pocket.state === "found" ? pocket.sure : false,
    note: pocket.note,
  };
}

/**
 * One pocket of a scanned page: nothing there, a card and our guesses,
 * or a card we could not read or could not find (the player finds it).
 */
export type PocketOutcome =
  | { slot: number; state: "empty" }
  | {
      slot: number;
      state: "found";
      read: ScanRead;
      matches: ScanMatch[];
      /** The careful reader's confidence; absent from a quick read. */
      sure?: boolean;
      /** How it decided, in a few words, for the check. */
      note?: string;
    }
  | {
      slot: number;
      state: "unread";
      read: ScanRead | null;
      note?: string;
      /**
       * What it might be: the catalogue's closest cards to what the
       * reader saw (name, colour, power), for "Might be one of these".
       */
      suggestions?: ScanMatch[];
    };

export type PageOutcome =
  { ok: true; pockets: PocketOutcome[] } | { ok: false; reason: ScanRefusal };

/**
 * A page: the nine pockets the client cut out of one photo, read side by
 * side. A pocket the client sent nothing for is empty. Each is read and
 * looked up exactly as a single card is, so a page is only ever as good
 * or as bad as nine single scans.
 */
export async function scanPage(
  who: { playerId: string; userId: string },
  cells: (Uint8Array | null)[],
): Promise<PageOutcome> {
  if ((await scannerAccess(who)) !== "on") return { ok: false, reason: "not-allowed" };
  if (cells.length !== POCKETS_PER_PAGE) return { ok: false, reason: "no-card" };

  const typed = cells.map((bytes) => {
    if (!bytes || bytes.length === 0) return null;
    if (bytes.length > SCAN_MAX_BYTES) return "too-big" as const;
    const mediaType = photoType(bytes);
    return mediaType ? { bytes, mediaType } : null;
  });
  if (typed.includes("too-big")) return { ok: false, reason: "too-big" };

  const reads = typed.filter((cell) => cell !== null).length;
  if (reads === 0) return { ok: false, reason: "no-card" };
  if (!allowReads(who.playerId, reads)) return { ok: false, reason: "limit" };

  const pockets = await Promise.all(
    typed.map(async (cell, slot): Promise<PocketOutcome> => {
      if (cell === null || cell === "too-big") return { slot, state: "empty" };
      const looked = await readCard(cell.bytes, cell.mediaType, true);
      if (!looked) return { slot, state: "unread", read: null };
      const read = looked.read;
      if (!read.found) return { slot, state: "empty" };
      if (read.game === "other") return { slot, state: "unread", read };
      const matches = await findScanned(read);
      return matches.length > 0
        ? { slot, state: "found", read, matches }
        : { slot, state: "unread", read };
    }),
  );
  /* Every read failing is the service, not the page. */
  if (pockets.every((pocket) => pocket.state === "unread" && pocket.read === null)) {
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, pockets };
}

const readSchema = z.object({
  layout: z.enum(["one-card", "binder-page", "no-card"]),
  found: z.boolean(),
  game: z.enum([...SCAN_GAMES, "other"]),
  name: z.string(),
  englishName: z.string(),
  number: z.string(),
  setCode: z.string(),
});

const READ_PROMPT = [
  "This photo should show one trading card. Read what is printed on it.",
  "layout: binder-page if the photo shows a binder page or a grid holding several cards; one-card if it shows one card (other cards only at the edges); no-card if there is no card.",
  "found: false if there is no trading card in the photo.",
  "game: one-piece, riftbound, lorcana, mtg (Magic: The Gathering), pokemon, flesh-and-blood, or other.",
  "name: the card's own name exactly as printed. Not the set, the artist or the card type.",
  "englishName: the card's English name if it is printed in another language, otherwise the same as name.",
  "number: the collector number exactly as printed, usually along the bottom edge, such as 199/165, OP01-001, WTR001, 123/204 or 0123.",
  "setCode: the set code printed beside the number, such as SVI, MKM, OP01 or OGN. Empty if none is printed.",
  "Write an empty string for anything you cannot read clearly. Never guess a number.",
].join("\n");

/* A pocket is cut from a photo of a whole page, a little larger than
   its square, so the edges of the cards beside it show. */
const POCKET_LEAD = [
  "This photo is one pocket cut from a photo of a binder page, so the edges of the cards beside it may show.",
  "Read only the card in the middle. found: false if the middle of the pocket is empty.",
].join("\n");

/** A client per scan: it is a plain object, and the key is read when used. */
function anthropic(): Anthropic {
  return new Anthropic({
    apiKey: scannerKey(),
    /* A scan is a person holding a card up to a camera. Past this they
       have given up, so a slow answer is a failed one. */
    timeout: 20_000,
    maxRetries: 1,
  });
}

/** What the model read off the photo, or null when the call failed. */
async function readCard(
  bytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  pocket = false,
): Promise<{ layout: "one-card" | "binder-page" | "no-card"; read: ScanRead } | null> {
  try {
    const response = await anthropic().messages.parse({
      model: SCAN_MODEL,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(readSchema) },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: Buffer.from(bytes).toString("base64"),
              },
            },
            {
              type: "text",
              text: pocket ? `${POCKET_LEAD}\n${READ_PROMPT}` : READ_PROMPT,
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const parsed = readSchema.safeParse(response.parsed_output);
    if (!parsed.success) return null;
    const { layout, ...read } = parsed.data;
    return { layout, read };
  } catch (error) {
    /*
     * Logged with the status and the API's own sentence ("Your credit
     * balance is too low...", "invalid x-api-key"), which say what to
     * fix, with anything shaped like a key blanked. The photo is never
     * logged.
     */
    if (error instanceof Anthropic.APIError) {
      console.error(
        "Card scan read failed",
        error.status,
        error.name,
        withoutKeys(error.message),
      );
    } else {
      /* Never the error object itself: its message and stack can quote a
         header, and the key with it. */
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      console.error("Card scan read failed", name, withoutKeys(message));
    }
    return null;
  }
}

/** Cards a name can be, at most this many, before the number narrows them. */
const NAME_CANDIDATES = 500;

/** The columns a candidate needs: its number, and the traits a read narrows by. */
const CANDIDATE_COLUMNS = "id, canonical_card_number, colors, power, cost, card_type";

type CandidateRow = {
  id: string;
  canonical_card_number: string;
  colors: string[] | null;
  power: number | null;
  cost: number | null;
  card_type: string | null;
};

type Candidate = {
  id: string;
  canonicalCardNumber: string;
  colors: string[];
  power: number | null;
  cost: number | null;
  cardType: string | null;
};

const candidate = (row: CandidateRow): Candidate => ({
  id: row.id,
  canonicalCardNumber: row.canonical_card_number,
  colors: row.colors ?? [],
  power: row.power,
  cost: row.cost,
  cardType: row.card_type,
});

/**
 * The catalogue's answer to a read: cards with the name read (in English
 * when the card was not), best number and set match first. When the
 * name finds nothing, the ranked search tries, and then the number on
 * its own for the games that print the set into it.
 *
 * `traits` (what the reader saw: colours, power, cost, type) narrow a
 * name with many cards before the top few are taken, unless the number
 * already names one. Without them a character with dozens of cards could
 * leave the right one outside the few returned.
 */
export async function findScanned(
  read: ScanRead,
  /* The page reader asks for more: a character with many printings. */
  limit = SCAN_MATCHES,
  traits?: ScanTraits,
): Promise<ScanMatch[]> {
  if (read.game === "other") return [];
  const admin = getSupabaseAdmin();
  const names = [
    ...new Set(
      [read.englishName, read.name].map((n) => normalizeName(n)).filter(Boolean),
    ),
  ];

  let candidates: Candidate[] = [];

  if (names.length > 0) {
    const { data, error } = await admin
      .from("cards")
      .select(CANDIDATE_COLUMNS)
      .eq("game", read.game)
      .in("normalized_name", names)
      .limit(NAME_CANDIDATES);
    if (error) console.error("Card scan lookup failed", error);
    candidates = ((data ?? []) as CandidateRow[]).map(candidate);
  }

  if (candidates.length === 0 && names.length > 0) {
    const found = await searchCards(read.englishName || read.name, { game: read.game });
    candidates = found.map((card) => ({
      id: card.id,
      canonicalCardNumber: card.canonicalCardNumber,
      colors: card.colors ?? [],
      power: card.power ?? null,
      cost: card.cost ?? null,
      cardType: card.cardType ?? null,
    }));
  }

  /* The number on its own as well, whenever there is one and the name
     found nothing with it: a misspelt or translated name must not hide a
     card whose number was read right. */
  const wanted = collectorValue(read.number);
  const nameHasNumber = candidates.some(
    (card) => wanted !== null && collectorValue(card.canonicalCardNumber) === wanted,
  );
  if (read.number && !nameHasNumber) {
    const compact = [
      ...new Set([compactCode(read.setCode + read.number), compactCode(read.number)]),
    ].filter(Boolean);
    const { data } = await admin
      .from("cards")
      .select(CANDIDATE_COLUMNS)
      .eq("game", read.game)
      .in("compact_card_number", compact)
      .limit(limit);
    const have = new Set(candidates.map((card) => card.id));
    for (const row of (data ?? []) as CandidateRow[]) {
      if (!have.has(row.id)) candidates.push(candidate(row));
    }
  }

  if (candidates.length === 0) return [];

  /* A number read right outranks anything the eye judged. */
  const numbered = candidates.some(
    (card) => scanScore(read, card.canonicalCardNumber) >= 2,
  );
  const narrowed =
    traits && !numbered ? narrowByTraits(candidates, traits) : candidates;
  const best = rankScan(read, narrowed, limit);
  return matchesFor(
    best.map((card) => card.id),
    read.setCode,
  );
}

/** Cards by id, in that order, each with the printing its set code names. */
async function matchesFor(ids: string[], setCode: string): Promise<ScanMatch[]> {
  if (ids.length === 0) return [];
  const cards = await cardResultsByIds(ids);
  const order = new Map(ids.map((id, index) => [id, index]));
  return [...cards]
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((card) => ({
      card,
      printingId: suggestedPrinting(setCode, card.printings),
    }));
}

/**
 * When the name finds nothing at all (a misread name, a nickname): the
 * game's cards with the power and cost the reader saw, narrowed by colour
 * and type, for "Might be one of these". Needs a power or a cost, or it
 * would be half the game.
 */
export async function suggestByTraits(
  game: ScanRead["game"],
  traits: ScanTraits,
  limit = 4,
): Promise<ScanMatch[]> {
  if (game === "other" || (traits.power === null && traits.cost === null)) return [];
  let query = getSupabaseAdmin()
    .from("cards")
    .select(CANDIDATE_COLUMNS)
    .eq("game", game);
  if (traits.power !== null) query = query.eq("power", traits.power);
  if (traits.cost !== null) query = query.eq("cost", traits.cost);
  const { data, error } = await query.limit(NAME_CANDIDATES);
  if (error) {
    console.error("Card scan trait lookup failed", error);
    return [];
  }
  const rows = ((data ?? []) as CandidateRow[]).map(candidate);
  const narrowed = narrowByTraits(rows, traits);
  /* Only worth showing when the traits got it down to a handful. */
  if (narrowed.length === 0 || narrowed.length > limit * 3) return [];
  return matchesFor(
    narrowed.slice(0, limit).map((card) => card.id),
    "",
  );
}
