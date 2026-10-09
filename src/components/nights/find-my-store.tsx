"use client";

import { useState } from "react";
import Link from "next/link";
import { LocateFixed, Loader2 } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { storeHereAction } from "@/lib/events/store-day-actions";
import {
  FIND_MY_STORE,
  JOIN_THE_ROOM,
  LOCATION_DENIED,
  NO_STORE_HERE,
  NOT_NOW,
  youreAtLine,
} from "@/lib/events/store-day-rules";
import type { StoreHere } from "@/lib/events/store-days";

/**
 * Find the store I'm in: the website's half of "you're here".
 *
 * The app offers the room when it opens at a store, if the phone has
 * already said it may know where it is. A browser cannot be asked
 * without a prompt, so on the website it is a button, and the position
 * is read only on the tap, sent once, and never kept. A store found is
 * the same banner the app shows, its Join the room going to the
 * counter's own door; Not now puts it away. Joining is always a tap.
 */
export function FindMyStore() {
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState<StoreHere | null>(null);
  const [line, setLine] = useState<string | null>(null);

  const find = () => {
    if (looking) return;
    setLine(null);
    setFound(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLine(LOCATION_DENIED);
      return;
    }
    setLooking(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        storeHereAction(position.coords.latitude, position.coords.longitude)
          .then((store) => {
            if (store) setFound(store);
            else setLine(NO_STORE_HERE);
          })
          .catch(() => setLine(NO_STORE_HERE))
          .finally(() => setLooking(false));
      },
      () => {
        setLooking(false);
        setLine(LOCATION_DENIED);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  if (found) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] border border-accent/40 bg-accent/10 px-3 py-2"
      >
        <p className="min-w-0 text-sm font-semibold text-text-primary">
          {youreAtLine(found.storeName)}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setFound(null)}
            className={buttonStyles("ghost", "sm")}
          >
            {NOT_NOW}
          </button>
          <Link href={`/e/${found.code}`} className={buttonStyles("primary", "sm")}>
            {JOIN_THE_ROOM}
          </Link>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={find}
        disabled={looking}
        className={cn(buttonStyles("ghost", "sm"), "self-start")}
      >
        {looking ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <LocateFixed className="size-4" aria-hidden="true" />
        )}
        {FIND_MY_STORE}
      </button>
      {line && (
        <p role="status" className="text-xs text-text-secondary">
          {line}
        </p>
      )}
    </div>
  );
}
