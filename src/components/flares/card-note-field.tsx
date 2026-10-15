"use client";

import { TextInput } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import {
  CARD_NOTE_LABEL,
  CARD_NOTE_MAX,
  CARD_NOTE_PLACEHOLDER,
  CARD_NOTE_SUGGESTIONS,
} from "@/lib/flares/card-note";

/**
 * The note on one card: a line to type in, and the common reasons as
 * one-tap chips above it, so most people say something without typing.
 * Used by the composer's card editor and by "Edit note" under an open
 * card. The app's CardNoteField is the same (mobile/src/card-note-field.tsx).
 */
export function CardNoteField({
  value,
  onChange,
  cardName,
}: {
  value: string;
  onChange: (next: string) => void;
  cardName: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-text-secondary">{CARD_NOTE_LABEL}</span>
      <div className="flex flex-wrap gap-1.5">
        {CARD_NOTE_SUGGESTIONS.map((suggestion) => {
          const on = value.trim() === suggestion;
          return (
            <button
              key={suggestion}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? "" : suggestion)}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-semibold",
                on
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-text-secondary hover:text-text-primary",
              )}
            >
              {suggestion}
            </button>
          );
        })}
      </div>
      <TextInput
        value={value}
        maxLength={CARD_NOTE_MAX}
        onChange={(event) => onChange(event.target.value)}
        placeholder={CARD_NOTE_PLACEHOLDER}
        aria-label={`Note on ${cardName}`}
      />
    </div>
  );
}
