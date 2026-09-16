"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Plus, Star, Trash2 } from "lucide-react";

import { CardPicker } from "@/components/flares/card-picker";
import { FlareComposerPreview } from "@/components/flares/flare-composer-preview";
import {
  addCard,
  CAPTION_MAX,
  chosenPrinting,
  clearDraft,
  EMPTY_DRAFT,
  isEmptyDraft,
  loadDraft,
  saveDraft,
  type Draft,
  type DraftCard,
} from "@/components/flares/draft";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, Textarea, TextInput } from "@/components/ui/controls";
import { Stepper } from "@/components/ui/stepper";
import { printingLabel } from "@/lib/cards/schema";
import { cn } from "@/lib/cn";
import { draftSummary, MAX_COPIES, mergeItems } from "@/lib/flares/draft-rules";
import { publishPostAction } from "@/lib/flares/publish-actions";

/**
 * One composer: select cards, compose one Flare, preview, post.
 *
 * The founder's model: a Flare is one social post of one or many
 * cards, pointing one way, with one caption, optionally into a hunt.
 * So there is one intent for the whole post, one caption, one hunt
 * setting (Looking for only), and a tray of cards each with its own
 * printing and copies. The first card is the cover.
 *
 * The draft lives in this browser until it is posted, so a reload, a
 * phone call or a wrong tab does not lose three minutes of picking.
 * Posting is the one write, and it is guarded against a second tap.
 */

