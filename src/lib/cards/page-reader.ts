import "server-only";

import { createHash } from "node:crypto";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { isRenderableImageUrl } from "@/lib/cards/images";
import { slotName } from "@/lib/cards/page-geometry";
import {
  findScanned,
  scannerKey,
  suggestByTraits,
  withoutKeys,
  type PocketOutcome,
  type ScanMatch,
} from "@/lib/cards/scan";
import {
  evidenceFor,
  isAltPrinting,
  narrowPrintings,
  scoreEvidence,
  verdict,
  type Evidence,
  type Verdict,
} from "@/lib/cards/scan-confidence";
import {
  callCents,
  gameWord,
  PROMPT_VERSION,
  RECOGNIZERS,
  type CardRead,
  type CropInput,
  type Provider,
  type ProviderCall,
} from "@/lib/cards/scan-providers";
import {
  photoType,
  scanScore,
  SCAN_GAMES,
  type ScanGame,
  type ScanRead,
  type ScanTraits,
} from "@/lib/cards/scan-rules";
import {
  ANTHROPIC_SCAN_MODEL,
  OPENAI_SCAN_MODEL,
  providerKeys,
  scannerSettings,
  type ScanMode,
  type ScannerSettings,
} from "@/lib/cards/scan-settings";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * The scanner's reader: straightened card pictures in, a verdict per
 * pocket out.
 *
 * The founder (2026-10-13): "accuracy first, then speed, then cost", and
 * "Do not allow the AI model to invent card IDs." So no model ever picks
 * a card. In order:
 *
 * 1. The cache. A picture read before (the same bytes, the same model and
 *    prompt) is not paid for twice.
 * 2. One batched call to the primary reader (by the scanner settings:
 *    Anthropic, OpenAI, or Anthropic first in hybrid), every card picture
 *    in the one request, each labelled with its pocket. A pocket the
 *    page's photo shows as empty is not sent.
 * 3. The catalogue. Each read is looked up (findScanned): name, number,
 *    the traits it saw. Its printings are narrowed by the set code, the
 *    rarity, and whether it is an alternate art. No model involved.
 * 4. Hybrid only: the pockets the evidence left unsure go, together, to
 *    OpenAI's reader at full resolution, and the better-supported read of
 *    the two is kept. Both naming the same card is a small bonus, never
 *    proof.
 * 5. One cheap picture comparison for every pocket still open between a
 *    few cards, or between a card's printings: the photo against the
 *    catalogue's own pictures.
 * 6. A verdict per pocket from the evidence (scan-confidence.ts): matched,
 *    ambiguous, unrecognized or empty. The player checks the unsure ones
 *    before anything is placed.
 *
 * Every call's tokens, time and cost are kept in the run summary, the
 * page stops asking once it has spent the configured cap, and nothing
 * logged carries a key or a picture.
 */

