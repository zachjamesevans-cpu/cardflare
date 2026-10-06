"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { BinderPicker } from "@/components/binder/binder-picker";
import { PasteList, type ListPreview } from "@/components/binder/paste-list";
import {
  addCard,
  keyOf,
  lessCard,
  lineKey,
  type DraftCard,
} from "@/components/flares/draft";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { addBinderCardsAction, previewBinderListAction } from "@/lib/binder/actions";
import { cn } from "@/lib/cn";

/**
 * "Add cards": the Flare picker in a sheet, over the binder page.
 *
 * The founder: "Binder should bring up same menu as posting flares -
 * can select multiple of one card, etc, to put into binder at mass."
 * So nothing lands on a tap any more: the taps fill a tray, several
 * copies of one card and several cards, and one button puts the whole
 * tray in the binder, "Add 5 cards to binder". Beside the search, a
 * second way in for somebody with the list already written: "Paste a
 * list", looked up and shown back before anything is added.
 *
 * Opened from an empty pocket, the batch starts AT that pocket: "Adding
 * a card in a specific slot should put that exact card there." The
 * first card takes the tapped pocket (or the next empty one after it,
 * if it filled meanwhile) and the rest follow into the empty pockets
 * after it. Opened any other way, `pocket` is null and the server puts
 * them after the last card.
 *
 * The page owns whether the sheet is open, because every empty pocket
 * on the owner's binder is a "+" that opens it, and since round 3
 * that is the only way in: the founder, "the add cards button and
 * edit button are completely redundant because you should be able to
 * do both of those on that screen already. Delete." The button is
 * still here for a caller that asks for it with `trigger`; the binder
 * page does not. Once the cards are in, the sheet closes and the page
 * says what happened, in the action's words, on the page they landed.
 */
