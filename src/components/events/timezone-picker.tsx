import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { setStoreTimeZoneAction } from "@/lib/events/actions";
import { knownTimeZones, zoneAbbreviation } from "@/lib/time/zone";

/**
 * Where the store is, which is the only way an event time means anything.
 *
 * Until a store sets this its events are read and written in UTC, which is the
 * column default and exactly what happened before — so nothing moves under an
 * existing store until it says where it is.
 *
 * A Server Component: one form posting to a Server Action, no client
 * JavaScript. The whole IANA list is rendered as a plain `<select>`, which a
 * phone turns into a native scroll wheel with type-ahead — better than any
 * combobox that could be built here, and it works before hydration.
 */
export function TimeZonePicker({
  storeId,
  timeZone,
}: {
  storeId: string;
  timeZone: string;
}) {
  // Passing the current zone guarantees it is in the list, so opening the
  // form can never silently reselect something else.
  const zones = knownTimeZones(timeZone);
  const now = new Date();

  // Unset stores sit on UTC, and it is worth naming that rather than letting
  // it look like a considered choice.
  const isDefault = timeZone === "UTC";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Your timezone</p>
          <p className="text-sm text-text-secondary">
            {isDefault
              ? "Set this and event times will read the way you say them out loud. Until then they are shown in UTC."
              : `Event times are read and shown in ${zoneAbbreviation(now, timeZone)}.`}
          </p>
        </div>
      </div>

      <form action={setStoreTimeZoneAction} className="flex flex-col gap-4">
        <input type="hidden" name="storeId" value={storeId} />

        <Field name="timezone" label="Timezone">
          <Select {...fieldIds("timezone")} name="timezone" defaultValue={timeZone}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <Button type="submit" variant={isDefault ? "primary" : "secondary"}>
            Save timezone
          </Button>
        </div>
      </form>

      {/*
       * Said plainly, because it is the question a store will have and the
       * answer is reassuring: an event already created keeps the instant it
       * was created at. Only what is typed from now on is affected.
       */}
      <p className="text-sm text-text-muted">
        Changing this does not move events you have already created.
      </p>
    </Card>
  );
}
