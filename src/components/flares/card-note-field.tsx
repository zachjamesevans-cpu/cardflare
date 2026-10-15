"use client";

import { TextInput } from "@/components/ui/controls";
import {
  CARD_NOTE_LABEL,
  CARD_NOTE_MAX,
  CARD_NOTE_PLACEHOLDER,
} from "@/lib/flares/card-note";

/**
 * The note on one card: one line to type in, the examples in its
 * placeholder.
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