export type ReaderPhoto = {
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

/** One pocket's picture, and what the page's photo already showed of it. */
export interface ScanCrop extends CropInput {
  /** The photo shows an empty pocket here: not sent to any reader. */
  looksEmpty?: boolean;
  /** A card outline was found here. */
  cardSeen?: boolean;
  /** Glare over part of the card. */
  glare?: boolean;
}

export interface ReadOptions {
  /** The player's games, for a card whose game the reader did not name. */
  games: readonly string[];
  /** Read once by the caller for a page of many reads; looked up when not given. */
  settings?: ScannerSettings;
  /** Overrides the settings' mode: the admin's benchmark runs all three. */
  mode?: ScanMode;
  /** A single pocket read again: more effort, and the cache is not used. */
  careful?: boolean;
  /** False for the admin's benchmark: every mode pays for its own reads, as it would live. */
  cache?: boolean;
}

export interface RunSummary {
  mode: ScanMode;
  calls: ProviderCall[];
  /** Calls made again after a failure: a provider down, the other tried. */
  retries: number;
  cents: number;
  ms: number;
  /** Pictures sent to a reader, and pictures answered from the cache. */
  cards: number;
  cached: number;
  /** Slots hybrid mode sent to the second reader. */
  escalated: number[];
  /** Most cards read upside down: the page was photographed turned round. */
  upsideDown: boolean;
  matched: number;
  review: number;
  unrecognized: number;
  empty: number;
}

export type ReadOutcome =
  | { ok: true; pockets: PocketOutcome[]; run: RunSummary }
  | { ok: false; reason: "unavailable" | "timeout" | "no-key"; run: RunSummary };

/** The words a reader might use for a game, as one of ours. */
export const gameOf = gameWord;

/**
 * The games to look a pocket up in: the one the reader named, or, when
 * it named none we carry, the player's own games (every game when the
 * player has not said), so an odd word never leaves a card unsearched.
 */
export function gamesToTry(
  seen: ScanGame | "other",
  playerGames: readonly string[],
): ScanGame[] {
  if (seen !== "other") return [seen];
  const own = playerGames.filter((game): game is ScanGame =>
    (SCAN_GAMES as readonly string[]).includes(game),
  );
  return own.length > 0 ? own : [...SCAN_GAMES];
}

const hashOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const modelOf = (provider: Provider) =>
  provider === "anthropic" ? ANTHROPIC_SCAN_MODEL : OPENAI_SCAN_MODEL;

/* ---- 1 and 2: the cache, then one call ------------------------------ */

/**
 * The reads for these pictures from one provider: from the cache where
 * the same picture was read before, the rest in one call. A failed call
 * keeps whatever the cache had.
 */
async function readWith(
  provider: Provider,
  crops: readonly ScanCrop[],
  options: ReadOptions & { settings: ScannerSettings },
  run: RunSummary,
): Promise<{
  reads: Map<number, CardRead>;
  failed: "unavailable" | "timeout" | "no-key" | null;
}> {
  const reads = new Map<number, CardRead>();
  if (crops.length === 0) return { reads, failed: null };
  const model = modelOf(provider);
  const hashes = new Map(crops.map((crop) => [crop.slot, hashOf(crop.bytes)]));
  const useCache =
    !options.careful && options.cache !== false && isSupabaseConfigured();

  if (useCache) {
    const { data, error } = await getSupabaseAdmin()
      .from("scan_recognitions")
      .select("hash, read")
      .in("hash", [...new Set(hashes.values())])
      .eq("provider", provider)
      .eq("model", model)
      .eq("prompt_version", PROMPT_VERSION);
    /* Missing before the migration runs: no cache, quietly. */
    if (!error) {
      const byHash = new Map(
        (data ?? []).map((row) => [row.hash, row.read as CardRead]),
      );
      for (const crop of crops) {
        const hit = byHash.get(hashes.get(crop.slot) ?? "");
        if (hit && typeof hit === "object")
          reads.set(crop.slot, { ...hit, slot: crop.slot });
      }
      run.cached += reads.size;
    }
  }

  const missing = crops.filter((crop) => !reads.has(crop.slot));
  if (missing.length === 0) return { reads, failed: null };
  const answer = await RECOGNIZERS[provider](missing, {
    games: options.games,
    careful: options.careful,
    prices: options.settings.prices,
  });
  if (answer.call) {
    run.calls.push(answer.call);
    run.cents += answer.call.cents;
  }
  if (!answer.ok) return { reads, failed: answer.reason };
  run.cards += missing.length;

  const fresh: {
    hash: string;
    provider: string;
    model: string;
    prompt_version: number;
    read: CardRead;
  }[] = [];
  for (const crop of missing) {
    const read = answer.reads.get(crop.slot);
    if (!read) continue;
    reads.set(crop.slot, read);
    fresh.push({
      hash: hashes.get(crop.slot) as string,
      provider,
      model,
      prompt_version: PROMPT_VERSION,
      read,
    });
  }
  if (isSupabaseConfigured() && fresh.length > 0) {
    const { error } = await getSupabaseAdmin()
      .from("scan_recognitions")
      .upsert(fresh, { onConflict: "hash,provider,model,prompt_version" });
    if (error) console.error("Could not keep the scanner's reads", error.code);
  }
  return { reads, failed: null };
}

/* ---- 3: the catalogue ---------------------------------------------- */

const traitsOf = (read: CardRead): ScanTraits => ({
  colors: read.colors,
  power: read.power,
  cost: read.cost,
  cardType: read.cardType,
});

const scanReadOf = (read: CardRead): ScanRead => ({
  found: true,
  game: read.game,
  name: read.name,
  englishName: read.englishName || read.name,
  number: read.number,
  setCode: read.setCode,
});

/** A read looked up in the catalogue, in the reader's game or the player's. */
async function lookUp(
  read: CardRead,
  games: readonly string[],
): Promise<{ read: CardRead; matches: ScanMatch[] }> {
  const tried = gamesToTry(read.game, games);
  for (const game of tried) {
    const named = { ...read, game };
    const matches = await findScanned(scanReadOf(named), 8, traitsOf(named));
    if (matches.length > 0) return { read: named, matches };
  }
  /* Nothing in any game: kept as the one game when there was only one,
     so "Might be one of these" can still look there. */
  return { read: tried.length === 1 ? { ...read, game: tried[0] } : read, matches: [] };
}

/** One reader's read of a pocket, weighed against the catalogue. */
interface Assessed {
  provider: Provider;
  read: CardRead;
  matches: ScanMatch[];
  /** Printings the top card can still be, by set code, rarity and art. */
  printings: string[];
  /** The same without the alternate-art word: what a picture chooses between. */
  printingChoices: string[];
  /** The top card is not settled by its number: the pictures should choose. */
  cardOpen: boolean;
  art: Evidence["art"];
  agreed: boolean;
}

function assess(
  provider: Provider,
  read: CardRead,
  matches: ScanMatch[],
): Assessed | null {
  if (matches.length === 0) return null;
  const top = matches[0].card;
  const numbered = matches.filter(
    (m) => scanScore(read, m.card.canonicalCardNumber) >= 4,
  );
  const printingRead = {
    setCode: read.setCode,
    rarity: read.rarity,
    altArt: read.altArt,
  };
  return {
    provider,
    read,
    matches,
    printings: narrowPrintings(top.printings, printingRead).map((p) => p.id),
    printingChoices: narrowPrintings(top.printings, printingRead, { art: false }).map(
      (p) => p.id,
    ),
    /* More than one card, and the number does not single one out. */
    cardOpen: matches.length > 1 && numbered.length !== 1,
    art: "not-asked",
    agreed: false,
  };
}

function evidenceOf(a: Assessed): Evidence {
  return evidenceFor(a.read, a.matches[0].card, {
    only: a.matches.length === 1 || !a.cardOpen,
    art: a.art,
    agreed: a.agreed,
  });
}

const scoreOf = (a: Assessed | null) => (a ? scoreEvidence(evidenceOf(a)).score : -1);

/* ---- 5: the pictures ------------------------------------------------ */

/** The most pictures one comparison sets against a pocket. */
const TIEBREAK_OPTIONS = 4;
const LETTERS = ["A", "B", "C", "D"] as const;

/** One choice a picture comparison can make: a card, and the printing whose art it shows. */
type Option = { cardId: string; printingId: string | null; imageUrl: string | null };

/**
 * What a pocket could still be: several cards the number could not tell
 * apart, or one card's printings the set code and rarity could not.
 * Empty when there is nothing for the pictures to decide.
 */
export function tiebreakOptions(
  a: Pick<Assessed, "matches" | "cardOpen" | "printings" | "printingChoices" | "read">,
): {
  kind: "card" | "printing";
  options: Option[];
} {
  const { matches } = a;
  if (matches.length === 0) return { kind: "card", options: [] };
  const artOf = (match: ScanMatch, printingId: string | null) =>
    match.card.printings.find((p) => p.id === printingId && p.imageUrl)?.imageUrl ??
    match.card.printings.find((p) => p.imageUrl)?.imageUrl ??
    null;
  if (a.cardOpen) {
    return {
      kind: "card",
      options: matches.slice(0, TIEBREAK_OPTIONS).map((match) => {
        const own = narrowPrintings(match.card.printings, {
          setCode: a.read.setCode,
          rarity: a.read.rarity,
          altArt: a.read.altArt,
        });
        const printingId = own.length === 1 ? own[0].id : null;
        return {
          cardId: match.card.id,
          printingId,
          imageUrl: artOf(match, own[0]?.id ?? null),
        };
      }),
    };
  }
  if (a.printingChoices.length > 1) {
    const top = matches[0];
    /* The printings the art word points at first, so they are never cut. */
    const ordered = [
      ...a.printingChoices.filter((id) => a.printings.includes(id)),
      ...a.printingChoices.filter((id) => !a.printings.includes(id)),
    ];
    const drawn = ordered
      .map((id) => top.card.printings.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p?.imageUrl));
    if (drawn.length > 1) {
      return {
        kind: "printing",
        options: drawn.slice(0, TIEBREAK_OPTIONS).map((p) => ({
          cardId: top.card.id,
          printingId: p.id,
          imageUrl: p.imageUrl,
        })),
      };
    }
  }
  return { kind: "card", options: [] };
}

