"use client";

import { useState, type ReactNode } from "react";
import { Flame, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * The composer's door in a room.
 *
 * The full composer is a screen's worth of controls, and a room page
 * is for seeing the room. The founder, on seeing the composer open at
 * the top of the room: "Someone should not open the room page and see
 * this massive search thing taking up the full page." So the room
 * shows one button. The composer opens in place when it is pressed and
 * folds away again from its own close, and the open-to-any-trade row
 * rides inside it, at the composer's foot, rather than as a block of
 * its own: "No need for a full block just to ask that."
 *
 * A guest has no composer, so the row is all the door holds for them.
 *
 * `composer` and `trades` are rendered by the server and passed in, so
 * this switch stays a switch.
 */
export function RoomComposerDoor({
  eventName,
  storeName,
  composer,
  trades,
}: {
  eventName: string;
  storeName: string;
  /** The composer, when the viewer has an account; null for a guest. */
  composer: ReactNode | null;
  /** The open-to-any-trade row for a guest; a player's sits in the composer. */
  trades: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (!composer) {
    return <Card className="[&>div]:border-t-0 [&>div]:pt-0">{trades}</Card>;
  }

  if (open) {
    return (
      <div className="relative flex flex-col gap-4">
        {composer}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3"
          aria-label="Close the composer"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="lg"
      className="w-full"
      onClick={() => setOpen(true)}
      aria-label={`Post a Flare to ${eventName} at ${storeName}`}
    >
      <Flame className="size-4" aria-hidden="true" />
      Post a Flare
    </Button>
  );
}
