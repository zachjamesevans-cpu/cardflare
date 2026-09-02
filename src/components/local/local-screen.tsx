"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Check, ChevronLeft, Loader2, MapPin, MessageCircle, Send } from "lucide-react";

import { CardImageZoom } from "@/components/cards/card-image-zoom";
import { PostalAsk } from "@/components/feed/postal-ask";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/controls";
import {
  closeThreadAction,
  localFeedAtAction,
  openThreadAction,
  readThreadAction,
  sendMessageAction,
  setLocalRadiusAction,
} from "@/lib/local/actions";
import type { LocalFeed, LocalFlare } from "@/lib/local/feed";
import {
  LOCAL_RADII,
  MESSAGE_MAX_LENGTH,
  agoLabel,
  milesLabel,
} from "@/lib/local/shared";
import type { ThreadMessage, ThreadSummary } from "@/lib/local/threads";
import { cn } from "@/lib/cn";

/** One bit in the browser: "they chose device location here before". */
const DEVICE_CHOICE_KEY = "cf-local-device";

/**
 * The Local tab: the room's question, asked across your whole area.
 *
 * Two halves on one screen, because they are one loop: the Flares
 * people near you have posted, and the conversations those Flares
 * started. "I have this" is the hinge — it opens a thread tied to that
 * exact card, so every conversation begins with its subject already on
 * the table. There is deliberately no other way to message anybody.
 *
 * Distance is a number the server computed; no coordinate ever reaches
 * this component. When the player has given no location at all, the
 * whole screen is the ask — a Local tab that quietly shows nothing
 * would read as broken, and the ask says exactly what the five digits
 * buy.
 */

export function LocalScreen({
  feed: serverFeed,
  threads,
  postalCode,
}: {
  feed: LocalFeed;
  threads: ThreadSummary[];
  postalCode: string | null;
}) {
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  /*
   * The browser-location override. The server rendered the ZIP's view;
   * "Use my location" asks the browser, hands the coordinates to ONE
   * action call — never stored, same promise as the app — and shows
   * what came back. State rather than a reload because a reload would
   * ask the browser all over again.
   */
  const [deviceFeed, setDeviceFeed] = useState<LocalFeed | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const feed = deviceFeed ?? serverFeed;

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocateError("This browser cannot share a location. The ZIP works.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const found = await localFeedAtAction(
            position.coords.latitude,
            position.coords.longitude,
          );
          setLocating(false);
          if (found) {
            setDeviceFeed(found);
            /* Remember the CHOICE, never the place. The founder: "when
               you do location it should cache it and save it." The
               browser keeps the grant; this one bit is what lets the
               next visit use it without another tap. Coordinates still
               ride one request and are never written anywhere. */
            try {
              localStorage.setItem(DEVICE_CHOICE_KEY, "1");
            } catch {
              /* Storage blocked: the tap still worked, it just will not
                 be remembered. */
            }
          } else {
            setLocateError("Could not look around from here. The ZIP works.");
          }
        })();
      },
      () => {
        setLocating(false);
        setLocateError("No problem. A ZIP code works just as well.");
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }, []);

  /*
   * The remembered choice, honoured quietly — the app's exact manner:
   * a permission already granted is used on open, and nobody who never
   * granted one sees a prompt for merely arriving. The permissions API
   * is asked first so a since-revoked grant cannot pop a dialog; where
   * that API is missing or refuses to answer, the stored choice only
   * exists because a grant once succeeded here, so trying is right.
   */
  useEffect(() => {
    let cancelled = false;

    let remembered = false;
    try {
      remembered = localStorage.getItem(DEVICE_CHOICE_KEY) === "1";
    } catch {
      remembered = false;
    }
    if (!remembered || !("geolocation" in navigator)) return;

    const attempt = () => {
      if (!cancelled) locate();
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "granted") attempt();
        })
        .catch(attempt);
    } else {
      void Promise.resolve().then(attempt);
    }

    return () => {
      cancelled = true;
    };
  }, [locate]);

  if (openThreadId) {
    return <ThreadView threadId={openThreadId} onBack={() => setOpenThreadId(null)} />;
  }

  return (
    <div className="flex flex-col gap-6">
      {feed.source === "none" ? (
        <Card className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
              <MapPin className="size-5 text-accent" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold text-text-primary">Flares near you</h2>
              <p className="text-sm text-text-secondary">
                Local shows every Flare posted near you, and you can message the poster
                when you have the card. It just needs to know roughly where you are,
                once.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              className="w-full sm:w-auto sm:self-start"
              onClick={locate}
              disabled={locating}
            >
              <MapPin className="size-4" aria-hidden="true" />
              {locating ? "Looking around…" : "Use my location"}
            </Button>
            {locateError && (
              <p className="text-sm text-text-secondary">{locateError}</p>
            )}
          </div>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold tracking-wide text-text-muted uppercase">
              or
            </span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <PostalAsk defaultValue={postalCode ?? ""} />
        </Card>
      ) : (
        <RadiusRow
          current={feed.radius}
          onSaved={deviceFeed ? locate : undefined}
          usingDevice={deviceFeed !== null}
        />
      )}

      {threads.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Messages">
          <h2 className="text-sm font-semibold tracking-wide text-text-secondary uppercase">
            Messages
          </h2>
          <Card className="flex flex-col p-0">
            {threads.map((thread) => (
              <ThreadRow
                key={thread.threadId}
                thread={thread}
                onOpen={() => setOpenThreadId(thread.threadId)}
              />
            ))}
          </Card>
        </section>
      )}

      {/*
       * No composer here.
       *
       * Posting lives in one place — the Flare tab — because two
       * composers asking the same questions is what made "where does
       * this go" unanswerable. Local is where Flares are READ and
       * answered; the Flare tab is where they are written.
       */}
      {feed.source !== "none" && (
        <section className="flex flex-col gap-3" aria-label="Wanted near you">
          <h2 className="text-sm font-semibold tracking-wide text-text-secondary uppercase">
            Wanted near you
          </h2>

          {feed.flares.length === 0 ? (
            <Card className="flex flex-col gap-2">
              <p className="font-semibold text-text-primary">
                Nothing on the boards within {feed.radius} miles
              </p>
              <p className="text-sm text-text-secondary">
                Flares land here the moment somebody posts one in a room at a store near
                you. Widen the range, or check back after event night.
              </p>
            </Card>
          ) : (
            <Card className="flex flex-col p-0">
              {groupFlares(feed.flares).map((entry) =>
                entry.kind === "one" ? (
                  <FlareRow
                    key={entry.flare.flareId}
                    flare={entry.flare}
                    onThreadOpened={setOpenThreadId}
                  />
                ) : (
                  <FlareGroup
                    key={entry.batchId}
                    flares={entry.flares}
                    onThreadOpened={setOpenThreadId}
                  />
                ),
              )}
            </Card>
          )}
        </section>
      )}
    </div>
  );
}