export interface ComposerViewer {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ComposerRoom {
  name: string;
  storeName: string;
}

type Step = "compose" | "pick" | "preview" | "posted";

const subscribeNothing = () => () => {};

export function FlareComposer(props: {
  viewer: ComposerViewer;
  hunts: { id: string; name: string }[];
  imagesEnabled: boolean;
  playerGames: readonly string[];
  /** The room the poster is standing in, when they are. */
  room: ComposerRoom | null;
  /** "Add cards" on a hunt arrives with the hunt already chosen. */
  initialHuntId: string | null;
}) {
  /*
   * The draft is read from storage, which the server does not have, so
   * the body mounts only once this is the browser: the first client
   * paint matches the server's and no effect has to set state.
   */
  const mounted = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  if (!mounted) {
    return (
      <Card className="flex flex-col gap-2 p-4 sm:p-6">
        <h1 className="text-xl font-bold text-text-primary">New flare</h1>
        <p className="text-sm text-text-muted">Loading your draft…</p>
      </Card>
    );
  }
  return <ComposerBody {...props} />;
}

function ComposerBody({
  viewer,
  hunts,
  imagesEnabled,
  playerGames,
  room,
  initialHuntId,
}: {
  viewer: ComposerViewer;
  hunts: { id: string; name: string }[];
  imagesEnabled: boolean;
  playerGames: readonly string[];
  room: ComposerRoom | null;
  initialHuntId: string | null;
}) {
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft() ?? EMPTY_DRAFT;
    if (initialHuntId && hunts.some((hunt) => hunt.id === initialHuntId)) {
      return {
        ...saved,
        intent: "want",
        hunt: { kind: "existing", id: initialHuntId },
      };
    }
    return saved;
  });
  const [step, setStep] = useState<Step>("compose");
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<{
    posted: number;
    huntId: string | null;
  } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    saveDraft(draft);
  }, [draft]);

  const patch = (next: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...next }));
  const patchCard = (cardId: string, next: Partial<DraftCard>) =>
    patch({
      cards: draft.cards.map((item) =>
        item.card.id === cardId ? { ...item, ...next } : item,
      ),
    });
  const move = (cardId: string, by: -1 | 1) => {
    const index = draft.cards.findIndex((item) => item.card.id === cardId);
    const to = index + by;
    if (index === -1 || to < 0 || to >= draft.cards.length) return;
    const cards = [...draft.cards];
    [cards[index], cards[to]] = [cards[to], cards[index]];
    patch({ cards });
  };
  const makeCover = (cardId: string) => {
    const item = draft.cards.find((entry) => entry.card.id === cardId);
    if (!item) return;
    patch({
      cards: [item, ...draft.cards.filter((entry) => entry.card.id !== cardId)],
    });
  };
  const remove = (cardId: string) => {
    patch({ cards: draft.cards.filter((item) => item.card.id !== cardId) });
    if (editing === cardId) setEditing(null);
  };

  const choice = draft.hunt;
  const huntName =
    draft.intent !== "want"
      ? null
      : choice.kind === "existing"
        ? (hunts.find((hunt) => hunt.id === choice.id)?.name ?? null)
        : choice.kind === "new"
          ? choice.name.trim() || null
          : null;

  const post = () => {
    if (pending || draft.cards.length === 0) return;
    setError(null);
    start(async () => {
      const hunt =
        draft.intent === "want"
          ? draft.hunt.kind === "existing"
            ? { id: draft.hunt.id }
            : draft.hunt.kind === "new" && draft.hunt.name.trim()
              ? { name: draft.hunt.name.trim() }
              : null
          : null;
      const result = await publishPostAction({
        intent: draft.intent,
        caption: draft.caption.trim() || null,
        items: mergeItems(
          draft.cards.map((item) => ({
            cardId: item.card.id,
            printingId: item.printingId,
            quantity: item.quantity,
          })),
        ),
        hunt,
        acceptsTrade: draft.acceptsTrade,
        acceptsCash: draft.acceptsCash,
        toRoom: room !== null,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      clearDraft();
      setDraft(EMPTY_DRAFT);
      setEditing(null);
      setPosted({ posted: result.posted, huntId: result.huntId });
      setStep("posted");
    });
  };

  if (step === "posted" && posted) {
    return (
      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <p className="flex items-center gap-2 text-lg font-bold text-accent">
          <Check className="size-5" aria-hidden="true" />
          Your flare is up.
        </p>
        <p className="text-sm text-text-secondary">
          {posted.posted === 1 ? "One card" : `${posted.posted} cards`} posted
          {room ? ` to ${room.name}` : " to your area"}
          {posted.huntId ? ", and on your hunt." : "."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href="/feed?tab=mine" className={buttonStyles("primary", "sm")}>
            See it in the Feed
          </Link>
          {posted.huntId && (
            <Link
              href={`/hunts/${posted.huntId}`}
              className={buttonStyles("secondary", "sm")}
            >
              Open the hunt
            </Link>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setPosted(null);
              setStep("compose");
            }}
          >
            Post another
          </Button>
        </div>
      </Card>
    );
  }

  if (step === "pick") {
    return (
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <CardPicker
          imagesEnabled={imagesEnabled}
          playerGames={playerGames}
          cards={draft.cards}
          onAdd={(card, printing) =>
            patch({ cards: addCard(draft.cards, card, printing) })
          }
          onRemove={remove}
          onDone={() => setStep("compose")}
        />
      </Card>
    );
  }

  if (step === "preview") {
    return (
      <Card className="flex flex-col gap-4 p-4 sm:p-6">
        <FlareComposerPreview
          draft={draft}
          viewer={viewer}
          huntName={huntName}
          onBack={() => setStep("compose")}
          onPost={post}
          pending={pending}
          error={error}
        />
      </Card>
    );
  }

  const editingCard = editing
    ? (draft.cards.find((item) => item.card.id === editing) ?? null)
    : null;
  const copiesLabel = draft.intent === "want" ? "Copies needed" : "Copies available";

  return (
    <Card className="flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-text-primary">New flare</h1>
        <p className="text-sm text-text-muted">
          {room
            ? `Posting to ${room.name} at ${room.storeName}.`
            : "Posting to your area."}
        </p>
      </div>

      {/* One direction for the whole post. */}
      <div
        role="radiogroup"
        aria-label="What this flare is"
        className="grid grid-cols-2 gap-1 rounded-[var(--radius-control)] border border-border bg-canvas p-1"
      >
        {(
          [
            ["want", "Looking for"],
            ["showcase", "Offering"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={draft.intent === value}
            onClick={() => patch({ intent: value })}
            className={cn(
              "cursor-pointer rounded-[8px] py-2 text-sm font-semibold transition-colors",
              draft.intent === value
                ? "bg-accent text-accent-contrast"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* The cards, in order, with the cover first. */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold text-text-primary">Cards in this flare</h2>
          <span className="text-xs text-text-muted tabular-nums">
            {draft.cards.length === 0 ? "None yet" : draftSummary(draft.cards)}
          </span>
        </div>

        <ul
          aria-label="Cards in this flare"
          className="flex [scrollbar-width:none] gap-2 overflow-x-auto py-1 [&::-webkit-scrollbar]:hidden"
        >
          {draft.cards.map((item, index) => {
            const printing = chosenPrinting(item);
            const active = editing === item.card.id;
            return (
              <li key={item.card.id} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setEditing(active ? null : item.card.id)}
                  aria-pressed={active}
                  aria-label={`Edit ${item.card.exactName}`}
                  className={cn(
                    "block h-[84px] w-[60px] cursor-pointer overflow-hidden rounded-[6px] border bg-elevated transition-[box-shadow]",
                    active
                      ? "border-accent shadow-[0_0_8px_rgba(198,238,79,0.5)]"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  {printing?.imageUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={printing.imageUrl}
                      alt=""
                      className="size-full object-cover"
                    />
                  )}
                </button>
                <span className="pointer-events-none absolute top-1 left-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-contrast tabular-nums">
                  {index + 1}
                  {item.quantity > 1 && ` · ${item.quantity}`}
                </span>
                {index === 0 && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-surface/90 py-0.5 text-center text-[9px] font-bold tracking-wider text-text-secondary uppercase">
                    Cover
                  </span>
                )}
              </li>
            );
          })}
          <li className="shrink-0">
            <button
              type="button"
              onClick={() => setStep("pick")}
              className="flex h-[84px] w-[60px] cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border border-dashed border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
            >
              <Plus className="size-5" aria-hidden="true" />
              <span className="text-[10px] font-semibold">Add cards</span>
            </button>
          </li>
        </ul>

        {editingCard && (
          <CardEditor
            item={editingCard}
            index={draft.cards.findIndex(
              (item) => item.card.id === editingCard.card.id,
            )}
            count={draft.cards.length}
            copiesLabel={copiesLabel}
            onPrinting={(printingId) => patchCard(editingCard.card.id, { printingId })}
            onQuantity={(quantity) => patchCard(editingCard.card.id, { quantity })}
            onMove={(by) => move(editingCard.card.id, by)}
            onCover={() => makeCover(editingCard.card.id)}
            onRemove={() => remove(editingCard.card.id)}
          />
        )}
      </div>

      {/* What goes with every card. */}
      <label className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between text-sm font-medium text-text-secondary">
          <span>
            Caption <span className="font-normal text-text-muted">Optional</span>
          </span>
          <span className="text-xs text-text-muted tabular-nums">
            {draft.caption.length}/{CAPTION_MAX}
          </span>
        </span>
        <Textarea
          value={draft.caption}
          onChange={(event) =>
            patch({ caption: event.target.value.slice(0, CAPTION_MAX) })
          }
          maxLength={CAPTION_MAX}
          rows={2}
          placeholder={
            draft.intent === "want"
              ? "NM only, or what you can trade for them"
              : "Condition, or what you are after in return"
          }
          className="min-h-0"
        />
      </label>

      {draft.intent === "want" && (
        <div className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary">
              Add to a hunt
            </span>
            <Select
              value={
                draft.hunt.kind === "existing"
                  ? draft.hunt.id
                  : draft.hunt.kind === "new"
                    ? "__new"
                    : ""
              }
              onChange={(event) => {
                const value = event.target.value;
                patch({
                  hunt:
                    value === ""
                      ? { kind: "none" }
                      : value === "__new"
                        ? { kind: "new", name: "" }
                        : { kind: "existing", id: value },
                });
              }}
            >
              <option value="">No hunt</option>
              {hunts.map((hunt) => (
                <option key={hunt.id} value={hunt.id}>
                  {hunt.name}
                </option>
              ))}
              <option value="__new">New hunt</option>
            </Select>
          </label>
          {draft.hunt.kind === "new" && (
            <TextInput
              value={draft.hunt.name}
              onChange={(event) =>
                patch({ hunt: { kind: "new", name: event.target.value.slice(0, 60) } })
              }
              maxLength={60}
              placeholder="Hunt name, like Green Zoro"
              aria-label="Hunt name"
              autoFocus
            />
          )}
          {draft.hunt.kind !== "none" && (
            <p className="text-xs text-text-muted">
              Cards already on the hunt keep their copies; new cards are added.
            </p>
          )}
        </div>
      )}

      {/* What they will do for it. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Open to</span>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["acceptsTrade", "Trade"],
              ["acceptsCash", "Cash ok"],
            ] as const
          ).map(([key, label]) => {
            /* The last one on cannot be switched off: a Flare open to
               nothing is not a Flare, and the database says so too. The
               app's composer holds the same line. */
            const last =
              draft[key] &&
              !draft[key === "acceptsTrade" ? "acceptsCash" : "acceptsTrade"];
            return (
              <button
                key={key}
                type="button"
                aria-pressed={draft[key]}
                aria-disabled={last || undefined}
                onClick={() => {
                  if (!last) patch({ [key]: !draft[key] });
                }}
                className={cn(
                  "cursor-pointer rounded-full border px-3 py-1 text-xs font-bold transition-colors",
                  draft[key]
                    ? "border-accent bg-accent text-accent-contrast"
                    : "border-border-strong text-text-secondary hover:text-text-primary",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => {
            setError(null);
            setStep("preview");
          }}
          disabled={draft.cards.length === 0}
          className="flex-1"
        >
          Preview
        </Button>
        {!isEmptyDraft(draft) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              clearDraft();
              setDraft(EMPTY_DRAFT);
              setEditing(null);
              setError(null);
            }}
          >
            Clear draft
          </Button>
        )}
      </div>
    </Card>
  );
}

/** One card's own settings: which printing, how many, and where it sits. */
function CardEditor({
  item,
  index,
  count,
  copiesLabel,
  onPrinting,
  onQuantity,
  onMove,
  onCover,
  onRemove,
}: {
  item: DraftCard;
  index: number;
  count: number;
  copiesLabel: string;
  onPrinting: (printingId: string | null) => void;
  onQuantity: (quantity: number) => void;
  onMove: (by: -1 | 1) => void;
  onCover: () => void;
  onRemove: () => void;
}) {
  const printing = chosenPrinting(item);
  const hasChoice = item.card.printings.length > 1;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-elevated/60 p-3">
      <div className="flex items-start gap-3">
        <span className="block h-[70px] w-[50px] shrink-0 overflow-hidden rounded-[6px] border border-border bg-elevated">
          {printing?.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={printing.imageUrl} alt="" className="size-full object-cover" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate font-semibold text-text-primary">
            {item.card.exactName}
          </p>
          <p className="font-mono text-xs text-text-muted">
            {item.card.canonicalCardNumber}
          </p>
          <p className="text-xs text-text-secondary">
            {index === 0 ? "The cover" : `Card ${index + 1} of ${count}`}
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Printing</span>
        {hasChoice ? (
          <Select
            value={item.printingId ?? ""}
            onChange={(event) => onPrinting(event.target.value || null)}
          >
            <option value="">Any printing</option>
            {item.card.printings.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {printingLabel(entry, item.card.exactName) ?? "This printing"}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-sm text-text-muted">Any printing</span>
        )}
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">{copiesLabel}</span>
        <Stepper
          value={item.quantity}
          min={1}
          max={MAX_COPIES}
          label={`copies of ${item.card.exactName}`}
          onChange={onQuantity}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Move left
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={index >= count - 1}
          onClick={() => onMove(1)}
        >
          Move right
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
        {index !== 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={onCover}>
            <Star className="size-4" aria-hidden="true" />
            Make cover
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="ml-auto"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Remove
        </Button>
      </div>
    </div>
  );
}
