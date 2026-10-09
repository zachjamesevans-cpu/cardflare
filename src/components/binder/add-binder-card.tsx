"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Loader2, Plus } from "lucide-react";

import { BinderPicker } from "@/components/binder/binder-picker";
import { PasteList, type ListPreview } from "@/components/binder/paste-list";
import { Scanner } from "@/components/cards/scanner";
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
import type { ScanRights } from "@/lib/cards/scan";
import { READING_IN_BACKGROUND, SCAN_TITLE } from "@/lib/cards/scan-rules";
import type { CardPrinting, CardResult } from "@/lib/cards/schema";

/**
 * "Add cards": the Flare picker in a sheet, over the binder page.
 *
 * The founder: "Binder should bring up same menu as posting flares -
 * can select multiple of one card, etc, to put into binder at mass."
 * So nothing lands on a tap any more: the taps fill a tray, several
 * copies of one card and several cards, and one button puts the whole
 * tray in the binder, "Add 5 cards to binder".
 *
 * No tabs: the founder (2026-10-09), "all the tabs of 'scan' etc having
 * 3 tabs seems redundant." The search is the sheet, and under its field,
 * in this order, the same as the app: a large "Scan" for somebody who
 * may scan, then "Paste a list", a small link to the pasted list (for
 * somebody with the list already written, looked up and shown back
 * before anything is added), which has its own way back to the search.
 *
 * Scan opens the scanner over everything (`Scanner`): one camera for a
 * single card, read into this same tray so a stack of scans goes in
 * with the same one button, or a whole binder page, sent to be read in
 * the background and placed pocket for pocket later from the binder's
 * banner or the notice, never through the tray. Whether Scan is drawn
 * is the server's answer, `rights`, read with the page: never a button
 * that appears and then goes. A page that did not read is retaken here:
 * the sheet opens straight into the scanner for that page of that queue
 * (`retake`), and closes with it.
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
  rights = null,
  pagesLeft,
  retake = null,
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
  /** The binder's cards, for "×2 in this binder" on the results and the pockets a scanned page would land on. */
  inBinder?: readonly { cardId: string; quantity: number; pocket: number }[];
  /** The action's sentence, and the pocket the first new card took. */
  onAdded?: (message: string, firstPocket: number | null) => void;
  /** Draw an "Add cards" button that opens the sheet. Off by default. */
  trigger?: boolean;
  /** What the player may scan; null, or no singles, draws no Scan button. */
  rights?: ScanRights | null;
  /** Pages the player may still send today: null has no limit, undefined is not known yet. */
  pagesLeft?: number | null;
  /** Opened to shoot one page of a queue again: straight into the scanner. */
  retake?: { batchId: string; page: number } | null;
}) {
  const router = useRouter();
  /* The search, or the pasted list it links to. */
  const [view, setView] = useState<"search" | "paste">("search");
  /* The scanner, open over the sheet. */
  const [scanning, setScanning] = useState(false);
  /* Pages went to be read from this sheet: it says so. */
  const [pagesWent, setPagesWent] = useState(false);
  const [picks, setPicks] = useState<DraftCard[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  /* A name the scanner read but could not find, waiting in the search. */
  const [lookFor, setLookFor] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ListPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* Each opening's own page queue: a new one every time the sheet opens. */
  const [session, setSession] = useState(0);
  /* A fresh sheet each time it opens: an empty tray, the search first,
     or the scanner for a retake. */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setSession((count) => count + 1);
      setView("search");
      setScanning(Boolean(retake));
      setPagesWent(false);
      setPicks([]);
      setFocus(null);
      setLookFor("");
      setText("");
      setPreview(null);
      setError(null);
    }
  }

  const scans = rights !== null && rights.singles !== null;
  const filled = useMemo(() => inBinder.map((card) => card.pocket), [inBinder]);

  const copiesHere = useMemo(() => {
    const copies = new Map<string, number>();
    for (const card of inBinder) {
      copies.set(card.cardId, (copies.get(card.cardId) ?? 0) + card.quantity);
    }
    return copies;
  }, [inBinder]);

  /* What the one button would add: the tray (searched or scanned into
     it), or the list's found cards. */
  const items =
    view === "search"
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

  /* The tray's three moves, shared by the search and the scanner: a
     scanned card lands exactly as a tapped one does, one copy, or one
     more of a line already there. */
  const pick = (card: CardResult, printing?: CardPrinting) => {
    setError(null);
    setPicks((current) => addCard(current, card, printing));
    setFocus(lineKey(card.id, printing?.id ?? null));
  };
  const quantityOf = (key: string, quantity: number) =>
    setPicks((current) =>
      current.map((item) => (keyOf(item) === key ? { ...item, quantity } : item)),
    );
  const removeLine = (key: string) =>
    setPicks((current) => current.filter((item) => keyOf(item) !== key));

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
            {view === "search" || preview ? (
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
          {pagesWent && (
            <p role="status" className="text-sm text-text-secondary">
              {READING_IN_BACKGROUND}
            </p>
          )}

          {view === "search" ? (
            <BinderPicker
              /* Remade with a name the scanner could not find, typed in. */
              key={lookFor}
              imagesEnabled={imagesEnabled}
              playerGames={playerGames}
              picks={picks}
              focus={focus}
              inBinder={copiesHere}
              initialQuery={lookFor}
              onAdd={pick}
              onLess={(key) => setPicks((current) => lessCard(current, key))}
              onQuantity={quantityOf}
              onRemove={removeLine}
              onFocus={setFocus}
              underField={
                <div className="flex flex-col items-center gap-3">
                  {scans && (
                    <Button
                      type="button"
                      size="lg"
                      className="w-full"
                      onClick={() => {
                        setError(null);
                        setScanning(true);
                      }}
                    >
                      <Camera className="size-5" aria-hidden="true" />
                      {SCAN_TITLE}
                    </Button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setView("paste");
                      setError(null);
                    }}
                    className="cursor-pointer text-sm font-semibold text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
                  >
                    Paste a list
                  </button>
                </div>
              }
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setView("search");
                  setError(null);
                }}
                className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Search
              </button>
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
            </>
          )}

          {scanning && rights && (
            <Scanner
              key={session}
              binderId={binderId}
              rights={rights}
              pockets={filled}
              left={pagesLeft}
              retake={retake}
              imagesEnabled={imagesEnabled}
              playerGames={playerGames}
              onAdd={pick}
              onNotFound={(name) => {
                setLookFor(name);
                setView("search");
              }}
              onDone={(sentPages) => {
                setScanning(false);
                if (sentPages) setPagesWent(true);
                /* Opened for a retake: the scanner was the whole visit. */
                if (retake) onOpenChange(false);
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
