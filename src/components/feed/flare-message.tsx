"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send } from "lucide-react";

import { cn } from "@/lib/cn";
import { openThreadAction } from "@/lib/local/actions";
import { MESSAGE_MAX_LENGTH } from "@/lib/local/shared";

/**
 * The paper plane on a Flare: the first message to its poster.
 *
 * Sending it is what creates the conversation - the same action the
 * Messages page and a nearby match use, landing on the same thread -
 * so the Feed never grows a second messaging system. The box opens
 * with a line already in it naming the card.
 */
export interface MessageTarget {
  flareId: string;
  cardName: string;
  posterName: string;
}

export function FlareMessage({
  target,
  count,
}: {
  target: MessageTarget;
  /** Hands raised on the post, drawn beside the plane. */
  count: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(`About your ${target.cardName}: `);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () => {
    const text = body.trim();
    if (!text || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await openThreadAction(target.flareId, text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/local?thread=${encodeURIComponent(result.threadId)}`);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`Message ${target.posterName}`}
        className={cn(
          "flex cursor-pointer items-center gap-1.5 text-sm font-medium transition-colors",
          open ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
        )}
      >
        <Send className="size-5" aria-hidden="true" />
        <span className="tabular-nums">{count}</span>
      </button>

      {open && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          className="flex basis-full flex-col gap-2 border-t border-border pt-3"
        >
          <p className="text-sm font-semibold text-text-primary">
            Message {target.posterName}
          </p>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={MESSAGE_MAX_LENGTH}
            rows={2}
            autoFocus
            aria-label="Your message"
            className="w-full resize-none rounded-[var(--radius-control)] border border-border bg-canvas px-3 py-2 text-sm text-text-primary placeholder:text-text-muted hover:border-border-strong focus:border-accent focus:outline-none"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-text-muted">
              Goes to {target.posterName} only. Meet at the store.
            </p>
            <button
              type="submit"
              disabled={pending || body.trim().length === 0}
              className="shrink-0 cursor-pointer rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-hover disabled:cursor-default disabled:opacity-60"
            >
              {pending ? "Sending…" : "Send"}
            </button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      )}
    </>
  );
}
