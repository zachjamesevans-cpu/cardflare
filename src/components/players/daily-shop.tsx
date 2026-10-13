"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { CosmeticArt } from "@/components/players/cosmetic-art";
import { Card } from "@/components/ui/card";
import type { DailyShelf } from "@/lib/players/daily-shop-rules";

/**
 * Today's shop: a few cosmetics on the shelf, changing at midnight UTC
 * (lib/players/daily-shop-rules.ts). Buying is Pro, like the rest of the
 * shop; a free player sees the door to Pro instead of Buy. The app's
 * DailyShop (mobile/src/daily-shop.tsx) is the same shelf.
 */

const REFUSALS: Record<string, string> = {
  "not-today": "That one has left the shelf. Have a look at today's.",
  "not-pro": "Buying cosmetics is part of cardflare Pro.",
  locked: "That one unlocks with more lifetime Embers.",
  "too-expensive": "Not enough Embers for that one yet.",
};

function hoursUntil(iso: string): number {
  return Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 3_600_000));
}

export function DailyShop({
  shelf: initial,
  pro,
}: {
  shelf: DailyShelf;
  pro: boolean;
}) {
  const [shelf, setShelf] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (shelf.offers.length === 0) return null;

  const buy = async (slug: string, name: string) => {
    setBusy(slug);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/shop/daily", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const body = (await response.json()) as { shelf?: DailyShelf; error?: string };
      if (!response.ok) {
        setMessage(REFUSALS[body.error ?? ""] ?? "That did not go through. Try again.");
        return;
      }
      if (body.shelf) setShelf(body.shelf);
      setMessage(`${name} is yours, and you are wearing it.`);
    } catch {
      setMessage("That did not go through. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-text-primary">Today&rsquo;s shop</h2>
        <p className="text-xs text-text-muted">New in {hoursUntil(shelf.resetsAt)}h</p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shelf.offers.map((offer) => (
          <li
            key={offer.slug}
            className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-elevated p-3"
          >
            <CosmeticArt kind={offer.kind} slug={offer.slug} className="h-24" />
            <p className="truncate text-sm font-semibold text-text-primary">
              {offer.name}
            </p>
            {offer.owned ? (
              <span className="text-xs font-bold text-accent">Yours</span>
            ) : pro ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void buy(offer.slug, offer.name)}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-bold text-accent transition-colors hover:border-accent disabled:opacity-60"
              >
                {busy === offer.slug && <Loader2 className="size-3 animate-spin" />}
                {offer.costEmbers} Embers
              </button>
            ) : (
              <Link
                href="/pro"
                className="rounded-full border border-border px-3 py-1.5 text-center text-xs font-bold text-text-secondary hover:border-border-strong"
              >
                Pro · {offer.costEmbers}
              </Link>
            )}
          </li>
        ))}
      </ul>

      {message && (
        <p role="status" className="text-sm text-text-secondary">
          {message}
        </p>
      )}
    </Card>
  );
}
