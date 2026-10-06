"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Pencil, Share2 } from "lucide-react";

import { HEADER_BUTTON, HEADER_ICON } from "@/components/ui/header-button";
import { AddBinderCard } from "@/components/binder/add-binder-card";
import { BinderSettings } from "@/components/binder/binder-settings";
import {
  usePocketDrag,
  useSlide,
  type DropSpot,
} from "@/components/binder/pocket-drag";
import {
  AddPocket,
  COLUMNS,
  EmptyPocket,
  POCKETS_PER_PAGE,
  PageArrow,
  PageDots,
  PocketTile,
} from "@/components/binder/pockets";
import {
  CardImageZoom,
  OfferPicksContext,
  useOfferBuild,
  type OfferBuild,
  type OfferSend,
  type OfferableCard,
  type ZoomAsk,
  type ZoomCard,
} from "@/components/cards/card-image-zoom";
import { InYourOffer } from "@/components/feed/post-actions";
import { OfferReview } from "@/components/flares/offer-review";
import { Sheet } from "@/components/ui/sheet";
import {
  offerOnBinderAction,
  placeBinderCardAction,
  removeBinderCardAction,
} from "@/lib/binder/actions";
import type { Binder, BinderCard, BinderSettingsPatch } from "@/lib/binder/binder";
import type { BinderCoverId } from "@/lib/binder/covers";
import {
  BINDER_OFFER_COPY,
  BINDER_OFFER_MAX_CARDS,
  BINDER_OFFER_NOTE_MAX,
} from "@/lib/binder/offer-copy";
import {
  LAST_POCKET,
  pageOf,
  pagesFor,
  placeInPockets,
} from "@/lib/binder/pocket-math";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { cn } from "@/lib/cn";

