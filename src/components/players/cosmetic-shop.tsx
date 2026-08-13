"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Flame, Loader2, Lock } from "lucide-react";

import { cn } from "@/lib/cn";
import { CosmeticCard } from "@/components/players/cosmetic-card";
import { Rail } from "@/components/lists/rail";
import { buyCosmeticAction } from "@/lib/players/profile-actions";
import type { CosmeticItem } from "@/lib/players/cosmetics";
import { SHOP_IDLE, type ShopState } from "@/lib/players/profile-schema";

/**
 * The shop and the wardrobe, which are the same shelf.
 *
 * A carousel of cards now, not a grid of text tiles — the founder's
 * unification: the store sells things that go ON cards, so every item is
 * previewed on a card, at the same width the board's carousel uses. The
 * card is the placeholder silhouette, not real artwork, wearing the one
 * item the tile sells; what you see scrolling the shelf is exactly what
 * your showcase would look like owning it.
 *
 * Everything is on show, owned or not, priced or locked. A shop that
 * hides what you cannot afford leaves a new player looking at three free
 * items with no idea why they would ever trade again — and the whole
 * point of the currency is that the expensive thing is visible from the
 * first night.
 *
 * One tap does everything: buy it if it is not yours, wear it if it is.
 * `buyCosmetic` on the server sorts out which happened. There is no
 * confirmation step, because Embers cannot be bought with money — the
 * worst case is a player wearing something they did not mean to buy and
 * trading a few more times, which is the behaviour the system wants
 * anyway.
 */
export function CosmeticShop({
  title,
  blurb,
  items,
  balance,
}: {
  title: string;
  blurb: string;
  items: CosmeticItem[];
  /** The private number. Only ever rendered on the owner's own profile. */
  balance: number;
}) {
  const [state, action] = useActionState<ShopState, FormData>(
    buyCosmeticAction,
    SHOP_IDLE,
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary">{blurb}</p>
      </div>

      <Rail ariaLabel={title}>
        {items.map((item) => (
          <li key={item.slug} className="w-14 shrink-0">
            <form action={action}>
              <input type="hidden" name="slug" value={item.slug} />
              <input type="hidden" name="name" value={item.name} />
              <Tile
                item={item}
                /*
                 * Affordability is recomputed here rather than trusted
                 * from the server's snapshot, because the balance on
                 * screen moves as things are bought and the tiles have
                 * to agree with it without a round trip.
                 */
                affordable={item.owned || (!item.lockedUntil && balance >= item.cost)}
              />
            </form>
          </li>
        ))}
      </Rail>

      {/*
       * One status line for the whole section, not one per tile: the
       * action is shared, so only the last tap can have anything to say.
       */}
      <Status state={state} />
    </section>
  );
}

/**
 * One item: a card wearing it, a name, and what tapping does.
 *
 * Its own component so it can use `useFormStatus`, which only reports on
 * the form its caller sits inside. The founder's standing rule from the
 * remove-button round: a press that waits on the server has to show that
 * it landed, or it gets pressed again.
 *
 * The flavour text does not fit on a 56px tile and is not pretended to:
 * it rides in the title attribute for anyone hovering, and the tile
 * itself carries the three facts a buyer acts on — what it looks like,
 * what it costs, and whether it is theirs.
 */
function Tile({ item, affordable }: { item: CosmeticItem; affordable: boolean }) {
  const { pending } = useFormStatus();
  const locked = item.lockedUntil !== null && !item.owned;

  return (
    <button
      type="submit"
      disabled={pending || item.equipped || !affordable}
      title={`${item.name}. ${item.description}`}
      className={cn(
        "flex w-full cursor-pointer flex-col gap-1 rounded-[7px] text-left transition-transform focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
        item.equipped || !affordable
          ? ""
          : "hover:ring-2 hover:ring-accent/60 active:scale-95",
        !affordable && !item.equipped ? "cursor-not-allowed opacity-60" : "",
      )}
    >
      <span
        className={cn(
          "relative block w-full rounded-[7px]",
          item.equipped ? "ring-2 ring-accent" : "",
        )}
      >
        {/*
         * The placeholder card, wearing only what this tile sells. The
         * other two slots stay at their defaults so a frame tile is not
         * accidentally also modelling the holo you happen to own.
         */}
        <CosmeticCard
          imageUrl={null}
          name={item.name}
          number=""
          imagesEnabled={false}
          frame={item.kind === "frame" ? item.slug : null}
          holo={item.kind === "holo" ? item.slug : null}
          effect={item.kind === "effect" ? item.slug : null}
          className="w-full"
        />

        {pending && (
          <span className="absolute inset-0 z-10 flex items-center justify-center rounded-[6px] bg-canvas/70">
            <Loader2 className="size-4 animate-spin text-accent" aria-hidden="true" />
          </span>
        )}

        {locked && !pending && (
          <span className="absolute right-0.5 bottom-0.5 z-10 rounded-full bg-surface/90 p-1">
            <Lock className="size-3 text-text-muted" aria-hidden="true" />
          </span>
        )}

        {item.equipped && !pending && (
          <span className="absolute right-0.5 bottom-0.5 z-10 rounded-full bg-accent p-0.5">
            <Check className="size-3 text-accent-contrast" aria-hidden="true" />
          </span>
        )}
      </span>

      <span className="w-full truncate text-[11px] font-semibold text-text-primary">
        {item.name}
      </span>

      <span className="w-full text-[10px] leading-tight font-medium">
        {item.equipped ? (
          <span className="text-accent">Equipped</span>
        ) : item.owned ? (
          <span className="text-text-secondary">Tap to wear</span>
        ) : locked ? (
          <span className="text-text-muted">
            Needs {item.lockedUntil?.toLocaleString()} earned
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 tabular-nums",
              affordable ? "text-accent" : "text-text-muted",
            )}
          >
            <Flame className="size-2.5" aria-hidden="true" />
            {item.cost.toLocaleString()}
          </span>
        )}
      </span>
    </button>
  );
}

function Status({ state }: { state: ShopState }) {
  if (state.status === "idle") return null;

  return (
    <p
      role="status"
      className={cn(
        "text-sm",
        state.status === "error" ? "text-danger" : "text-success",
      )}
    >
      {state.status === "error"
        ? state.message
        : state.status === "bought"
          ? `${state.name} unlocked and equipped.`
          : `${state.name} equipped.`}
    </p>
  );
}
