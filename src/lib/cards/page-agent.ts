import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { isRenderableImageUrl } from "@/lib/cards/images";
import { findScanned, scannerKey, withoutKeys } from "@/lib/cards/scan";
import { SCAN_GAMES, type ScanGame } from "@/lib/cards/scan-rules";
import type { CardResult } from "@/lib/cards/schema";

/**
 * The careful reader: an agent that looks at a binder page (or one card
 * the quick reader was unsure of), searches cardflare's catalogue, looks
 * at candidate cards' art beside the photo, and says what is in every
 * pocket.
 *
 * The founder (2026-10-09): "I really think that the full binder page
 * scans should be fully agentic. It is a further away picture, often
 * with glare inside a binder, so it's best to have it do a full pass."
 * So the quick reader's one look becomes a loop with three tools, and
 * the model may search and compare as often as it needs within a
 * budget of turns and time.
 *
 * It never picks a card from memory: a card it submits must be one its
 * own searches returned in this run, and a printing must belong to that
 * card, or the pocket is handed back as unread for the player to find.
 * The player checks every page before anything is placed.
 *
 * The model is a Vercel setting, SCAN_AGENT_MODEL, so it can be changed
 * without a release; the default is the one the founder agreed.
 */

const DEFAULT_MODEL = "claude-sonnet-5-5";

function agentModel(): string {
  return process.env.SCAN_AGENT_MODEL?.trim() || DEFAULT_MODEL;
}

/** Models that take the server-side refusal fallback. */
const FALLBACK_MODELS = new Set([
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-fable-5-1",
]);

export type AgentPhoto = {
  bytes: Uint8Array;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
};

/** What the reader decided for one pocket, checked against its own searches. */
export interface AgentPocket {
  slot: number;
  state: "empty" | "card" | "unsure";
  cardId: string | null;
  printingId: string | null;
  /** Other cards it thought it might be, best first. */
  alternatives: string[];
  /** False when the reader was not confident: the check flags it. */
  sure: boolean;
  /** One line on how it decided, for the check: "glare on the number, matched by art". */
  note: string;
  readName: string;
  readNumber: string;
}

export type AgentOutcome =
  | { ok: true; pockets: AgentPocket[]; cards: Map<string, CardResult> }
  | { ok: false; reason: "unavailable" | "timeout" };

/* Budgets: a page may search and look a good deal; one card far less. */
const BUDGET = {
  page: { turns: 40, views: 45, searches: 60, ms: 230_000 },
  card: { turns: 12, views: 12, searches: 15, ms: 45_000 },
} as const;

const SYSTEM = [
  "You identify trading cards in photos for cardflare, a trading app, and match each one to cardflare's own catalogue so it can go in the player's binder.",
  "First recognise every card the way an expert collector would, from everything visible: the character or card name, the artwork, the frame and colours, the set's style and symbol, rarity marks, and any text you can read. Use your own knowledge of the games freely. Text does not need to be readable for you to know a card: most cards can be named from the artwork alone.",
  "Then find each card with search_cards, using the English name you recognised and the set code or collector number when you know or can read them. If a search misses, search again differently: the name alone, a shorter or alternative spelling, or the set code and number alone.",
  "When several results could be it (the same character in many sets, alternate arts, parallels, reprints), use view_card on the likely ones and choose the one whose artwork matches the photo.",
  "Your answer for a pocket must use a card_id, and a printing_id when you can tell, from your search results. If you recognised a card but could not find it, answer unsure with card_id null, put the name you recognised in read_name, and say what you recognised in the note, for example: Roronoa Zoro, OP01 alternate art, not in the results.",
  "Glare, sleeves, distance and photos of a screen are normal: rely on the artwork. Ignore anything laid over the photo, such as an on-screen button.",
  "Mark sure as false whenever you are not confident, and say why in the note in a few words. A wrong card the player trusts is worse than an honest unsure.",
  "When you have decided every pocket, call submit_page exactly once.",
].join("\n");

const tools: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_cards",
    description:
      "Search cardflare's catalogue. Give the card's English name as you recognised it, the game, and the set code and collector number when you know or can read them (they narrow the results, and the number alone also finds a card). Returns up to twelve candidate cards with their printings.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The card's name in English, as you recognised it.",
        },
        game: { type: "string", enum: [...SCAN_GAMES] },
        number: {
          type: "string",
          description: "Collector number, or empty.",
        },
        set_code: { type: "string", description: "Set code, or empty." },
      },
      required: ["query", "game"],
    },
  },
  {
    name: "view_card",
    description:
      "See the art of one catalogue card (and printing, when given) to compare with the photo. Only for cards a search returned.",
    input_schema: {
      type: "object",
      properties: {
        card_id: { type: "string" },
        printing_id: {
          type: "string",
          description: "Optional: a printing of that card.",
        },
      },
      required: ["card_id"],
    },
  },
  {
    name: "submit_page",
    description: "Your answer for every pocket. Call once, at the end.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        pockets: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              slot: { type: "integer" },
              state: { type: "string", enum: ["empty", "card", "unsure"] },
              card_id: { type: ["string", "null"] },
              printing_id: { type: ["string", "null"] },
              alternatives: { type: "array", items: { type: "string" } },
              sure: { type: "boolean" },
              note: { type: "string" },
              read_name: { type: "string" },
              read_number: { type: "string" },
            },
            required: [
              "slot",
              "state",
              "card_id",
              "printing_id",
              "alternatives",
              "sure",
              "note",
              "read_name",
              "read_number",
            ],
          },
        },
      },
      required: ["pockets"],
    },
  },
];

