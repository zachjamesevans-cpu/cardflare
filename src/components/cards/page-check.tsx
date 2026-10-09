"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { OtherMatch, PrintingChips, ScannedCard } from "@/components/cards/scan-card";
import { Button } from "@/components/ui/button";
import { isRenderableImageUrl } from "@/lib/cards/images";
import type { scanPageAction } from "@/lib/cards/scan-actions";
import {
  FIND_THE_CARD,
  IS_THIS_IT,
  LEAVE_EMPTY,
  OTHER_MATCHES,
  POCKET_EMPTY,
  POCKET_TAKEN,
  POCKET_UNREAD,
  pocketAt,
} from "@/lib/cards/scan-rules";
import { cardArt, type CardResult } from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * Checking scanned pages before anything is placed: each page as the
 * 3x3 grid it is in the real binder, "Page 4", and a tap on a pocket
 * opens what was read there under the grid.
 *
 * The founder agreed nothing goes in a binder before the player has
 * looked, so every pocket's card is the player's to change here: a
 * found pocket swaps to another guess or another printing, a pocket
 * the reader could not read (a "?") or one it thought empty is found
 * with the site's search, and any pocket can be left empty. Whatever
 * is left chosen is what the Add button places, in that same pocket.
 *
 * The outline the product draws for "you have this" is not used on a
 * tile: here a card is only a guess until it is placed.
 */

type PageOutcome = Awaited<ReturnType<typeof scanPageAction>>;
/** One pocket of a read page, as the server answered. */
export type Pocket = Extract<PageOutcome, { ok: true }>["pockets"][number];
/** The card a pocket will be placed with; null leaves it empty. */
export type Choice = { card: CardResult; printingId: string | null } | null;

/** A page for the check, numbered where it will land. */
export interface CheckedPage {
  id: number;
  /** 1-based, as people count. */
  page: number;
  /** The player's own photo of each pocket. */
  cellUrls: readonly string[];
  /** Null until the page has read, or when it did not. */
  read: { pockets: readonly Pocket[]; choices: readonly Choice[] } | null;
  /** What a page that has not read says instead of its grid. */
  line: string;
}

