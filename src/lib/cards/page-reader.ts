import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { isRenderableImageUrl } from "@/lib/cards/images";
import {
  findScanned,
  scannerKey,
  suggestByTraits,
  withoutKeys,
  type PocketOutcome,
  type ScanMatch,
} from "@/lib/cards/scan";
import {
  photoType,
  scanScore,
  SCAN_GAMES,
  type ScanGame,
  type ScanRead,
  type ScanTraits,
} from "@/lib/cards/scan-rules";

/**
 * The page reader: one look, then the catalogue, then a cheap tiebreak.
 *
 * The founder (2026-10-09), after three pages cost $2.79: "surely there's
 * a better way to do this from an API standpoint." The reader before
 * this was an agent loop that searched, looked at catalogue art and
 * searched again, re-sending every photo on every round: up to forty
 * rounds a page on the strongest model. Now:
 *
 * 1. One call to the reader model with the page and its pockets. It says
 *    what each card is the way a collector would (name, number when it
 *    can read one, the frame's colours, power, cost, type, whether it is
 *    an alternate art), in a fixed shape, and nothing else.
 * 2. Our catalogue finds each card from that, narrowed by the traits
 *    (findScanned). No model is involved, and most pockets end here.
 * 3. Pockets the catalogue cannot settle (the same name and traits on a
 *    few cards, or a regular and an alternate art) go together into one
 *    call to the cheapest model, which compares each pocket with up to
 *    four pictures and picks one, or none.
 * 4. A card it recognised but nothing matched gets the catalogue's
 *    closest cards by traits, for "Might be one of these".
 *
 * The model never chooses a card id: it describes, and the catalogue and
 * the pictures decide. The player checks every pocket before anything is
 * placed. Each read logs what it cost, and the tiebreak is skipped once
 * a page has spent PAGE_CAP_CENTS.
 */

const DEFAULT_MODEL = "claude-sonnet-5-5";
const TIEBREAK_MODEL = "claude-haiku-5-5";

/** The reader's model, a Vercel setting so it can change without a release. */
export function readerModel(): string {
  return process.env.SCAN_AGENT_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Dollars per million tokens: input, output, cache read. An unknown
 * model is costed as the dearest Opus, so the log never under-reports.
 */
const PRICES: Record<string, [number, number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5, 0.01],
  "claude-sonnet-5-5": [2, 10, 0.2],
  "claude-sonnet-5": [2, 10, 0.2],
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-opus-5": [5, 25, 0.5],
  "claude-fable-5-1": [10, 50, 0.25],
};
const DEAREST: [number, number, number] = [10, 50, 1];

/** What a call cost, in cents. */
export function costCents(
  model: string,
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
): number {
  const [input, output, cacheRead] = PRICES[model] ?? DEAREST;
  const dollars =
    (usage.input_tokens * input +
      (usage.cache_creation_input_tokens ?? 0) * input * 1.25 +
      (usage.cache_read_input_tokens ?? 0) * cacheRead +
      usage.output_tokens * output) /
    1_000_000;
  return dollars * 100;
}

/** Past this, a page skips the tiebreak and leaves the choice to the player. */
export const PAGE_CAP_CENTS = 15;

/** The most pictures one tiebreak compares a pocket with. */
const TIEBREAK_OPTIONS = 4;
const LETTERS = ["A", "B", "C", "D"] as const;

