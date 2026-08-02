import { Card } from "@/components/ui/card";
import { JoinEventForm } from "./join-event-form";

/**
 * What a store's counter code shows when it does not lead straight into a
 * busy room.
 *
 * Neither of these is an error, and neither is a 404. The code on the counter
 * is correct in both cases — telling somebody their store's own printed code
 * does not exist would send them to the counter to complain about a sheet that
 * is fine. The store's name is on both screens for exactly that reason: it is
 * the thing that proves the scan worked.
 */

/** Nothing is running, and joining will start it. */
export function StoreLobby({
  storeName,
  code,
  knownAs,
}: {
  storeName: string;
  code: string;
  knownAs?: string | null;
}) {
  return (
    <>
      <Card className="flex flex-col gap-1">
        <p className="text-sm font-medium text-accent">{storeName}</p>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Trade here today
        </h1>
        <p className="text-text-secondary">
          Nobody is trading yet. Join and you will be the first — anyone who scans this
          code after you lands in the same room.
        </p>
      </Card>

      <Card>
        <JoinEventForm code={code} knownAs={knownAs ?? undefined} />
      </Card>
    </>
  );
}

/** The store has walk-in trading switched off and has no event running. */
export function StoreQuiet({ storeName }: { storeName: string }) {
  return (
    <Card className="flex flex-col gap-2">
      <p className="text-sm font-medium text-accent">{storeName}</p>
      <h1 className="text-xl font-bold text-text-primary">No trading room right now</h1>
      <p className="text-text-secondary">
        This store opens a room for its events. Ask at the counter when the next one is,
        and scan this code again then.
      </p>
    </Card>
  );
}