function imageBlock(photo: AgentPhoto): Anthropic.Beta.BetaImageBlockParam {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: photo.mediaType,
      data: Buffer.from(photo.bytes).toString("base64"),
    },
  };
}

function taskText(
  mode: "page" | "card",
  games: readonly string[],
  pockets: number[],
): string {
  const known = games.length > 0 ? `The player collects: ${games.join(", ")}. ` : "";
  if (mode === "card") {
    return `${known}The photo is one trading card. Identify it and call submit_page with a single entry for slot 0.`;
  }
  return [
    known,
    "The first photo is a whole binder page with nine pockets in a 3x3 grid.",
    `The photos after it are the pockets cut out, for slots ${pockets.join(", ")}: slots 0, 1, 2 are the top row from left to right, 3, 4, 5 the middle row, 6, 7, 8 the bottom row. A slot with no close-up is empty.`,
    "Decide every slot from 0 to 8: empty, a card, or unsure. Then call submit_page with nine entries.",
  ].join("\n");
}

/** A catalogue image, fetched from an allowed host only, as a block the model can see. */
async function cardImage(
  url: string | null,
): Promise<Anthropic.Beta.BetaImageBlockParam | null> {
  if (!url || !isRenderableImageUrl(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    const mediaType =
      type === "image/jpeg" || type === "image/png" || type === "image/webp"
        ? type
        : null;
    if (!mediaType) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 2_000_000) return null;
    return imageBlock({ bytes, mediaType });
  } catch {
    return null;
  }
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}

/**
 * Reads a page (or one card) with the agent. `pockets` holds a close-up
 * per slot or null for an empty one; in card mode it is one photo.
 */