/** The distances Local offers, as chips. Saving reloads the list. */
function RadiusRow({
  current,
  onSaved,
  usingDevice = false,
}: {
  current: number;
  /** Set when a browser location is in play: re-look there instead of
      reloading the ZIP's server render. */
  onSaved?: () => void;
  /** Says quietly WHERE "within" is measured from. */
  usingDevice?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choosing, setChoosing] = useState(current);

  function choose(radius: number) {
    setChoosing(radius);
    startTransition(async () => {
      const result = await setLocalRadiusAction(radius);
      if (!result.ok) return;
      if (onSaved) onSaved();
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-text-secondary">Within</span>
      {LOCAL_RADII.map((radius) => (
        <button
          key={radius}
          type="button"
          disabled={pending}
          onClick={() => choose(radius)}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-semibold",
            choosing === radius
              ? "border-accent bg-accent text-accent-contrast"
              : "border-border-strong text-text-secondary hover:text-text-primary",
          )}
        >
          {radius} mi
        </button>
      ))}
      {pending && (
        <Loader2 className="size-4 animate-spin text-text-muted" aria-hidden="true" />
      )}
      {usingDevice && !pending && (
        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
          <MapPin className="size-3" aria-hidden="true" />
          your location
        </span>
      )}
    </div>
  );
}

