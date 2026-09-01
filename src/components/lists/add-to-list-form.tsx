"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  Check,
  ChevronRight,
  Handshake,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";

import { CardSearch } from "@/components/cards/card-search";
import { CardThumbnail } from "@/components/cards/card-thumbnail";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Select, TextInput } from "@/components/ui/controls";
import { Card } from "@/components/ui/card";
import { addToListAction } from "@/lib/lists/actions";
import { composerMode } from "@/lib/lists/composer-mode";
import { saveWantAction } from "@/lib/players/account-actions";
import {
  LIST_IDLE,
  MAX_DECK_LABEL,
  MAX_NOTE,
  MAX_QUANTITY,
  type ListKind,
  type ListState,
} from "@/lib/lists/schema";
import {
  pickBasePrinting,
  printingLabel,
  type CardPrinting,
  type CardResult,
} from "@/lib/cards/schema";

/**
 * Adding a card to a Flare list or a Have list.
 *
 * Search first, then confirm. Picking the card is the hard part on a phone at
 * a counter, so it gets the whole screen until it is done.
 *
 * The confirm step is deliberately short. The founder's screenshot of the
 * previous version told the story: printing, quantity, note, deck name and a
 * two-line checkbox, every one of them expanded, with the button that
 * actually posts pushed below the fold. Almost every Flare is "this card,
 * one of them, either way" — so that is what the form asks, in one screen,
 * and the rest folds away behind a disclosure.
 *
 * Not the swipe-between-panels the founder floated, and worth saying why:
 * swiping hides how many steps are left, has no keyboard or screen-reader
 * equivalent, and fights the page's own vertical scroll on a phone. The
 * intent behind the idea — stop showing me everything at once — is what
 * this keeps.
 */

const COPY: Record<ListKind, { title: string; hint: string; submit: string }> = {
  flare: {
    title: "Post a Flare",
    hint: "A card you want, or one you will let go. Everyone in this room sees it.",
    submit: "Post Flare",
  },
  have: {
    title: "Add a card you have",
    hint: "Only you can see your Have list. Nobody is told what you are carrying.",
    submit: "Add to my list",
  },
};

function Outcome({ state, saved = false }: { state: ListState; saved?: boolean }) {
  if (state.status === "idle") return null;

  const isError = state.status === "error";

  return (
    <p
      role="status"
      className={
        isError
          ? "flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
          : "flex items-start gap-2 rounded-[var(--radius-control)] border border-accent/30 bg-accent/[0.07] px-4 py-3 text-sm text-text-secondary"
      }
    >
      {isError ? (
        <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
      )}
      <span>
        {state.status === "error"
          ? state.message
          : saved
            ? `${state.cardName || "That card"} saved to your list. Search for your next card below.`
            : state.kind === "flare"
              ? `${state.cardName || "That card"} posted. Search for your next card below.`
              : `${state.cardName || "That card"} added.`}
      </span>
    </p>
  );
}

/**
 * One choice in a segmented control.
 *
 * A real radio underneath, visually hidden. Segmented controls built out
 * of buttons have to reinvent arrow-key movement and announce their own
 * state; a radio group gets both from the platform, and posts its value
 * without any of this component's state being involved.
 */
export function Segment({
  name,
  value,
  checked,
  onSelect,
  icon: Icon,
  children,
}: {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  icon: typeof Search;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-3 py-2 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:outline-none ${
        checked
          ? "bg-accent text-accent-contrast"
          : "text-text-secondary hover:text-text-primary"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onSelect}
        className="sr-only"
      />
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </label>
  );
}