/** A catalogue picture, from an allowed host, typed by its bytes. */
async function picture(url: string | null): Promise<ReaderPhoto | null> {
  if (!url || !isRenderableImageUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 1_500_000) return null;
    const mediaType = photoType(bytes);
    return mediaType ? { bytes, mediaType } : null;
  } catch {
    return null;
  }
}

const tiebreakSchema = z.object({
  picks: z.array(z.object({ pocket: z.number().int(), choice: z.string() })),
});

function imageBlock(photo: ReaderPhoto): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: photo.mediaType,
      data: Buffer.from(photo.bytes).toString("base64"),
    },
  };
}

/**
 * Every open pocket in one call to the cheapest model. The answer per
 * pocket is a letter or "none"; a letter it was not offered counts as
 * none, and a pocket with fewer than two usable pictures is not asked.
 */
async function tiebreak(
  asks: { slot: number; photo: ReaderPhoto; options: Option[] }[],
  settings: ScannerSettings,
  run: RunSummary,
): Promise<{ asked: Set<number>; picks: Map<number, Option> }> {
  const picks = new Map<number, Option>();
  const asked = new Set<number>();
  if (asks.length === 0 || !scannerKey()) return { asked, picks };

  const content: Anthropic.ContentBlockParam[] = [
    {
      type: "text",
      text: "Each pocket below is a photo of one trading card from a binder, followed by catalogue pictures labelled A to D. For each pocket, choose the letter whose artwork is the same card and the same art as the photo (sleeves, glare and angle aside), or none if no picture matches.",
    },
  ];
  const offered = new Map<number, Option[]>();
  for (const ask of asks) {
    const pictures = await Promise.all(
      ask.options.map((option) => picture(option.imageUrl)),
    );
    const usable = ask.options.flatMap((option, index) =>
      pictures[index] ? [{ option, photo: pictures[index] }] : [],
    );
    if (usable.length < 2) continue;
    offered.set(
      ask.slot,
      usable.map((each) => each.option),
    );
    content.push({ type: "text", text: `Pocket ${ask.slot}:` }, imageBlock(ask.photo));
    usable.forEach((each, index) => {
      content.push(
        { type: "text", text: `${LETTERS[index]}:` },
        imageBlock(each.photo),
      );
    });
  }
  if (offered.size === 0) return { asked, picks };
  for (const slot of offered.keys()) asked.add(slot);

  const started = Date.now();
  try {
    const response = await new Anthropic({
      apiKey: scannerKey(),
      timeout: 60_000,
      maxRetries: 1,
    }).messages.parse({
      model: ANTHROPIC_SCAN_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(tiebreakSchema) },
      messages: [{ role: "user", content }],
    });
    const usage = {
      input:
        response.usage.input_tokens +
        (response.usage.cache_read_input_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0),
      output: response.usage.output_tokens,
      cached: response.usage.cache_read_input_tokens ?? 0,
    };
    const cents = callCents(settings.prices, ANTHROPIC_SCAN_MODEL, usage);
    run.calls.push({
      provider: "anthropic",
      model: ANTHROPIC_SCAN_MODEL,
      ...usage,
      cents,
      ms: Date.now() - started,
      cards: offered.size,
      ok: response.stop_reason !== "refusal",
    });
    run.cents += cents;
    const parsed = tiebreakSchema.safeParse(response.parsed_output);
    if (response.stop_reason === "refusal" || !parsed.success) return { asked, picks };
    for (const { pocket, choice } of parsed.data.picks) {
      const options = offered.get(pocket);
      const index = LETTERS.indexOf(
        choice.trim().toUpperCase() as (typeof LETTERS)[number],
      );
      if (options && index >= 0 && index < options.length)
        picks.set(pocket, options[index]);
    }
    return { asked, picks };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    console.error("Scanner picture comparison failed", name, withoutKeys(message));
    return { asked: new Set(), picks };
  }
}

