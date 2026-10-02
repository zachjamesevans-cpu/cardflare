"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, PenLine, Search, X } from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { PlayerAvatar } from "@/components/players/player-avatar";
import { Button } from "@/components/ui/button";
import { TextInput, Textarea } from "@/components/ui/controls";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import {
  pickBasePrinting,
  printingLabel,
  type CardPrinting,
  type CardResult,
} from "@/lib/cards/schema";
import { cn } from "@/lib/cn";
import { formatHandle } from "@/lib/players/handle";
import { logTradeAction } from "@/lib/trades/logged-actions";
import {
  LOGGED_NOTE_MAX,
  LOGGED_PARTNER_MAX,
  LOGGED_PLACE_MAX,
  LOGGED_QUANTITY_MAX,
  todayISO,
} from "@/lib/trades/logged-schema";

/**
 * "Log a trade": the founder's ask, "allow me to enter my own trades.
 * Like if I did something off of CardFlare."
 *
 * One sheet, nine things in order: which way, which card, how many,
 * who with, where, when, a note, whether the Have list follows, and
 * the button. The same fields in the same order as the app's screen,
 * and the same limits, which live in logged-schema so neither form
 * can drift from what the server accepts.
 */

interface FoundPlayer {
  playerId: string;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  frame: string | null;
  ring: string | null;
  aura: string | null;
}

type Direction = "got" | "gave";

const LABEL = "text-sm font-medium text-text-secondary";

export function LogTradeButton({
  locals,
  imagesEnabled,
  playerGames,
}: {
  /** The stores they follow, as chips for "Where". */
  locals: string[];
  imagesEnabled: boolean;
  playerGames: readonly string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  /* A fresh form each time: the sheet's body unmounts when it closes
     (Sheet renders children only while open), and the key makes sure
     of it after a successful log too. */
  const [formKey, setFormKey] = useState(0);

  /* "Logged." is news for a moment, not a label. It went stale on the
     audit's screen, still lit after the trade it announced had been
     removed from the list below it. */
  useEffect(() => {
    if (!logged) return;
    const timer = setTimeout(() => setLogged(false), 4000);
    return () => clearTimeout(timer);
  }, [logged]);

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        size="sm"
        onClick={() => {
          setLogged(false);
          setOpen(true);
        }}
      >
        <PenLine className="size-4" aria-hidden="true" />
        Log a trade
      </Button>
      {logged && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-accent">
          <Check className="size-4" aria-hidden="true" />
          Logged.
        </p>
      )}
      <LogTradeSheet
        key={formKey}
        open={open}
        onClose={() => setOpen(false)}
        onLogged={() => {
          setOpen(false);
          setFormKey((value) => value + 1);
          setLogged(true);
          router.refresh();
        }}
        locals={locals}
        imagesEnabled={imagesEnabled}
        playerGames={playerGames}
      />
    </div>
  );
}

