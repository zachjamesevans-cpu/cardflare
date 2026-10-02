"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { addBinderCardAction } from "@/lib/binder/actions";

/**
 * "Add cards": the card search in a sheet, over the binder page.
 *
 * Picking a card, or one of its printings, puts one copy in the
 * binder and the page refreshes with it in the first pocket. The
 * sheet stays open so a second card is one more tap, which is how
 * somebody loads a binder: in a run, not one visit per card.
 */
export function AddBinderCard({
  imagesEnabled,
  playerGames,
}: {
  imagesEnabled: boolean;
  /** The reader's sign-up games, for the search's default chip. */
  playerGames: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setError(null);
          setAdded(null);
          setOpen(true);
        }}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add cards
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Add cards"
        footer={
          <div className="flex min-h-5 items-center gap-2 text-sm">
            {pending && (
              <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
            )}
            {error ? (
              <span role="alert" className="text-danger">
                {error}
              </span>
            ) : added ? (
              <span role="status" className="text-text-secondary">
                {added} is in your binder.
              </span>
            ) : (
              <span className="text-text-muted">
                Tap a card, or one of its printings, to add one copy.
              </span>
            )}
          </div>
        }
      >
        <CardSearch
          imagesEnabled={imagesEnabled}
          playerGames={playerGames}
          autoFocus
          onSelect={(card, printing) => {
            if (pending) return;
            setError(null);
            setAdded(null);
            start(async () => {
              const result = await addBinderCardAction({
                cardId: card.id,
                printingId: printing?.id ?? null,
                quantity: 1,
              });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setAdded(card.exactName);
              router.refresh();
            });
          }}
        />
      </Sheet>
    </>
  );
}
