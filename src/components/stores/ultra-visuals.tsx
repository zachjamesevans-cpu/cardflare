import { PackageSearch } from "lucide-react";

import { ControlPanel } from "@/components/event-hub/control-panel";
import { PhoneFrame, TvFrame } from "@/components/stores/device-frames";
import { Card } from "@/components/ui/card";
import { demoDisplayPayload, demoNow } from "@/lib/event-hub/demo";
import { siteUrl } from "@/lib/site";

/**
 * The pictures on the store page, each of them the real thing.
 *
 * The founder: "better visuals / renders for the cardflare ultra page
 * so people can better visualize what's going on." The television is
 * the display component on a sample night; the phone is the control
 * panel on the same night, between rounds, with Auto Mode's cockpit
 * open. Both count in real time.
 */

/** The wall during a round: the clock, the Flare, the code. */
export function FlareCastPreview() {
  return (
    <TvFrame
      scene="focus"
      label="FlareCast on the wall during round 3: the clock, what the room is hunting, and the code to scan in."
    />
  );
}

/** Between rounds: the wall's countdown and the organizer's phone. */
export function AutoModePreview() {
  const now = demoNow();
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.6fr_1fr]">
      <TvFrame
        scene="intermission"
        label="Time was called 45 seconds ago. The wall counts down to round 4 while pairings go up."
      />
      <PhoneFrame label="The organizer's phone at the same moment: hold, add two minutes, or start now.">
        <ControlPanel
          initial={demoDisplayPayload("intermission", now, `${siteUrl()}/ultra`)}
          token={null}
          demo
        />
      </PhoneFrame>
    </div>
  );
}

/** The inventory line the console shows after a TCGplayer upload. */
export function InventoryPreview() {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <PackageSearch className="size-5 text-accent" aria-hidden="true" />
        <p className="text-sm text-text-secondary">
          <strong className="font-semibold text-text-primary">1,284</strong> cards
          synced · updated tonight, 6:40 PM · 12 lines not recognised
        </p>
        <span className="rounded-full border border-border bg-elevated px-2 py-0.5 text-xs font-semibold text-text-secondary">
          counter search on
        </span>
      </div>
      <p className="text-sm text-text-muted">
        What your console says after one upload. From then on, a Flare for a card in the
        file carries a &ldquo;Store may have&rdquo; band on the wall and in the room, as
        on the Zoro above.
      </p>
    </Card>
  );
}