/** A togglable pill backed by a real checkbox, so it posts on its own. */
function Chip({
  name,
  checked,
  onToggle,
  icon: Icon,
  children,
}: {
  name: string;
  checked: boolean;
  onToggle: () => void;
  icon: typeof Search;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:outline-none ${
        checked
          ? "border-accent bg-accent/15 text-text-primary"
          : "border-border text-text-muted hover:text-text-secondary"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onToggle}
        className="sr-only"
      />
      <Icon
        className={`size-3.5 shrink-0 ${checked ? "text-accent" : ""}`}
        aria-hidden="true"
      />
      {children}
    </label>
  );
}

/**
 * The icon-only chip: a checkbox drawn as a square toggle.
 *
 * The founder's call for the inline composer: the trade and cash
 * switches belong on the surface, not under "More", and the two icons
 * carry the meaning without words. Sized exactly like the stepper
 * buttons beside them so the row reads as one family of controls; the
 * name still posts and a screen reader still gets the words.
 */
export function IconChip({
  name,
  checked,
  onToggle,
  icon: Icon,
  label,
}: {
  name: string;
  checked: boolean;
  onToggle: () => void;
  icon: typeof Search;
  label: string;
}) {
  return (
    <label
      title={label}
      className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent has-[:focus-visible]:outline-none ${
        checked
          ? "border-accent bg-accent/15 text-accent"
          : "border-border text-text-muted hover:text-text-secondary"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={onToggle}
        aria-label={label}
        className="sr-only"
      />
      <Icon className="size-4 shrink-0" aria-hidden="true" />
    </label>
  );
}

/** Where a selection's composer belongs, in the key CardSearch matches on. */
export function composerKeyFor(picked: {
  card: CardResult;
  printingId: string;
}): string {
  return picked.printingId ? `${picked.card.id}:${picked.printingId}` : picked.card.id;
}

/**
 * The compact composer, opened inside the result that was tapped.
 *
 * The founder's goal, in their words: post a Flare without your finger
 * jumping around the page. So this is not a form the search hands you
 * off to — it is a panel that grows out of the row you just touched,
 * with the controls you are most likely to want stacked in the order
 * you are most likely to want them, and Post as the largest target of
 * the lot, a thumb's width from where the tap landed.
 *
 * What is on the surface: which way the card points, how many, and
 * Post. Everything else — terms, note, deck name — is one tap away
 * behind "More", which expands in place rather than anywhere else, for
 * the same reason.
 *
 * Not a swipe between panels, though the founder offered that as an
 * option. A horizontal swipe inside a vertically scrolling list is a
 * coin toss on a phone, and it hides that there is anything to find.
 * The button says so and costs the same one tap.
 */
function InlineComposer({
  picked,
  code,
  kind,
  onBoard,
  formAction,
  onClose,
  error = null,
}: {
  picked: { card: CardResult; printingId: string };
  code: string;
  kind: ListKind;
  onBoard: boolean;
  formAction: (formData: FormData) => void;
  onClose: () => void;
  /** Shown here rather than at the top of the page, where it would be
      off screen for anything but the first result. */
  error?: string | null;
}) {
  const { card, printingId } = picked;
  const [showcase, setShowcase] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [acceptsTrade, setAcceptsTrade] = useState(false);
  const [acceptsCash, setAcceptsCash] = useState(false);
  const [more, setMore] = useState(false);

  const printing = printingId
    ? (card.printings.find((entry) => entry.id === printingId) ?? null)
    : null;

  const which = printing
    ? (printingLabel(printing, card.exactName) ?? "This printing")
    : "Any printing";

  return (
    <form
      action={formAction}
      className="flex slide-open flex-col gap-2 border-t border-border p-3"
    >
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="cardId" value={card.id} />
      <input type="hidden" name="cardName" value={card.exactName} />
      <input type="hidden" name="printingId" value={printingId} />
      <input type="hidden" name="quantity" value={quantity} />

      {error && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger"
        >
          <X className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {onBoard && (
        <fieldset>
          <legend className="sr-only">
            Are you looking for this card or letting it go?
          </legend>
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-elevated p-1">
            <Segment
              name="intent"
              value="want"
              checked={!showcase}
              onSelect={() => setShowcase(false)}
              icon={Search}
            >
              I want this
            </Segment>
            <Segment
              name="intent"
              value="showcase"
              checked={showcase}
              onSelect={() => setShowcase(true)}
              icon={ArrowUpRight}
            >
              I have this
            </Segment>
          </div>
        </fieldset>
      )}

      {/* One line for everything a post decides by tapping: how many,
          the terms, and Post itself, side by side under the same thumb.
          The terms used to hide under "More"; the founder pulled them
          out — no words needed, the two icons carry it. */}
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            aria-label="One fewer"
            className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-text-secondary disabled:opacity-40"
          >
            <Minus className="size-4" aria-hidden="true" />
          </button>
          <output
            aria-live="polite"
            className="min-w-7 text-center font-semibold text-text-primary tabular-nums"
          >
            {quantity}
          </output>
          <button
            type="button"
            onClick={() => setQuantity(Math.min(MAX_QUANTITY, quantity + 1))}
            disabled={quantity >= MAX_QUANTITY}
            aria-label="One more"
            className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-text-secondary disabled:opacity-40"
          >
            <Plus className="size-4" aria-hidden="true" />
          </button>
        </div>

        {onBoard && (
          <fieldset className="flex shrink-0 items-center gap-1">
            <legend className="sr-only">
              {showcase
                ? "Will you trade this card away, sell it, or either?"
                : "Will you trade for this card, buy it, or either?"}
            </legend>
            <IconChip
              name="acceptsTrade"
              checked={acceptsTrade}
              onToggle={() => setAcceptsTrade(!acceptsTrade)}
              icon={Handshake}
              label="Trade"
            />
            <IconChip
              name="acceptsCash"
              checked={acceptsCash}
              onToggle={() => setAcceptsCash(!acceptsCash)}
              icon={Banknote}
              label="Cash"
            />
          </fieldset>
        )}

        <SubmitButton
          /* One word either way. "Post Flare" and "Post" side by side
             read as two different buttons for the same act. */
          label="Post"
          pendingLabel="Posting…"
          size="sm"
          className="h-9 min-w-0 flex-1 justify-center"
        />
      </div>

      {/*
       * The footer, deliberately last and deliberately one line: what
       * was tapped, the way to open the rest, and the way out. Every
       * pixel above this is a pixel between the tap and Post, which is
       * the distance this whole panel exists to shorten.
       */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMore((value) => !value)}
          aria-expanded={more}
          className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          <ChevronRight
            aria-hidden="true"
            className={`size-4 shrink-0 text-accent transition-transform duration-[var(--duration-base)] ${
              more ? "rotate-90" : ""
            }`}
          />
          More
        </button>

        <p className="min-w-0 flex-1 truncate text-right text-xs text-text-muted">
          {which}
        </p>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-m-1 shrink-0 rounded-full p-1 text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {/*
       * Kept mounted once opened, hidden rather than unmounted, so a
       * note typed and then folded away is still posted.
       */}
      <div className={`flex flex-col gap-3 ${more ? "" : "hidden"}`}>
        <TextInput
          name="note"
          maxLength={MAX_NOTE}
          placeholder={'Note, e.g. "NM only"'}
          aria-label="Note"
        />

        {kind === "flare" && (
          <TextInput
            name="deckLabel"
            maxLength={MAX_DECK_LABEL}
            placeholder={'Deck name, e.g. "RG Luffy"'}
            aria-label="Deck name"
          />
        )}
      </div>
    </form>
  );
}

export function AddToListForm({
  code,
  kind,
  imagesEnabled,
  game = null,
  target = "room",
  footer,
}: {
  code: string;
  kind: ListKind;
  imagesEnabled: boolean;
  /** The room's TCG, when the scan said which one. Scopes the search. */
  game?: string | null;
  /**
   * Where the card lands. "room" is the board in front of you; "list"
   * is the account's saved wants, for a player with no room open — the
   * couch case, which used to have nowhere to go but a stale room.
   */
  target?: "room" | "list";
  /**
   * A row renting the bottom of this card, under the form. Server-
   * rendered by the page (the open-to-trades switch lives here), so the
   * founder's rule holds: one block for the two answers to "what are
   * you here for?", without this form knowing what its tenant does.
   */
  footer?: React.ReactNode;
}) {
  /*
   * Which composer this build runs. Both are kept: see
   * src/lib/lists/composer-mode.ts for why, and for how to go back.
   * Read before anything else here, because the scroll behaviour below
   * depends on it.
   */
  const inline = composerMode() === "inline";

  const [state, formAction] = useActionState(
    target === "list" ? saveWantAction : addToListAction,
    LIST_IDLE,
  );

  /*
   * `printingId` rides along from the search: tapping a specific version in
   * the expanded list arrives here with that printing already chosen, so
   * nobody picks the alternate art twice. An empty string is "any printing" —
   * the same value the select's default option posts.
   */
  const [picked, setPicked] = useState<{
    card: CardResult;
    printingId: string;
  } | null>(null);

  /*
   * The deck name survives the post on purpose. Somebody building an RG
   * Luffy types the name once and posts fourteen cards; the form remounts
   * per card (see the `key` below), so the draft lives out here and comes
   * back as the next card's default.
   */
  const [deckDraft, setDeckDraft] = useState("");

  /*
   * Reset on every posted card rather than kept like the deck name: which
   * way a card points is a statement about that one card, and leaving it
   * set would quietly turn the next hunt into an offer.
   */
  const [showcase, setShowcase] = useState(false);
  const [quantity, setQuantity] = useState(1);
  /*
   * Both start unlit, the founder's call. Neither chip on is not an
   * error, it is "did not say" — and the server reads that as the plain
   * trade the board has always assumed. So the chips are what somebody
   * reaches for to widen or narrow their terms, not a question they are
   * made to answer before they can post.
   */
  const [acceptsTrade, setAcceptsTrade] = useState(false);
  const [acceptsCash, setAcceptsCash] = useState(false);

  /*
   * The result that just accepted a post, so the confirmation can stay
   * inside it. Inline only: the two-step flow hands the whole screen
   * back and puts its banner at the top, where the eye already is.
   * Posting from the fifth result should not put the only confirmation
   * off screen.
   */
  /*
   * Bumped on every successful post to clear the search.
   *
   * The founder's report: posting left the search sitting there with the
   * alternate-art list still hanging open under the card that had just
   * gone up, which reads as though nothing happened. Clearing it makes
   * the next card the obvious next move, which is what somebody posting
   * a deck actually wants.
   */
  const [searchReset, setSearchReset] = useState(0);

  /*
   * The two-step flow collapses a tall results list into a short form,
   * which yanks everything below it upward while the browser holds its
   * scroll offset — a beta tester reported the page "teleporting" down.
   * Anchoring the panel back into view on each pick keeps that form
   * where the eye already was.
   *
   * The inline composer must never do this. Nothing collapses there:
   * the tapped row stays exactly where it is and grows downwards, so
   * scrolling anywhere is the bug rather than the fix. Left running in
   * both modes it hauled the page up to the top of this card on every
   * tap, which is the opposite of the whole point.
   */
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inline || !picked) return;
    panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [inline, picked]);

  /*
   * The one time the inline composer is allowed to scroll: a post has
   * just cleared the search, so the results a reader was standing in
   * genuinely no longer exist. `block: "nearest"` keeps it honest — it
   * does nothing at all when the card is already on screen, which is
   * the common case.
   */
  useEffect(() => {
    if (!inline || searchReset === 0) return;
    panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [inline, searchReset]);

  /*
   * A successful post hands the screen back to the search. Keeping the
   * posted card up, with its "Change" button still showing, read as if
   * the post itself wanted changing; the founder called it out. The
   * banner above says what just posted, and the search below is the
   * "next card" the person actually wants now.
   *
   * Adjusted during render, the way React documents deriving state from
   * a changed input: each action result clears the picker exactly once,
   * so a card picked afterwards is never re-cleared by a re-render.
   */
  const [clearedFor, setClearedFor] = useState<ListState>(state);
  if (state !== clearedFor) {
    setClearedFor(state);
    if (state.status === "added") {
      setSearchReset((count) => count + 1);
      setPicked(null);
      setShowcase(false);
      setQuantity(1);
      setAcceptsTrade(false);
      setAcceptsCash(false);
    }
  }

  /* One verb either way: it is the same act, and where it lands is
     derived from whether somebody is standing in a room. */
  const copy =
    target === "list"
      ? {
          title: "What are you hunting?",
          hint: "Goes up for people near you. Walk into a room and it posts there too.",
          submit: "Post the Flare",
        }
      : COPY[kind];

  /* Only a Flare on a live board points a direction or names terms. */
  const onBoard = kind === "flare" && target === "room";

  return (
    <Card className="flex flex-col gap-4">
      {/* Zero-height scroll anchor: the Card itself may not forward refs. */}
      <div ref={panel} aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-text-primary">{copy.title}</h3>
        <p className="text-sm text-text-secondary">{copy.hint}</p>
      </div>

      <Outcome state={state} saved={target === "list"} />

      {inline ? (
        /*
         * The search never goes away. Tapping a result opens the
         * composer inside that result, so the controls arrive where the
         * finger already is, and posting does not move it.
         */
        <CardSearch
          imagesEnabled={imagesEnabled}
          game={game}
          onSelect={(card: CardResult, printing?: CardPrinting) => {
            const key = printing ? `${card.id}:${printing.id}` : card.id;
            /* Tapping the row that is already open closes it. */
            setPicked((current) =>
              current && composerKeyFor(current) === key
                ? null
                : { card, printingId: printing?.id ?? "" },
            );
          }}
          resetSignal={searchReset}
          composerKey={picked ? composerKeyFor(picked) : null}
          composer={
            picked ? (
              <InlineComposer
                key={composerKeyFor(picked)}
                picked={picked}
                code={code}
                kind={kind}
                onBoard={onBoard}
                formAction={formAction}
                onClose={() => setPicked(null)}
                error={state.status === "error" ? state.message : null}
              />
            ) : null
          }
        />
      ) : !picked ? (
        <CardSearch
          imagesEnabled={imagesEnabled}
          game={game}
          onSelect={(card: CardResult, printing?: CardPrinting) =>
            setPicked({ card, printingId: printing?.id ?? "" })
          }
        />
      ) : (
        <PickedCardForm
          key={`${picked.card.id}-${picked.printingId}`}
          picked={picked}
          code={code}
          kind={kind}
          onBoard={onBoard}
          imagesEnabled={imagesEnabled}
          formAction={formAction}
          onChangeCard={() => setPicked(null)}
          submitLabel={showcase ? "Post as available" : copy.submit}
          showcase={showcase}
          setShowcase={setShowcase}
          quantity={quantity}
          setQuantity={setQuantity}
          acceptsTrade={acceptsTrade}
          setAcceptsTrade={setAcceptsTrade}
          acceptsCash={acceptsCash}
          setAcceptsCash={setAcceptsCash}
          deckDraft={deckDraft}
          setDeckDraft={setDeckDraft}
        />
      )}

      {footer}
    </Card>
  );
}

function PickedCardForm({
  picked,
  code,
  kind,
  onBoard,
  imagesEnabled,
  formAction,
  onChangeCard,
  submitLabel,
  showcase,
  setShowcase,
  quantity,
  setQuantity,
  acceptsTrade,
  setAcceptsTrade,
  acceptsCash,
  setAcceptsCash,
  deckDraft,
  setDeckDraft,
}: {
  picked: { card: CardResult; printingId: string };
  code: string;
  kind: ListKind;
  onBoard: boolean;
  imagesEnabled: boolean;
  formAction: (formData: FormData) => void;
  onChangeCard: () => void;
  submitLabel: string;
  showcase: boolean;
  setShowcase: (value: boolean) => void;
  quantity: number;
  setQuantity: (value: number) => void;
  acceptsTrade: boolean;
  setAcceptsTrade: (value: boolean) => void;
  acceptsCash: boolean;
  setAcceptsCash: (value: boolean) => void;
  deckDraft: string;
  setDeckDraft: (value: string) => void;
}) {
  const { card } = picked;

  /*
   * Which version this Flare is for, held here rather than left to the
   * select's own DOM value. The founder caught the reason: changing the
   * printing has to change the picture. An uncontrolled select posts the
   * right id but tells nothing else on the form that it moved, so the
   * preview kept showing whichever art arrived from the search.
   */
  const [printingId, setPrintingId] = useState(picked.printingId);
  const anyPrinting = printingId === "";

  /*
   * The art, at last. The previous form named the card in text and
   * showed nothing, which on a phone means confirming a purchase from a
   * product code. The picture is the fastest possible check that the
   * right card was tapped.
   */
  const chosen = printingId
    ? (card.printings.find((printing) => printing.id === printingId) ?? null)
    : pickBasePrinting(card.printings, card.exactName);

  const hasPrintingChoice = card.printings.length > 1;
  const showsDeck = kind === "flare";

  /*
   * Open from the start when a specific version came through from the
   * search. That path is the one where the warning under the select
   * matters, and hiding it would let somebody post a needlessly narrow
   * request without ever seeing why it was narrow.
   */
  const detailsOpen = picked.printingId !== "";

  const detailsSummary = [
    hasPrintingChoice ? "printing" : null,
    "note",
    showsDeck ? "deck name" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="cardId" value={card.id} />
      <input type="hidden" name="cardName" value={card.exactName} />
      <input type="hidden" name="quantity" value={quantity} />
      {/* Carries "any printing" when the disclosure is never opened. */}
      {!hasPrintingChoice && (
        <input type="hidden" name="printingId" value={printingId} />
      )}

      <div className="flex items-center gap-3">
        <CardThumbnail
          imageUrl={chosen?.imageUrl ?? null}
          exactName={card.exactName}
          cardNumber={card.canonicalCardNumber}
          enabled={imagesEnabled}
          anyPrinting={anyPrinting}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate font-semibold text-text-primary">{card.exactName}</p>
          <p className="font-mono text-xs text-text-muted">
            {card.canonicalCardNumber}
          </p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onChangeCard}>
          Change
        </Button>
      </div>

      {/*
       * The question the whole board hangs on, and it used to be the
       * last control on the form, under three optional fields. Which
       * way a card points decides whether somebody walks over to offer
       * or to ask, so it is answered before anything optional.
       */}
      {onBoard && (
        <fieldset>
          <legend className="sr-only">
            Are you looking for this card or letting it go?
          </legend>
          <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-elevated p-1">
            <Segment
              name="intent"
              value="want"
              checked={!showcase}
              onSelect={() => setShowcase(false)}
              icon={Search}
            >
              I want this
            </Segment>
            <Segment
              name="intent"
              value="showcase"
              checked={showcase}
              onSelect={() => setShowcase(true)}
              icon={ArrowUpRight}
            >
              I have this
            </Segment>
          </div>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-text-secondary">How many</span>
          {/*
           * A stepper, not a number field. One tap beats summoning a
           * numeric keyboard to change 1 into 2, and it cannot be left
           * holding something that is not a number.
           */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              aria-label="One fewer"
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-text-secondary disabled:opacity-40"
            >
              <Minus className="size-4" aria-hidden="true" />
            </button>
            <output
              aria-live="polite"
              className="min-w-8 text-center font-semibold text-text-primary tabular-nums"
            >
              {quantity}
            </output>
            <button
              type="button"
              onClick={() => setQuantity(Math.min(MAX_QUANTITY, quantity + 1))}
              disabled={quantity >= MAX_QUANTITY}
              aria-label="One more"
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border text-text-secondary disabled:opacity-40"
            >
              <Plus className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/*
         * Whether to bring cards or money is the question somebody has
         * walking over, and the board could not answer it until now.
         * Never a price: a flag says something about the person, a
         * number would make this a marketplace.
         */}
        {onBoard && (
          <fieldset className="flex items-center gap-2">
            {/*
             * No visible label: two chips reading "Trade" and "Cash" are
             * their own question, and the words above them were furniture.
             * The legend stays for anyone who cannot see the pair, and it
             * reads against the direction, because the same two chips mean
             * buying on a want and selling on a showcase.
             */}
            <legend className="sr-only">
              {showcase
                ? "Will you trade this card away, sell it, or either?"
                : "Will you trade for this card, buy it, or either?"}
            </legend>
            <Chip
              name="acceptsTrade"
              checked={acceptsTrade}
              onToggle={() => setAcceptsTrade(!acceptsTrade)}
              icon={Handshake}
            >
              Trade
            </Chip>
            <Chip
              name="acceptsCash"
              checked={acceptsCash}
              onToggle={() => setAcceptsCash(!acceptsCash)}
              icon={Banknote}
            >
              Cash
            </Chip>
          </fieldset>
        )}
      </div>

      {/*
       * Everything a Flare does not need. Rendered inside the form
       * whether open or shut, so a value typed and then folded away is
       * still posted.
       */}
      <details open={detailsOpen} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-text-secondary [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-4 shrink-0 transition-transform group-open:rotate-90"
            aria-hidden="true"
          />
          Add {detailsSummary}
        </summary>

        <div className="flex flex-col gap-4 pt-3">
          {/*
           * "Any printing" is first in the list and the default for a plain
           * row tap — it is what most people mean, and defaulting to a
           * specific art would quietly make every request narrower than
           * intended.
           */}
          {hasPrintingChoice && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">Printing</span>
              <Select
                name="printingId"
                value={printingId}
                onChange={(event) => setPrintingId(event.target.value)}
              >
                <option value="">Any printing</option>
                {card.printings.map((printing) => (
                  <option key={printing.id} value={printing.id}>
                    {printingLabel(printing, card.exactName) ?? "This printing"}
                  </option>
                ))}
              </Select>
              {!anyPrinting && (
                <span className="text-xs text-text-muted">
                  Asking for this exact version. Switch to &ldquo;Any printing&rdquo;
                  above if any art will do, since more people can answer that.
                </span>
              )}
            </label>
          )}

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-text-secondary">
              Note{" "}
              <span className="font-normal text-text-muted">
                Optional, e.g. &ldquo;NM only&rdquo;
              </span>
            </span>
            <TextInput name="note" maxLength={MAX_NOTE} />
          </label>

          {showsDeck && (
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-text-secondary">
                Building a deck?{" "}
                <span className="font-normal text-text-muted">
                  Optional, e.g. &ldquo;RG Luffy&rdquo;
                </span>
              </span>
              <TextInput
                name="deckLabel"
                maxLength={MAX_DECK_LABEL}
                defaultValue={deckDraft}
                onChange={(event) => setDeckDraft(event.target.value)}
              />
              <span className="text-xs text-text-muted">
                Cards with the same deck name show as one folder on the board. The name
                sticks around so you can post the whole deck.
              </span>
            </label>
          )}
        </div>
      </details>

      <SubmitButton label={submitLabel} className="w-full justify-center" />
    </form>
  );
}
