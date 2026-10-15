"use client";

import Link from "next/link";
import { useState } from "react";

import { Button, buttonStyles } from "@/components/ui/button";
import {
  INTRO_CARDS,
  INTRO_LOOK,
  INTRO_NEXT,
  INTRO_POST,
  INTRO_SKIP,
  type IntroGame,
} from "@/lib/onboarding/intro";
import { IntroScene } from "@/components/onboarding/intro-scenes";
import { cn } from "@/lib/cn";

/**
 * The thirty seconds after signing up, on the website: the same three
 * cards and words as the app (mobile/src/intro.tsx), the same last two
 * ways out. "Look around first" lands on the Feed with its + pointed at
 * (PostSpotlight). Each card shows a scene of the app (IntroScene) in
 * the art of the player's game.
 */

const LOOK_HREF = "/feed?tour=post";

export function IntroCards({ game }: { game: IntroGame }) {
  const [index, setIndex] = useState(0);
  const card = INTRO_CARDS[index];
  const last = index === INTRO_CARDS.length - 1;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <div className="flex min-h-6 w-full justify-end">
        {!last && (
          <Link
            href={LOOK_HREF}
            className="text-sm font-semibold text-text-muted hover:text-text-primary"
          >
            {INTRO_SKIP}
          </Link>
        )}
      </div>

      <div key={card.key} className="flex flex-col items-center gap-6 text-center">
        <IntroScene card={card.key} game={game} />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">
            {card.title}
          </h1>
          <p className="text-lg text-text-secondary">{card.body}</p>
        </div>
      </div>

      <div
        className="flex gap-2"
        aria-label={`${index + 1} of ${INTRO_CARDS.length}`}
        role="img"
      >
        {INTRO_CARDS.map((entry, at) => (
          <span
            key={entry.key}
            className={cn(
              "h-2 rounded-full",
              at === index ? "w-5 bg-accent" : "w-2 bg-border-strong",
            )}
          />
        ))}
      </div>

      {last ? (
        <div className="flex w-full flex-col gap-2">
          <Link href="/flare" className={buttonStyles("primary")}>
            {INTRO_POST}
          </Link>
          <Link
            href={LOOK_HREF}
            className="py-2 text-center font-semibold text-accent hover:underline"
          >
            {INTRO_LOOK}
          </Link>
        </div>
      ) : (
        <Button type="button" className="w-full" onClick={() => setIndex(index + 1)}>
          {INTRO_NEXT}
        </Button>
      )}
    </div>
  );
}
