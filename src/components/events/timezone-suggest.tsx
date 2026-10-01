"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Clock } from "lucide-react";

import { Card } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { setStoreTimeZoneAction } from "@/lib/events/actions";
import { isValidTimeZone, UTC } from "@/lib/time/zone";

/** The browser never changes its zone under a page, so nothing to watch. */
const subscribe = () => () => {};
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone = () => "";

/**
 * The store's zone, offered in one tap.
 *
 * The audit typed "6 PM" into a store still on the UTC default and got
 * a night at 11 AM Pacific. The fix has to be quicker than the mistake:
 * the browser already knows where the owner is sitting, so this reads
 * that zone, checks the runtime knows it, and offers it as a sentence
 * with a button. "Pick another" reveals the full picker (passed in as
 * `picker`, so it stays the Server Component it already is) for the
 * owner setting up from somewhere other than the shop.
 *
 * The zone is read through `useSyncExternalStore` with an empty server
 * snapshot: the server has no browser clock, so rendering it on both
 * sides would be a hydration mismatch. Until the browser's value is in,
 * and when the browser offers nothing usable, the full picker shows on
 * its own.
 */

export function TimezoneSuggest({
  storeId,
  message,
  picker,
}: {
  storeId: string;
  /** Why this is being asked, in one sentence above the offer. */
  message: string;
  /** The full `TimeZonePicker`, rendered by the page. */
  picker: ReactNode;
}) {
  const guess = useSyncExternalStore(subscribe, browserZone, serverZone);
  const mounted = guess !== "";
  const zone = mounted && guess !== UTC && isValidTimeZone(guess) ? guess : null;
  const [pickAnother, setPickAnother] = useState(false);

  const showPicker = mounted && (zone === null || pickAnother);

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 border-accent/50">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-text-primary">{message}</p>
            {mounted && zone && (
              <p className="text-sm text-text-secondary">
                Your store&rsquo;s clock:{" "}
                <strong className="font-semibold text-text-primary">{zone}</strong>
              </p>
            )}
          </div>
        </div>

        {mounted && zone && !pickAnother && (
          <form
            action={setStoreTimeZoneAction}
            className="flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="storeId" value={storeId} />
            <input type="hidden" name="timezone" value={zone} />
            <SubmitButton label="Use this" pendingLabel="Saving…" />
            <button
              type="button"
              onClick={() => setPickAnother(true)}
              className="text-sm text-accent underline-offset-4 hover:underline"
            >
              Pick another
            </button>
          </form>
        )}
      </Card>

      {showPicker && picker}
    </div>
  );
}