export type ReaderPhoto = {
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

export type ReaderOutcome =
  | { ok: true; pockets: PocketOutcome[]; cents: number }
  | { ok: false; reason: "unavailable" | "timeout" };

const pocketSchema = z.object({
  slot: z.number().int(),
  /* Plain text, normalised below: the API takes an enum only as a hint,
     and one odd word ("One Piece") must not sink a whole page. */
  state: z.string(),
  game: z.string(),
  name: z.string(),
  englishName: z.string(),
  number: z.string(),
  setCode: z.string(),
  colors: z.array(z.string()),
  power: z.number().int().nullable(),
  cost: z.number().int().nullable(),
  cardType: z.string(),
  altArt: z.boolean(),
  sure: z.boolean(),
  note: z.string(),
});
const readingSchema = z.object({ pockets: z.array(pocketSchema) });
type Raw = z.infer<typeof pocketSchema>;
type Seen = Omit<Raw, "state" | "game"> & {
  state: "empty" | "card";
  game: ScanGame | "other";
};

/** The names a reader might write for each game, to ours. */
const GAME_WORDS: Record<string, ScanGame> = {
  onepiece: "one-piece",
  riftbound: "riftbound",
  lorcana: "lorcana",
  disneylorcana: "lorcana",
  mtg: "mtg",
  magic: "mtg",
  magicthegathering: "mtg",
  pokemon: "pokemon",
  pokmon: "pokemon",
  fleshandblood: "flesh-and-blood",
  fab: "flesh-and-blood",
};

/** A reader's word for a game, as one of ours, or "other". */
export function gameOf(word: string): ScanGame | "other" {
  const key = word.toLowerCase().replace(/[^a-z]/g, "");
  if ((SCAN_GAMES as readonly string[]).includes(word.trim().toLowerCase())) {
    return word.trim().toLowerCase() as ScanGame;
  }
  return GAME_WORDS[key] ?? "other";
}

const tidy = (raw: Raw): Seen => ({
  ...raw,
  state: raw.state.trim().toLowerCase() === "empty" ? "empty" : "card",
  game: gameOf(raw.game),
});

const tiebreakSchema = z.object({
  picks: z.array(z.object({ pocket: z.number().int(), choice: z.string() })),
});

const READ_PROMPT = [
  "You identify trading cards in photos for cardflare, a trading app. Our catalogue finds each card from what you say, so describe each one precisely.",
  "Recognise every card the way an expert collector would, from everything visible: the artwork, the character, the frame and its colours, the set's style, rarity marks, and any text you can read. Use your own knowledge of the games freely: most cards can be named from the artwork alone, even at an angle or under glare.",
  "For each card give: game; name as printed; englishName (the English name, the same as name when it is printed in English); number and setCode exactly as printed, only if you can read them or are certain of them, otherwise empty; colors, the card's colours as lower-case words (red, green, blue, purple, black, yellow, white), empty if unclear; power and cost as the numbers printed, or null; cardType in lower case (leader, character, event, stage, creature, instant, pokemon, trainer, and so on), empty if unclear; altArt true for an alternate, parallel or special art; sure false whenever you are not confident; note, a few words on how you decided, or what got in the way.",
  "Ignore sleeves, glare, reflections and anything laid over the photo, such as an on-screen button.",
].join("\n");

function pageTask(slots: number[]): string {
  return [
    "The first photo is a whole binder page with nine pockets in a 3x3 grid: slots 0, 1, 2 are the top row from left to right, 3, 4, 5 the middle row, 6, 7, 8 the bottom row.",
    slots.length > 0
      ? `The photos after it are close-ups of slots ${slots.join(", ")}, cut automatically on that grid, so one may be off-centre or show parts of the cards beside it. When a close-up and the whole page disagree, trust the whole page and the card's place in the grid.`
      : "There are no close-ups: read every slot from the whole page.",
    "Answer all nine slots, 0 to 8: state empty for an empty pocket, card for a card.",
  ].join("\n");
}

const CARD_TASK =
  "The photo is one trading card. Answer one entry, slot 0, state card (or empty if there is no card).";

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

function client(timeout: number): Anthropic {
  return new Anthropic({ apiKey: scannerKey(), timeout, maxRetries: 1 });
}

function logFailure(stage: string, error: unknown): "unavailable" | "timeout" {
  if (error instanceof Anthropic.APIError) {
    console.error(
      `Page reader ${stage} failed`,
      error.status,
      error.name,
      withoutKeys(error.message),
    );
    return "unavailable";
  }
  const name = error instanceof Error ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Page reader ${stage} failed`, name, withoutKeys(message));
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable";
}

/** Step 1: the one look. */
async function look(input: {
  mode: "page" | "card";
  page: ReaderPhoto | null;
  pockets: (ReaderPhoto | null)[];
  games: readonly string[];
  model: string;
}): Promise<
  | { ok: true; seen: Seen[]; cents: number }
  | { ok: false; reason: "unavailable" | "timeout" }
> {
  const slots = input.pockets.flatMap((photo, slot) => (photo ? [slot] : []));
  const content: Anthropic.ContentBlockParam[] = [];
  if (input.page) content.push(imageBlock(input.page));
  for (const photo of input.pockets) if (photo) content.push(imageBlock(photo));
  const known =
    input.games.length > 0 ? `The player collects: ${input.games.join(", ")}.\n` : "";
  content.push({
    type: "text",
    text: `${READ_PROMPT}\n${known}${input.mode === "page" ? pageTask(slots) : CARD_TASK}`,
  });

  try {
    const response = await client(150_000).messages.parse({
      model: input.model,
      /* Room for its thinking and nine described cards; the ceiling on
         what one look can cost. */
      max_tokens: 6000,
      output_config: { effort: "medium", format: zodOutputFormat(readingSchema) },
      messages: [{ role: "user", content }],
    });
    const cents = costCents(input.model, response.usage);
    if (response.stop_reason === "refusal") {
      console.info("Page reader cost", { model: input.model, cents, how: "refused" });
      return { ok: false, reason: "unavailable" };
    }
    const parsed = readingSchema.safeParse(response.parsed_output);
    if (!parsed.success) {
      console.error("Page reader look came back unreadable", response.stop_reason);
      return { ok: false, reason: "unavailable" };
    }
    return { ok: true, seen: parsed.data.pockets.map(tidy), cents };
  } catch (error) {
    return { ok: false, reason: logFailure("look", error) };
  }
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

/** One choice a tiebreak can make: a card, and the printing whose art it shows. */
type Option = { cardId: string; printingId: string | null; imageUrl: string | null };

/**
 * What a pocket could still be: several cards the catalogue could not
 * tell apart, or one card whose printings differ in art when the reader
 * saw an alternate art. Empty when there is nothing to decide.
 */
export function tiebreakOptions(
  matches: ScanMatch[],
  seen: Pick<Seen, "altArt" | "number" | "setCode">,
): Option[] {
  if (matches.length === 0) return [];
  const art = (match: ScanMatch, printingId: string | null) =>
    match.card.printings.find((p) => p.id === printingId)?.imageUrl ??
    match.card.printings.find((p) => p.imageUrl)?.imageUrl ??
    null;
  const decided = scanScore(seen, matches[0].card.canonicalCardNumber) >= 2;
  if (matches.length > 1 && !decided) {
    return matches.slice(0, TIEBREAK_OPTIONS).map((match) => ({
      cardId: match.card.id,
      printingId: match.printingId,
      imageUrl: art(match, match.printingId),
    }));
  }
  const top = matches[0];
  const drawn = top.card.printings.filter((p) => p.imageUrl);
  if (seen.altArt && !top.printingId && drawn.length > 1) {
    return drawn.slice(0, TIEBREAK_OPTIONS).map((p) => ({
      cardId: top.card.id,
      printingId: p.id,
      imageUrl: p.imageUrl,
    }));
  }
  return [];
}

/**
 * Step 3: every unsettled pocket in one call to the cheapest model. The
 * answer per pocket is a letter or "none"; a letter it was not offered
 * counts as none.
 */
async function tiebreak(
  asks: { slot: number; photo: ReaderPhoto; options: Option[] }[],
): Promise<{ picks: Map<number, Option>; cents: number }> {
  const picks = new Map<number, Option>();
  if (asks.length === 0) return { picks, cents: 0 };

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
  if (offered.size === 0) return { picks, cents: 0 };

  try {
    const response = await client(60_000).messages.parse({
      model: TIEBREAK_MODEL,
      max_tokens: 2000,
      output_config: { effort: "low", format: zodOutputFormat(tiebreakSchema) },
      messages: [{ role: "user", content }],
    });
    const cents = costCents(TIEBREAK_MODEL, response.usage);
    const parsed = tiebreakSchema.safeParse(response.parsed_output);
    if (response.stop_reason === "refusal" || !parsed.success) return { picks, cents };
    for (const { pocket, choice } of parsed.data.picks) {
      const options = offered.get(pocket);
      const index = LETTERS.indexOf(
        choice.trim().toUpperCase() as (typeof LETTERS)[number],
      );
      if (options && index >= 0 && index < options.length)
        picks.set(pocket, options[index]);
    }
    return { picks, cents };
  } catch (error) {
    logFailure("tiebreak", error);
    return { picks, cents: 0 };
  }
}

const traitsOf = (seen: Seen): ScanTraits => ({
  colors: seen.colors,
  power: seen.power,
  cost: seen.cost,
  cardType: seen.cardType,
});

const readOf = (seen: Seen): ScanRead => ({
  found: true,
  game: seen.game,
  name: seen.name,
  englishName: seen.englishName || seen.name,
  number: seen.number,
  setCode: seen.setCode,
});

/**
 * Reads a page (nine pockets) or one card. `pockets` holds a close-up per
 * slot, or null; in card mode it is the one photo and `page` is null.
 */
export async function readCards(input: {
  mode: "page" | "card";
  page: ReaderPhoto | null;
  pockets: (ReaderPhoto | null)[];
  games: readonly string[];
}): Promise<ReaderOutcome> {
  const model = readerModel();
  const count = input.mode === "page" ? 9 : 1;
  const looked = await look({ ...input, model });
  if (!looked.ok) return looked;
  let cents = looked.cents;

  const bySlot = new Map<number, Seen>();
  for (const seen of looked.seen) {
    if (
      Number.isInteger(seen.slot) &&
      seen.slot >= 0 &&
      seen.slot < count &&
      !bySlot.has(seen.slot)
    ) {
      bySlot.set(seen.slot, seen);
    }
  }

  /* Step 2: the catalogue, every pocket at once. */
  const found = await Promise.all(
    Array.from({ length: count }, async (_, slot) => {
      const seen = bySlot.get(slot);
      if (!seen || seen.state === "empty")
        return { slot, seen, matches: [] as ScanMatch[] };
      if (seen.game === "other") return { slot, seen, matches: [] as ScanMatch[] };
      const matches = await findScanned(readOf(seen), 6, traitsOf(seen));
      return { slot, seen, matches };
    }),
  );

  /* Step 3: one cheap call for every pocket the catalogue left open. */
  const asks = found.flatMap(({ slot, seen, matches }) => {
    const photo =
      input.pockets[slot] ?? (input.mode === "card" ? input.pockets[0] : null);
    if (!seen || !photo) return [];
    const options = tiebreakOptions(matches, seen);
    return options.length > 1 ? [{ slot, photo, options }] : [];
  });
  const settled =
    cents < PAGE_CAP_CENTS
      ? await tiebreak(asks)
      : { picks: new Map<number, Option>(), cents: 0 };
  cents += settled.cents;

  /* Step 4: the pockets, and suggestions where nothing matched. */
  const pockets = await Promise.all(
    found.map(async ({ slot, seen, matches }): Promise<PocketOutcome> => {
      if (!seen) return { slot, state: "unread", read: null, note: "" };
      if (seen.state === "empty") return { slot, state: "empty" };
      const read = readOf(seen);
      if (seen.game === "other")
        return { slot, state: "unread", read, note: seen.note };
      if (matches.length === 0) {
        const suggestions = await suggestByTraits(seen.game, traitsOf(seen));
        return {
          slot,
          state: "unread",
          read,
          note: seen.note,
          ...(suggestions.length > 0 ? { suggestions } : {}),
        };
      }
      const pick = settled.picks.get(slot);
      const asked = asks.some((ask) => ask.slot === slot);
      let ordered = matches;
      if (pick) {
        const chosen = matches.find((match) => match.card.id === pick.cardId);
        if (chosen) {
          ordered = [
            { card: chosen.card, printingId: pick.printingId ?? chosen.printingId },
            ...matches.filter((match) => match !== chosen),
          ];
        }
      }
      /* Sure only when the reader was, and nothing was left open: either
         the catalogue settled it, or the pictures did. */
      const sure = seen.sure && (!asked || Boolean(pick));
      return { slot, state: "found", read, matches: ordered, sure, note: seen.note };
    }),
  );

  console.info("Page reader cost", {
    model,
    mode: input.mode,
    cents: Math.round(cents * 100) / 100,
    tiebreaks: asks.length,
  });
  return { ok: true, pockets, cents };
}
