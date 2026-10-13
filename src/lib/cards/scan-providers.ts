import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { slotName } from "@/lib/cards/page-geometry";
import { scannerKey, withoutKeys } from "@/lib/cards/scan";
import { SCAN_GAMES, type ScanGame } from "@/lib/cards/scan-rules";
import {
  ANTHROPIC_SCAN_MODEL,
  OPENAI_SCAN_MODEL,
  type ModelPrice,
} from "@/lib/cards/scan-settings";

/**
 * The two AI readers, behind one contract.
 *
 * The founder (2026-10-13): "Implement an interchangeable AI recognition
 * service with two providers", Anthropic's claude-haiku-5-5 and OpenAI's
 * gpt-5.4-mini, "Process the same exact crops ... so we can compare
 * recognition accuracy fairly."
 *
 * Each is given the same straightened card pictures (page-vision.ts), each
 * labelled with its pocket, in ONE request, with the same short prompt,
 * and must answer in the same fixed shape. Neither decides which catalogue
 * card it is, and neither decides where it sits: they describe what they
 * see, and the catalogue (page-reader.ts) decides.
 *
 * Keys come from server environment variables only (ANTHROPIC_API_KEY,
 * OPENAI_API_KEY); a missing key is a plain "no-key" answer, never a crash,
 * and nothing logged here can carry one.
 */

export type Provider = "anthropic" | "openai";

/** Bumped when the prompt or the answer's shape changes: the cache key has it. */
export const PROMPT_VERSION = 2;

