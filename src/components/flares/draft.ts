import {
  pickBasePrinting,
  type CardPrinting,
  type CardResult,
} from "@/lib/cards/schema";
import { MAX_COPIES } from "@/lib/flares/draft-rules";

/**
 * A Flare draft: what the composer holds until "Post flare".
 *
 * Pure and client-safe, so the composer, the picker and the preview
 * share one shape and one set of rules, and a reload does not lose
 * the draft: it is kept in this browser under DRAFT_KEY, wrapped in
 * try/catch because storage can refuse.
 */

/** Mirrors CAPTION_MAX in lib/flares/publish.ts, which is server-only. */
export const CAPTION_MAX = 280;
export const DRAFT_KEY = "flare-draft";

export interface DraftCard {
  card: CardResult;
  /** Null is any printing. */
  printingId: string | null;
  quantity: number;
}

export type HuntChoice =
  { kind: "none" } | { kind: "existing"; id: string } | { kind: "new"; name: string };

export interface Draft {
  intent: "want" | "showcase";
  /** In order: the first is the cover. */
  cards: DraftCard[];
  caption: string;
  hunt: HuntChoice;
  acceptsTrade: boolean;
  acceptsCash: boolean;
}

export const EMPTY_DRAFT: Draft = {
  intent: "want",
  cards: [],
  caption: "",
  hunt: { kind: "none" },
  acceptsTrade: false,
  acceptsCash: false,
};

export function isEmptyDraft(draft: Draft): boolean {
  return (
    draft.cards.length === 0 &&
    draft.caption.trim().length === 0 &&
    draft.hunt.kind === "none"
  );
}

/**
 * The same CARD again is more copies of it, never a second row: card
 * identity and printing are two things, and the printing is changed
 * on the card's own editor. A tap that carried a printing sets it on a
 * card that had none.
 */
export function addCard(
  cards: DraftCard[],
  card: CardResult,
  printing?: CardPrinting,
): DraftCard[] {
  const index = cards.findIndex((item) => item.card.id === card.id);
  if (index === -1) {
    return [...cards, { card, printingId: printing?.id ?? null, quantity: 1 }];
  }
  return cards.map((item, at) =>
    at === index
      ? {
          ...item,
          quantity: Math.min(MAX_COPIES, item.quantity + 1),
          printingId: item.printingId ?? printing?.id ?? null,
        }
      : item,
  );
}

/** The printing a draft card shows: the chosen one, or the base art. */
export function chosenPrinting(item: DraftCard): CardPrinting | null {
  if (item.printingId) {
    return (
      item.card.printings.find((printing) => printing.id === item.printingId) ?? null
    );
  }
  return pickBasePrinting(item.card.printings, item.card.exactName);
}

export function loadDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || !Array.isArray(parsed.cards)) return null;
    return {
      intent: parsed.intent === "showcase" ? "showcase" : "want",
      cards: parsed.cards.filter((item): item is DraftCard =>
        Boolean(item && typeof item === "object" && item.card && item.card.id),
      ),
      caption: typeof parsed.caption === "string" ? parsed.caption : "",
      hunt:
        parsed.hunt && typeof parsed.hunt === "object" ? parsed.hunt : { kind: "none" },
      acceptsTrade: Boolean(parsed.acceptsTrade),
      acceptsCash: Boolean(parsed.acceptsCash),
    };
  } catch {
    return null;
  }
}

export function saveDraft(draft: Draft): void {
  try {
    if (isEmptyDraft(draft)) window.localStorage.removeItem(DRAFT_KEY);
    else window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* Private mode, or storage refused: the draft lasts the page. */
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Nothing to clear, or nowhere to clear it from. */
  }
}
