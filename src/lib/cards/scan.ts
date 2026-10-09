import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { normalizeName } from "@/lib/cards/domain";
import {
  type ScanRead,
  type ScanRefusal,
  SCAN_GAMES,
  SCAN_MATCHES,
  SCAN_MAX_BYTES,
  compactCode,
  rankScan,
  suggestedPrinting,
} from "@/lib/cards/scan-rules";
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
  return Boolean(process.env.ANTHROPIC_API_KEY) && isSupabaseConfigured();
}

/**
 * Open to Pro, or admins only. The founder agreed admins try it first;
 * setting CARD_SCANNER_FOR_PRO to "on" in Vercel opens it to Pro with
 * no code change.
 */
function openToPro(): boolean {
  return process.env.CARD_SCANNER_FOR_PRO === "on";
}

/**
 * What a player sees: "on" scans, "pro-door" shows the button that
 * leads to Pro, and null shows nothing at all (an unconfigured
 * deployment, or a free player during the admin trial), so there is
 * never a button that cannot work.
 */
export type ScanAccess = "on" | "pro-door" | null;

export async function scannerAccess(who: {
  playerId: string;
  userId: string;
}): Promise<ScanAccess> {
  if (!scannerConfigured()) return null;
  const admin = getSupabaseAdmin();
  const [{ data: adminRow }, { data: player }] = await Promise.all([
    admin.from("admin_users").select("user_id").eq("user_id", who.userId).maybeSingle(),
    admin.from("players").select("tier").eq("id", who.playerId).maybeSingle(),
  ]);
  if (adminRow) return "on";
  if (!openToPro()) return null;
  return tierAllows(player?.tier ?? null, "cardScanner") ? "on" : "pro-door";
}

/** One guess: the card, and the printing the set code points at. */
export interface ScanMatch {
  card: CardResult;
  printingId: string | null;
}

export type ScanOutcome =
  | { ok: true; read: ScanRead; matches: ScanMatch[] }
  | { ok: false; reason: ScanRefusal; read?: ScanRead };

/*
 * Ceilings on a paid call. A real binder session is a card every few
 * seconds at most; these stop a stuck loop or a script, and the day's
 * ceiling bounds what one account can cost.
 */
const BURST = { limit: 60, windowMs: 10 * 60 * 1000 };
const DAILY = { limit: 500, windowMs: 24 * 60 * 60 * 1000 };

/** Whether a photo's first bytes say JPEG, PNG or WebP. A named type is a hint. */
export function photoType(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

/** A scan, start to finish: the gate, the ceilings, the read, the lookup. */
export async function scanCard(
  who: { playerId: string; userId: string },
  bytes: Uint8Array,
): Promise<ScanOutcome> {
  if ((await scannerAccess(who)) !== "on") return { ok: false, reason: "not-allowed" };

  if (bytes.length === 0 || bytes.length > SCAN_MAX_BYTES) {
    return { ok: false, reason: "too-big" };
  }
  const mediaType = photoType(bytes);
  if (!mediaType) return { ok: false, reason: "no-card" };

  if (
    !checkRateLimit(`card-scan:${who.playerId}`, BURST.limit, BURST.windowMs).allowed ||
    !checkRateLimit(`card-scan-day:${who.playerId}`, DAILY.limit, DAILY.windowMs)
      .allowed
  ) {
    return { ok: false, reason: "limit" };
  }

  const read = await readCard(bytes, mediaType);
  if (!read) return { ok: false, reason: "unavailable" };
  if (!read.found) return { ok: false, reason: "no-card", read };
  if (read.game === "other") return { ok: false, reason: "not-carried", read };

  const matches = await findScanned(read);
  if (matches.length === 0) return { ok: false, reason: "not-found", read };
  return { ok: true, read, matches };
}

const readSchema = z.object({
  found: z.boolean(),
  game: z.enum([...SCAN_GAMES, "other"]),
  name: z.string(),
  englishName: z.string(),
  number: z.string(),
  setCode: z.string(),
});

const READ_PROMPT = [
  "This photo should show one trading card. Read what is printed on it.",
  "found: false if there is no trading card in the photo.",
  "game: one-piece, riftbound, lorcana, mtg (Magic: The Gathering), pokemon, flesh-and-blood, or other.",
  "name: the card's own name exactly as printed. Not the set, the artist or the card type.",
  "englishName: the card's English name if it is printed in another language, otherwise the same as name.",
  "number: the collector number exactly as printed, usually along the bottom edge, such as 199/165, OP01-001, WTR001, 123/204 or 0123.",
  "setCode: the set code printed beside the number, such as SVI, MKM, OP01 or OGN. Empty if none is printed.",
  "Write an empty string for anything you cannot read clearly. Never guess a number.",
].join("\n");

/** A client per scan: it is a plain object, and the key is read when used. */
function anthropic(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
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
): Promise<ScanRead | null> {
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
            { type: "text", text: READ_PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const parsed = readSchema.safeParse(response.parsed_output);
    if (!parsed.success) return null;
    return parsed.data;
  } catch (error) {
    /* Logged with the SDK's own class name and status, never the photo. */
    if (error instanceof Anthropic.APIError) {
      console.error("Card scan read failed", error.status, error.name);
    } else {
      console.error("Card scan read failed", error);
    }
    return null;
  }
}

/** Cards a name can be, at most this many, before the number narrows them. */
const NAME_CANDIDATES = 500;

/**
 * The catalogue's answer to a read: cards with the name read (in English
 * when the card was not), best number and set match first. When the
 * name finds nothing, the ranked search tries, and then the number on
 * its own for the games that print the set into it.
 */
export async function findScanned(read: ScanRead): Promise<ScanMatch[]> {
  if (read.game === "other") return [];
  const admin = getSupabaseAdmin();
  const names = [
    ...new Set(
      [read.englishName, read.name].map((n) => normalizeName(n)).filter(Boolean),
    ),
  ];

  let candidates: { id: string; canonicalCardNumber: string }[] = [];

  if (names.length > 0) {
    const { data, error } = await admin
      .from("cards")
      .select("id, canonical_card_number")
      .eq("game", read.game)
      .in("normalized_name", names)
      .limit(NAME_CANDIDATES);
    if (error) console.error("Card scan lookup failed", error);
    candidates = (data ?? []).map((row) => ({
      id: row.id,
      canonicalCardNumber: row.canonical_card_number,
    }));
  }

  if (candidates.length === 0 && names.length > 0) {
    const found = await searchCards(read.englishName || read.name, { game: read.game });
    candidates = found.map((card) => ({
      id: card.id,
      canonicalCardNumber: card.canonicalCardNumber,
    }));
  }

  if (candidates.length === 0 && read.number) {
    const compact = [
      ...new Set([compactCode(read.setCode + read.number), compactCode(read.number)]),
    ].filter(Boolean);
    const { data } = await admin
      .from("cards")
      .select("id, canonical_card_number")
      .eq("game", read.game)
      .in("compact_card_number", compact)
      .limit(SCAN_MATCHES);
    candidates = (data ?? []).map((row) => ({
      id: row.id,
      canonicalCardNumber: row.canonical_card_number,
    }));
  }

  if (candidates.length === 0) return [];

  const best = rankScan(read, candidates);
  const cards = await cardResultsByIds(best.map((card) => card.id));
  return cards.map((card) => ({
    card,
    printingId: suggestedPrinting(read.setCode, card.printings),
  }));
}