/**
 * The binder, open: the cards in pockets, a page at a time.
 *
 * Drawn the way a binder sits on a table: three by three pockets per
 * page, always (the founder: "Just have a 3x3."), arrows and dots to
 * turn it, and a tap on any pocket opens the card large in the same
 * viewer every other card on the site opens in.
 *
 * A trade binder is answerable. The founder: "Any card in a trade
 * binder you should be able to do the same stack as making an offer
 * on their trade cards - like scrolling through them with the same UI
 * as making an offer on someone's flares. Can then DM them about
 * them." So a signed-in visitor's viewer carries the Feed's stack: a
 * toggle on each card ("I want this card"), the tray, the bar under
 * the pages, and the same review, whose send is one message in the
 * pair's conversation (`offerOnBinderAction`). Somebody signed out is
 * shown the way in instead. The owner, and a binder that is not up for
 * trade, get the viewer as it was.
 *
 * And shareable: "Add a public link that can be shared for binders so
 * they can view it on web or app." Share is its own round button at the
 * top, beside the pencil and never inside it (the founder: "Share
 * button shouldn't be in same bubble as edit."), for the owner and a
 * visitor alike. It hands the system share sheet the short link,
 * cardflare.gg/b/<shareCode>, or copies it. On the owner's private
 * binder it stays, and says what would make it shareable.
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
 * REAL POCKETS. Every card has a pocket (page 1 is 0 to 8), and a gap
 * stays a gap, the way a binder keeps a slot open for a card still
 * being chased. Every empty pocket on the owner's binder is a "+" that
 * opens Add cards FOR THAT POCKET: "Adding a card in a specific slot
 * should put that exact card there." Once the last page is full the
 * owner sees one more page of them (`pagesFor`). A visitor's empty
 * pockets stay empty.
 *
 * HOLD AND MOVE, in one gesture (`usePocketDrag`). The founder: "I
 * should be able to hold it down, and without lifting finger start
 * moving the cards around." A finger held on a card lifts it, a mouse
 * lifts it by moving; while it is up the pocket under it shows where
 * it will land and the other cards slide aside exactly as the drop
 * will put them (`placeInPockets`, the database's own rule: an empty
 * pocket takes it, a full one slides the run along to the next gap).
 * Held at the page's edge or over an arrow, the page turns. Let go,
 * the move paints at once and `placeBinderCardAction` keeps it; a
 * refusal puts the card back and says so. Alt and the arrow keys do
 * the same from a keyboard, pocket by pocket.
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
  offerAs = null,
}: {
  binder: Binder;
  imagesEnabled: boolean;
  /** The owner's sign-up games, for the search's default chip. */
  playerGames?: readonly string[];
  /** The visible heading, or null when the shell already names the page. */
  title: string | null;
  /** A visitor's one control under the page: the message door. */
  footer?: ReactNode;
  /**
   * Who may make an offer on the cards: a signed-in "player" who is
   * not the owner and not blocked either way, or a signed-out "guest",
   * who is shown the way in. Null for everyone else.
   */
  offerAs?: "player" | "guest" | null;
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
  /** The Add cards sheet, open, and the pocket that opened it. */
  const [adding, setAdding] = useState<{ pocket: number | null } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** What the last batch of adds said: "Added 3 cards." */
  const [added, setAdded] = useState<string | null>(null);
  /** Share was pressed on the owner's private binder. */
  const [shareRefused, setShareRefused] = useState(false);
  const [pending, start] = useTransition();

  /* A visitor's "On your hunts" packs the matches into pockets in a
     row; everything else is drawn where it sits. */
  const list = useMemo(
    () =>
      !binder.yours && onHuntsOnly
        ? cards
            .filter((card) => card.onYourHunt)
            .map((card, index) => ({ ...card, pocket: index }))
        : cards,
    [binder.yours, onHuntsOnly, cards],
  );
  const perPage = POCKETS_PER_PAGE;
  /* Enough pages to reach the last card; for the owner, one more of
     "+" pockets once the last page is full. */
  const pages = pagesFor(list, binder.yours);
  /* Never off the end: removing the last card on the last page folds
     back onto a page that exists. */
  const page = Math.min(at, pages - 1);

  /*
   * THE GESTURE. Let go over a pocket, the card goes there; over
   * Remove, it leaves; anywhere else, it goes back. Held over an edge,
   * the page turns.
   */
  const {
    lifted,
    over: hovering,
    grid,
    ghost,
    pocketProps,
  } = usePocketDrag({
    enabled: binder.yours && !pending,
    columns: COLUMNS,
    onDrop: (entryId, spot) => {
      if (spot === "remove") remove(entryId);
      else if (typeof spot === "number") move(entryId, page * perPage + spot);
    },
    onTurn: (side) => {
      const next = side === "prev" ? page - 1 : page + 1;
      if (next >= 0 && next < pages) setAt(next);
    },
    canTurn: (side) => (side === "prev" ? page > 0 : page < pages - 1),
  });
  const dragging = lifted?.entryId ?? null;
  const over: DropSpot | null = dragging ? hovering : null;
  const landing = typeof over === "number" ? page * perPage + over : null;
  /* While a card is held over a pocket, the page is drawn as the drop
     would leave it: the others already slid aside. */
  const drawn =
    dragging && landing !== null ? placeInPockets(list, dragging, landing) : list;
  const pockets = pageOf(drawn, page);
  const held = dragging ? cards.find((card) => card.entryId === dragging) : undefined;
  const slide = useSlide(
    grid,
    `${page}:${pockets.map((card) => card?.entryId ?? "").join(",")}`,
  );

  /*
   * THE OFFER, as the Feed post's. The picks live here, for the page's
   * life, and reach every pocket's viewer through `OfferPicksContext`,
   * so a card picked from one pocket is still picked when the viewer is
   * opened from another. Keyed by the pocket's entry id, capped at the
   * copies in the pocket. The send is the binder's: one message.
   */
  const asking = !binder.yours && settings.forTrade && offerAs !== null;
  const picking = asking && offerAs === "player";
  const offerable = useMemo<OfferableCard[]>(
    () =>
      picking
        ? cards.map((card) => ({
            flareId: card.entryId,
            name: card.name,
            imageUrl: card.imageUrl,
            printingLabel: card.printingLabel,
            max: Math.max(1, card.quantity),
          }))
        : [],
    [picking, cards],
  );
  /** What the last send said, and the conversation it went to. */
  const [sent, setSent] = useState<{ message: string; threadId: string } | null>(null);
  const sendOffer: OfferSend = async (lines, message) => {
    const result = await offerOnBinderAction(binder.id, {
      items: lines.map((line) => ({ entryId: line.key, quantity: line.quantity })),
      note: message.trim() || null,
    });
    if (!result.ok) return { ok: false, message: result.message, refused: [] };
    setSent({ message: result.message, threadId: result.threadId });
    return { ok: true, offered: lines.length, refused: [] };
  };
  const build = useOfferBuild(null, offerable, sendOffer);
  const offers: OfferBuild = {
    ...build,
    /* Never past what one offer carries; a new pick starts a new offer. */
    toggle: (key) => {
      if (!(key in build.picks) && build.count >= BINDER_OFFER_MAX_CARDS) return;
      setSent(null);
      build.toggle(key);
    },
  };
  const chat = sent ? `/local?thread=${encodeURIComponent(sent.threadId)}` : null;

  const askFor = (card: BinderCard): ZoomAsk | null => {
    if (!asking) return null;
    if (!picking) {
      return {
        mode: "sign-in",
        href: `/login?next=/b/${binder.id}`,
        label: BINDER_OFFER_COPY.signIn,
      };
    }
    return {
      mode: "pick",
      key: card.entryId,
      want: BINDER_OFFER_COPY.want,
      picked: BINDER_OFFER_COPY.picked,
      max: BINDER_OFFER_MAX_CARDS,
      sent: sent && chat ? { message: sent.message, href: chat } : null,
    };
  };

  const zoomCards: ZoomCard[] = list.map((card) => ({
    imageUrl: card.imageUrl,
    exactName: card.name,
    cardNumber: card.number,
    caption: card.printingLabel,
    note: card.note,
    direction: "showcase",
    ask: askFor(card),
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
   * Put the card in `pocket`, as the database will: an empty pocket
   * takes it, a full one slides the run along to the next gap. Painted
   * at once, and the page follows the card so it is seen landing; a
   * refusal puts every card back where it was and says so.
   */
  const move = (entryId: string, pocket: number) => {
    if (pending) return;
    const card = cards.find((entry) => entry.entryId === entryId);
    if (!card || pocket < 0 || pocket > LAST_POCKET || card.pocket === pocket) return;
    const before = cards;
    setCards(placeInPockets(cards, entryId, pocket));
    setAt(Math.floor(pocket / perPage));
    setError(null);
    setAdded(null);
    start(async () => {
      const result = await placeBinderCardAction(binder.id, { entryId, pocket });
      if (!result.ok) {
        setCards(before);
        setError(`${result.message} It is back where it was.`);
        return;
      }
      router.refresh();
    });
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
    setAdded(null);
    setCards((current) => current.filter((entry) => entry.entryId !== entryId));
    act(() => removeBinderCardAction(card.entryId, binder.id));
  };

  const countLine = `${binder.count} ${binder.count === 1 ? "card" : "cards"}`;
  const line = binderLine(settings.forTrade, binder.yours, binder.ownerName);

  /* The name a share sheet and a chat preview give the link. */
  const shareTitle = `${binder.ownerName}'s ${settings.name}`;

  const view = (
    <div className="flex w-full flex-col gap-4">
      {/* The title row: the words on the left; on the right, Share in
          its own round button, and for the owner the pencil that opens
          the settings sheet beside it. */}
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
        <div className="flex shrink-0 items-center gap-2">
          {(binder.yours || settings.forTrade) && (
            <ShareBinder
              binderId={binder.id}
              shareCode={binder.shareCode}
              title={shareTitle}
              forTrade={settings.forTrade}
              onPrivate={() => setShareRefused(true)}
            />
          )}
          {binder.yours && (
            <button
              type="button"
              aria-label="Binder settings"
              onClick={() => setSettingsOpen(true)}
              className={HEADER_BUTTON}
            >
              <Pencil className={HEADER_ICON} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Share on a private binder: no link to give, so the reason,
          inline, until Up for trade is on. */}
      {shareRefused && !settings.forTrade && (
        <p role="status" className="text-sm text-text-secondary">
          {PRIVATE_SHARE_LINE}
        </p>
      )}

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
          ref={grid}
          className="grid grid-cols-3 gap-2"
          aria-label={`Page ${page + 1} of ${pages}`}
        >
          {pockets.map((card, index) => {
            const slot = page * perPage + index;
            /* The held card's own pocket: where it will land, or where
               it goes back to, drawn faint with the accent ring. */
            const own = card !== undefined && card.entryId === dragging;
            return (
              <li
                key={card ? card.entryId : `empty-${page}-${index}`}
                ref={card ? slide(card.entryId) : undefined}
                className={cn(
                  "relative rounded-[5px] transition-opacity",
                  own && "opacity-40 ring-2 ring-accent",
                )}
              >
                {card ? (
                  <div
                    role="group"
                    aria-label={
                      binder.yours
                        ? `${card.name}, page ${page + 1}, pocket ${index + 1}. Hold or drag to move it, or hold Alt and use the arrow keys.`
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
                    {...(binder.yours ? pocketProps(card.entryId) : {})}
                    onKeyDown={
                      binder.yours
                        ? (event) => {
                            if (!event.altKey) return;
                            if ((event.target as HTMLElement).closest("dialog")) return;
                            const step = ARROW_STEP(event.key);
                            if (step === null) return;
                            event.preventDefault();
                            move(card.entryId, card.pocket + step);
                          }
                        : undefined
                    }
                    className={cn(
                      "rounded-[5px]",
                      binder.yours &&
                        "cursor-grab touch-manipulation select-none [-webkit-touch-callout:none] active:cursor-grabbing",
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
                      position={list.findIndex(
                        (entry) => entry.entryId === card.entryId,
                      )}
                      ask={askFor(card)}
                      thumbClassName="w-full"
                      thumb={<PocketTile card={card} imagesEnabled={imagesEnabled} />}
                    />
                  </div>
                ) : binder.yours ? (
                  <AddPocket onClick={() => setAdding({ pocket: slot })} />
                ) : (
                  <EmptyPocket />
                )}
              </li>
            );
          })}
        </ul>

        {pages > 1 && (
          <>
            <PageArrow
              side="prev"
              disabled={page === 0}
              onClick={() => setAt(page - 1)}
              ring={over === "prev"}
            />
            <PageArrow
              side="next"
              disabled={page === pages - 1}
              onClick={() => setAt(page + 1)}
              ring={over === "next"}
            />
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
          data-drop="remove"
          className={cn(
            "flex h-14 items-center justify-center rounded-[var(--radius-control)] border-2 border-dashed border-danger text-sm font-semibold text-danger transition-colors",
            over === "remove" ? "bg-danger/20" : "bg-danger/5",
          )}
        >
          Remove
        </div>
      )}

      {/* The card in the hand: over everything, under the finger, a
          little bigger and casting a shadow, the way the app lifts it. */}
      {held &&
        lifted &&
        createPortal(
          <div
            ref={ghost}
            aria-hidden="true"
            className="pointer-events-none fixed top-0 left-0 z-50 rounded-[5px] shadow-[var(--shadow-panel)]"
            style={{ width: lifted.width, height: lifted.height }}
          >
            <PocketTile card={held} imagesEnabled={imagesEnabled} />
          </div>,
          document.body,
        )}

      {pages > 1 && <PageDots pages={pages} page={page} onPick={setAt} />}

      {/* "2 in your offer · Review", the Feed post's bar, while
          anything is picked; once an offer goes, what it said and the
          way into the chat. */}
      {picking && (
        <div className="flex flex-col items-center gap-1 text-center">
          <InYourOffer />
          {sent && chat && offers.count === 0 && (
            <p role="status" className="text-sm text-text-secondary">
              <span className="font-semibold text-accent">{sent.message}</span>{" "}
              <Link
                href={chat}
                className="font-semibold text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                Open the chat
              </Link>
            </p>
          )}
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

      {/* What the last batch of adds did, in the action's words. */}
      {added && !error && (
        <p role="status" className="text-center text-sm text-text-secondary">
          {added}
        </p>
      )}

      {binder.yours ? (
        <>
          {/* The Add cards sheet, opened from the "+" pockets alone,
              each one opening it for its own pocket. */}
          <AddBinderCard
            binderId={binder.id}
            imagesEnabled={imagesEnabled}
            playerGames={playerGames}
            open={adding !== null}
            onOpenChange={(open) => {
              if (!open) setAdding(null);
            }}
            pocket={adding?.pocket ?? null}
            inBinder={cards}
            onAdded={(message, firstPocket) => {
              setError(null);
              setAdded(message);
              if (firstPocket !== null) setAt(Math.floor(firstPocket / perPage));
            }}
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

      {/* The review, once for every pocket: the Flare's sheet, in the
          binder's words, closing on a send so the page can say where
          the offer went. */}
      {picking && (
        <OfferReview
          open={offers.reviewOpen}
          onClose={offers.closeReview}
          lines={offers.lines}
          onQuantity={offers.setQuantity}
          onRemove={offers.remove}
          onSubmit={offers.submit}
          onSent={offers.clear}
          sendLabel={BINDER_OFFER_COPY.send}
          notePlaceholder={BINDER_OFFER_COPY.notePlaceholder}
          noteMax={BINDER_OFFER_NOTE_MAX}
          closeOnSent
        />
      )}
    </div>
  );

  /* The picks reach every pocket's viewer, and the bar, from here. */
  return picking ? (
    <OfferPicksContext.Provider value={offers}>{view}</OfferPicksContext.Provider>
  ) : (
    view
  );
}

/** What the owner of a private binder is told when they press Share. */
const PRIVATE_SHARE_LINE = "Turn on Up for trade to share this binder.";

/**
 * SHARE, at the top of the binder, in its own round button: the
 * founder, "Share button shouldn't be in same bubble as edit." The link
 * is the short one, cardflare.gg/b/<shareCode> (the binder's id for a
 * binder from before codes), which opens the binder on the web for
 * anyone and in the app on a phone that has it. A phone's own share
 * sheet when there is one (a dismissed sheet is not an error); anywhere
 * else the link is copied and "Link copied" shows beside the button for
 * two seconds, because a button that copies silently gets pressed four
 * times. A private binder has no link to give, so on the owner's the
 * button stays and says, under the title, what would make it
 * shareable: never a dead press.
 */
function ShareBinder({
  binderId,
  shareCode,
  title,
  forTrade,
  onPrivate,
}: {
  binderId: string;
  /** The short link's code; null for a binder that has none yet. */
  shareCode: string | null;
  title: string;
  /** The live Up for trade setting, not the one the page loaded with. */
  forTrade: boolean;
  /** Pressed on a private binder: the page says why there is no link. */
  onPrivate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const share = async () => {
    if (!forTrade) {
      onPrivate();
      return;
    }
    const url = `${window.location.origin}/b/${shareCode ?? binderId}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        /* Dismissed: they changed their mind, and that is the end of it. */
        if (error instanceof DOMException && error.name === "AbortError") return;
        /* Refused for another reason: copying still works. */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard refused: nothing more to offer here. */
    }
  };

  return (
    <>
      <span
        role="status"
        aria-live="polite"
        className="text-xs font-semibold text-accent"
      >
        {copied ? "Link copied" : ""}
      </span>
      <button
        type="button"
        onClick={() => void share()}
        aria-label="Share binder"
        title="Share binder"
        className={HEADER_BUTTON}
      >
        {copied ? (
          <Check className={cn(HEADER_ICON, "text-accent")} aria-hidden="true" />
        ) : (
          <Share2 className={HEADER_ICON} aria-hidden="true" />
        )}
      </button>
    </>
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
