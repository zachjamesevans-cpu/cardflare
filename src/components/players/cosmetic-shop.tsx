"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Flame, Loader2, Lock } from "lucide-react";

import { cn } from "@/lib/cn";
import { buyCosmeticAction } from "@/lib/players/profile-actions";
import type { CosmeticItem } from "@/lib/players/cosmetics";
import { SHOP_IDLE, type ShopState } from "@/lib/players/profile-schema";

/**
 * The shop and the wardrobe, which are the same screen.
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

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {items.map((item) => (
          <li key={item.slug}>
            <form action={action} className="h-full">
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
      </ul>

      {/*
       * One status line for the whole section, not one per tile: the
       * action is shared, so only the last tap can have anything to say.
       */}
      <Status state={state} />
    </section>
  );
}

/**
 * One item.
 *
 * Its own component so it can use `useFormStatus`, which only reports on
 * the form its caller sits inside. The founder's standing rule from the
 * remove-button round: a press that waits on the server has to show that
 * it landed, or it gets pressed again.
 */
function Tile({ item, affordable }: { item: CosmeticItem; affordable: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || item.equipped || !affordable}
      className={cn(
        "flex h-full w-full flex-col gap-1 rounded-[var(--radius-control)] border p-3 text-left transition-colors",
        item.equipped
          ? "border-accent bg-accent/10"
          : affordable
            ? "border-border bg-elevated hover:border-border-strong"
            : /* Not a hover target, and it says so: the cursor and the
                 dimming agree with the disabled state. */
              "cursor-not-allowed border-border bg-elevated/50 opacity-60",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
        {pending ? (
          <Loader2
            className="size-3.5 shrink-0 animate-spin text-accent"
            aria-hidden="true"
          />
        ) : item.equipped ? (
          <Check className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
        ) : item.lockedUntil !== null && !item.owned ? (
          <Lock className="size-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        ) : null}
        {item.name}
      </span>

      <span className="text-xs text-text-muted">{item.description}</span>

      <span className="mt-auto pt-1 text-xs font-medium">
        {item.equipped ? (
          <span className="text-accent">Equipped</span>
        ) : item.owned ? (
          <span className="text-text-secondary">Tap to wear</span>
        ) : item.lockedUntil !== null ? (
          <span className="text-text-muted">
            Needs {item.lockedUntil.toLocaleString()} earned
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 tabular-nums",
              affordable ? "text-accent" : "text-text-muted",
            )}
          >
            <Flame className="size-3" aria-hidden="true" />
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
