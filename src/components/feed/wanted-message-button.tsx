import Link from "next/link";
import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import { cn } from "@/lib/cn";
import { newMessageHref } from "@/lib/nearby/shared";

/**
 * "Message", at the end of a "Wanted from you" row.
 *
 * The founder: "I should be able to DM them immediately - with pressing
 * a green DM button on that screen and it'll say something like 'I
 * have (insert card name here)' and it'll open a DM with that card as
 * a convo." So the message icon opens a new conversation, inbox-style,
 * with "I have <card>. Are you looking to trade for it?" already in the
 * box (/local/new) - the same as "Wanted near you" - and Send starts
 * the Flare's thread. When a conversation on that Flare is already
 * open, the icon is filled and simply opens it: nothing is sent twice.
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
  return (
    <div className="flex items-center gap-3">
      {children}
      <Link
        href={
          threadId
            ? `/local?thread=${encodeURIComponent(threadId)}`
            : newMessageHref({ kind: "flare", id: flareId })
        }
        aria-label={threadId ? "Open the conversation" : `Message about ${cardName}`}
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
      </Link>
    </div>
  );
}
