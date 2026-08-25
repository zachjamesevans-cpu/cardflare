"use client";

import { useState } from "react";
import Image from "next/image";
import { HelpCircle, Loader2, X } from "lucide-react";

import { FRAME_CLASS } from "@/components/players/cosmetic-card";
import { cn } from "@/lib/cn";

/**
 * The pack corner of the Embers store, and the full-screen opening.
 *
 * The founder's staging: opening dims everything, the pack fills the
 * screen, tearing it reveals a carousel of face-down cards - and the
 * LAST card is always the rarest of the three, because that is how a
 * real pack is riffled. Tap flips a card; holding a finger on one
 * glows in its rarity's colour. Odds live behind a small "?" that
 * fades a popup in, every item with its own exact percent.
 *
 * Contents are drawn server-side at the moment of opening; nothing
 * here knows what is in a sealed pack because nothing does.
 */

export interface SeriesJson {
  id: string;
  name: string;
  setNumber: number;
  priceEmbers: number;
  slots: number;
  odds: { rarity: string; slugs: string[]; percent: number }[];
  oddsDetail?: { rarity: string; items: { slug: string; percent: number }[] }[];
}

export interface SealedJson {
  id: string;
  series: string;
  source: string;
}

interface Pull {
  slug: string;
  rarity: string;
  duplicate: boolean;
  embersInstead: number;
}

const RARITY_TEXT: Record<string, string> = {
  common: "text-text-secondary",
  uncommon: "text-success",
  rare: "text-frost",
  epic: "text-rose",
  legendary: "text-gold",
};

/** Rarity to glow colour, for the held-finger halo. */
const RARITY_GLOW: Record<string, string> = {
  common: "rgba(160,175,190,0.55)",
  uncommon: "rgba(123,216,138,0.6)",
  rare: "rgba(110,195,255,0.65)",
  epic: "rgba(255,111,181,0.65)",
  legendary: "rgba(240,194,75,0.75)",
};

const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

/** Rarest LAST: the pack's crescendo. Stable for equal rarities. */
function riffled(pulls: Pull[]): Pull[] {
  return [...pulls].sort(
    (a, b) => (RARITY_RANK[a.rarity] ?? 0) - (RARITY_RANK[b.rarity] ?? 0),
  );
}

/** The sealed wrapper, foil and crimp. */
export function PackArt({
  name,
  setNumber,
  className,
}: {
  name: string;
  setNumber: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "cf-pack flex h-52 w-36 shrink-0 flex-col items-center justify-center gap-2 text-center",
        className,
      )}
    >
      <div className="cf-holo cf-holo-classic-holo" aria-hidden="true" />
      <Image
        src="/brand/cardflare-mark.png"
        alt=""
        width={64}
        height={80}
        className="relative h-20 w-auto"
      />
      <p className="relative font-bold tracking-wide text-text-primary">cardflare</p>
      <p className="relative text-xs text-text-muted">
        {name} · Set {setNumber}
      </p>
    </div>
  );
}

