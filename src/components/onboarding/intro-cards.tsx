"use client";

import Link from "next/link";
import { useRef, useState } from "react";

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
  const strip = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  /* Pages whose scene has drawn: each mounts as it slides past halfway,
     so its animation plays as it arrives (the app's rule, intro.tsx). */
  const [drawn, setDrawn] = useState(1);
  const last = index === INTRO_CARDS.length - 1;

  const follow = () => {
    const el = strip.current;
    if (!el || el.clientWidth === 0) return;
    const at = Math.max(
      0,
      Math.min(INTRO_CARDS.length - 1, Math.round(el.scrollLeft / el.clientWidth)),
    );
    setIndex(at);
    setDrawn((count) => Math.max(count, at + 1));
  };
  const go = (to: number) => {
    const el = strip.current;
    if (!el) return;
    const at = Math.max(0, Math.min(INTRO_CARDS.length - 1, to));
    el.scrollTo({ left: at * el.clientWidth, behavior: "smooth" });
  };

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

      {/*
       * THE CARDS, SWIPED. The founder: "people should be able to swipe
       * between these screens on this page. like go back and forth." A
       * strip that snaps a card at a time: a finger swipes it, a
       * trackpad scrolls it, the arrow keys and Next move it.
       */}
      <div
        ref={strip}
        onScroll={follow}
        tabIndex={0}
        aria-roledescription="carousel"
        aria-label="What cardflare does"
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(index + 1);
          if (event.key === "ArrowLeft") go(index - 1);
        }}
        className="flex w-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain outline-none [&::-webkit-scrollbar]:hidden"
      >
        {INTRO_CARDS.map((card, at) => (
          <div
            key={card.key}
            className="flex w-full shrink-0 snap-center snap-always flex-col items-center gap-6 px-1 text-center"
            aria-hidden={at !== index}
          >
            {/* A fixed height, so the words do not jump when it draws. */}
            <div className="flex h-[300px] items-center">
              {at < drawn && <IntroScene card={card.key} game={game} />}
            </div>
            <div className="flex flex-col gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-text-primary">
                {card.title}
              </h1>
              <p className="text-lg text-text-secondary">{card.body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Where you are, three dots; each one goes there. */}
      <div className="flex gap-2">
        {INTRO_CARDS.map((entry, at) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => go(at)}
            aria-label={`${entry.title}, ${at + 1} of ${INTRO_CARDS.length}`}
            aria-current={at === index}
            className={cn(
              "h-2 cursor-pointer rounded-full transition-[width]",
              at === index ? "w-5 bg-accent" : "w-2 bg-border-strong",
            )}
          />
        ))}
      </div>

      {/* The same place on every card: one button whose words change,
          and the line under it always kept, empty until the last card.
          The app's rule (intro.tsx); the founder found the shift
          "disorienting". */}
      <div className="flex w-full flex-col gap-2">
        {last ? (
          <Link href="/flare" className={cn(buttonStyles("primary"), "w-full")}>
            {INTRO_POST}
          </Link>
        ) : (
          <Button type="button" className="w-full" onClick={() => go(index + 1)}>
            {INTRO_NEXT}
          </Button>
        )}
        <div className="flex h-9 items-center justify-center">
          {last && (
            <Link
              href={LOOK_HREF}
              className="font-semibold text-accent hover:underline"
            >
              {INTRO_LOOK}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
