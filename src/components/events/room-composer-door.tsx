"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { FlareFab } from "@/components/events/flare-fab";
import { Button } from "@/components/ui/button";

/**
 * The composer's door in a room: the floating "+ Flare" button, and the
 * composer it opens in place.
 *
 * The full composer is a screen's worth of controls, and a room page
 * is for seeing the room. The founder, on seeing the composer open at
 * the top of the room: "Someone should not open the room page and see
 * this massive search thing taking up the full page." And then, on
 * the full-width lime bar that replaced it: "too visually dominant".
 * So the trigger is the small floating button, bottom right, and the
 * composer opens where this door sits (near the top of the page,
 * scrolled to) and folds away again from its own close.
 *
 * Nothing beside it. The open-to-any-trade row rides inside the
 * composer, at its foot, where the page passes it as the composer's
 * `footer`. A guest has no composer and so no door; their toggle sits
 * at the foot of the board instead.
 *
 * `composer` is rendered by the server and passed in, so this switch
 * stays a switch.
 */
export function RoomComposerDoor({
  composer,
}: {
  /** The composer, with the open-to-trades toggle already in its foot. */
  composer: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  /* The button floats at the foot of the screen and the composer opens
     near the top of the page, so the page comes to it. */
  useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [open]);

  if (!open) return <FlareFab onOpen={() => setOpen(true)} />;

  return (
    <div ref={panel} className="relative flex scroll-mt-4 flex-col gap-4">
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
