"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, Loader2 } from "lucide-react";

import { FRAME_CLASS } from "@/components/players/cosmetic-card";
import { cn } from "@/lib/cn";

/**
 * The pack corner of the Embers store, and the opening table.
 *
 * One component owns the whole loop - see the sealed pack, read the
 * odds, buy with Embers, tear one open, watch three pulls flip in -
 * because the loop IS the feature: the founder's brief is a nod to
 * real TCGs, where the pack on the wall and the pack in your hands are
 * the same object.
 *
 * Contents are drawn server-side at the moment of opening; this
 * component never knows what is inside a sealed pack because nothing
 * does.
 */

export interface SeriesJson {
  id: string;
  name: string;
  setNumber: number;
  priceEmbers: number;
  slots: number;
  odds: { rarity: string; slugs: string[]; percent: number }[];
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

const RARITY_COLOR: Record<string, string> = {
  common: "text-text-secondary",
  uncommon: "text-success",
  rare: "text-frost",
  epic: "text-rose",
  legendary: "text-gold",
};

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
      <p className="relative font-bold tracking-wide text-text-primary">CardFlare</p>
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
  const [busy, setBusy] = useState<"buy" | "open" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pulls, setPulls] = useState<Pull[] | null>(null);

  const post = async (payload: unknown) => {
    const response = await fetch("/api/v1/packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return response;
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

  const open = async () => {
    const next = packs.find((pack) => pack.series === series.id);
    if (!next) return;
    setBusy("open");
    setMessage(null);
    setPulls(null);
    try {
      const response = await post({ action: "open", packId: next.id });
      if (!response.ok) {
        setMessage("That pack could not be opened. Try again in a moment.");
        return;
      }
      const body = (await response.json()) as { pulls: Pull[]; packs: SealedJson[] };
      setPacks(body.packs);
      setPulls(body.pulls);
    } catch {
      setMessage("That pack could not be opened. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  const mine = packs.filter((pack) => pack.series === series.id).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-5">
        <PackArt name={series.name} setNumber={series.setNumber} />

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <p className="text-sm text-text-secondary">
            {series.slots} cosmetics per pack, drawn the moment you open it. Duplicates
            come back as Embers, so no pull is ever nothing.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void buy()}
              disabled={busy !== null}
              className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-accent/40 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:border-accent disabled:opacity-60"
            >
              {busy === "buy" && <Loader2 className="size-4 animate-spin" />}
              Buy a pack · {series.priceEmbers} Embers
            </button>

            {mine > 0 && (
              <button
                type="button"
                onClick={() => void open()}
                disabled={busy !== null}
                className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-border bg-elevated px-4 py-2 text-sm font-semibold text-text-primary transition-colors hover:border-border-strong disabled:opacity-60"
              >
                {busy === "open" && <Loader2 className="size-4 animate-spin" />}
                Open one · {mine} sealed
              </button>
            )}
          </div>

          {message && <p className="text-sm text-text-secondary">{message}</p>}

          <details className="group">
            <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
              What can be inside, and the exact odds
            </summary>
            <ul className="mt-2 flex flex-col gap-1.5 border-l border-border pl-4">
              {series.odds.map((tier) => (
                <li key={tier.rarity} className="text-sm">
                  <span
                    className={cn(
                      "font-semibold capitalize",
                      RARITY_COLOR[tier.rarity] ?? "text-text-secondary",
                    )}
                  >
                    {tier.rarity}
                  </span>{" "}
                  <span className="text-text-muted tabular-nums">
                    {tier.percent}% per slot
                  </span>
                  <span className="text-text-secondary">
                    {" "}
                    · {tier.slugs.map((slug) => names[slug] ?? slug).join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>

      {pulls && (
        <div className="flex flex-col gap-2">
          <p className="font-semibold text-text-primary">Your pulls</p>
          <div className="flex flex-wrap gap-3">
            {pulls.map((pull, index) => (
              <div
                key={`${pull.slug}-${index}`}
                className="cf-pack-pull flex w-28 flex-col items-center gap-1.5 rounded-[var(--radius-control)] border border-border bg-elevated p-3 text-center"
                style={{ animationDelay: `${index * 0.35}s` }}
              >
                <div
                  className={cn(
                    "relative h-20 w-14 overflow-hidden rounded-md border border-border bg-surface",
                    FRAME_CLASS[pull.slug] ?? "",
                  )}
                >
                  {pull.slug.endsWith("-holo") && (
                    <div className={cn("cf-holo", `cf-holo-${pull.slug}`)} />
                  )}
                </div>
                <p className="text-xs font-semibold text-text-primary">
                  {names[pull.slug] ?? pull.slug}
                </p>
                <p
                  className={cn(
                    "text-[11px] capitalize",
                    RARITY_COLOR[pull.rarity] ?? "text-text-muted",
                  )}
                >
                  {pull.rarity}
                </p>
                {pull.duplicate && (
                  <p className="text-[11px] text-text-muted">
                    Already yours: +{pull.embersInstead} Embers
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            Everything you pulled is in your wardrobe now, ready to equip.
          </p>
        </div>
      )}
    </div>
  );
}
