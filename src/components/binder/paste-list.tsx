"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/controls";
import { QuantityBadge } from "@/components/ui/quantity-badge";
import { Stepper } from "@/components/ui/stepper";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { MAX_COPIES } from "@/lib/flares/draft-rules";

/**
 * "Paste a list": a deck list, or a list typed out by hand, into a
 * binder at once. The same paste the deck-list import has, read the
 * same way (`previewBinderListAction` runs the deck-list parser), and
 * shown back before anything is added: the art and the name of every
 * card it found, with its count on the binder's quantity tag and a
 * stepper to change it, then what it could not find and what it could
 * not read, line by line, so nothing is dropped without saying so.
 */

/** One looked-up line: a card the catalogue has, or a number it does not. */
export interface ListEntry {
  cardId: string | null;
  cardNumber: string;
  quantity: number;
  name: string | null;
  imageUrl: string | null;
}

export interface ListPreview {
  entries: ListEntry[];
  unreadable: string[];
}

export const LIST_PLACEHOLDER = "2x OP01-001\nOP05-119\n...";

export function PasteList({
  imagesEnabled,
  text,
  onText,
  preview,
  pending,
  onLookUp,
  onQuantity,
  onRemove,
  onEdit,
}: {
  imagesEnabled: boolean;
  text: string;
  onText: (text: string) => void;
  /** The looked-up list, or null while the text is being written. */
  preview: ListPreview | null;
  pending: boolean;
  onLookUp: () => void;
  /** Both take the entry's index in `preview.entries`. */
  onQuantity: (index: number, quantity: number) => void;
  onRemove: (index: number) => void;
  /** Back to the text, as it was. */
  onEdit: () => void;
}) {
  if (!preview) {
    return (
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-text-primary">Paste a list</span>
          <Textarea
            value={text}
            onChange={(event) => onText(event.target.value)}
            placeholder={LIST_PLACEHOLDER}
            rows={8}
            spellCheck={false}
            autoComplete="off"
            maxLength={20_000}
            className="font-mono text-sm"
          />
        </label>
        <p className="text-xs text-text-muted">
          One card number per line. A number in front is how many copies.
        </p>
        <Button
          type="button"
          size="sm"
          className="w-fit"
          disabled={pending || text.trim().length === 0}
          onClick={onLookUp}
        >
          Look up
        </Button>
      </div>
    );
  }

  const found = preview.entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.cardId !== null);
  const missing = preview.entries.filter((entry) => entry.cardId === null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary tabular-nums">
          {found.length === 0
            ? "None of those are in the catalogue."
            : `Found ${found.length} ${found.length === 1 ? "card" : "cards"}.`}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          Edit the list
        </Button>
      </div>

      {found.length > 0 && (
        <ul aria-label="Cards found" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {found.map(({ entry, index }) => {
            const name = entry.name ?? entry.cardNumber;
            const art = imagesEnabled && isRenderableImageUrl(entry.imageUrl);
            return (
              <li
                key={`${entry.cardNumber}-${index}`}
                className="flex flex-col gap-1.5"
              >
                <div className="relative aspect-[63/88] w-full overflow-hidden rounded-[5px] bg-black ring-2 ring-black/80">
                  {art ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={entry.imageUrl ?? ""}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-0.5 bg-elevated px-1 text-center">
                      <span className="line-clamp-2 text-[10px] font-semibold text-text-primary">
                        {name}
                      </span>
                    </span>
                  )}
                  <QuantityBadge
                    quantity={entry.quantity}
                    className="absolute top-1 left-1"
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label={`Leave out ${name}`}
                    className="absolute top-1 right-1 flex size-6 cursor-pointer items-center justify-center rounded-full bg-canvas/85 text-text-secondary ring-1 ring-border-strong hover:text-text-primary"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs font-semibold text-text-primary">
                    {name}
                  </span>
                  <span className="font-mono text-[10px] text-text-muted">
                    {entry.cardNumber}
                  </span>
                </div>
                <Stepper
                  value={entry.quantity}
                  min={1}
                  max={MAX_COPIES}
                  label={`copies of ${name}`}
                  onChange={(quantity) => onQuantity(index, quantity)}
                />
              </li>
            );
          })}
        </ul>
      )}

      {(missing.length > 0 || preview.unreadable.length > 0) && (
        <ul
          aria-label="Left out"
          className="flex flex-col gap-1 text-xs text-text-muted"
        >
          {missing.map((entry, index) => (
            <li key={`missing-${entry.cardNumber}-${index}`}>
              Not found: <span className="font-mono">{entry.cardNumber}</span>
            </li>
          ))}
          {preview.unreadable.map((line, index) => (
            <li key={`unreadable-${index}`} className="truncate">
              {"Couldn't read: "}
              <span className="font-mono">{line}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
