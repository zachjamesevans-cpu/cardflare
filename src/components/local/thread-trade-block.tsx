"use client";

import { useState } from "react";
import { Handshake } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import {
  pickBasePrinting,
  printingLabel,
  type CardPrinting,
  type CardResult,
} from "@/lib/cards/schema";
import { cn } from "@/lib/cn";
import { THREAD_TRADE_QUANTITY_MAX } from "@/lib/trades/thread-trade-copy";
import type { ProposeInput, ThreadTrade } from "@/lib/trades/thread-trades";

/**
 * "We traded", inside a conversation.
 *
 * The audit: "zero confirmed trades in 30 days suggests confirming is
 * too hard, and confirming is the only way to earn Embers." A trade
 * could only be written in a room. Now either side of a conversation
 * says it here, the other side is asked, and the second tap pays both.
 *
 * Three states, drawn from the newest trade the thread carries:
 *
 *   a) nothing pending: the last settled trade as one muted line, and
 *      the form once "We traded" is tapped;
 *   b) pending, and the viewer said it: a card that says so and waits;
 *   c) pending, and the viewer is the one asked: the same card with
 *      "Yes, we did" and "No".
 *
 * Prop-driven on purpose. The screen that hosts it owns the action
 * calls and the reload; this component only knows what to draw and
 * what to say, so it can be rendered in every state without a
 * database behind it. The app's thread screen draws the same three
 * states with the same words.
 */

const LABEL = "text-sm font-medium text-text-secondary";

type Direction = "got" | "gave";

export function ThreadTradeBlock({
  trade,
  kind,
  cardName,
  withName,
  imagesEnabled,
  playerGames,
  onPropose,
  onAnswer,
  pending,
  error,
  composing,
  onComposingChange,
}: {
  trade: ThreadTrade | null;
  kind: "flare" | "want" | "direct";
  /** The conversation's card, when it has one. */
  cardName: string | null;
  withName: string | null;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  onPropose: (input: ProposeInput) => void;
  onAnswer: (tradeId: string, yes: boolean) => void;
  pending: boolean;
  error: string | null;
  /**
   * Whether the form is open. The thread screen controls this so "We
   * traded" can live in the chat header's ⋯ menu; left out, the block
   * keeps the state itself and draws the trigger.
   */
  composing?: boolean;
  onComposingChange?: (open: boolean) => void;
}) {
  const [ownComposing, setOwnComposing] = useState(false);
  const controlled = onComposingChange !== undefined;
  const open = controlled ? (composing ?? false) : ownComposing;
  const setOpen = (next: boolean) => {
    if (controlled) onComposingChange(next);
    else setOwnComposing(next);
  };

  const they = withName ?? "They";

  /* b) The viewer's own word, waiting on the other side's. */
  if (trade && trade.status === "pending" && trade.saidByYou) {
    return (
      <TradeCard>
        <p className="text-sm font-semibold text-text-primary">
          You said you traded {trade.cardName}.
        </p>
        <p className="text-xs text-text-muted">
          Waiting for {they} to confirm. Then you both earn Embers.
        </p>
        {error && <ErrorLine>{error}</ErrorLine>}
      </TradeCard>
    );
  }

  /* c) The other side's word, and the viewer's answer is what it waits for. */
  if (trade && trade.status === "pending" && trade.awaitingYou) {
    return (
      <TradeCard>
        <p className="text-sm font-semibold text-text-primary">
          {they} says you traded {trade.cardName}.
        </p>
        {trade.quantity > 1 && (
          <p className="text-sm text-text-secondary tabular-nums">
            {trade.quantity} copies
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => onAnswer(trade.id, true)}
            disabled={pending}
          >
            {pending ? "Confirming…" : "Yes, we did"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onAnswer(trade.id, false)}
            disabled={pending}
          >
            No
          </Button>
        </div>
        <p className="text-xs text-text-muted">Yes pays you both Embers.</p>
        {error && <ErrorLine>{error}</ErrorLine>}
      </TradeCard>
    );
  }

  /* a) Nothing pending: what was settled last, and the form on request. */
  const settled = trade && trade.status !== "pending" ? trade : null;

  return (
    <div className="flex flex-col gap-2">
      {settled && (
        <p className="text-xs text-text-muted">{settledLine(settled, they)}</p>
      )}
      {open ? (
        <ProposeForm
          kind={kind}
          cardName={cardName}
          imagesEnabled={imagesEnabled}
          playerGames={playerGames}
          onPropose={onPropose}
          onCancel={() => setOpen(false)}
          pending={pending}
          error={error}
        />
      ) : (
        !controlled && (
          <TradeTrigger onClick={() => setOpen(true)} className="self-start" />
        )
      )}
    </div>
  );
}

/**
 * The text button that opens the form, when the block keeps its own
 * state. The thread screen offers "We traded" from its ⋯ instead.
 */
export function TradeTrigger({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("text-xs text-text-muted hover:text-text-secondary", className)}
    >
      We traded
    </button>
  );
}

