"use client";

import type { DisplayFlare } from "@/lib/event-hub/display-payload";
import { groupFlares, type FlareGroup } from "@/lib/event-hub/flare-groups";
import type { FlareShape } from "@/lib/event-hub/layout";

/**
 * What the room is looking for, on the wall.
 *
 * Every card here came off the public board — somebody posted it, to a
 * room, on purpose. Nothing on this screen is read out of anybody's
 * binder; see `display-payload.ts`, which is the only place that
 * decides.
 *
 * THE CARD STANDS UP. That is the change, and it came from a photograph
 * of a live shop: the art was pinned to an 88-pixel thumbnail at the
 * left of a full-width row, in a band a third of a television tall, and
 * the founder said it was too small. It was. Cards are portrait and the
 * band is short and wide, so a horizontal row is the one arrangement
 * that guarantees the picture stays small however much room is going
 * spare. Upright, filling the band's height, the same card is about
 * three times the size on a 1080p screen.
 *
 * Cards gather under the person who asked, with a rule between people —
 * a name said once above somebody's cards reads faster from across a
 * room than the same name repeated on every row, and it makes two
 * people wanting the same thing visible. The grouping rule itself lives
 * in `flare-groups.ts`.
 *
 * The strip keeps its compact rows. With four tournaments running the
 * board is a footnote at the bottom of the screen, and there is not
 * enough height there for a picture worth enlarging.
 */