export interface CropInput {
  slot: number;
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

/** What a reader said about one card picture. */
export interface CardRead {
  slot: number;
  state: "empty" | "card";
  game: ScanGame | "other";
  name: string;
  englishName: string;
  /** The collector number exactly as printed, empty when not legible. */
  number: string;
  setCode: string;
  /** The rarity mark as printed: C, UC, R, SR, SEC, L, SP and so on. */
  rarity: string;
  colors: string[];
  power: number | null;
  cost: number | null;
  cardType: string;
  altArt: boolean;
  /** A few words on the artwork, for telling printings apart. */
  artNote: string;
  /** The card is upside down in its picture: the page was photographed turned. */
  upsideDown: boolean;
  sure: boolean;
  note: string;
}

export interface ProviderCall {
  provider: Provider;
  model: string;
  input: number;
  output: number;
  cached: number;
  cents: number;
  ms: number;
  cards: number;
  ok: boolean;
}

export type ProviderResult =
  | { ok: true; reads: Map<number, CardRead>; call: ProviderCall }
  | {
      ok: false;
      reason: "no-key" | "unavailable" | "timeout";
      call: ProviderCall | null;
    };

/* ---- The prompt and the answer's shape, the same for both ---------- */

const GAMES = [...SCAN_GAMES, "other"].join(", ");

export const READ_PROMPT = [
  "Each picture is one trading card cut from a photo of a binder page, labelled with its pocket. For each pocket, identify the exact printing.",
  `state: empty if the pocket holds no card, otherwise card. game: one of ${GAMES}.`,
  "name as printed; englishName (same as name when printed in English); number: the collector number exactly as printed (for example OP01-120), empty if you cannot read it, never guessed; setCode as printed or from the number's prefix; rarity as printed (C, UC, R, SR, SEC, L, SP...), empty if unclear.",
  "colors as lower-case words; power and cost as printed numbers or null; cardType in lower case; altArt true for an alternate, parallel, full-art or special art; artNote: under 15 words on the artwork itself (pose, background, framing) to tell printings apart.",
  "upsideDown true if the card is upside down in its picture.",
  "Recognise cards from their artwork using your knowledge of the games. sure false whenever you are not confident; note: a few words on what got in the way, if anything.",
].join("\n");

const readShape = {
  slot: z.number().int(),
  state: z.string(),
  game: z.string(),
  name: z.string(),
  englishName: z.string(),
  number: z.string(),
  setCode: z.string(),
  rarity: z.string(),
  colors: z.array(z.string()),
  power: z.number().int().nullable(),
  cost: z.number().int().nullable(),
  cardType: z.string(),
  altArt: z.boolean(),
  artNote: z.string(),
  upsideDown: z.boolean(),
  sure: z.boolean(),
  note: z.string(),
};
const answerSchema = z.object({ pockets: z.array(z.object(readShape)) });

/** The same shape as plain JSON Schema, strict, for OpenAI. */
const OPENAI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pockets"],
  properties: {
    pockets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: Object.keys(readShape),
        properties: {
          slot: { type: "integer" },
          state: { type: "string", enum: ["empty", "card"] },
          game: { type: "string" },
          name: { type: "string" },
          englishName: { type: "string" },
          number: { type: "string" },
          setCode: { type: "string" },
          rarity: { type: "string" },
          colors: { type: "array", items: { type: "string" } },
          power: { type: ["integer", "null"] },
          cost: { type: ["integer", "null"] },
          cardType: { type: "string" },
          altArt: { type: "boolean" },
          artNote: { type: "string" },
          upsideDown: { type: "boolean" },
          sure: { type: "boolean" },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

/** The words a reader might use for each game, found anywhere in what it wrote. */
const GAME_WORDS: [string, ScanGame][] = [
  ["onepiece", "one-piece"],
  ["optcg", "one-piece"],
  ["riftbound", "riftbound"],
  ["lorcana", "lorcana"],
  ["magic", "mtg"],
  ["mtg", "mtg"],
  ["pokemon", "pokemon"],
  ["pokmon", "pokemon"],
  ["fleshandblood", "flesh-and-blood"],
  ["fab", "flesh-and-blood"],
];

export function gameWord(word: string): ScanGame | "other" {
  const exact = word.trim().toLowerCase();
  if ((SCAN_GAMES as readonly string[]).includes(exact)) return exact as ScanGame;
  const key = exact.replace(/[^a-z]/g, "");
  return GAME_WORDS.find(([words]) => key.includes(words))?.[1] ?? "other";
}

/** A reader's answer, tidied and held to the pockets it was asked about. */
export function tidyAnswer(
  raw: unknown,
  asked: readonly number[],
): Map<number, CardRead> {
  const parsed = answerSchema.safeParse(raw);
  const reads = new Map<number, CardRead>();
  if (!parsed.success) return reads;
  for (const pocket of parsed.data.pockets) {
    if (!asked.includes(pocket.slot) || reads.has(pocket.slot)) continue;
    reads.set(pocket.slot, {
      ...pocket,
      state: pocket.state.trim().toLowerCase() === "empty" ? "empty" : "card",
      game: gameWord(pocket.game),
      englishName: pocket.englishName || pocket.name,
      colors: pocket.colors.map((c) => c.trim().toLowerCase()).filter(Boolean),
    });
  }
  return reads;
}

/** What a call cost, in cents, from the configured prices. */
export function callCents(
  prices: Record<string, ModelPrice>,
  model: string,
  usage: { input: number; output: number; cached: number },
): number {
  /* An unknown model is costed as the dearest known, never as free. */
  const fallback = Object.values(prices).reduce<ModelPrice>(
    (dear, p) => (p[1] > dear[1] ? p : dear),
    [10, 50, 1],
  );
  const [input, output, cached] = prices[model] ?? fallback;
  const fresh = Math.max(0, usage.input - usage.cached);
  return (
    ((fresh * input + usage.cached * cached + usage.output * output) / 1_000_000) * 100
  );
}

const labelOf = (slot: number) => `Pocket ${slotName(slot)} (slot ${slot}):`;

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/* ---- Anthropic ----------------------------------------------------- */

export async function recognizeAnthropic(
  crops: readonly CropInput[],
  options: {
    games: readonly string[];
    careful?: boolean;
    prices: Record<string, ModelPrice>;
  },
): Promise<ProviderResult> {
  if (!scannerKey()) return { ok: false, reason: "no-key", call: null };
  if (crops.length === 0)
    return { ok: true, reads: new Map(), call: emptyCall("anthropic") };
  const started = Date.now();
  const client = new Anthropic({
    apiKey: scannerKey(),
    timeout: 60_000,
    maxRetries: 1,
  });
  const content: Anthropic.ContentBlockParam[] = [];
  for (const crop of crops) {
    content.push({ type: "text", text: labelOf(crop.slot) });
    content.push({
      type: "image",
      source: { type: "base64", media_type: crop.mediaType, data: base64(crop.bytes) },
    });
  }
  const known =
    options.games.length > 0
      ? `The player collects: ${options.games.join(", ")}.\n`
      : "";
  content.push({ type: "text", text: `${known}${READ_PROMPT}` });

  try {
    const response = await client.messages.parse({
      model: ANTHROPIC_SCAN_MODEL,
      /* Room for nine short answers and a little thinking: the ceiling on
         what one read can cost. */
      max_tokens: options.careful ? 6000 : 3000,
      output_config: {
        effort: options.careful ? "medium" : "low",
        format: zodOutputFormat(answerSchema),
      },
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
    const call: ProviderCall = {
      provider: "anthropic",
      model: ANTHROPIC_SCAN_MODEL,
      ...usage,
      cents: callCents(options.prices, ANTHROPIC_SCAN_MODEL, usage),
      ms: Date.now() - started,
      cards: crops.length,
      ok: response.stop_reason !== "refusal",
    };
    if (response.stop_reason === "refusal")
      return { ok: false, reason: "unavailable", call };
    return {
      ok: true,
      reads: tidyAnswer(
        response.parsed_output,
        crops.map((c) => c.slot),
      ),
      call,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    console.error("Anthropic card read failed", name, withoutKeys(message));
    return {
      ok: false,
      reason:
        name === "APIConnectionTimeoutError" || name === "TimeoutError"
          ? "timeout"
          : "unavailable",
      call: {
        ...emptyCall("anthropic"),
        ms: Date.now() - started,
        cards: crops.length,
        ok: false,
      },
    };
  }
}

/* ---- OpenAI -------------------------------------------------------- */

/** OpenAI's key, whitespace out, as for Anthropic's. Server only. */
function openaiKey(): string {
  return (process.env.OPENAI_API_KEY ?? "").replace(/\s+/g, "");
}

type ResponsesAnswer = {
  status?: string;
  output?: {
    type: string;
    content?: { type: string; text?: string; refusal?: string }[];
  }[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string } | null;
};

/**
 * One request to OpenAI's Responses API: every crop as an input_image at
 * its original resolution, and a strict JSON Schema for the answer. Raw
 * HTTP rather than a second SDK: one endpoint, and no new dependency.
 */
export async function recognizeOpenAI(
  crops: readonly CropInput[],
  options: {
    games: readonly string[];
    careful?: boolean;
    prices: Record<string, ModelPrice>;
  },
): Promise<ProviderResult> {
  const key = openaiKey();
  if (!key) return { ok: false, reason: "no-key", call: null };
  if (crops.length === 0)
    return { ok: true, reads: new Map(), call: emptyCall("openai") };
  const started = Date.now();
  const content: Record<string, unknown>[] = [];
  for (const crop of crops) {
    content.push({ type: "input_text", text: labelOf(crop.slot) });
    content.push({
      type: "input_image",
      image_url: `data:${crop.mediaType};base64,${base64(crop.bytes)}`,
      detail: "original",
    });
  }
  const known =
    options.games.length > 0
      ? `The player collects: ${options.games.join(", ")}.\n`
      : "";
  content.push({ type: "input_text", text: `${known}${READ_PROMPT}` });

  const body = JSON.stringify({
    model: OPENAI_SCAN_MODEL,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "binder_pockets",
        schema: OPENAI_SCHEMA,
        strict: true,
      },
    },
    reasoning: { effort: options.careful ? "medium" : "low" },
    max_output_tokens: options.careful ? 8000 : 4000,
    /* Nothing kept on OpenAI's side beyond the call. */
    store: false,
  });

  let answer: ResponsesAnswer | null = null;
  let failure: "unavailable" | "timeout" = "unavailable";
  /* One retry, and only for the answers that say "try again". */
  for (let attempt = 0; attempt < 2 && !answer; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(90_000),
      });
      if (response.status === 429 || response.status >= 500) {
        failure = "unavailable";
        continue;
      }
      const json = (await response.json()) as ResponsesAnswer;
      if (!response.ok) {
        console.error(
          "OpenAI card read refused",
          response.status,
          withoutKeys(json.error?.message ?? ""),
        );
        break;
      }
      answer = json;
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      failure =
        name === "TimeoutError" || name === "AbortError" ? "timeout" : "unavailable";
      console.error(
        "OpenAI card read failed",
        name,
        withoutKeys(error instanceof Error ? error.message : ""),
      );
    }
  }
  if (!answer) {
    return {
      ok: false,
      reason: failure,
      call: {
        ...emptyCall("openai"),
        ms: Date.now() - started,
        cards: crops.length,
        ok: false,
      },
    };
  }

  const usage = {
    input: answer.usage?.input_tokens ?? 0,
    output: answer.usage?.output_tokens ?? 0,
    cached: answer.usage?.input_tokens_details?.cached_tokens ?? 0,
  };
  const parts = (answer.output ?? []).flatMap((item) =>
    item.type === "message" ? (item.content ?? []) : [],
  );
  const refused = parts.some((part) => part.type === "refusal");
  const text = parts.find((part) => part.type === "output_text")?.text ?? "";
  const call: ProviderCall = {
    provider: "openai",
    model: OPENAI_SCAN_MODEL,
    ...usage,
    cents: callCents(options.prices, OPENAI_SCAN_MODEL, usage),
    ms: Date.now() - started,
    cards: crops.length,
    ok: !refused && answer.status === "completed",
  };
  if (refused || answer.status !== "completed")
    return { ok: false, reason: "unavailable", call };
  let raw: unknown = null;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "unavailable", call };
  }
  return {
    ok: true,
    reads: tidyAnswer(
      raw,
      crops.map((c) => c.slot),
    ),
    call,
  };
}

function emptyCall(provider: Provider): ProviderCall {
  return {
    provider,
    model: provider === "anthropic" ? ANTHROPIC_SCAN_MODEL : OPENAI_SCAN_MODEL,
    input: 0,
    output: 0,
    cached: 0,
    cents: 0,
    ms: 0,
    cards: 0,
    ok: true,
  };
}

/** The reader for a provider. */
export const RECOGNIZERS: Record<Provider, typeof recognizeAnthropic> = {
  anthropic: recognizeAnthropic,
  openai: recognizeOpenAI,
};
