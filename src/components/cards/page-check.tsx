"use client";

import { useState } from "react";
import { CircleAlert, CircleHelp } from "lucide-react";

import {
  CardViewer,
  type Choice,
  type ViewerItem,
} from "@/components/cards/card-viewer";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isRenderableImageUrl } from "@/lib/cards/images";
import type { PocketOutcome } from "@/lib/cards/scan";
import {
  CHECK_PAGES,
  NOT_SURE,
  POCKET_EMPTY,
  POCKET_UNREAD,
  POCKETS_PER_PAGE,
  RETAKE,
  checkUnsureLabel,
  pocketAt,
} from "@/lib/cards/scan-rules";
import { cardArt } from "@/lib/cards/schema";
import { cn } from "@/lib/cn";

/**
 * Checking scanned pages before anything is placed: each page as the
 * 3x3 grid it is in the real binder, "Page 4", every pocket showing the
 * card it will be placed with.
 *
 * The founder agreed nothing goes in a binder before the player has
 * looked, so every pocket's card is the player's to change. A tap on a
 * pocket opens the card viewer on it, full screen (`CardViewer`): the
 * player's own photo of the pocket beside our match, and the menu, That's
 * it, Other printing, Not this card (the other guesses, then the Flare
 * composer's picker, for one card) and Leave empty. A pocket the reader
 * could not place offers "Might be one of these", the catalogue's
 * closest cards to what it saw (`suggestions`), over Find the card. The founder: "it should just have a popup
 * full card viewer and a contextual menu there. i didn't even know i had
 * to scroll down." From there the arrows, the keyboard and a swipe step
 * through every pocket of every page. Whatever is left chosen is what
 * the Add button places, in that same pocket.
 *
 * The careful reader says when it was not sure of a pocket: that tile
 * wears a small mark, and the viewer says so with the reader's note.
 * While any pocket is unsure or unread and not yet looked at, "Check 2
 * unsure" opens the viewer stepping through only those.
 *
 * The outline the product draws for "you have this" is not used on a
 * tile: here a card is only a guess until it is placed.
 */

/** One pocket of a read page, as the server answered. */
export type Pocket = PocketOutcome;
/** The card a pocket will be placed with; null leaves it empty. */
export type { Choice };

/** A page for the check, numbered where it will land. */
export interface CheckedPage {
  id: string;
  /** 1-based, as people count. */
  page: number;
  /** The player's own photo of each pocket: links to the server's copies. */
  cellUrls: readonly (string | null)[];
  /** Null until the page has read, or when it did not. */
  read: { pockets: readonly Pocket[]; choices: readonly Choice[] } | null;
  /** What a page that has not read says instead of its grid. */
  line: string;
  /** Still being read: the line wears the spinner. */
  reading?: boolean;
  /** A page that did not read, shot again; absent when it cannot be. */
  onRetake?: () => void;
}

/** Where one pocket is: its page's id and its slot. */
type At = { id: string; slot: number };