function settledLine(trade: ThreadTrade, they: string): string {
  switch (trade.status) {
    case "confirmed":
      return `Traded ${trade.cardName}. Both confirmed.`;
    case "late":
      return `Traded ${trade.cardName}. ${they} never confirmed.`;
    case "declined":
      return trade.saidByYou
        ? `${they} said that trade did not happen.`
        : "You said that trade did not happen.";
    default:
      return "";
  }
}

/**
 * The form. A thread with a card names it and asks only how many; a
 * direct message asks which card and which way it went, the same two
 * controls the log-trade form draws.
 */
function ProposeForm({
  kind,
  cardName,
  imagesEnabled,
  playerGames,
  onPropose,
  onCancel,
  pending,
  error,
}: {
  kind: "flare" | "want" | "direct";
  cardName: string | null;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  onPropose: (input: ProposeInput) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}) {
  const direct = kind === "direct";
  const [direction, setDirection] = useState<Direction>("got");
  const [card, setCard] = useState<{
    card: CardResult;
    printing: CardPrinting | null;
  } | null>(null);
  const [quantity, setQuantity] = useState(1);

  const ready = !direct || card !== null;

  const submit = () => {
    if (pending || !ready) return;
    if (direct) {
      onPropose({
        cardId: card?.card.id ?? null,
        printingId: card?.printing?.id ?? null,
        quantity,
        got: direction === "got",
      });
    } else {
      onPropose({ quantity });
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-3">
      {direct ? (
        <>
          <div className="flex flex-col gap-2">
            <p className={LABEL}>Card</p>
            {card ? (
              <ChosenCard
                card={card.card}
                printing={card.printing}
                imagesEnabled={imagesEnabled}
                onChange={() => setCard(null)}
              />
            ) : (
              <CardSearch
                imagesEnabled={imagesEnabled}
                playerGames={playerGames}
                onSelect={(picked, printing) =>
                  setCard({ card: picked, printing: printing ?? null })
                }
              />
            )}
          </div>

          <div
            role="radiogroup"
            aria-label="Which way the card went"
            className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-canvas p-1"
          >
            {(
              [
                ["got", "I got it"],
                ["gave", "I gave it"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={direction === value}
                onClick={() => setDirection(value)}
                className={cn(
                  "cursor-pointer rounded-[8px] py-2 text-sm font-semibold transition-colors",
                  direction === value
                    ? "bg-accent text-accent-contrast"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-text-primary">
          Traded: <span className="font-semibold">{cardName ?? "this card"}</span>
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className={LABEL}>Copies</p>
        <Stepper
          value={quantity}
          min={1}
          max={THREAD_TRADE_QUANTITY_MAX}
          onChange={setQuantity}
          label="copies"
          disabled={pending}
        />
      </div>

      <p className="text-xs text-text-muted">
        They confirm on their side and you both earn Embers.
      </p>

      {error && <ErrorLine>{error}</ErrorLine>}

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={submit} disabled={pending || !ready}>
          {pending ? "Marking…" : "Mark as traded"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="text-sm font-semibold text-text-secondary hover:text-text-primary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The picked card as a row, with the way to pick again. */
function ChosenCard({
  card,
  printing,
  imagesEnabled,
  onChange,
}: {
  card: CardResult;
  printing: CardPrinting | null;
  imagesEnabled: boolean;
  onChange: () => void;
}) {
  const art = printing ?? pickBasePrinting(card.printings, card.exactName);
  const label = printing ? printingLabel(printing, card.exactName) : "Any printing";

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-2.5">
      <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-surface">
        {imagesEnabled && art?.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={art.imageUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-text-primary">
          {card.exactName}
        </span>
        <span className="truncate font-mono text-xs text-text-muted">
          {card.canonicalCardNumber}
          {label ? ` · ${label}` : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 cursor-pointer text-sm font-semibold text-accent hover:underline"
      >
        Change
      </button>
    </div>
  );
}

/** The pending states' card: an accent handshake beside the words. */
function TradeCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
        <Handshake className="size-4 text-accent" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="text-sm text-danger">
      {children}
    </p>
  );
}