export function AddBinderCard({
  binderId,
  imagesEnabled,
  playerGames,
  open,
  onOpenChange,
  pocket = null,
  inBinder = [],
  onAdded,
  trigger = false,
}: {
  /** The binder the cards land in. */
  binderId: string;
  imagesEnabled: boolean;
  /** The reader's sign-up games, for the search's default chip. */
  playerGames: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The empty pocket that was tapped: the batch starts there. */
  pocket?: number | null;
  /** The binder's cards, for "×2 in this binder" on the results. */
  inBinder?: readonly { cardId: string; quantity: number }[];
  /** The action's sentence, and the pocket the first new card took. */
  onAdded?: (message: string, firstPocket: number | null) => void;
  /** Draw an "Add cards" button that opens the sheet. Off by default. */
  trigger?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"search" | "paste">("search");
  const [picks, setPicks] = useState<DraftCard[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ListPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* A fresh sheet each time it opens: an empty tray, the search first. */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTab("search");
      setPicks([]);
      setFocus(null);
      setText("");
      setPreview(null);
      setError(null);
    }
  }

  const copiesHere = useMemo(() => {
    const copies = new Map<string, number>();
    for (const card of inBinder) {
      copies.set(card.cardId, (copies.get(card.cardId) ?? 0) + card.quantity);
    }
    return copies;
  }, [inBinder]);

  /* What the one button would add: the tray, or the list's found cards. */
  const items =
    tab === "search"
      ? picks.map((item) => ({
          cardId: item.card.id,
          printingId: item.printingId,
          quantity: item.quantity,
        }))
      : (preview?.entries ?? []).flatMap((entry) =>
          entry.cardId
            ? [{ cardId: entry.cardId, printingId: null, quantity: entry.quantity }]
            : [],
        );
  const count = items.length;

  const submit = () => {
    if (pending || count === 0) return;
    setError(null);
    start(async () => {
      const result = await addBinderCardsAction(binderId, { items, pocket });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onAdded?.(result.message, result.firstPocket);
      onOpenChange(false);
      router.refresh();
    });
  };

  const lookUp = () => {
    if (pending || text.trim().length === 0) return;
    setError(null);
    start(async () => {
      const result = await previewBinderListAction(text);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setPreview({ entries: result.entries, unreadable: result.unreadable });
    });
  };

  return (
    <>
      {trigger && (
        <Button type="button" onClick={() => onOpenChange(true)}>
          <Plus className="size-4" aria-hidden="true" />
          Add cards
        </Button>
      )}

      <Sheet
        open={open}
        onClose={() => onOpenChange(false)}
        title="Add cards"
        footer={
          <div className="flex flex-col gap-2">
            {(error || pending) && (
              <div className="flex min-h-5 items-center gap-2 text-sm">
                {pending && (
                  <Loader2
                    className="size-4 animate-spin text-accent"
                    aria-hidden="true"
                  />
                )}
                {error && (
                  <span role="alert" className="text-danger">
                    {error}
                  </span>
                )}
              </div>
            )}
            {tab === "search" || preview ? (
              <Button
                type="button"
                className="w-full"
                disabled={pending || count === 0}
                onClick={submit}
              >
                {addLabel(count)}
              </Button>
            ) : (
              <p className="text-sm text-text-muted">
                Look the list up to check it before anything is added.
              </p>
            )}
          </div>
        }
      >
        {/*
         * TALL ON PURPOSE. The sheet sizes itself to its content, and
         * before anything is typed the content is one field and a
         * hint, so the game menu under the chip opened into a body a
         * few lines high and was cut off; the founder: "when u click
         * the TCG dropdown, it gets cut off". So the container gets
         * the room: at least 70dvh, and the results scroll inside the
         * sheet under the footer.
         */}
        <div className="flex min-h-[70dvh] flex-col gap-4">
          <div
            role="tablist"
            aria-label="How to add"
            className="grid grid-cols-2 gap-1 rounded-full border border-border bg-canvas p-1"
          >
            {(
              [
                ["search", "Search"],
                ["paste", "Paste a list"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => {
                  setTab(id);
                  setError(null);
                }}
                className={cn(
                  "cursor-pointer rounded-full px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                  tab === id
                    ? "bg-accent text-accent-contrast"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "search" ? (
            <BinderPicker
              imagesEnabled={imagesEnabled}
              playerGames={playerGames}
              picks={picks}
              focus={focus}
              inBinder={copiesHere}
              onAdd={(card, printing) => {
                setError(null);
                setPicks((current) => addCard(current, card, printing));
                setFocus(lineKey(card.id, printing?.id ?? null));
              }}
              onLess={(key) => setPicks((current) => lessCard(current, key))}
              onQuantity={(key, quantity) =>
                setPicks((current) =>
                  current.map((item) =>
                    keyOf(item) === key ? { ...item, quantity } : item,
                  ),
                )
              }
              onRemove={(key) =>
                setPicks((current) => current.filter((item) => keyOf(item) !== key))
              }
              onFocus={setFocus}
            />
          ) : (
            <PasteList
              imagesEnabled={imagesEnabled}
              text={text}
              onText={setText}
              preview={preview}
              pending={pending}
              onLookUp={lookUp}
              onQuantity={(index, quantity) =>
                setPreview((current) =>
                  current
                    ? {
                        ...current,
                        entries: current.entries.map((entry, at) =>
                          at === index ? { ...entry, quantity } : entry,
                        ),
                      }
                    : current,
                )
              }
              onRemove={(index) =>
                setPreview((current) =>
                  current
                    ? {
                        ...current,
                        entries: current.entries.filter((_, at) => at !== index),
                      }
                    : current,
                )
              }
              onEdit={() => {
                setPreview(null);
                setError(null);
              }}
            />
          )}
        </div>
      </Sheet>
    </>
  );
}

/** "Add 1 card to binder", "Add 5 cards to binder": distinct cards, not copies. */
export function addLabel(count: number): string {
  if (count === 0) return "Add cards to binder";
  return `Add ${count} ${count === 1 ? "card" : "cards"} to binder`;
}
