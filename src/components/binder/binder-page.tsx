"use client";

import { useState, useTransition, type DragEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";

import { AddBinderCard } from "@/components/binder/add-binder-card";
import { BinderSettings } from "@/components/binder/binder-settings";
import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import { Sheet } from "@/components/ui/sheet";
import { removeBinderCardAction, reorderBinderAction } from "@/lib/binder/actions";
import type { Binder, BinderCard, BinderSettingsPatch } from "@/lib/binder/binder";
import type { BinderCoverId } from "@/lib/binder/covers";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { cn } from "@/lib/cn";

/**
 * The binder, open: the cards in pockets, a page at a time.
 *
 * Drawn the way a binder sits on a table: three by three pockets per
 * page, always (the founder: "Just have a 3x3."), arrows and dots to
 * turn it, and a tap on any pocket opens the card large in the same
 * viewer every other card on the site opens in, with no offer
 * control: the binder is not answerable yet, this round.
 *
 * The owner's tools are the page itself. The founder (round 3): "the
 * add cards button and edit button are completely redundant because
 * you should be able to do both of those on that screen already.
 * Delete." So a card goes in through the "+" in an empty pocket, and
 * a card comes out by dropping it on the Remove zone that appears
 * under the page while one is held. The settings (name, Up for trade,
 * cover, Delete binder) live in a sheet behind the pencil at the top:
 * "Maybe a small edit icon at the top or something." A visitor gets the "On your hunts" chip when any card is one they
 * are hunting, and the message door.
 *
 * The order of the pockets is the owner's. The founder: "I think we
 * should have a 'hold to move' thing, similar animations to how
 * people can adjust which order their flares are in when they post."
 * So every filled pocket drags, the way the composer's tray drags: a
 * pocket dropped on another pocket moves there and the rest shift to
 * make room, never a swap; dropped on an arrow it goes to the far end
 * of the page beyond. Alt and the arrow keys do the same from a
 * keyboard. The new order paints at once and the server keeps it.
 *
 * Every empty pocket on the owner's binder is a "+" that opens Add
 * cards, and once the last page is full the owner sees one more page
 * of them, so there is always somewhere to put the next card. A
 * visitor's empty pockets stay empty.
 *
 * The page's settings and order are held here as live values so a
 * change paints at once; the server's copy arrives behind it with the
 * refresh and wins, which is also what keeps two tabs honest. The
 * line under the title follows the live Up for trade switch, so
 * flipping it in the sheet repaints the words at the top.
 */

type Settings = {
  cover: BinderCoverId;
  forTrade: boolean;
  name: string;
};

const settingsOf = (binder: Binder): Settings => ({
  cover: binder.cover,
  forTrade: binder.forTrade,
  name: binder.name,
});

/* Three across, three down: the one page a binder has. */
const COLUMNS = 3;
const POCKETS_PER_PAGE = COLUMNS * COLUMNS;

/** Where a dragged pocket is hovering: a slot, an arrow, or Remove. */
type DropSpot = number | "prev" | "next" | "remove";

/**
 * The line under the title: what this binder's cards mean. Up for
 * trade, the owner reads what that gets them and a visitor what they
 * are looking at; private, the owner reads that it is theirs alone.
 * The same three sentences on the app's Binder screen.
 */
function binderLine(
  forTrade: boolean,
  yours: boolean,
  ownerName: string,
): string | null {
  if (forTrade) {
    return yours
      ? "Up for trade. Somebody nearby hunting one of these hears about it."
      : `Cards ${ownerName} will trade.`;
  }
  return yours ? "Private. Only you can open it." : null;
}

export function BinderView({
  binder,
  imagesEnabled,
  playerGames = [],
  title,
  footer = null,
}: {
  binder: Binder;
  imagesEnabled: boolean;
  /** The owner's sign-up games, for the search's default chip. */
  playerGames?: readonly string[];
  /** The visible heading, or null when the shell already names the page. */
  title: string | null;
  /** A visitor's one control under the page: the message door. */
  footer?: ReactNode;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(() => settingsOf(binder));
  const [cards, setCards] = useState(binder.cards);
  /* The server's copy, when a refresh brings a new one, replaces the
     live values: the documented way to derive state from a prop. */
  const [seen, setSeen] = useState(binder);
  if (seen !== binder) {
    setSeen(binder);
    setSettings(settingsOf(binder));
    setCards(binder.cards);
  }

  const [at, setAt] = useState(0);
  const [onHuntsOnly, setOnHuntsOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** The entry id in the air, while a pocket is being dragged. */
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<DropSpot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const list =
    !binder.yours && onHuntsOnly ? cards.filter((card) => card.onYourHunt) : cards;
  const perPage = POCKETS_PER_PAGE;
  /* The owner always has an empty pocket in reach: when the last page
     is full (or there are no cards), one more page of "+" pockets. */
  const pages = binder.yours
    ? Math.floor(list.length / perPage) + 1
    : Math.max(1, Math.ceil(list.length / perPage));
  /* Never off the end: removing the last card on the last page folds
     back onto a page that exists. */
  const page = Math.min(at, pages - 1);
  const shown = list.slice(page * perPage, page * perPage + perPage);
  const pockets: (BinderCard | null)[] = [
    ...shown,
    ...Array.from({ length: perPage - shown.length }, () => null),
  ];

  const zoomCards: ZoomCard[] = list.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.name,
    cardNumber: card.number,
    caption: card.printingLabel,
    note: card.note,
    direction: "showcase",
  }));

  const act = (work: () => Promise<{ ok: true } | { ok: false; message: string }>) => {
    if (pending) return;
    setError(null);
    start(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  };

  const paint = (patch: BinderSettingsPatch) =>
    setSettings((current) => ({ ...current, ...patch }));

  /**
   * Put the card into slot `to`, shifting the others: the composer's
   * splice, over the whole binder rather than one page. A slot past
   * the end (an empty pocket, the trailing page) means last. The page
   * follows the card, so a move onto the next page is seen landing.
   */
  const move = (entryId: string, to: number) => {
    if (pending) return;
    const from = cards.findIndex((card) => card.entryId === entryId);
    const slot = Math.max(0, Math.min(to, cards.length - 1));
    if (from < 0 || from === slot) return;
    const next = [...cards];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(slot, 0, moved);
    setCards(next);
    setAt(Math.floor(slot / perPage));
    act(() =>
      reorderBinderAction(
        next.map((card) => card.entryId),
        binder.id,
      ),
    );
  };

  /**
   * Take the card out: the pocket empties at once and the server
   * follows; a refusal paints the card back through the refresh. The
   * count line under the title catches up with the refresh too.
   */
  const remove = (entryId: string) => {
    if (pending) return;
    const card = cards.find((entry) => entry.entryId === entryId);
    if (!card) return;
    setCards((current) => current.filter((entry) => entry.entryId !== entryId));
    act(() => removeBinderCardAction(card.entryId, binder.id));
  };

  const dropAt = (spot: DropSpot) => (event: DragEvent) => {
    event.preventDefault();
    if (!dragging) return;
    if (spot === "remove") {
      remove(dragging);
    } else {
      const to =
        spot === "prev"
          ? page * perPage - 1
          : spot === "next"
            ? (page + 1) * perPage
            : spot;
      move(dragging, to);
    }
    setDragging(null);
    setOver(null);
  };

  /* Preventing the default is what marks a valid drop target; without
     it the browser refuses the drop. */
  const dragOver = (spot: DropSpot, own: boolean) => (event: DragEvent) => {
    if (!dragging || own) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (over !== spot) setOver(spot);
  };

  const dragLeave = (spot: DropSpot) => () =>
    setOver((current) => (current === spot ? null : current));

  const countLine = `${binder.count} ${binder.count === 1 ? "card" : "cards"}`;
  const line = binderLine(settings.forTrade, binder.yours, binder.ownerName);

  return (
    <div className="flex w-full flex-col gap-4">
      {/* The title row: the words on the left, and for the owner the
          pencil on the right that opens the settings sheet. */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          {title && (
            <h2 className="truncate text-lg font-extrabold text-text-primary">
              {title}
            </h2>
          )}
          {line && <p className="text-sm text-text-secondary">{line}</p>}
          <p className="text-xs text-text-muted tabular-nums">
            {countLine} · Page {page + 1} of {pages}
          </p>
        </div>
        {binder.yours && (
          <button
            type="button"
            aria-label="Binder settings"
            onClick={() => setSettingsOpen(true)}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-surface text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
          >
            <Pencil className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {!binder.yours && binder.onYourHunts > 0 && (
        <div className="flex gap-2" role="group" aria-label="Show">
          <Chip
            label="All"
            on={!onHuntsOnly}
            onClick={() => {
              setOnHuntsOnly(false);
              setAt(0);
            }}
          />
          <Chip
            label="On your hunts"
            count={binder.onYourHunts}
            on={onHuntsOnly}
            onClick={() => {
              setOnHuntsOnly(true);
              setAt(0);
            }}
          />
        </div>
      )}

      {/* The page: pockets on the binder-page background, the arrows
          over its middle. */}
      <div className="cfa-bg-binder-page relative overflow-hidden rounded-[var(--radius-card)] p-3 shadow-[var(--shadow-card)]">
        <ul
          className="grid grid-cols-3 gap-2"
          aria-label={`Page ${page + 1} of ${pages}`}
        >
          {pockets.map((card, index) => {
            const slot = page * perPage + index;
            const own = card?.entryId === dragging;
            return (
              <li
                key={card ? card.entryId : `empty-${page}-${index}`}
                /*
                 * DRAGGED INTO PLACE, the website's half of the app's
                 * hold to move. A mouse needs no long press to say it
                 * means to drag, so a filled pocket is draggable
                 * outright, and every pocket, filled or not, takes the
                 * drop.
                 */
                draggable={binder.yours && card !== null}
                onDragStart={
                  binder.yours && card
                    ? (event) => {
                        setDragging(card.entryId);
                        event.dataTransfer.effectAllowed = "move";
                        /* Firefox will not start a drag without payload. */
                        event.dataTransfer.setData("text/plain", card.entryId);
                      }
                    : undefined
                }
                onDragEnd={
                  binder.yours
                    ? () => {
                        setDragging(null);
                        setOver(null);
                      }
                    : undefined
                }
                onDragOver={binder.yours ? dragOver(slot, own) : undefined}
                onDragLeave={binder.yours ? dragLeave(slot) : undefined}
                onDrop={binder.yours ? dropAt(slot) : undefined}
                className={cn(
                  "relative rounded-[5px] transition-opacity",
                  own && "opacity-40",
                  over === slot && !own && "ring-2 ring-accent",
                )}
              >
                {card ? (
                  <div
                    role="group"
                    aria-label={
                      binder.yours
                        ? `${card.name}, pocket ${slot + 1} of ${cards.length}. Drag to move it, or hold Alt and use the arrow keys.`
                        : undefined
                    }
                    /* A pocket whose card has no picture to open has
                       no button inside, so the group itself takes the
                       focus and the keys. */
                    tabIndex={
                      binder.yours &&
                      !(imagesEnabled && isRenderableImageUrl(card.imageUrl))
                        ? 0
                        : undefined
                    }
                    onKeyDown={
                      binder.yours
                        ? (event) => {
                            if (!event.altKey) return;
                            if ((event.target as HTMLElement).closest("dialog")) return;
                            const step = ARROW_STEP(event.key);
                            if (step === null) return;
                            event.preventDefault();
                            move(card.entryId, slot + step);
                          }
                        : undefined
                    }
                    className={cn(
                      "rounded-[5px]",
                      binder.yours && "cursor-grab active:cursor-grabbing",
                    )}
                  >
                    <CardImageZoom
                      imageUrl={card.imageUrl}
                      exactName={card.name}
                      cardNumber={card.number}
                      caption={card.printingLabel}
                      note={card.note}
                      direction="showcase"
                      enabled={imagesEnabled}
                      siblings={zoomCards}
                      position={list.indexOf(card)}
                      thumbClassName="w-full"
                      thumb={<PocketTile card={card} imagesEnabled={imagesEnabled} />}
                    />
                  </div>
                ) : binder.yours ? (
                  <AddPocket onClick={() => setAdding(true)} />
                ) : (
                  <EmptyPocket />
                )}
              </li>
            );
          })}
        </ul>

        {pages > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setAt(page - 1)}
              onDragOver={binder.yours ? dragOver("prev", false) : undefined}
              onDragLeave={binder.yours ? dragLeave("prev") : undefined}
              onDrop={binder.yours ? dropAt("prev") : undefined}
              className={cn(
                "absolute top-1/2 left-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-canvas/80 text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-30",
                over === "prev" && "ring-2 ring-accent",
              )}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={page === pages - 1}
              onClick={() => setAt(page + 1)}
              onDragOver={binder.yours ? dragOver("next", false) : undefined}
              onDragLeave={binder.yours ? dragLeave("next") : undefined}
              onDrop={binder.yours ? dropAt("next") : undefined}
              className={cn(
                "absolute top-1/2 right-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-canvas/80 text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-30",
                over === "next" && "ring-2 ring-accent",
              )}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

      {/*
       * REMOVE, under the page, only while a card is in the air. The
       * one way a card leaves the binder: it is dropped here. Drawn in
       * the danger colour so it cannot be mistaken for a pocket, and
       * not drawn at all when nothing is held.
       */}
      {binder.yours && dragging && (
        <div
          role="group"
          aria-label="Remove from binder"
          onDragOver={dragOver("remove", false)}
          onDragLeave={dragLeave("remove")}
          onDrop={dropAt("remove")}
          className={cn(
            "flex h-14 items-center justify-center rounded-[var(--radius-control)] border-2 border-dashed border-danger text-sm font-semibold text-danger transition-colors",
            over === "remove" ? "bg-danger/20" : "bg-danger/5",
          )}
        >
          Remove
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: pages }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Page ${index + 1}`}
              aria-current={index === page ? "page" : undefined}
              onClick={() => setAt(index)}
              className={cn(
                "h-1.5 cursor-pointer rounded-full transition-all",
                index === page ? "w-4 bg-accent" : "w-1.5 bg-border-strong",
              )}
            />
          ))}
        </div>
      )}

      {binder.yours && cards.length > 0 && (
        <p className="text-center text-xs text-text-muted">
          Hold a card to move it, or drop it on Remove.
        </p>
      )}

      {binder.count === 0 && (
        <p className="text-center text-sm text-text-muted">
          {binder.yours
            ? "Cards you would trade. Add the ones you carry."
            : "Nothing to trade yet."}
        </p>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}

      {binder.yours ? (
        <>
          {/* The Add cards sheet, opened from the "+" pockets alone. */}
          <AddBinderCard
            binderId={binder.id}
            imagesEnabled={imagesEnabled}
            playerGames={playerGames}
            open={adding}
            onOpenChange={setAdding}
          />
          <Sheet
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            title="Binder settings"
          >
            <BinderSettings
              binderId={binder.id}
              name={settings.name}
              count={binder.count}
              forTrade={settings.forTrade}
              cover={settings.cover}
              onChange={paint}
            />
          </Sheet>
        </>
      ) : (
        footer
      )}
    </div>
  );
}

/** One slot sideways, one row up or down, or nothing for any other key. */
function ARROW_STEP(key: string): number | null {
  switch (key) {
    case "ArrowLeft":
      return -1;
    case "ArrowRight":
      return 1;
    case "ArrowUp":
      return -COLUMNS;
    case "ArrowDown":
      return COLUMNS;
    default:
      return null;
  }
}

/** "All", "On your hunts 3": the two ways to look at somebody's binder. */
function Chip({
  label,
  count,
  on,
  onClick,
}: {
  label: string;
  count?: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "shrink-0 cursor-pointer rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        on
          ? "border-accent bg-accent text-accent-contrast"
          : "border-border bg-surface text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {label}
      {count !== undefined && (
        <span className="ml-1 tabular-nums opacity-80">{count}</span>
      )}
    </button>
  );
}

/* A pocket: black, with the sleeve's lip catching the light at the top. */
const POCKET =
  "relative aspect-[63/88] w-full overflow-hidden rounded-[5px] bg-black ring-2 ring-black/80 shadow-[inset_0_0_0_2px_rgb(255_255_255/0.06)]";

function PocketTile({
  card,
  imagesEnabled,
}: {
  card: BinderCard;
  imagesEnabled: boolean;
}) {
  const art = imagesEnabled && isRenderableImageUrl(card.imageUrl);

  return (
    <div className={POCKET}>
      {art ? (
        /* The picture is not its own drag source: the pocket is, so
           the whole tile travels, not the image out of it. */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={card.imageUrl ?? ""}
          alt=""
          draggable={false}
          className="size-full object-cover"
        />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-0.5 bg-elevated px-1 text-center">
          <span className="line-clamp-2 text-[10px] font-semibold text-text-primary">
            {card.name}
          </span>
          <span className="text-[9px] text-text-muted">{card.number}</span>
        </span>
      )}
      {/* The sleeve lip. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[6%] bg-[linear-gradient(180deg,rgb(255_255_255/0.22),transparent)]"
      />
      {card.quantity > 1 && (
        <span className="absolute top-1 left-1 rounded-full bg-canvas/85 px-1.5 py-px text-[9px] font-bold text-text-primary tabular-nums ring-1 ring-border-strong">
          ×{card.quantity}
        </span>
      )}
      {card.onYourHunt && (
        <span className="absolute inset-x-0 bottom-0 bg-accent py-0.5 text-center text-[8px] font-bold tracking-wider text-accent-contrast uppercase">
          ON YOUR HUNT
        </span>
      )}
    </div>
  );
}

/** A visitor's empty pocket: black, and nothing to press. */
function EmptyPocket() {
  return <div aria-hidden="true" className={POCKET} />;
}

/**
 * The owner's empty pocket: a "+" that opens Add cards. The founder:
 * "there should be a + on the open card areas in the binder to add a
 * card that way."
 */
function AddPocket({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add a card"
      className="flex aspect-[63/88] w-full cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[5px] border-2 border-dashed border-border-strong bg-black/60 text-text-secondary transition-colors hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:outline-none"
    >
      <span aria-hidden="true" className="text-3xl leading-none font-light">
        +
      </span>
      <span className="text-[10px] font-semibold">Add</span>
    </button>
  );
}
