import { DoorOpen, Printer } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { JoinPoster } from "./join-poster";
import { setWalkInAction } from "@/lib/events/actions";

/**
 * The sheet a store prints once.
 *
 * Everything here is a Server Component: each control is its own form posting
 * to a Server Action, so the page works before hydration and ships no
 * JavaScript beyond the existing print button.
 */

export function WalkInSwitch({
  storeId,
  enabled,
}: {
  storeId: string;
  enabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={enabled ? "accent" : "neutral"}>{enabled ? "On" : "Off"}</Badge>
        <p className="text-text-secondary">
          {enabled
            ? "Anyone who scans the counter code can start trading, whether or not you have an event on."
            : "The counter code only works during events you have opened."}
        </p>
      </div>

      <form action={setWalkInAction}>
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
        <Button type="submit" variant={enabled ? "secondary" : "primary"}>
          {enabled ? "Turn off walk-in trading" : "Turn on walk-in trading"}
        </Button>
      </form>
    </div>
  );
}

export function CounterCode({
  storeId,
  storeName,
  joinCode,
  url,
  qrSvg,
  walkInEnabled,
}: {
  storeId: string;
  storeName: string;
  joinCode: string;
  url: string;
  qrSvg: string;
  walkInEnabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Printer className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-text-primary">Print this once</p>
            <p className="text-text-secondary">
              This code never changes. Put it somewhere players can see it — the
              counter, the door, the end of a table — and leave it there. It opens
              whichever room is running: your event if you have one on, otherwise a
              walk-in room that starts the moment somebody joins.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-border pt-4">
          <DoorOpen className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-text-primary">
              A quiet room closes by itself
            </p>
            <p className="text-text-secondary">
              After a few hours with nobody trading, the walk-in room ends. The next
              person to scan starts a fresh one, so nobody ever arrives to a board of
              last week&rsquo;s requests. You never have to open or close anything.
            </p>
          </div>
        </div>
      </Card>

      {/* No subtitle: a counter sheet is laminated and outlives any date. */}
      <JoinPoster
        kind="counter"
        title={storeName}
        joinCode={joinCode}
        url={url}
        qrSvg={qrSvg}
      />

      <Card className="flex flex-col gap-4">
        <h3 className="font-semibold text-text-primary">Walk-in trading</h3>
        <WalkInSwitch storeId={storeId} enabled={walkInEnabled} />
      </Card>
    </div>
  );
}
