"use client";

import { useState } from "react";
import { Loader2, MapPin } from "lucide-react";

import { buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { saveStoreLocationAction } from "@/lib/events/actions";
import {
  PLAN_REFUSALS,
  SET_STORE_LOCATION,
  STORE_LOCATION_HINT,
  STORE_LOCATION_SAVED,
} from "@/lib/events/store-day-rules";

/** When the browser will not say where it is: the console's own words. */
export const STORE_LOCATION_OFF =
  "This browser is not sharing its location. Allow it for cardflare and tap again.";

/**
 * Where the store is, to the metre: the pin "you're here" measures from.
 *
 * One button, pressed once by somebody standing in the shop. The
 * browser is asked on the tap and not before, with high accuracy,
 * because the pin is compared with a phone at the counter rather than
 * with a ZIP code. A store imported with an address already has a rough
 * pin; this is the one that counts.
 */
export function StoreLocationButton({ storeId }: { storeId: string }) {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<{ text: string; ok: boolean } | null>(null);

  const save = () => {
    if (busy) return;
    setLine(null);
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLine({ text: STORE_LOCATION_OFF, ok: false });
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        saveStoreLocationAction(
          storeId,
          position.coords.latitude,
          position.coords.longitude,
        )
          .then((result) =>
            setLine(
              result.ok
                ? { text: STORE_LOCATION_SAVED, ok: true }
                : { text: PLAN_REFUSALS.unavailable, ok: false },
            ),
          )
          .catch(() => setLine({ text: PLAN_REFUSALS.unavailable, ok: false }))
          .finally(() => setBusy(false));
      },
      () => {
        setBusy(false);
        setLine({ text: STORE_LOCATION_OFF, ok: false });
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Location</p>
          <p className="text-sm text-text-secondary">{STORE_LOCATION_HINT}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className={buttonStyles("secondary", "md")}
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {SET_STORE_LOCATION}
        </button>
        {line && (
          <p
            role="status"
            className={line.ok ? "text-sm text-success" : "text-sm text-danger"}
          >
            {line.text}
          </p>
        )}
      </div>
    </Card>
  );
}
