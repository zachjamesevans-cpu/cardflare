import { Sparkles } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The small pitch a guest sees for a free account.
 *
 * The founder: "we need a call to action in the join room / room
 * screen that asks to create their cardflare account. Like a small
 * pitch to get them into the app." It used to be one faint line at the
 * foot of the room, written when accounts were invite-only. Accounts
 * are open now, so this is a card, near the top, saying the one true
 * thing a guest loses: as a guest, the cards they post stay in this
 * room. Both buttons carry the room's address, so signing up or in
 * lands them back on the same board with the seat they already had.
 */
export function AccountPitch({
  next,
  variant,
}: {
  /** The room to come back to, e.g. `/e/MOX7VG`. */
  next: string;
  /** Before joining, or already in as a guest. */
  variant: "join" | "room";
}) {
  const back = encodeURIComponent(next);

  return (
    <Card className="flex flex-col gap-3 border-accent/30">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-[0.16em] text-accent uppercase">
          <Sparkles className="size-3.5" aria-hidden="true" />
          {variant === "room" ? "You're in as a guest" : "Free account"}
        </p>
        <h2 className="text-lg font-bold text-text-primary">
          {variant === "room"
            ? "Keep your cards with you."
            : "Or join with a free account."}
        </h2>
        <p className="text-sm text-text-secondary">
          Your Flares, binder and Embers follow you to every store and show. As a guest,
          they stay in this room.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink
          href={`/signup?next=${back}`}
          size="sm"
          data-analytics-event="room_signup_cta_clicked"
        >
          Create free account
        </ButtonLink>
        <ButtonLink href={`/login?next=${back}`} size="sm" variant="ghost">
          Sign in
        </ButtonLink>
      </div>
    </Card>
  );
}