function ThreadRow({ thread, onOpen }: { thread: ThreadSummary; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-t border-border p-3 text-left first:border-t-0 hover:bg-elevated"
    >
      <Thumb imageUrl={thread.imageUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-text-primary">
          {thread.withName}
          <span className="font-normal text-text-muted"> · {thread.cardName}</span>
        </span>
        <span className="block truncate text-sm text-text-secondary">
          {thread.closed ? "Conversation ended" : (thread.lastMessagePreview ?? "")}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-text-muted">
          {agoLabel(thread.lastMessageAt)}
        </span>
        {thread.unread > 0 && (
          <span className="min-w-5 rounded-full bg-accent px-1.5 text-center text-xs leading-5 font-bold text-accent-contrast">
            {thread.unread}
          </span>
        )}
      </span>
    </button>
  );
}

function FlareRow({
  flare,
  onThreadOpened,
}: {
  flare: LocalFlare;
  onThreadOpened: (threadId: string) => void;
}) {
  const [composing, setComposing] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-border p-3 first:border-t-0">
      <div className="flex items-start gap-3">
        {/* The same zoom the rest of the product uses. A flat thumbnail
            here was the one card face that did nothing when clicked. */}
        <span className="block w-12 shrink-0">
          <CardImageZoom
            imageUrl={flare.imageUrl}
            exactName={flare.cardName}
            cardNumber={flare.cardNumber}
            enabled
            caption={flare.printingLabel}
            note={flare.note}
            lookingFor={flare.quantity}
            direction={flare.intent === "showcase" ? "showcase" : "want"}
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-text-primary">
            {flare.cardName}
            {flare.quantity > 1 && (
              <span className="text-accent"> ×{flare.quantity}</span>
            )}
          </p>
          <p className="truncate font-mono text-xs text-text-muted">
            {flare.cardNumber}
            {flare.printingLabel ? ` · ${flare.printingLabel}` : ""}
          </p>
          <p className="mt-1 truncate text-sm text-text-secondary">
            {flare.poster.name}
            {flare.isYours ? " (you)" : ""} · {flare.storeName} ·{" "}
            {milesLabel(flare.miles)} · {agoLabel(flare.postedAt)}
          </p>
          {flare.note && (
            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
              {flare.note}
            </p>
          )}
          <p className="mt-1 text-xs text-text-muted">
            {flare.intent === "showcase" ? "Trading away" : "Hunting"} ·{" "}
            {flare.acceptsTrade && flare.acceptsCash
              ? "trade or cash"
              : flare.acceptsCash
                ? "cash"
                : "trade"}
          </p>
        </div>

        {flare.canMessage && !composing && (
          <Button type="button" size="sm" onClick={() => setComposing(true)}>
            <MessageCircle className="size-4" aria-hidden="true" />I have this
          </Button>
        )}
      </div>

      {composing && (
        <OpenThreadComposer
          flare={flare}
          onCancel={() => setComposing(false)}
          onOpened={onThreadOpened}
        />
      )}
    </div>
  );
}