/* ---- The whole read ------------------------------------------------- */

/** A run that made no calls. */
export const emptyRun = (mode: ScanMode): RunSummary => ({
  mode,
  calls: [],
  retries: 0,
  cents: 0,
  ms: 0,
  cards: 0,
  cached: 0,
  escalated: [],
  upsideDown: false,
  matched: 0,
  review: 0,
  unrecognized: 0,
  empty: 0,
});

/**
 * Reads a page's pockets (or one card, as slot 0). Each crop is one
 * straightened card picture from page-vision.ts, or the one photo of a
 * single scan.
 */
export async function readCrops(
  crops: readonly ScanCrop[],
  options: ReadOptions,
): Promise<ReadOutcome> {
  const started = Date.now();
  const settings = options.settings ?? (await scannerSettings());
  const mode = options.mode ?? settings.mode;
  const run = emptyRun(mode);
  const withSettings = { ...options, settings };
  const keys = providerKeys();
  const thresholds = {
    autoAccept: settings.autoAccept,
    reviewFloor: settings.reviewFloor,
  };

  /* The primary reader by the mode, the other when its key is missing. */
  let primary: Provider = mode === "openai" ? "openai" : "anthropic";
  const otherOf = (p: Provider): Provider =>
    p === "anthropic" ? "openai" : "anthropic";
  if (!keys[primary] && keys[otherOf(primary)]) primary = otherOf(primary);
  const finish = (outcome: ReadOutcome): ReadOutcome => {
    outcome.run.ms = Date.now() - started;
    outcome.run.cents = Math.round(outcome.run.cents * 10_000) / 10_000;
    logRun(outcome);
    return outcome;
  };
  if (!keys[primary]) return finish({ ok: false, reason: "no-key", run });

  const bySlot = new Map(crops.map((crop) => [crop.slot, crop]));
  const toRead = crops.filter((crop) => !crop.looksEmpty);

  let first = await readWith(primary, toRead, withSettings, run);
  /* The primary down altogether: the other reader, once, when it has a key. */
  if (first.failed && first.reads.size === 0 && keys[otherOf(primary)]) {
    run.retries += 1;
    primary = otherOf(primary);
    first = await readWith(primary, toRead, withSettings, run);
  }
  if (first.failed && first.reads.size === 0 && toRead.length > 0) {
    return finish({ ok: false, reason: first.failed, run });
  }

  /* A page turned round reads with most of its cards upside down. */
  const cardsRead = [...first.reads.values()].filter((read) => read.state === "card");
  run.upsideDown =
    cardsRead.length >= 2 &&
    cardsRead.filter((read) => read.upsideDown).length > cardsRead.length / 2;

  /* 3: the catalogue, every pocket at once. */
  const looked = new Map(
    await Promise.all(
      [...first.reads].map(async ([slot, read]) => {
        if (read.state === "empty")
          return [slot, { read, matches: [] as ScanMatch[] }] as const;
        return [slot, await lookUp(read, options.games)] as const;
      }),
    ),
  );
  const best = new Map<number, Assessed | null>();
  for (const [slot, { read, matches }] of looked) {
    if (read.state === "card") best.set(slot, assess(primary, read, matches));
  }

  /* 4: hybrid sends the unsure pockets, together, to the second reader. */
  const second: Provider = otherOf(primary);
  if (
    mode === "hybrid" &&
    primary === "anthropic" &&
    keys[second] &&
    run.cents < settings.pageCapCents
  ) {
    const unsure = toRead.filter((crop) => {
      const read = first.reads.get(crop.slot);
      /* An empty pocket the photo saw a card in, or a pocket never answered. */
      if (!read) return true;
      if (read.state === "empty") return Boolean(crop.cardSeen);
      return scoreOf(best.get(crop.slot) ?? null) < settings.autoAccept;
    });
    if (unsure.length > 0) {
      run.escalated = unsure.map((crop) => crop.slot);
      const again = await readWith(second, unsure, withSettings, run);
      await Promise.all(
        [...again.reads].map(async ([slot, read]) => {
          if (read.state === "empty") {
            if (!first.reads.has(slot)) looked.set(slot, { read, matches: [] });
            return;
          }
          const found = await lookUp(read, options.games);
          const theirs = assess(second, found.read, found.matches);
          const ours = best.get(slot) ?? null;
          if (!first.reads.has(slot) || first.reads.get(slot)?.state === "empty") {
            looked.set(slot, found);
          }
          const agreed = Boolean(
            ours && theirs && ours.matches[0].card.id === theirs.matches[0].card.id,
          );
          const kept = scoreOf(theirs) > scoreOf(ours) ? theirs : ours;
          if (kept) kept.agreed = agreed;
          best.set(slot, kept);
        }),
      );
    }
  }

  /* 5: one picture comparison for every pocket still open. */
  const asks: {
    slot: number;
    photo: ReaderPhoto;
    options: Option[];
    kind: "card" | "printing";
  }[] = [];
  for (const [slot, a] of best) {
    const crop = bySlot.get(slot);
    if (!a || !crop) continue;
    const { kind, options: choices } = tiebreakOptions(a);
    if (choices.length > 1) asks.push({ slot, photo: crop, options: choices, kind });
  }
  const compared =
    asks.length > 0 && run.cents < settings.pageCapCents
      ? await tiebreak(asks, settings, run)
      : { asked: new Set<number>(), picks: new Map<number, Option>() };
  const pinned = new Map<number, string | null>();
  /* Pockets whose picture pick an alternate art was not backed up. */
  const artInDoubt = new Set<number>();
  /**
   * An alternate art is only taken from the pictures when the reader
   * independently said "alternate art" and was sure of the card, and a
   * regular printing only when the reader did not say alternate. The
   * founder (2026-10-13): "Our confidence thresholds don't automatically
   * accept questionable alternate-art identifications." Anything less is
   * left for the player to choose.
   */
  const pin = (slot: number, a: Assessed, printingId: string) => {
    const printing = a.matches[0].card.printings.find((p) => p.id === printingId);
    const alt = printing ? isAltPrinting(printing) : false;
    if (alt !== a.read.altArt || (alt && !a.read.sure)) {
      artInDoubt.add(slot);
      return;
    }
    pinned.set(slot, printingId);
  };
  for (const ask of asks) {
    const a = best.get(ask.slot);
    if (!a || !compared.asked.has(ask.slot)) continue;
    const pick = compared.picks.get(ask.slot);
    if (ask.kind === "card") {
      if (!pick) {
        a.art = "rejected";
        continue;
      }
      const chosen = a.matches.find((m) => m.card.id === pick.cardId);
      if (!chosen) continue;
      a.matches = [chosen, ...a.matches.filter((m) => m !== chosen)];
      a.cardOpen = false;
      a.art = "chosen";
      const printingRead = {
        setCode: a.read.setCode,
        rarity: a.read.rarity,
        altArt: a.read.altArt,
      };
      a.printings = narrowPrintings(chosen.card.printings, printingRead).map(
        (p) => p.id,
      );
      a.printingChoices = narrowPrintings(chosen.card.printings, printingRead, {
        art: false,
      }).map((p) => p.id);
      if (pick.printingId) pin(ask.slot, a, pick.printingId);
    } else if (pick?.printingId) {
      a.art = "chosen";
      pin(ask.slot, a, pick.printingId);
    }
  }

  /* 6: a verdict per pocket. */
  const pockets = await Promise.all(
    crops.map(async (crop): Promise<PocketOutcome> => {
      const slot = crop.slot;
      const position = slotName(slot);
      const glare = Boolean(crop.glare);
      const seen = looked.get(slot);
      const empty: PocketOutcome = {
        slot,
        state: "empty",
        position,
        status: "empty",
        confidence: 1,
        reasons: [],
        glare,
      };
      if (crop.looksEmpty) return empty;
      if (!seen) {
        const v = verdict({ kind: "none", readerSaw: false }, thresholds);
        return { slot, state: "unread", read: null, position, ...v, glare };
      }
      if (seen.read.state === "empty") {
        /* The reader saw nothing where the photo saw a card's outline. */
        if (crop.cardSeen) {
          const v = verdict({ kind: "none", readerSaw: false }, thresholds);
          return { slot, state: "unread", read: null, position, ...v, glare };
        }
        return empty;
      }
      const a = best.get(slot) ?? null;
      const read = a?.read ?? seen.read;
      const note = read.note;
      if (!a) {
        const game = read.game;
        const suggestions =
          game === "other" ? [] : await suggestByTraits(game, traitsOf(read));
        const v = verdict({ kind: "none", readerSaw: true }, thresholds);
        return {
          slot,
          state: "unread",
          read: scanReadOf(read),
          note,
          ...(suggestions.length > 0 ? { suggestions } : {}),
          position,
          ...v,
          glare,
        };
      }

      const printingId =
        pinned.get(slot) ??
        (a.printings.length === 1 && a.printingChoices.length <= 1
          ? a.printings[0]
          : null);
      const printingOpen =
        printingId === null && a.matches[0].card.printings.length > 1;
      const v: Verdict = verdict(
        { kind: "candidate", evidence: evidenceOf(a), printingOpen },
        thresholds,
      );
      if (artInDoubt.has(slot)) v.reasons.push("alternate art not confirmed");
      if (glare) v.reasons.push("glare over the card");
      const matches: ScanMatch[] = [
        {
          card: a.matches[0].card,
          printingId:
            printingId ??
            (a.matches[0].card.printings.length === 1
              ? a.matches[0].card.printings[0].id
              : null),
        },
        ...a.matches.slice(1),
      ];
      if (v.status === "unrecognized") {
        /* A weak guess only: offered as "Might be one of these". */
        return {
          slot,
          state: "unread",
          read: scanReadOf(read),
          note,
          suggestions: matches.slice(0, 4),
          position,
          ...v,
          glare,
        };
      }
      return {
        slot,
        state: "found",
        read: scanReadOf(read),
        matches,
        sure: v.status === "matched",
        note,
        position,
        status: v.status,
        confidence: v.confidence,
        reasons: v.reasons,
        printingUncertain: printingOpen,
        glare,
      };
    }),
  );

  for (const pocket of pockets) {
    if (pocket.status === "matched") run.matched += 1;
    else if (pocket.status === "ambiguous") run.review += 1;
    else if (pocket.status === "unrecognized") run.unrecognized += 1;
    else run.empty += 1;
  }
  return finish({ ok: true, pockets: pockets.map(stripVerdict), run });
}

