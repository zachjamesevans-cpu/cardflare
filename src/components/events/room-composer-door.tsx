"use client";

import { useState, type ReactNode } from "react";
import { Flame, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The composer's door in a room.
 *
 * The full composer is a screen's worth of controls, and a room page
 * is for seeing the room. The founder, on seeing the composer open at
 * the top of the room: "Someone should not open the room page and see
 * this massive search thing taking up the full page." So the room
 * shows one button, "Post a Flare". The composer opens in place when
 * it is pressed and folds away again from its own close.
 *
 * One button and nothing beside it. The open-to-any-trade row rides
 * inside the composer, at its foot, where the page passes it as the
 * composer's `footer`: "No need for a full block just to ask that."
 * A guest has no composer and so no door; their toggle sits at the
 * foot of the board card instead.
 *
 * `composer` is rendered by the server and passed in, so this switch
 * stays a switch.
 */
export function RoomComposerDoor({
  eventName,
  storeName,
  composer,
}: {
  eventName: string;
  storeName: string;
  /** The composer, with the open-to-trades toggle already in its foot. */
  composer: ReactNode;
}) {
  const [open, setOpen] = useState(false);

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
