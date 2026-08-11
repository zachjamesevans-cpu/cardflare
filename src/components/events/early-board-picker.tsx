import { Sunrise } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/controls";
import { Field, fieldIds } from "@/components/ui/field";
import { setEarlyBoardAction } from "@/lib/events/actions";

/**
 * How long before doors a scheduled board starts taking Flares.
 *
 * The founder proved the value at a beta by sharing the link hours early:
 * players posted from home and everyone knew what to bring. This makes it
 * the store's own dial. Off exists for the store that finds a pre-filled
 * board confusing at the counter — the switch is theirs, not ours.
 *
 * A Server Component: one form, one action, no client JavaScript — the
 * same shape as the timezone picker above it on the page.
 */

const CHOICES = [
  { hours: 0, label: "Off. Boards open at doors" },
  { hours: 24, label: "The day before (24 hours)" },
  { hours: 48, label: "Two days before (48 hours)" },
  { hours: 72, label: "Three days before (72 hours)" },
  { hours: 168, label: "The whole week (168 hours)" },
];

export function EarlyBoardPicker({
  storeId,
  hours,
}: {
  storeId: string;
  hours: number;
}) {
  // A value set by hand (or by an older default) stays selectable, so
  // opening the form can never silently move it.
  const choices = CHOICES.some((choice) => choice.hours === hours)
    ? CHOICES
    : [...CHOICES, { hours, label: `${hours} hours` }].sort(
        (a, b) => a.hours - b.hours,
      );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Sunrise className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-text-primary">Early boards</p>
          <p className="text-sm text-text-secondary">
            {hours > 0
              ? `Your event boards start taking Flares ${hours} hours before doors, and always by midnight of event day, so players post from home and everyone knows what to bring. Flares from anyone who never shows are cleared when the night ends.`
              : "Your event boards open when the event does. Turn this on and players can post Flares from home before your locals, so people know what to bring."}
          </p>
        </div>
      </div>

      <form action={setEarlyBoardAction} className="flex flex-col gap-4">
        <input type="hidden" name="storeId" value={storeId} />

        <Field name="earlyBoardHours" label="Boards open">
          <Select
            {...fieldIds("earlyBoardHours")}
            name="earlyBoardHours"
            defaultValue={String(hours)}
          >
            {choices.map((choice) => (
              <option key={choice.hours} value={String(choice.hours)}>
                {choice.label}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <Button type="submit" variant="secondary">
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
