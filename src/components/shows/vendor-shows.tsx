import { CalendarClock, MapPin } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/controls";
import { formatEventWindow } from "@/lib/events/format";
import { claimBoothAction, leaveShowAction } from "@/lib/shows/actions";
import type { ShowRow } from "@/lib/supabase/types";

/**
 * "I'll be there — booth A12."
 *
 * The vendor's half of a show's roster. Claiming again moves the booth
 * (tables get shuffled the morning of), and leaving takes them off the
 * attendee search entirely. Inventory is untouched either way: stock is a
 * fact about the vendor, presence is a fact about the weekend.
 */
export function VendorShows({
  storeId,
  shows,
  booths,
}: {
  storeId: string;
  shows: ShowRow[];
  booths: Map<string, string>;
}) {
  if (shows.length === 0) {
    return (
      <Card className="py-8 text-center text-text-secondary">
        No upcoming shows yet. When one is announced it appears here, and you can claim
        your booth.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {shows.map((show) => {
        const booth = booths.get(show.id);
        const where = [show.city, show.region].filter(Boolean).join(", ");

        return (
          <Card key={show.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className="font-semibold text-text-primary">{show.name}</p>
              {booth && <Badge>Booth {booth}</Badge>}
            </div>

            <div className="flex flex-col gap-1 text-sm text-text-secondary">
              <span className="flex items-center gap-2">
                <CalendarClock
                  className="size-4 shrink-0 text-text-muted"
                  aria-hidden="true"
                />
                {formatEventWindow(show.starts_at, show.ends_at, show.timezone)}
              </span>
              {where && (
                <span className="flex items-center gap-2">
                  <MapPin
                    className="size-4 shrink-0 text-text-muted"
                    aria-hidden="true"
                  />
                  {where}
                </span>
              )}
            </div>

            <form
              action={claimBoothAction}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="storeId" value={storeId} />
              <input type="hidden" name="showId" value={show.id} />
              <TextInput
                name="booth"
                defaultValue={booth ?? ""}
                placeholder="Booth — e.g. A12"
                maxLength={12}
                required
                aria-label={`Your booth at ${show.name}`}
                className="min-w-0 flex-1 basis-40 sm:max-w-48"
              />
              <Button type="submit" variant={booth ? "secondary" : "primary"} size="sm">
                {booth ? "Move booth" : "Claim booth"}
              </Button>
            </form>

            {booth && (
              <form action={leaveShowAction}>
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="showId" value={show.id} />
                <button
                  type="submit"
                  className="text-sm text-text-muted underline underline-offset-4 transition-colors hover:text-text-secondary"
                >
                  I&rsquo;m not coming after all
                </button>
              </form>
            )}
          </Card>
        );
      })}
    </div>
  );
}
