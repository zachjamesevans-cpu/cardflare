"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { openThreadAction } from "@/lib/local/actions";

/**
 * "Message", at the end of a "Wanted from you" row.
 *
 * The founder: "I should be able to DM them immediately - with pressing
 * a green DM button on that screen and it'll say something like 'I
 * have (insert card name here)' and it'll open a DM with that card as
 * a convo." So the message icon opens `I have <card>.` as a draft under
 * the row - the same icon and draft as "Wanted near you", so the two
 * cards read as one family - and Send starts the Flare's thread and
 * lands in it. When a conversation on that Flare is already open, the
 * icon is filled and simply opens it: nothing is sent twice.
 *
 * It owns the row it sits in, because a refusal from the server is
 * shown under the row rather than in a toast nobody reads.
 */
export function WantedMessageButton({
  flareId,
  threadId,
  cardName,
  children,
}: {
  flareId: string;
  /** A conversation the viewer already has on this Flare. */
  threadId: string | null;
  cardName: string;
  /** The row's own content: the card, the face and the name. */
  children: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [drafting, setDrafting] = useState(false);
  const [text, setText] = useState(`I have ${cardName}.`);

  const message = () => {
    if (pending) return;
    setError(null);
    if (threadId) {
      router.push(`/local?thread=${encodeURIComponent(threadId)}`);
      return;
    }
    setDrafting(!drafting);
  };

  const send = () => {
    if (pending || !text.trim()) return;
    setError(null);
    start(async () => {
      const result = await openThreadAction(flareId, text.trim());
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`/local?thread=${encodeURIComponent(result.threadId)}`);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {children}
        <button
          type="button"
          onClick={message}
          aria-label={threadId ? "Open the conversation" : `Message about ${cardName}`}
          aria-expanded={threadId ? undefined : drafting}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full border",
            threadId
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border-strong text-accent hover:bg-elevated",
          )}
        >
          <MessageCircle
            className={cn("size-5", threadId && "fill-current")}
            aria-hidden="true"
          />
        </button>
      </div>
      {drafting && !threadId && (
        <div className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={2}
            aria-label="Your message"
            className="w-full resize-none rounded-[var(--radius-control)] border border-border-strong bg-canvas px-3 py-2 text-sm text-text-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !text.trim()}
              onClick={send}
              className={buttonStyles("primary", "sm")}
            >
              {pending ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setDrafting(false)}
              className={buttonStyles("ghost", "sm")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