export function PackShop({
  series,
  sealed,
  names,
}: {
  series: SeriesJson;
  sealed: SealedJson[];
  /** slug to display name, resolved from the catalogue server-side. */
  names: Record<string, string>;
}) {
  const [packs, setPacks] = useState(sealed);
  const [busy, setBusy] = useState<"buy" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = useState(false);
  /* Full-screen opening: "sealed" shows the pack, then the carousel. */
  const [opening, setOpening] = useState<null | {
    stage: "sealed" | "tearing" | "revealed";
    pulls: Pull[];
  }>(null);

  const post = async (payload: unknown) => {
    return fetch("/api/v1/packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const buy = async () => {
    setBusy("buy");
    setMessage(null);
    try {
      const response = await post({ action: "buy", series: series.id });
      if (response.status === 402) {
        setMessage("Not enough Embers for a pack yet.");
        return;
      }
      if (!response.ok) {
        setMessage("That did not go through. Try again in a moment.");
        return;
      }
      const body = (await response.json()) as { packs: SealedJson[] };
      setPacks(body.packs);
      setMessage("Pack added. Tear it open when ready.");
    } catch {
      setMessage("That did not go through. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const tear = async () => {
    const next = packs.find((pack) => pack.series === series.id);
    if (!next || !opening || opening.stage !== "sealed") return;
    setOpening({ stage: "tearing", pulls: [] });
    try {
      const response = await post({ action: "open", packId: next.id });
      if (!response.ok) {
        setOpening(null);
        setMessage("That pack could not be opened. Try again in a moment.");
        return;
      }
      const body = (await response.json()) as { pulls: Pull[]; packs: SealedJson[] };
      setPacks(body.packs);
      setOpening({ stage: "revealed", pulls: riffled(body.pulls) });
    } catch {
      setOpening(null);
      setMessage("That pack could not be opened. Try again in a moment.");
    }
  };

  const mine = packs.filter((pack) => pack.series === series.id).length;

  return (
    <div className="flex flex-col gap-4">
      {/*
       * Art and copy side by side; every CONTROL in one bar underneath,
       * spanning the panel. The founder's note on the first cut was that
       * it read as uneven, and it did: the buttons were penned into the
       * narrow column beside a tall pack, so Buy was squeezed, Open ran
       * to a different width, and the "?" floated at a third height.
       * One row, equal columns, one height - matching the app exactly.
       */}
      <div className="flex flex-wrap items-stretch gap-5">
        <PackArt name={series.name} setNumber={series.setNumber} />

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <p className="text-sm text-text-secondary">
            {series.slots} cosmetics per pack, drawn the moment you open it. Duplicates
            come back as Embers, so no pull is ever nothing.
          </p>
          <p className="text-sm text-text-muted">
            {mine > 0
              ? `${mine} sealed, waiting to be torn open.`
              : "None sealed right now."}
          </p>
        </div>
      </div>

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => void buy()}
          disabled={busy !== null}
          className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-accent/40 bg-accent/10 px-4 py-2.5 text-sm font-semibold text-accent transition-colors hover:border-accent disabled:opacity-60"
        >
          {busy === "buy" && <Loader2 className="size-4 animate-spin" />}
          {busy === "buy" ? "Buying…" : `Buy · ${series.priceEmbers} Embers`}
        </button>

        {mine > 0 && (
          <button
            type="button"
            onClick={() => setOpening({ stage: "sealed", pulls: [] })}
            className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated px-4 py-2.5 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong"
          >
            Open one
          </button>
        )}

        {/* The odds live behind a quiet "?", square so it shares the
            buttons' height instead of hovering at its own. */}
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="What can be inside, and the exact odds"
            aria-expanded={oddsOpen}
            onClick={() => setOddsOpen((current) => !current)}
            className="flex h-full w-11 cursor-pointer items-center justify-center rounded-[var(--radius-control)] border border-border text-text-muted transition-colors hover:border-border-strong hover:text-text-primary"
          >
            <HelpCircle className="size-4" aria-hidden="true" />
          </button>

          <div
            className={cn(
              "absolute top-[calc(100%+0.5rem)] right-0 z-10 w-72 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-xl transition-opacity duration-200",
              oddsOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            <p className="mb-2 text-sm font-semibold text-text-primary">
              Exact odds, per slot
            </p>
            <ul className="flex flex-col gap-2">
              {(series.oddsDetail ?? []).map((tier) => (
                <li key={tier.rarity} className="text-xs">
                  <p
                    className={cn(
                      "font-semibold capitalize",
                      RARITY_TEXT[tier.rarity] ?? "text-text-secondary",
                    )}
                  >
                    {tier.rarity}
                  </p>
                  {tier.items.map((item) => (
                    <p
                      key={item.slug}
                      className="flex justify-between text-text-secondary"
                    >
                      <span>{names[item.slug] ?? item.slug}</span>
                      <span className="text-text-muted tabular-nums">
                        {item.percent}%
                      </span>
                    </p>
                  ))}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-text-muted">
              Three slots per pack, each rolled independently. No slot can repeat
              another in the same pack.
            </p>
          </div>
        </div>
      </div>

      {message && <p className="text-sm text-text-secondary">{message}</p>}

      {opening && (
        <PackOpening
          series={series}
          stage={opening.stage}
          pulls={opening.pulls}
          names={names}
          onTear={() => void tear()}
          onClose={() => setOpening(null)}
        />
      )}
    </div>
  );
}

/** The full-screen ceremony: dim, pack, tear, carousel. */
function PackOpening({
  series,
  stage,
  pulls,
  names,
  onTear,
  onClose,
}: {
  series: SeriesJson;
  stage: "sealed" | "tearing" | "revealed";
  pulls: Pull[];
  names: Record<string, string>;
  onTear: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black/90 p-6">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-5 right-5 cursor-pointer rounded-full p-2 text-text-muted hover:text-text-primary"
      >
        <X className="size-6" aria-hidden="true" />
      </button>

      {stage !== "revealed" ? (
        <>
          <button
            type="button"
            onClick={onTear}
            disabled={stage === "tearing"}
            className={cn(
              "cursor-pointer transition-transform duration-300",
              stage === "tearing" ? "animate-pulse" : "hover:scale-105",
            )}
          >
            <PackArt
              name={series.name}
              setNumber={series.setNumber}
              className="h-[26rem] w-72"
            />
          </button>
          <p className="text-sm text-text-secondary">
            {stage === "tearing" ? "Tearing…" : "Tap the pack to tear it open"}
          </p>
        </>
      ) : (
        <>
          <div className="flex w-full snap-x snap-mandatory gap-6 overflow-x-auto px-[10vw] py-4">
            {pulls.map((pull, index) => (
              <FlipCard
                key={`${pull.slug}-${index}`}
                pull={pull}
                name={names[pull.slug] ?? pull.slug}
                last={index === pulls.length - 1}
              />
            ))}
          </div>
          <p className="text-sm text-text-secondary">
            Tap a card to flip it. Hold to see its rarity. The last one is your best
            pull.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-[var(--radius-control)] border border-border bg-elevated px-5 py-2 text-sm font-semibold text-text-primary hover:border-border-strong"
          >
            Done
          </button>
        </>
      )}
    </div>
  );
}

function FlipCard({ pull, name, last }: { pull: Pull; name: string; last: boolean }) {
  const [flipped, setFlipped] = useState(false);
  const [held, setHeld] = useState(false);

  const glow = RARITY_GLOW[pull.rarity] ?? RARITY_GLOW.common;

  return (
    <button
      type="button"
      onClick={() => setFlipped(true)}
      onPointerDown={() => setHeld(true)}
      onPointerUp={() => setHeld(false)}
      onPointerLeave={() => setHeld(false)}
      className="shrink-0 cursor-pointer snap-center [perspective:1000px]"
      aria-label={flipped ? name : "A face-down pull. Tap to flip."}
    >
      <div
        className="relative h-80 w-56 transition-transform duration-500 [transform-style:preserve-3d]"
        style={{
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          filter: held ? `drop-shadow(0 0 24px ${glow})` : undefined,
        }}
      >
        {/* The back: the set's wrapper art, face down. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl border border-border-strong bg-[linear-gradient(160deg,#1a2030,#0e1116_55%,#1c1430)] [backface-visibility:hidden]">
          <Image
            src="/brand/cardflare-mark.png"
            alt=""
            width={64}
            height={80}
            className="h-24 w-auto opacity-80"
          />
          {last && <p className="text-xs text-text-muted">Your best pull waits here</p>}
        </div>

        {/* The front: the cosmetic, worn by a blank card. */}
        <div className="absolute inset-0 flex [transform:rotateY(180deg)] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-elevated p-4 [backface-visibility:hidden]">
          <div
            className={cn(
              "relative h-40 w-28 overflow-hidden rounded-lg border border-border bg-surface",
              FRAME_CLASS[pull.slug] ?? "",
            )}
          >
            {pull.slug.endsWith("-holo") && (
              <div className={cn("cf-holo", `cf-holo-${pull.slug}`)} />
            )}
          </div>
          <p className="font-semibold text-text-primary">{name}</p>
          <p
            className={cn(
              "text-sm capitalize",
              RARITY_TEXT[pull.rarity] ?? "text-text-muted",
            )}
          >
            {pull.rarity}
          </p>
          {pull.duplicate && (
            <p className="text-xs text-text-muted">
              Already yours: +{pull.embersInstead} Embers
            </p>
          )}
        </div>
      </div>
    </button>
  );
}