export function PageCheck({
  pages,
  taken,
  imagesEnabled,
  playerGames,
  onChoose,
}: {
  pages: readonly CheckedPage[];
  /** Pockets this cardflare binder already has a card in. */
  taken: ReadonlySet<number>;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  onChoose: (pageId: number, slot: number, choice: Choice) => void;
}) {
  /* The pocket whose detail is open, one at a time across the pages. */
  const [open, setOpen] = useState<{ id: number; slot: number } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {pages.map((page) => (
        <section
          key={page.id}
          aria-label={`Page ${page.page}`}
          className="flex flex-col gap-3"
        >
          <h3 className="text-base font-semibold text-text-primary">
            Page {page.page}
          </h3>
          {page.read ? (
            <>
              <ul className="grid grid-cols-3 gap-2">
                {page.read.pockets.map((pocket) => {
                  const choice = page.read?.choices[pocket.slot] ?? null;
                  const on = open?.id === page.id && open.slot === pocket.slot;
                  return (
                    <li key={pocket.slot}>
                      <PocketTile
                        pocket={pocket}
                        choice={choice}
                        photo={page.cellUrls[pocket.slot] ?? null}
                        taken={taken.has(pocketAt(page.page, pocket.slot))}
                        imagesEnabled={imagesEnabled}
                        open={on}
                        onToggle={() =>
                          setOpen(on ? null : { id: page.id, slot: pocket.slot })
                        }
                      />
                    </li>
                  );
                })}
              </ul>
              {open?.id === page.id &&
                page.read.pockets
                  .filter((pocket) => pocket.slot === open.slot)
                  .map((pocket) => (
                    <PocketDetail
                      key={`${page.id}:${pocket.slot}`}
                      pocket={pocket}
                      choice={page.read?.choices[pocket.slot] ?? null}
                      photo={page.cellUrls[pocket.slot] ?? null}
                      taken={taken.has(pocketAt(page.page, pocket.slot))}
                      imagesEnabled={imagesEnabled}
                      playerGames={playerGames}
                      onChoose={(choice) => onChoose(page.id, pocket.slot, choice)}
                      onLeaveEmpty={() => {
                        onChoose(page.id, pocket.slot, null);
                        setOpen(null);
                      }}
                    />
                  ))}
            </>
          ) : (
            <p className="text-sm text-text-secondary">{page.line}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/**
 * One pocket on the grid. A chosen card shows its art, or the player's
 * own photo of the pocket when card art is off; an unread pocket is a
 * "?"; an empty one is faint. A pocket already full in this binder
 * wears a small mark, and its detail says why.
 */
function PocketTile({
  pocket,
  choice,
  photo,
  taken,
  imagesEnabled,
  open,
  onToggle,
}: {
  pocket: Pocket;
  choice: Choice;
  photo: string | null;
  taken: boolean;
  imagesEnabled: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const label = choice
    ? `Pocket ${pocket.slot + 1}: ${choice.card.exactName}`
    : `Pocket ${pocket.slot + 1}: ${pocket.state === "unread" ? POCKET_UNREAD : POCKET_EMPTY}`;
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative block aspect-[63/88] w-full cursor-pointer overflow-hidden rounded-[5px] border bg-elevated transition-colors",
        open ? "border-text-secondary" : "border-border hover:border-border-strong",
      )}
    >
      {choice ? (
        <ChoiceFace choice={choice} photo={photo} imagesEnabled={imagesEnabled} />
      ) : pocket.state === "unread" ? (
        <span className="flex size-full items-center justify-center text-2xl font-semibold text-text-secondary">
          ?
        </span>
      ) : (
        <span className="flex size-full items-center justify-center bg-canvas text-xs text-text-muted">
          {POCKET_EMPTY}
        </span>
      )}
      {taken && (
        <span className="absolute top-1 right-1 rounded-full bg-canvas/80 p-0.5">
          <CircleAlert className="size-3.5 text-warning" aria-hidden="true" />
        </span>
      )}
    </button>
  );
}

/** A chosen card on its tile: its art, else the player's photo, else its name. */
function ChoiceFace({
  choice,
  photo,
  imagesEnabled,
}: {
  choice: NonNullable<Choice>;
  photo: string | null;
  imagesEnabled: boolean;
}) {
  const { card } = choice;
  const printing = card.printings.find((each) => each.id === choice.printingId);
  const art = cardArt(printing?.imageUrl, card.printings, card.exactName);
  const src = imagesEnabled && isRenderableImageUrl(art) ? art : photo;
  return src ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt="" className="size-full object-cover" />
  ) : (
    <span className="line-clamp-4 px-1 pt-1 text-[10px] font-semibold text-text-secondary">
      {card.exactName}
    </span>
  );
}

/**
 * What was read in one pocket, under its page's grid: the player's own
 * photo of the pocket beside the card it will be placed with, the
 * other guesses and the printings for a found pocket, the search for
 * one that was not found, and "Leave empty" on every one.
 */
function PocketDetail({
  pocket,
  choice,
  photo,
  taken,
  imagesEnabled,
  playerGames,
  onChoose,
  onLeaveEmpty,
}: {
  pocket: Pocket;
  choice: Choice;
  photo: string | null;
  taken: boolean;
  imagesEnabled: boolean;
  playerGames: readonly string[];
  onChoose: (choice: Choice) => void;
  onLeaveEmpty: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const read = pocket.state === "empty" ? null : pocket.read;
  const lookFor = read ? read.englishName || read.name : "";
  const matches = pocket.state === "found" ? pocket.matches : [];
  const others = matches.filter((match) => match.card.id !== choice?.card.id);

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-card)] border border-border bg-canvas p-3">
      <div className="flex items-start gap-3">
        {photo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photo}
            alt=""
            className="w-20 shrink-0 rounded-[5px] border border-border object-contain"
          />
        )}
        <div className="flex min-w-0 flex-col gap-2 text-sm">
          {taken && (
            <p className="flex items-start gap-1.5 text-text-secondary">
              <CircleAlert
                className="mt-0.5 size-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              {POCKET_TAKEN}
            </p>
          )}
          {pocket.state === "unread" && !choice && (
            <p className="text-text-primary">{POCKET_UNREAD}</p>
          )}
        </div>
      </div>

      {pocket.state === "found" && (
        <h4 className="text-base font-semibold text-text-primary">{IS_THIS_IT}</h4>
      )}
      {choice && (
        <ScannedCard
          card={choice.card}
          printingId={choice.printingId}
          imagesEnabled={imagesEnabled}
          className="w-32"
        />
      )}

      {others.length > 0 && (
        <div className="flex flex-col gap-2">
          {choice && <p className="text-xs text-text-muted">{OTHER_MATCHES}</p>}
          <ul className="flex [scrollbar-width:none] gap-2 overflow-x-auto pb-0.5 [&::-webkit-scrollbar]:hidden">
            {others.map((match) => (
              <li key={match.card.id} className="shrink-0">
                <OtherMatch
                  card={match.card}
                  imagesEnabled={imagesEnabled}
                  onPick={() =>
                    onChoose({ card: match.card, printingId: match.printingId })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {choice && (
        <PrintingChips
          card={choice.card}
          printingId={choice.printingId}
          onPrinting={(printingId) => onChoose({ card: choice.card, printingId })}
        />
      )}

      {/* A pocket with no guess is found by hand, the read name already
          typed when there is one. */}
      {pocket.state !== "found" &&
        (searching ? (
          <CardSearch
            imagesEnabled={imagesEnabled}
            playerGames={playerGames}
            autoFocus
            initialQuery={lookFor}
            onSelect={(card, printing) => {
              onChoose({ card, printingId: printing?.id ?? null });
              setSearching(false);
            }}
          />
        ) : (
          <Button type="button" variant="secondary" onClick={() => setSearching(true)}>
            {FIND_THE_CARD}
          </Button>
        ))}

      <Button type="button" variant="ghost" onClick={onLeaveEmpty}>
        {LEAVE_EMPTY}
      </Button>
    </div>
  );
}