export async function readWithAgent(input: {
  mode: "page" | "card";
  page: AgentPhoto | null;
  pockets: (AgentPhoto | null)[];
  games: readonly string[];
}): Promise<AgentOutcome> {
  const budget = BUDGET[input.mode];
  const deadline = Date.now() + budget.ms;
  const model = agentModel();
  const client = new Anthropic({
    apiKey: scannerKey(),
    timeout: 120_000,
    maxRetries: 1,
  });

  /* What the searches returned: the only cards and printings it may pick. */
  const seen = new Map<string, CardResult>();
  let views = 0;
  /* What the read cost, logged at the end so a page's price is visible. */
  const used = { turns: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const logUse = (how: string) =>
    console.info("Page agent read", { how, model, mode: input.mode, ...used });
  let searches = 0;

  const slots = input.pockets.flatMap((photo, slot) => (photo ? [slot] : []));
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.page) content.push(imageBlock(input.page));
  for (const photo of input.pockets) if (photo) content.push(imageBlock(photo));
  content.push({ type: "text", text: taskText(input.mode, input.games, slots) });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];

  try {
    for (let turn = 0; turn < budget.turns; turn += 1) {
      const left = deadline - Date.now();
      if (left <= 0) return { ok: false, reason: "timeout" };

      const response = await client.beta.messages.create(
        {
          model,
          /* Room for its thinking and a nine-pocket answer in one turn. */
          max_tokens: 16000,
          system: SYSTEM,
          tools,
          messages,
          output_config: { effort: "medium" },
          /* The photos and the history are re-sent every turn: cache them. */
          cache_control: { type: "ephemeral" },
          ...(FALLBACK_MODELS.has(model)
            ? {
                betas: ["server-side-fallback-2026-07-01"],
                fallbacks: "default" as const,
              }
            : {}),
        },
        { signal: AbortSignal.timeout(left) },
      );

      used.turns += 1;
      used.input += response.usage.input_tokens;
      used.output += response.usage.output_tokens;
      used.cacheRead += response.usage.cache_read_input_tokens ?? 0;
      used.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;

      if (response.stop_reason === "refusal") {
        logUse("refused");
        return { ok: false, reason: "unavailable" };
      }

      /* Appended whole and unchanged: thinking blocks must come back as sent. */
      messages.push({ role: "assistant", content: response.content });

      const calls = response.content.filter(
        (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use",
      );

      const submitted = calls.find((call) => call.name === "submit_page");
      if (submitted) {
        logUse("answered");
        return {
          ok: true,
          pockets: checkAnswer(submitted.input, seen, input.mode),
          cards: seen,
        };
      }

      if (calls.length === 0) {
        /* Finished without answering: one reminder, appended, then give up. */
        if (turn >= budget.turns - 1) break;
        messages.push({
          role: "user",
          content: [
            { type: "text", text: "Please call submit_page with your answer now." },
          ],
        });
        continue;
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const call of calls) {
        const args = (call.input ?? {}) as Record<string, unknown>;
        if (call.name === "search_cards") {
          searches += 1;
          if (searches > budget.searches) {
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: "Search limit reached. Decide with what you have and submit.",
            });
            continue;
          }
          const game = SCAN_GAMES.includes(args.game as ScanGame)
            ? (args.game as ScanGame)
            : null;
          if (!game) {
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: `Unknown game. Use one of: ${SCAN_GAMES.join(", ")}.`,
              is_error: true,
            });
            continue;
          }
          const query = asText(args.query);
          const found = await findScanned(
            {
              found: true,
              game,
              name: query,
              englishName: query,
              number: asText(args.number),
              setCode: asText(args.set_code),
            },
            12,
          );
          for (const match of found) seen.set(match.card.id, match.card);
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content:
              found.length === 0
                ? "No cards found. Try the English name, part of the name, or the number."
                : JSON.stringify(
                    found.map(({ card }) => ({
                      card_id: card.id,
                      name: card.exactName,
                      number: card.canonicalCardNumber,
                      printings: card.printings.slice(0, 8).map((printing) => ({
                        printing_id: printing.id,
                        set_code: printing.setCode,
                        set_name: printing.setName,
                        label: printing.printingLabel,
                        rarity: printing.rarity,
                        variant: printing.variantType,
                      })),
                    })),
                  ),
          });
          continue;
        }

        if (call.name === "view_card") {
          views += 1;
          const card = seen.get(asText(args.card_id));
          if (!card) {
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: "That card was not in your search results. Search for it first.",
              is_error: true,
            });
            continue;
          }
          if (views > budget.views) {
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              content: "Picture limit reached. Decide with what you have and submit.",
            });
            continue;
          }
          const printing =
            card.printings.find((each) => each.id === asText(args.printing_id)) ??
            card.printings.find((each) => each.imageUrl) ??
            null;
          const picture = await cardImage(printing?.imageUrl ?? null);
          const caption = [card.exactName, card.canonicalCardNumber, printing?.setName]
            .filter(Boolean)
            .join(" · ");
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: picture
              ? [{ type: "text", text: caption }, picture]
              : `${caption}. No picture is available for this card.`,
          });
          continue;
        }

        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: "Unknown tool.",
          is_error: true,
        });
      }
      messages.push({ role: "user", content: results });
    }
    return { ok: false, reason: "timeout" };
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error(
        "Page agent read failed",
        error.status,
        error.name,
        withoutKeys(error.message),
      );
    } else {
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      console.error("Page agent read failed", name, withoutKeys(message));
      if (name === "TimeoutError" || name === "AbortError") {
        return { ok: false, reason: "timeout" };
      }
    }
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * The submitted answer, held to what the run actually found: a card it
 * never searched up, or a printing that is not that card's, becomes an
 * unread pocket for the player to find. Every slot answers once.
 */
export function checkAnswer(
  raw: unknown,
  seen: Map<string, CardResult>,
  mode: "page" | "card",
): AgentPocket[] {
  const count = mode === "page" ? 9 : 1;
  const given = Array.isArray((raw as { pockets?: unknown })?.pockets)
    ? ((raw as { pockets: unknown[] }).pockets as Record<string, unknown>[])
    : [];
  const bySlot = new Map<number, Record<string, unknown>>();
  for (const entry of given) {
    const slot = Number(entry?.slot);
    if (Number.isInteger(slot) && slot >= 0 && slot < count && !bySlot.has(slot)) {
      bySlot.set(slot, entry);
    }
  }

  return Array.from({ length: count }, (_, slot): AgentPocket => {
    const entry = bySlot.get(slot);
    const note = asText(entry?.note);
    const readName = asText(entry?.read_name);
    const readNumber = asText(entry?.read_number);
    const base = { slot, alternatives: [], note, readName, readNumber };
    if (!entry) {
      return { ...base, state: "unsure", cardId: null, printingId: null, sure: false };
    }
    if (entry.state === "empty") {
      return { ...base, state: "empty", cardId: null, printingId: null, sure: true };
    }
    const card = seen.get(asText(entry.card_id));
    const alternatives = (Array.isArray(entry.alternatives) ? entry.alternatives : [])
      .map(asText)
      .filter((id) => seen.has(id) && id !== card?.id)
      .slice(0, 3);
    if (!card) {
      return {
        ...base,
        alternatives,
        state: "unsure",
        cardId: null,
        printingId: null,
        sure: false,
      };
    }
    const printingId = card.printings.some((each) => each.id === entry.printing_id)
      ? (entry.printing_id as string)
      : null;
    return {
      ...base,
      alternatives,
      state: "card",
      cardId: card.id,
      printingId,
      sure: entry.sure === true && entry.state === "card",
    };
  });
}