export function LogTradeSheet({
  open,
  onClose,
  onLogged,
  locals,
  imagesEnabled,
  playerGames,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: () => void;
  locals: string[];
  imagesEnabled: boolean;
  playerGames: readonly string[];
}) {
  const [direction, setDirection] = useState<Direction>("got");
  const [card, setCard] = useState<{
    card: CardResult;
    printing: CardPrinting | null;
  } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [partnerName, setPartnerName] = useState("");
  const [partner, setPartner] = useState<FoundPlayer | null>(null);
  const [place, setPlace] = useState("");
  const [tradedOn, setTradedOn] = useState(() => todayISO());
  const [note, setNote] = useState("");
  const [updateHaveList, setUpdateHaveList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const today = todayISO();

  const submit = () => {
    if (pending) return;
    if (!card) {
      setError("Pick a card from the list.");
      return;
    }
    setError(null);
    start(async () => {
      const result = await logTradeAction({
        cardId: card.card.id,
        printingId: card.printing?.id ?? null,
        quantity,
        direction,
        partnerPlayerId: partner?.playerId ?? null,
        partnerName: partner ? partner.displayName : partnerName,
        place,
        tradedOn,
        note,
        updateHaveList,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onLogged();
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Log a trade"
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-xs text-text-muted">
            Logged trades earn no Embers. Nobody else confirmed them.
          </p>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !card}
            className="w-full"
          >
            {pending ? "Logging…" : "Log it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 1. Which way it went. */}
        <div
          role="radiogroup"
          aria-label="Which way the card went"
          className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-canvas p-1"
        >
          {(
            [
              ["got", "I got a card"],
              ["gave", "I gave a card"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={direction === value}
              onClick={() => setDirection(value)}
              className={cn(
                "cursor-pointer rounded-[8px] py-2 text-sm font-semibold transition-colors",
                direction === value
                  ? "bg-accent text-accent-contrast"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 2. The card. */}
        <div className="flex flex-col gap-2">
          <p className={LABEL}>Card</p>
          {card ? (
            <ChosenCard
              card={card.card}
              printing={card.printing}
              imagesEnabled={imagesEnabled}
              onChange={() => setCard(null)}
            />
          ) : (
            <CardSearch
              imagesEnabled={imagesEnabled}
              playerGames={playerGames}
              onSelect={(picked, printing) =>
                setCard({ card: picked, printing: printing ?? null })
              }
            />
          )}
        </div>

        {/* 3. How many. */}
        <div className="flex items-center justify-between gap-3">
          <p className={LABEL}>Copies</p>
          <Stepper
            value={quantity}
            min={1}
            max={LOGGED_QUANTITY_MAX}
            onChange={setQuantity}
            label="copies"
          />
        </div>

        {/* 4. Who with: a name, or an account found by name. */}
        <div className="flex flex-col gap-2">
          <p className={LABEL}>Who with</p>
          {/* Two fields used to sit here with nothing saying which to
              use. One line says it: a name is enough, an account is
              better. */}
          <p className="text-xs text-text-muted">
            Type their name, or find their account so the trade opens their profile.
          </p>
          {partner ? (
            <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-2.5">
              <PlayerAvatar
                displayName={partner.displayName}
                seed={partner.playerId}
                avatarUrl={partner.avatarUrl}
                frame={partner.frame}
                ring={partner.ring}
                aura={partner.aura}
                size="sm"
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-text-primary">
                  {partner.displayName}
                </span>
                <span className="truncate text-xs text-text-muted">
                  {formatHandle(partner.handle)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setPartner(null)}
                aria-label={`Clear ${partner.displayName}`}
                className="-m-1 shrink-0 cursor-pointer rounded-full p-1 text-text-muted hover:text-text-primary"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <>
              <TextInput
                value={partnerName}
                onChange={(event) => setPartnerName(event.target.value)}
                maxLength={LOGGED_PARTNER_MAX}
                placeholder="Their name"
                aria-label="Their name"
              />
              <PartnerSearch onPick={setPartner} />
            </>
          )}
        </div>

        {/* 5. Where. */}
        <div className="flex flex-col gap-2">
          <label htmlFor="log-trade-place" className={LABEL}>
            Where
          </label>
          <TextInput
            id="log-trade-place"
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            maxLength={LOGGED_PLACE_MAX}
            placeholder="A store, a kitchen table, a parking lot"
          />
          {locals.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {locals.map((name) => (
                <Chip key={name} active={place === name} onClick={() => setPlace(name)}>
                  {name}
                </Chip>
              ))}
            </div>
          )}
        </div>

        {/* 6. When. */}
        <div className="flex flex-col gap-2">
          <label htmlFor="log-trade-day" className={LABEL}>
            When
          </label>
          <TextInput
            id="log-trade-day"
            type="date"
            value={tradedOn}
            max={today}
            onChange={(event) => setTradedOn(event.target.value)}
            className="[color-scheme:dark]"
          />
        </div>

        {/* 7. A note. */}
        <div className="flex flex-col gap-2">
          <label htmlFor="log-trade-note" className={LABEL}>
            Note <span className="font-normal text-text-muted">Optional</span>
          </label>
          <Textarea
            id="log-trade-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={LOGGED_NOTE_MAX}
            rows={2}
            className="min-h-0"
            placeholder="Threw in a sleeve, cash on top, whatever you want to remember."
          />
          <p className="text-right text-xs text-text-muted tabular-nums">
            {note.length}/{LOGGED_NOTE_MAX}
          </p>
        </div>

        {/* 8. The Have list. */}
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold text-text-primary">
              Keep my Have list in step
            </span>
            <span className="text-xs text-text-muted">
              A card you gave comes off your Have list. A card you got goes on it.
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={updateHaveList}
            aria-checked={updateHaveList}
            onChange={(event) => setUpdateHaveList(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-[6px] border border-border-strong bg-canvas accent-accent"
          />
        </label>
      </div>
    </Sheet>
  );
}

/** The picked card as a row, with the way to pick again. */
function ChosenCard({
  card,
  printing,
  imagesEnabled,
  onChange,
}: {
  card: CardResult;
  printing: CardPrinting | null;
  imagesEnabled: boolean;
  onChange: () => void;
}) {
  const art = printing ?? pickBasePrinting(card.printings, card.exactName);
  const label = printing ? printingLabel(printing, card.exactName) : "Any printing";

  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-border bg-elevated p-2.5">
      <span className="block h-14 w-10 shrink-0 overflow-hidden rounded-[6px] border border-border bg-surface">
        {imagesEnabled && art?.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={art.imageUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-text-primary">
          {card.exactName}
        </span>
        <span className="truncate font-mono text-xs text-text-muted">
          {card.canonicalCardNumber}
          {label ? ` · ${label}` : ""}
        </span>
      </span>
      <button
        type="button"
        onClick={onChange}
        className="shrink-0 cursor-pointer text-sm font-semibold text-accent hover:underline"
      >
        Change
      </button>
    </div>
  );
}

/**
 * "Find on CardFlare": the same search the People card uses, debounced
 * the same way, with a tap picking the account instead of opening it.
 */
function PartnerSearch({ onPick }: { onPick: (player: FoundPlayer) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<FoundPlayer[] | null>(null);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(0);

  const search = (value: string) => {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);

    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setFound(null);
      setFailed(false);
      return;
    }

    const request = ++latest.current;
    timer.current = setTimeout(() => {
      void fetch(`/api/players/search?q=${encodeURIComponent(trimmed)}`, {
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`${response.status}`);
          const body = (await response.json()) as { players: FoundPlayer[] };
          if (latest.current === request) {
            setFound(body.players);
            setFailed(false);
          }
        })
        .catch(() => {
          if (latest.current === request) setFailed(true);
        });
    }, 300);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="relative block">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <TextInput
          value={query}
          onChange={(event) => search(event.target.value)}
          placeholder="Find on CardFlare"
          aria-label="Find on CardFlare"
          className="pl-9"
        />
      </label>

      {failed && (
        <p className="text-sm text-text-muted">
          The search did not go through. Try again in a moment.
        </p>
      )}
      {found && found.length === 0 && !failed && (
        <p className="text-sm text-text-muted">
          Nobody yet. Try their handle instead, or part of either.
        </p>
      )}
      {found && found.length > 0 && (
        <ul className="flex flex-col">
          {found.map((person) => (
            <li key={person.playerId}>
              <button
                type="button"
                onClick={() => {
                  onPick(person);
                  setQuery("");
                  setFound(null);
                }}
                className="flex w-full cursor-pointer items-center gap-3 border-t border-border py-2.5 text-left first:border-t-0 hover:bg-elevated"
              >
                <PlayerAvatar
                  displayName={person.displayName}
                  seed={person.playerId}
                  avatarUrl={person.avatarUrl}
                  frame={person.frame}
                  ring={person.ring}
                  aura={person.aura}
                  size="sm"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {person.displayName}
                  </span>
                  <span className="truncate text-xs text-text-muted">
                    {formatHandle(person.handle)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1 text-sm font-semibold transition-colors",
        active
          ? "border-accent bg-accent text-accent-contrast"
          : "border-border-strong text-text-secondary hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}