/** The verdict's needsReview is the status's to say: not sent to clients. */
function stripVerdict(
  pocket: PocketOutcome & { needsReview?: boolean },
): PocketOutcome {
  const rest = { ...pocket };
  delete rest.needsReview;
  return rest;
}

/** The run in the server log: calls, tokens, cents, counts. No pictures, no keys. */
function logRun(outcome: ReadOutcome): void {
  const { run } = outcome;
  console.info("Scanner run", {
    mode: run.mode,
    ok: outcome.ok,
    cents: run.cents,
    ms: run.ms,
    calls: run.calls.map((c) => ({
      provider: c.provider,
      model: c.model,
      input: c.input,
      output: c.output,
      cached: c.cached,
      cents: Math.round(c.cents * 10_000) / 10_000,
      ms: c.ms,
      cards: c.cards,
      ok: c.ok,
    })),
    cards: run.cards,
    cached: run.cached,
    escalated: run.escalated.length,
    matched: run.matched,
    review: run.review,
    unrecognized: run.unrecognized,
    empty: run.empty,
  });
}

/** A run kept for the cost and accuracy numbers on /admin/scanner. */
export async function recordRun(
  run: RunSummary,
  context: {
    playerId: string | null;
    pageScanId?: string | null;
    kind: "page" | "card" | "pocket" | "benchmark";
    detectMethod?: string | null;
  },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { error } = await getSupabaseAdmin()
    .from("scan_runs")
    .insert({
      player_id: context.playerId,
      page_scan_id: context.pageScanId ?? null,
      kind: context.kind,
      mode: run.mode,
      calls: run.calls,
      cards: run.cards,
      retries: run.retries,
      cents: run.cents,
      ms: run.ms,
      matched: run.matched,
      review: run.review,
      unrecognized: run.unrecognized,
      empty: run.empty,
      detect_method: context.detectMethod ?? null,
    });
  /* Missing before the migration runs: the numbers are a nicety, the scan is not. */
  if (error) console.error("Could not record a scanner run", error.code);
}
