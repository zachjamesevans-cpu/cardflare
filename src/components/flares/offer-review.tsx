"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { MAX_OFFER_MESSAGE } from "@/lib/matching/schema";

/**
 * "I have these": the review before an offer goes.
 *
 * One sheet for both places an offer starts, a hunt on a profile and a
 * post in the Feed. The caller owns the selection and the server call;
 * this lists what was picked, takes the one optional message, and says
 * what happened - including which cards were answered while the offer
 * was being written, by name, so nobody wonders why two of three went.
 */

export interface OfferLine {
  /** What the server keys the line by: the Flare's id. */
  key: string;
  name: string;
  imageUrl: string | null;
  printingLabel: string | null;
  quantity: number;
}

export interface OfferOutcome {
  ok: boolean;
  message?: string;
  offered?: number;
  /** Keys refused by the server. */
  refused: string[];
}

/** "2 cards selected · 3 copies". Cards and copies stay two numbers. */
export function selectionSummary(cards: number, copies: number): string {
  return `${cards} ${cards === 1 ? "card" : "cards"} selected · ${copies} ${
    copies === 1 ? "copy" : "copies"
  }`;
}

/**
 * The selection a list of offerable cards builds up: which lines, and
 * how many copies of each, never above what the line allows.
 */
export function useSelection(maxFor: (key: string) => number) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const keys = Object.keys(selected);
  return {
    selected,
    has: (key: string) => key in selected,
    quantity: (key: string) => selected[key] ?? 0,
    toggle: (key: string) =>
      setSelected((current) => {
        if (key in current) {
          const rest = { ...current };
          delete rest[key];
          return rest;
        }
        return { ...current, [key]: Math.min(1, Math.max(1, maxFor(key))) };
      }),
    setQuantity: (key: string, value: number) =>
      setSelected((current) => ({
        ...current,
        [key]: Math.max(1, Math.min(maxFor(key), Math.round(value))),
      })),
    clear: () => setSelected({}),
    count: keys.length,
    copies: keys.reduce((sum, key) => sum + (selected[key] ?? 0), 0),
  };
}

export function OfferReview({
  open,
  onClose,
  lines,
  onSubmit,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  lines: OfferLine[];
  onSubmit: (message: string) => Promise<OfferOutcome>;
  /** Called once an offer landed, so the caller can clear its selection. */
  onSent: () => void;
}) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ offered: number; refused: string[] } | null>(null);
  const [pending, start] = useTransition();

  const copies = lines.reduce((sum, line) => sum + line.quantity, 0);
  const refusedNames = (keys: string[]) =>
    keys
      .map((key) => lines.find((line) => line.key === key)?.name)
      .filter((name): name is string => Boolean(name));

  const close = () => {
    setError(null);
    setSent(null);
    setMessage("");
    onClose();
  };

  const send = () => {
    if (pending || lines.length === 0) return;
    setError(null);
    start(async () => {
      const outcome = await onSubmit(message);
      if (!outcome.ok) {
        const names = refusedNames(outcome.refused);
        setError(
          names.length > 0
            ? `${outcome.message ?? "Could not send the offer."} ${names.join(", ")} ${
                names.length === 1 ? "was" : "were"
              } answered while you were writing.`
            : (outcome.message ?? "Could not send the offer."),
        );
        return;
      }
      setSent({ offered: outcome.offered ?? lines.length, refused: outcome.refused });
      onSent();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title={sent ? "Offer sent" : "Review your offer"}
      footer={
        sent ? (
          <Button type="button" onClick={close} className="w-full">
            Done
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-text-muted tabular-nums">
              {selectionSummary(lines.length, copies)}
            </p>
            <Button
              type="button"
              onClick={send}
              disabled={pending || lines.length === 0}
              className="w-full"
            >
              {pending ? "Sending…" : "Send offer"}
            </Button>
          </div>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 font-semibold text-accent">
            <Check className="size-5" aria-hidden="true" />
            {sent.offered === 1
              ? "They know you have it."
              : `They know you have ${sent.offered} of these.`}
          </p>
          {sent.refused.length > 0 && (
            <p className="text-sm text-text-secondary">
              {refusedNames(sent.refused).join(", ")}{" "}
              {sent.refused.length === 1 ? "was" : "were"} answered while you were
              writing, so {sent.refused.length === 1 ? "that one" : "those"} did not go.
            </p>
          )}
          <p className="text-sm text-text-secondary">
            Your name is on the offer. Keep an eye on your messages.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {lines.map((line) => (
              <li key={line.key} className="flex items-center gap-3">
                <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated">
                  {line.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={line.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {line.name}
                  </span>
                  <span className="truncate text-xs text-text-muted">
                    {line.printingLabel ?? "Any printing"}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-accent tabular-nums">
                  {line.quantity} {line.quantity === 1 ? "copy" : "copies"}
                </span>
              </li>
            ))}
          </ul>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">
              Message <span className="font-normal text-text-muted">Optional</span>
            </span>
            <Textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              maxLength={MAX_OFFER_MESSAGE}
              rows={2}
              placeholder="Where to find you, or what you would take for them"
              className="min-h-0"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
