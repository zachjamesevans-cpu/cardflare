"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";

import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { Stepper } from "@/components/ui/stepper";
import { selectionSummary } from "@/lib/feed/offer-copy";
import { MAX_OFFER_MESSAGE } from "@/lib/matching/schema";

/**
 * "I have these": the review before an offer goes.
 *
 * One sheet for every place an offer starts: the card viewer, a post's
 * full list and a hunt on a profile. The caller owns the selection and
 * the server call; this lists what was picked, takes the one optional
 * message, and says what happened - including which cards could not
 * be taken, by name, so nobody wonders why two of three went. The
 * server refuses a card only when it is no longer up; somebody else's
 * offer never gates yours.
 *
 * THE NUMBER IS RAISED HERE. The audit of 2026-10-02: "Viewer offers
 * always send 1 copy... The review shows '1 copy' as plain text, with
 * no stepper." So every line carries a stepper, capped at what the
 * line allows, and a Remove; the viewer's picks come in as one copy
 * each and this is where they become three. Removing the last line
 * closes the review: there is nothing left to review.
 */

export interface OfferLine {
  /** What the server keys the line by: the Flare's id. */
  key: string;
  name: string;
  imageUrl: string | null;
  printingLabel: string | null;
  quantity: number;
  /** The most the line allows: the card's remaining, or its quantity. */
  max: number;
}

export interface OfferOutcome {
  ok: boolean;
  message?: string;
  offered?: number;
  /** Keys refused by the server. */
  refused: string[];
}

/**
 * The selection a list of offerable cards builds up: which lines, and
 * how many copies of each, never above what the line allows. The
 * summary it prints is `selectionSummary` in lib/feed/offer-copy, a
 * plain module, so the server-rendered card can say the same words.
 */
export function useSelection(maxFor: (key: string) => number) {
  const [selected, setSelected] = useState<Record<string, number>>({});
  const keys = Object.keys(selected);
  const remove = (key: string) =>
    setSelected((current) => {
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
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
    remove,
    clear: () => setSelected({}),
    count: keys.length,
    copies: keys.reduce((sum, key) => sum + (selected[key] ?? 0), 0),
  };
}

export function OfferReview({
  open,
  onClose,
  lines,
  onQuantity,
  onRemove,
  onSubmit,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  lines: OfferLine[];
  /** The stepper on a line moved; the caller clamps and keeps it. */
  onQuantity: (key: string, value: number) => void;
  /** A line's Remove was pressed. */
  onRemove: (key: string) => void;
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

  /* Removing the last line closes the review: nothing left to review. */
  const remove = (key: string) => {
    if (lines.length === 1) close();
    onRemove(key);
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
            ? `${outcome.message ?? "Could not send the offer."} ${names.join(", ")} could not be taken.`
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
              {refusedNames(sent.refused).join(", ")} could not be taken, so{" "}
              {sent.refused.length === 1 ? "that one" : "those"} did not go.
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
              <li
                key={line.key}
                className="flex items-stretch gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-3"
              >
                {/* The same row as the full list: art down the left,
                    one aligned column beside it. */}
                <span className="block h-[7.75rem] w-[5.5rem] shrink-0 overflow-hidden rounded-[8px] border border-border bg-elevated">
                  {line.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={line.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {line.name}
                  </span>
                  <span className="truncate text-xs text-text-muted">
                    {line.printingLabel ?? "Any printing"}
                  </span>
                  {/* How many, capped at what the line allows: the card's
                      remaining, or its quantity before anything is found.
                      Remove sits under the stepper, on the same left
                      edge: beside it, it ran off a phone's width. */}
                  <div className="mt-auto flex flex-col items-start gap-1">
                    <Stepper
                      value={line.quantity}
                      min={1}
                      max={line.max}
                      label={`copies of ${line.name}`}
                      onChange={(value) => onQuantity(line.key, value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${line.name}`}
                      onClick={() => remove(line.key)}
                      className="-ml-3 shrink-0"
                    >
                      <X className="size-4" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </div>
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