export function FlareBoard({
  flares,
  shape,
  /* Bumped by the rotation so the crossfade restarts. Not used for
     anything else — the window itself is chosen upstream. */
  tick,
}: {
  flares: DisplayFlare[];
  shape: FlareShape;
  tick: number;
}) {
  if (flares.length === 0) return <EmptyBoard shape={shape} />;

  const groups = groupFlares(flares);

  return (
    <div className="flex h-full min-h-0 flex-col gap-[clamp(0.3rem,0.6vw,0.75rem)]">
      <p className="shrink-0 text-[clamp(0.65rem,0.9vw,1rem)] font-semibold tracking-[0.18em] text-accent uppercase">
        Wanted in the room
      </p>

      <div
        key={tick}
        className="flex min-h-0 flex-1 gap-[clamp(0.5rem,1.1vw,1.4rem)] overflow-hidden motion-safe:animate-[cf-flare-in_var(--duration-slow)_var(--ease-out-soft)]"
      >
        {groups.map((group) =>
          shape === "strip" ? (
            <StripGroup key={group.key} group={group} />
          ) : (
            <PosterGroup key={group.key} group={group} shape={shape} />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * The divider, and the name it divides.
 *
 * A rule on the LEFT of every group but the first, rather than a
 * separate element between them: an element between siblings is one
 * more thing to keep in step with the list, and a border cannot end up
 * orphaned at the edge of a row.
 */
function GroupFrame({
  group,
  children,
}: {
  group: FlareGroup;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-[clamp(0.15rem,0.35vw,0.4rem)] not-first:border-l not-first:border-border-strong not-first:pl-[clamp(0.5rem,1.1vw,1.4rem)]">
      <p className="shrink-0 truncate text-[clamp(0.7rem,1vw,1.15rem)] font-bold text-accent">
        {group.who}{" "}
        <span className="font-semibold text-text-secondary">{group.verb}</span>
      </p>
      {children}
    </section>
  );
}

function PosterGroup({ group, shape }: { group: FlareGroup; shape: FlareShape }) {
  return (
    <GroupFrame group={group}>
      <div className="flex min-h-0 flex-1 items-start gap-[clamp(0.35rem,0.8vw,1rem)]">
        {group.flares.map((flare) => (
          <Poster key={flare.cardId} flare={flare} shape={shape} />
        ))}
      </div>
    </GroupFrame>
  );
}

/**
 * One card, upright.
 *
 * The WIDTH is the fixed dimension and the height follows from the
 * card's own 60:84. Sizing it the other way round — height from the
 * band, width from the aspect ratio — is circular inside a flex column,
 * and browsers resolve that circle by letting the art spill out of its
 * column and over its neighbour.
 */
function Poster({ flare, shape }: { flare: DisplayFlare; shape: FlareShape }) {
  const width =
    shape === "board" ? "w-[clamp(4rem,9.4vw,14rem)]" : "w-[clamp(3rem,6.6vw,10rem)]";

  return (
    <article
      className={`flex shrink-0 flex-col gap-[clamp(0.1rem,0.25vw,0.3rem)] ${width}`}
    >
      <span className="relative block w-full overflow-hidden rounded-[8px] border border-border bg-elevated">
        <span className="block aspect-[60/84] w-full">
          {/* A plain img in a fixed box. The art is immutable and CDN
              cached, so eight hours of rotation re-downloads nothing, and
              next/image would add a transform per card for no gain. */}
          {flare.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={flare.imageUrl}
              alt=""
              decoding="async"
              className="size-full object-cover"
            />
          )}
        </span>

        {/* Wanting four copies is a different sentence from four people
            wanting one. The count rides in the corner so every card is
            the same shape and the row keeps one baseline. */}
        {flare.quantity > 1 && (
          <span className="absolute top-[6%] right-[5%] rounded-full bg-accent px-[0.5em] py-[0.15em] text-[clamp(0.6rem,0.85vw,1rem)] font-extrabold text-accent-contrast shadow-[0_2px_6px_rgba(0,0,0,0.45)]">
            &times;{flare.quantity}
          </span>
        )}

        {/* A boolean somebody already asked about. Never a price, never
            a count, and never a route to the stock list. */}
        {flare.storeMayHave && (
          <span className="absolute inset-x-0 bottom-0 bg-text-primary py-[0.2em] text-center text-[clamp(0.55rem,0.75vw,0.85rem)] font-bold tracking-[0.04em] text-accent-contrast">
            Store may have
          </span>
        )}
      </span>

      <p className="truncate text-center text-[clamp(0.7rem,1vw,1.2rem)] font-bold text-text-primary">
        {flare.cardName}
      </p>
      <p className="truncate text-center font-mono text-[clamp(0.55rem,0.75vw,0.9rem)] text-text-muted">
        {flare.cardNumber}
      </p>
    </article>
  );
}

/**
 * The compact form, for a screen already carrying four tournaments.
 *
 * Same grouping and the same divider — a busy screen needs the "whose
 * is this" answer more, not less — with the thumbnail it always had,
 * because there is no height here to make a picture out of.
 */
function StripGroup({ group }: { group: FlareGroup }) {
  return (
    <GroupFrame group={group}>
      <div className="flex min-h-0 flex-1 flex-col justify-start gap-[clamp(0.15rem,0.3vw,0.35rem)]">
        {group.flares.map((flare) => (
          <article
            key={flare.cardId}
            className="flex min-w-0 items-center gap-[clamp(0.3rem,0.6vw,0.75rem)]"
          >
            <span className="block w-[clamp(1.6rem,2.6vw,3.2rem)] shrink-0 overflow-hidden rounded-[4px] border border-border bg-elevated">
              <span className="block aspect-[60/84] w-full">
                {flare.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={flare.imageUrl}
                    alt=""
                    decoding="async"
                    className="size-full object-cover"
                  />
                )}
              </span>
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[clamp(0.65rem,0.95vw,1.1rem)] font-bold text-text-primary">
                {flare.cardName}
                {flare.quantity > 1 && (
                  <span className="text-accent"> &times;{flare.quantity}</span>
                )}
              </span>
              <span className="block truncate font-mono text-[clamp(0.55rem,0.75vw,0.85rem)] text-text-muted">
                {flare.cardNumber}
              </span>
            </span>
          </article>
        ))}
      </div>
    </GroupFrame>
  );
}

function EmptyBoard({ shape }: { shape: FlareShape }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-border p-4 text-center">
      <p
        className={`font-bold text-text-secondary ${
          shape === "strip"
            ? "text-[clamp(0.85rem,1.2vw,1.2rem)]"
            : "text-[clamp(1.1rem,2vw,2rem)]"
        }`}
      >
        Nothing on the board yet
      </p>
      <p
        className={`text-text-muted ${
          shape === "strip"
            ? "text-[clamp(0.7rem,0.9vw,0.9rem)]"
            : "text-[clamp(0.85rem,1.2vw,1.25rem)]"
        }`}
      >
        Scan to post a card you&rsquo;re looking for.
      </p>
    </div>
  );
}
