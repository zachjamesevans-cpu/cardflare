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
 *
 * The page owns whether the sheet is open, because the button under
 * the page is not the only way in: every empty pocket on the owner's
 * binder is a "+" that opens this same sheet. The binder's id says
 * which binder the card lands in.
 */
export function AddBinderCard({
  binderId,
  imagesEnabled,
  playerGames,
  open,
  onOpenChange,
}: {
  /** The binder the card lands in. */
  binderId: string;
  imagesEnabled: boolean;
  /** The reader's sign-up games, for the search's default chip. */
  playerGames: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* A fresh sheet each time it opens: no stale "X is in your binder". */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setAdded(null);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => onOpenChange(true)}>
        <Plus className="size-4" aria-hidden="true" />
        Add cards
      </Button>

      <Sheet
        open={open}
        onClose={() => onOpenChange(false)}
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
        {/*
         * TALL ON PURPOSE. The sheet sizes itself to its content, and
         * before anything is typed the content is one field and a
         * hint, so the game menu under the chip opened into a body a
         * few lines high and was cut off; the founder: "when u click
         * the TCG dropdown, it gets cut off". The search is left as it
         * is; its container gets the room: at least 70dvh, so the
         * menu opens inside the scroll area whole, and once results
         * come they scroll inside the sheet under the footer.
         */}
        <div className="flex min-h-[70dvh] flex-col">
          <CardSearch
            imagesEnabled={imagesEnabled}
            playerGames={playerGames}
            autoFocus
            onSelect={(card, printing) => {
              if (pending) return;
              setError(null);
              setAdded(null);
              start(async () => {
                const result = await addBinderCardAction(
                  {
                    cardId: card.id,
                    printingId: printing?.id ?? null,
                    quantity: 1,
                  },
                  binderId,
                );
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setAdded(card.exactName);
                router.refresh();
              });
            }}
          />
        </div>
      </Sheet>
    </>
  );
}
