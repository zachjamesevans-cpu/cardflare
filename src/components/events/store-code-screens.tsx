import Link from "next/link";

import { Card } from "@/components/ui/card";
import type { EarlyBoard } from "@/lib/events/schema";
import { JoinEventForm } from "./join-event-form";

/** "Wednesday's board is already taking Flares" — the pinned link's payoff. */
function EarlyBoardCard({ board }: { board: EarlyBoard }) {
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(board.startsAt));

  return (
    <Card className="flex flex-col gap-1 border-accent/30">
      <h2 className="font-semibold text-text-primary">
        {board.name} is taking Flares early
      </h2>
      <p className="text-sm text-text-secondary">
        The board for {day} is already open. Post what you&rsquo;re hunting now, so
        people know what to bring from home.
      </p>
      <Link
        href={`/e/${board.code}`}
        className="text-sm font-medium text-accent underline-offset-4 hover:underline"
      >
        Open {day}&rsquo;s board →
      </Link>
    </Card>
  );
}

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
  earlyBoard,
}: {
  storeName: string;
  code: string;
  knownAs?: string | null;
  earlyBoard?: EarlyBoard | null;
}) {
  return (
    <>
      <Card className="flex flex-col gap-1">
        <p className="text-sm font-medium text-accent">{storeName}</p>
        <h1 className="text-2xl font-bold tracking-tight text-text-primary">
          Trade here today
        </h1>
        <p className="text-text-secondary">
          Nobody is trading yet. Join and you will be the first, and anyone who scans
          this code after you lands in the same room.
        </p>
      </Card>

      {earlyBoard && <EarlyBoardCard board={earlyBoard} />}

      <Card>
        <JoinEventForm code={code} knownAs={knownAs ?? undefined} />
      </Card>
    </>
  );
}

/** The store has walk-in trading switched off and has no event running. */
export function StoreQuiet({
  storeName,
  earlyBoard,
}: {
  storeName: string;
  earlyBoard?: EarlyBoard | null;
}) {
  return (
    <>
      <Card className="flex flex-col gap-2">
        <p className="text-sm font-medium text-accent">{storeName}</p>
        <h1 className="text-xl font-bold text-text-primary">
          No trading room right now
        </h1>
        <p className="text-text-secondary">
          This store opens a room for its events. Ask at the counter when the next one
          is, and scan this code again then.
        </p>
      </Card>

      {earlyBoard && <EarlyBoardCard board={earlyBoard} />}
    </>
  );
}
