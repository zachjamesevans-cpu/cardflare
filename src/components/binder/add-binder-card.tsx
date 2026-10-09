"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";

import { BinderPicker, BinderTray } from "@/components/binder/binder-picker";
import { PasteList, type ListPreview } from "@/components/binder/paste-list";
import { PageScan } from "@/components/cards/page-scan";
import { ScanCard, ScanWithPro } from "@/components/cards/scan-card";
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
import type { CardPrinting, CardResult } from "@/lib/cards/schema";
import { SCAN_CARD, SCAN_ONE, SCAN_PAGES } from "@/lib/cards/scan-rules";
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
 * And a third, for a Pro player: "Scan a card", a photo read into the
 * same tray, one card after another, so a stack of scans goes in with
 * the same one button. Whether it is drawn is the server's answer,
 * `scanAccess`, read with the page: the scanner, the door to Pro, or
 * nothing, never a button that appears and then goes. Its switch has a
 * second way to scan, "Whole pages": photos of real binder pages, read
 * in a queue, checked as grids, and placed pocket for pocket by their
 * own action (`PageScan`), never through the tray.
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
  scanAccess = null,
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
  /** "on" draws the scanner, "pro-door" the way to Pro, null nothing. */
  scanAccess?: "on" | "pro-door" | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"search" | "paste" | "scan">("search");
  /* The scan tab's switch: one card into the tray, or whole pages. */
  const [scanMode, setScanMode] = useState<"one" | "pages">("one");
  const [picks, setPicks] = useState<DraftCard[]>([]);
  const [focus, setFocus] = useState<string | null>(null);
  /* A name the scanner read but could not find, waiting in the search. */
  const [lookFor, setLookFor] = useState("");
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
      setScanMode("one");
      setPicks([]);
      setFocus(null);
      setLookFor("");
      setText("");
      setPreview(null);
      setError(null);
    }
  }

  /* Pages bring their own button and their own action: the sheet's
     footer, the tray's Add, is not theirs. */
  const pageMode = tab === "scan" && scanMode === "pages";
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
    tab !== "paste"
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
          !pageMode && (
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
              {tab !== "paste" || preview ? (
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
          )
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
            className={cn(
              "grid gap-1 rounded-full border border-border bg-canvas p-1",
              scanAccess === "on" ? "grid-cols-3" : "grid-cols-2",
            )}
          >
            {(
              [
                ["search", "Search"],
                ["paste", "Paste a list"],
                ...(scanAccess === "on" ? ([["scan", SCAN_CARD]] as const) : []),
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => {
                  /* The scanner's name goes in the search once, not
                     every time the search tab is opened again. */
                  if (tab === "search" && id !== "search") setLookFor("");
                  setTab(id);
                  setError(null);
                }}
                className={cn(
                  "cursor-pointer rounded-full px-2 py-1.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                  tab === id
                    ? "bg-accent text-accent-contrast"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Not Pro, while the scanner is open to Pro: the way there. */}
          {scanAccess === "pro-door" && <ScanWithPro />}

          {tab === "search" ? (
            <BinderPicker
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
            />
          ) : tab === "scan" ? (
            <div className="flex flex-1 flex-col gap-4">
              <div
                role="radiogroup"
                aria-label="How to scan"
                className="grid grid-cols-2 gap-1 self-center rounded-full border border-border bg-canvas p-1"
              >
                {(
                  [
                    ["one", SCAN_ONE],
                    ["pages", SCAN_PAGES],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={scanMode === id}
                    onClick={() => {
                      setScanMode(id);
                      setError(null);
                    }}
                    className={cn(
                      "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                      scanMode === id
                        ? "bg-elevated text-text-primary"
                        : "text-text-secondary hover:text-text-primary",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {scanMode === "one" ? (
                <>
                  <BinderTray
                    imagesEnabled={imagesEnabled}
                    picks={picks}
                    focus={focus}
                    onQuantity={quantityOf}
                    onRemove={removeLine}
                    onFocus={setFocus}
                  />
                  <ScanCard
                    imagesEnabled={imagesEnabled}
                    onAdd={pick}
                    onNotFound={setLookFor}
                  />
                </>
              ) : (
                /* Placed the way the tray's Add lands: the page says
                   what happened, the sheet closes, the binder redraws. */
                <PageScan
                  binderId={binderId}
                  imagesEnabled={imagesEnabled}
                  playerGames={playerGames}
                  pockets={filled}
                  onPlaced={(message, firstPocket) => {
                    onAdded?.(message, firstPocket);
                    onOpenChange(false);
                    router.refresh();
                  }}
                />
              )}
            </div>
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