/** A pocket worth a second look: one the reader was unsure of, or could not read. */
export function doubtful(pocket: Pocket): boolean {
  return unsure(pocket) || pocket.state === "unread";
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
  onChoose: (pageId: string, slot: number, choice: Choice) => void;
}) {
  /* The viewer, open: the pockets it steps through and the one on screen. */
  const [walk, setWalk] = useState<{ list: At[]; at: number } | null>(null);
  /* Pockets the player has looked at and said yes to, or changed. */
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  const keyOf = (at: At) => `${at.id}:${at.slot}`;
  const pocketOf = (at: At) => {
    const page = pages.find((each) => each.id === at.id);
    const pocket = page?.read?.pockets.find((each) => each.slot === at.slot);
    return page && pocket ? { page, pocket } : null;
  };

  /* Every pocket of every read page, in order: what the viewer steps through. */
  const every: At[] = pages.flatMap((page) =>
    page.read
      ? Array.from({ length: POCKETS_PER_PAGE }, (_, slot) => ({ id: page.id, slot }))
      : [],
  );
  const unsureLeft = every.filter((at) => {
    const found = pocketOf(at);
    return found && doubtful(found.pocket) && !checked.has(keyOf(at));
  });

  const items: ViewerItem[] = (walk?.list ?? []).map((at) => {
    const found = pocketOf(at);
    const page = found?.page;
    const pocket = found?.pocket ?? { slot: at.slot, state: "empty" as const };
    const read = pocket.state === "empty" ? null : pocket.read;
    return {
      key: keyOf(at),
      place: { page: page?.page ?? 1, slot: at.slot },
      photo: page?.cellUrls[at.slot] ?? null,
      choice: page?.read?.choices[at.slot] ?? null,
      matches: pocket.state === "found" ? pocket.matches : [],
      suggestions: pocket.state === "unread" ? pocket.suggestions : undefined,
      state: pocket.state,
      sure: pocket.state === "found" ? pocket.sure : undefined,
      note: pocket.state === "empty" ? undefined : pocket.note,
      lookFor: read ? read.englishName || read.name : "",
      taken: page ? taken.has(pocketAt(page.page, at.slot)) : false,
    };
  });

  const looked = (at: At) => setChecked((all) => new Set(all).add(keyOf(at)));
  /* On to the next pocket; past the last, back to the grid. */
  const onward = () =>
    setWalk((current) =>
      current && current.at + 1 < current.list.length
        ? { ...current, at: current.at + 1 }
        : null,
    );
  const here = walk ? walk.list[walk.at] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {unsureLeft.length > 0 && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => setWalk({ list: unsureLeft, at: 0 })}
        >
          <CircleHelp className="size-4 text-warning" aria-hidden="true" />
          {checkUnsureLabel(unsureLeft.length)}
        </Button>
      )}

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
            <ul className="grid grid-cols-3 gap-2">
              {page.read.pockets.map((pocket) => (
                <li key={pocket.slot}>
                  <PocketTile
                    pocket={pocket}
                    choice={page.read?.choices[pocket.slot] ?? null}
                    photo={page.cellUrls[pocket.slot] ?? null}
                    taken={taken.has(pocketAt(page.page, pocket.slot))}
                    imagesEnabled={imagesEnabled}
                    onOpen={() =>
                      setWalk({
                        list: every,
                        at: every.findIndex(
                          (at) => at.id === page.id && at.slot === pocket.slot,
                        ),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex items-center gap-3">
              <p
                role={page.reading ? "status" : "alert"}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 text-sm",
                  page.reading ? "text-text-secondary" : "text-text-primary",
                )}
              >
                {page.reading && <Spinner size="sm" />}
                {page.line}
              </p>
              {page.onRetake && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={page.onRetake}
                >
                  {RETAKE}
                </Button>
              )}
            </div>
          )}
        </section>
      ))}

      {walk && here && (
        <CardViewer
          label={CHECK_PAGES}
          items={items}
          at={walk.at}
          onAt={(at) => setWalk({ ...walk, at })}
          imagesEnabled={imagesEnabled}
          playerGames={playerGames}
          onChoose={(choice) => {
            onChoose(here.id, here.slot, choice);
            looked(here);
          }}
          onConfirm={() => {
            looked(here);
            onward();
          }}
          onLeaveEmpty={() => {
            onChoose(here.id, here.slot, null);
            looked(here);
            onward();
          }}
          onClose={() => setWalk(null)}
        />
      )}
    </div>
  );
}

/**
 * One pocket on the grid. A chosen card shows our match's art, or the
 * player's own photo of the pocket when card art is off; an unread
 * pocket is a "?"; an empty one is faint. A pocket already full in this
 * binder wears a small mark, and the viewer says why; so does a guess
 * the reader was not sure of, in the other corner.
 */
function PocketTile({
  pocket,
  choice,
  photo,
  taken,
  imagesEnabled,
  onOpen,
}: {
  pocket: Pocket;
  choice: Choice;
  photo: string | null;
  taken: boolean;
  imagesEnabled: boolean;
  /** The card viewer, on this pocket. */
  onOpen: () => void;
}) {
  const label = choice
    ? `Pocket ${pocket.slot + 1}: ${choice.card.exactName}${unsure(pocket) ? `. ${NOT_SURE}` : ""}`
    : `Pocket ${pocket.slot + 1}: ${pocket.state === "unread" ? POCKET_UNREAD : POCKET_EMPTY}`;
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={label}
      onClick={onOpen}
      className="relative block aspect-[63/88] w-full cursor-pointer overflow-hidden rounded-[5px] border border-border bg-elevated transition-colors hover:border-border-strong"
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
      {unsure(pocket) && (
        <span className="absolute top-1 left-1 rounded-full bg-canvas/80 p-0.5">
          <CircleHelp className="size-3.5 text-warning" aria-hidden="true" />
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

/** A found pocket the careful reader was not sure of. A quick read says nothing either way. */
export function unsure(pocket: Pocket): boolean {
  return pocket.state === "found" && pocket.sure === false;
}
