"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";

import { AddBinderCard } from "@/components/binder/add-binder-card";
import { BinderSettings } from "@/components/binder/binder-settings";
import { CardImageZoom, type ZoomCard } from "@/components/cards/card-image-zoom";
import { Button } from "@/components/ui/button";
import { removeBinderCardAction, saveBinderSettingsAction } from "@/lib/binder/actions";
import type { Binder, BinderCard, BinderSettingsPatch } from "@/lib/binder/binder";
import {
  pocketsPerPage,
  type BinderCoverId,
  type BinderLayout,
} from "@/lib/binder/covers";
import { isRenderableImageUrl } from "@/lib/cards/images";
import { cn } from "@/lib/cn";

/**
 * The binder, open: the cards in pockets, a page at a time.
 *
 * The Have list drawn the way a trade binder sits on a table. Two by
 * two or three by three pockets per page, arrows and dots to turn it,
 * and a tap on any pocket opens the card large in the same viewer
 * every other card on the site opens in, with no offer control: the
 * binder is not answerable yet, this round.
 *
 * The owner gets their tools under the page: Add cards, an Edit
 * toggle that puts a remove cross and a Front tag on every pocket,
 * and the settings strip. A visitor gets the "On your hunts" chip
 * when any card is one they are hunting, and the message door.
 *
 * The page's settings are held here as live values so a change paints
 * at once; the server's copy arrives behind it with the refresh and
 * wins, which is also what keeps two tabs honest.
 */

type Settings = {
  layout: BinderLayout;
  cover: BinderCoverId;
  isPublic: boolean;
  frontEntryId: string | null;
};

const settingsOf = (binder: Binder): Settings => ({
  layout: binder.layout,
  cover: binder.cover,
  isPublic: binder.isPublic,
  frontEntryId: binder.frontEntryId,
});

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
  /* The server's copy, when a refresh brings a new one, replaces the
     live values: the documented way to derive state from a prop. */
  const [seen, setSeen] = useState(binder);
  if (seen !== binder) {
    setSeen(binder);
    setSettings(settingsOf(binder));
  }

  const [at, setAt] = useState(0);
  const [onHuntsOnly, setOnHuntsOnly] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const cards =
    !binder.yours && onHuntsOnly
      ? binder.cards.filter((card) => card.onYourHunt)
      : binder.cards;
  const perPage = pocketsPerPage(settings.layout);
  const pages = Math.max(1, Math.ceil(cards.length / perPage));
  /* Never off the end: removing the last card on the last page, or
     widening the layout, folds back onto a page that exists. */
  const page = Math.min(at, pages - 1);
  const shown = cards.slice(page * perPage, page * perPage + perPage);
  const pockets: (BinderCard | null)[] = [
    ...shown,
    ...Array.from({ length: perPage - shown.length }, () => null),
  ];

  const zoomCards: ZoomCard[] = cards.map((card) => ({
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

  const countLine = `${binder.count} ${binder.count === 1 ? "card" : "cards"}`;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        {title && (
          <h2 className="truncate text-lg font-extrabold text-text-primary">{title}</h2>
        )}
        <p className="text-xs text-text-muted tabular-nums">
          {countLine} · Page {page + 1} of {pages}
        </p>
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
          className={cn(
            "grid gap-2",
            settings.layout === 2 ? "grid-cols-2 gap-3" : "grid-cols-3",
          )}
          aria-label={`Page ${page + 1} of ${pages}`}
        >
          {pockets.map((card, index) => (
            <li
              key={card ? card.entryId : `empty-${page}-${index}`}
              className="relative"
            >
              {card ? (
                <>
                  <CardImageZoom
                    imageUrl={card.imageUrl}
                    exactName={card.name}
                    cardNumber={card.number}
                    caption={card.printingLabel}
                    note={card.note}
                    direction="showcase"
                    enabled={imagesEnabled}
                    siblings={zoomCards}
                    position={page * perPage + index}
                    thumbClassName="w-full"
                    thumb={
                      <PocketTile
                        card={card}
                        imagesEnabled={imagesEnabled}
                        big={settings.layout === 2}
                      />
                    }
                  />
                  {binder.yours && editing && (
                    <>
                      <button
                        type="button"
                        disabled={pending}
                        aria-label={`Remove ${card.name}`}
                        onClick={() => act(() => removeBinderCardAction(card.entryId))}
                        className="absolute top-1 right-1 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full bg-canvas/85 text-text-primary ring-1 ring-border-strong transition-colors hover:bg-danger hover:text-accent-contrast"
                      >
                        <X className="size-3.5" strokeWidth={3} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={settings.frontEntryId === card.entryId}
                        onClick={() => {
                          const patch = { frontEntryId: card.entryId };
                          paint(patch);
                          act(() => saveBinderSettingsAction(patch));
                        }}
                        className={cn(
                          "absolute bottom-1 left-1 z-10 cursor-pointer rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ring-1 transition-colors",
                          settings.frontEntryId === card.entryId
                            ? "bg-accent text-accent-contrast ring-accent"
                            : "bg-canvas/85 text-text-secondary ring-border-strong hover:text-text-primary",
                        )}
                      >
                        Front
                      </button>
                    </>
                  )}
                </>
              ) : (
                <EmptyPocket />
              )}
            </li>
          ))}
        </ul>

        {pages > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setAt(page - 1)}
              className="absolute top-1/2 left-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-canvas/80 text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-30"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={page === pages - 1}
              onClick={() => setAt(page + 1)}
              className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-canvas/80 text-text-secondary transition-colors hover:text-text-primary disabled:cursor-default disabled:opacity-30"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </>
        )}
      </div>

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
          <div className="flex flex-wrap items-center gap-2">
            <AddBinderCard imagesEnabled={imagesEnabled} playerGames={playerGames} />
            {binder.count > 0 && (
              <Button
                type="button"
                variant={editing ? "primary" : "secondary"}
                aria-pressed={editing}
                onClick={() => setEditing((value) => !value)}
              >
                <Pencil className="size-4" aria-hidden="true" />
                {editing ? "Done" : "Edit"}
              </Button>
            )}
          </div>
          <BinderSettings
            isPublic={settings.isPublic}
            layout={settings.layout}
            cover={settings.cover}
            onChange={paint}
          />
        </>
      ) : (
        footer
      )}
    </div>
  );
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
  big,
}: {
  card: BinderCard;
  imagesEnabled: boolean;
  big: boolean;
}) {
  const art = imagesEnabled && isRenderableImageUrl(card.imageUrl);

  return (
    <div className={POCKET}>
      {art ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={card.imageUrl ?? ""} alt="" className="size-full object-cover" />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-0.5 bg-elevated px-1 text-center">
          <span
            className={cn(
              "line-clamp-2 font-semibold text-text-primary",
              big ? "text-xs" : "text-[10px]",
            )}
          >
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
        <span
          className={cn(
            "absolute inset-x-0 bottom-0 bg-accent text-center font-bold tracking-wider text-accent-contrast uppercase",
            big ? "py-1 text-[10px]" : "py-0.5 text-[8px]",
          )}
        >
          ON YOUR HUNT
        </span>
      )}
    </div>
  );
}

function EmptyPocket() {
  return <div aria-hidden="true" className={POCKET} />;
}