/** The first message. Sending it is what creates the conversation. */
function OpenThreadComposer({
  flare,
  onCancel,
  onOpened,
}: {
  flare: LocalFlare;
  onCancel: () => void;
  onOpened: (threadId: string) => void;
}) {
  const [body, setBody] = useState(`I have ${flare.cardName}. `);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setMessage(null);
    startTransition(async () => {
      const result = await openThreadAction(flare.flareId, body);
      if (result.ok) onOpened(result.threadId);
      else setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-elevated p-3">
      <Textarea
        rows={2}
        maxLength={MESSAGE_MAX_LENGTH}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        aria-label={`Message ${flare.poster.name}`}
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={send} disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {message && <p className="text-sm text-danger">{message}</p>}
      </div>
      <p className="text-xs text-text-muted">
        Goes to {flare.poster.name} only. Meet at the store; never send money to
        somebody you have not met.
      </p>
    </div>
  );
}

/**
 * One conversation. Loaded fresh on open — reading is the receipt —
 * and refreshed after every send. No live socket in v1; the Refresh
 * button is the honest version of one.
 */
function ThreadView({ threadId, onBack }: { threadId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<ThreadMessage[] | null>(null);
  const [cardName, setCardName] = useState<string | null>(null);
  const [withName, setWithName] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const thread = await readThreadAction(threadId);
      if (!thread.ok) {
        onBack();
        return;
      }
      setMessages(thread.messages);
      setCardName(thread.cardName);
      setWithName(thread.withName);
      setClosed(thread.closed);
    });
    /* onBack is stable enough for a mount effect; re-running on its
       identity would reload the thread on every parent render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  useEffect(() => {
    load();
  }, [load]);

  function send() {
    const body = draft.trim();
    if (!body) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessageAction(threadId, body);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft("");
      const thread = await readThreadAction(threadId);
      if (thread.ok) setMessages(thread.messages);
    });
  }

  function end() {
    startTransition(async () => {
      await closeThreadAction(threadId);
      setClosed(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Local
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate font-semibold text-text-primary">
            {withName ?? "Conversation"}
          </p>
          {cardName && <p className="truncate text-xs text-text-muted">{cardName}</p>}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={load}>
          Refresh
        </Button>
      </div>

      <Card className="flex min-h-64 flex-col gap-2">
        {messages === null ? (
          <p className="py-8 text-center text-text-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-text-muted">No messages yet.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[85%] rounded-[var(--radius-control)] px-3 py-2 text-sm",
                message.yours
                  ? "self-end bg-accent text-accent-contrast"
                  : "self-start bg-elevated text-text-primary",
              )}
            >
              <p className="break-words whitespace-pre-wrap">{message.body}</p>
              <p
                className={cn(
                  "mt-1 text-[10px]",
                  message.yours ? "text-accent-contrast/70" : "text-text-muted",
                )}
              >
                {agoLabel(message.sentAt)}
              </p>
            </div>
          ))
        )}
      </Card>

      {closed ? (
        <p className="flex items-center gap-2 text-sm text-text-secondary">
          <Check className="size-4" aria-hidden="true" />
          This conversation was ended. Ended conversations stay ended.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              maxLength={MESSAGE_MAX_LENGTH}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              aria-label="Message"
              className="flex-1"
            />
            <Button type="button" size="sm" onClick={send} disabled={pending}>
              <Send className="size-4" aria-hidden="true" />
              Send
            </Button>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="button"
            onClick={end}
            className="self-start text-xs text-text-muted hover:text-text-secondary"
          >
            End this conversation
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Cards posted together, kept together.
 *
 * The founder: "should be able to post multiple flares in one group in
 * local — so it looks like one post." A room's board has grouped a pasted
 * deck under one folder since `posted_batch` arrived; Local carries the
 * same batch id now, so it can stop scrolling somebody's whole deck past
 * everybody nearby one card at a time.
 *
 * A batch of one is not a group: it is a card, and dressing it up as a
 * folder with a single thing inside would be worse than the row it
 * replaced.
 */
function groupFlares(
  flares: LocalFlare[],
): (
  | { kind: "one"; flare: LocalFlare }
  | { kind: "many"; batchId: string; flares: LocalFlare[] }
)[] {
  const out: (
    | { kind: "one"; flare: LocalFlare }
    | { kind: "many"; batchId: string; flares: LocalFlare[] }
  )[] = [];
  const seen = new Set<string>();

  for (const flare of flares) {
    if (!flare.batchId) {
      out.push({ kind: "one", flare });
      continue;
    }
    if (seen.has(flare.batchId)) continue;
    seen.add(flare.batchId);

    const group = flares.filter((other) => other.batchId === flare.batchId);
    if (group.length === 1) out.push({ kind: "one", flare });
    else out.push({ kind: "many", batchId: flare.batchId, flares: group });
  }

  return out;
}

/**
 * One posting act, shown as one post.
 *
 * The header carries what the whole group has in common — who, where, how
 * far, when — so each card underneath is just the card. Every face opens
 * the same zoom as everywhere else, with the group as its shelf, so one
 * swipe walks the deck.
 */
function FlareGroup({
  flares,
  onThreadOpened,
}: {
  flares: LocalFlare[];
  onThreadOpened: (threadId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const lead = flares[0];
  if (!lead) return null;

  const shelf = flares.map((flare) => ({
    imageUrl: flare.imageUrl,
    exactName: flare.cardName,
    cardNumber: flare.cardNumber,
    caption: flare.printingLabel,
    note: flare.note,
    lookingFor: flare.quantity,
    direction: (flare.intent === "showcase" ? "showcase" : "want") as
      "showcase" | "want",
  }));

  return (
    <div className="flex flex-col gap-3 border-t border-border p-3 first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-text-primary">
            {lead.deckLabel?.trim() || `${flares.length} cards`}
          </span>
          <span className="block truncate text-sm text-text-secondary">
            {lead.poster.name}
            {lead.isYours ? " (you)" : ""}
            {lead.storeName ? ` · ${lead.storeName}` : ""} · {milesLabel(lead.miles)} ·{" "}
            {agoLabel(lead.postedAt)}
          </span>
        </span>
        <span className="shrink-0 text-xs text-text-muted">
          {open ? "Hide" : `${flares.length} cards`}
        </span>
      </button>

      {/* The faces, always: a group nobody can see into is a headline
          with no story. */}
      <div className="flex flex-wrap gap-2">
        {flares.map((flare, index) => (
          <span key={flare.flareId} className="block w-12">
            <CardImageZoom
              imageUrl={flare.imageUrl}
              exactName={flare.cardName}
              cardNumber={flare.cardNumber}
              enabled
              caption={flare.printingLabel}
              note={flare.note}
              lookingFor={flare.quantity}
              direction={flare.intent === "showcase" ? "showcase" : "want"}
              siblings={shelf}
              position={index}
            />
          </span>
        ))}
      </div>

      {open &&
        flares.map((flare) => (
          <FlareRow key={flare.flareId} flare={flare} onThreadOpened={onThreadOpened} />
        ))}
    </div>
  );
}

function Thumb({ imageUrl }: { imageUrl: string | null }) {
  return (
    <span className="block w-12 shrink-0 overflow-hidden rounded-[4px] border border-border bg-elevated">
      <span className="block aspect-[60/84] w-full">
        {imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            className="size-full object-cover"
          />
        )}
      </span>
    </span>
  );
}
