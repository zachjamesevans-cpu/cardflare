"use client";

import Image from "next/image";
import {
  Check,
  Hand,
  Heart,
  Lock,
  LockKeyhole,
  MessageCircle,
  Plus,
  UserRound,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { BinderCover } from "@/components/binder/binder-cover";
import { FlareStatus } from "@/components/feed/flare-feed-card";
import type { BinderCoverId } from "@/lib/binder/covers";
import {
  INTRO_ART,
  INTRO_BINDERS,
  INTRO_COMMENT,
  INTRO_COMMENT_COUNT,
  INTRO_LIKES,
  INTRO_OFFERED,
  INTRO_OFFER_SENT,
  INTRO_PEOPLE,
  INTRO_PRIVATE,
  INTRO_PUBLIC,
  INTRO_SHARE_LINK,
  INTRO_SHARE_MESSAGE,
  INTRO_WANT,
  INTRO_YOU,
  introChat,
  introShareTitle,
  type IntroCard,
  type IntroGame,
} from "@/lib/onboarding/intro";

/**
 * The intro's five scenes on the website: the same small pieces of the
 * app the phone shows (mobile/src/intro-scenes.tsx), in the art of the
 * game the player picked. The founder: "the big screen that shows all
 * the big icons ... isn't enough. maybe a screenshot of the app or
 * something for each of those things", then the five slides with the
 * binders in them. FlareStatus is the Feed's own line, BinderCover the
 * one binder, and the FOUND band the one the hunt binder wears.
 *
 * Each plays once as its card arrives, then holds. Reduced motion skips
 * the movement (motion-safe).
 */

const art = (game: IntroGame, n: 1 | 2 | 3) => `/intro/${game}-${n}.jpg`;

/* One animation, delayed: the way every piece arrives. */
const play = (name: "cf-flare-in" | "cf-intro-slide" | "cf-intro-pop", delay: number) =>
  ({ ["--a" as string]: `${name} 420ms ease-out ${delay}ms both` }) as CSSProperties;
const ANIMATE = "motion-safe:[animation:var(--a)]";

function Art({ src, alt, width }: { src: string; alt: string; width: number }) {
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={Math.round((width * 88) / 63)}
      className="rounded-[5px]"
    />
  );
}

function Face({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-border-strong bg-elevated font-bold text-text-primary"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function IntroScene({
  card,
  game,
  handle = null,
}: {
  card: IntroCard["key"];
  game: IntroGame;
  /** The player's handle, for the share scene's link title. */
  handle?: string | null;
}) {
  const names = INTRO_ART[game];
  return (
    <div
      className="flex w-[300px] max-w-full flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-left shadow-[0_0_28px_-8px_var(--color-accent)]"
      aria-hidden="true"
    >
      {card === "post" && <PostScene game={game} names={names} />}
      {card === "nearby" && <NearbyScene game={game} names={names} />}
      {card === "binders" && <BindersScene />}
      {card === "share" && <ShareScene game={game} names={names} handle={handle} />}
      {card === "trade" && <TradeScene game={game} names={names} />}
    </div>
  );
}

type SceneProps = { game: IntroGame; names: readonly [string, string, string] };

/* 1. A Flare going up, and the followers' answer. */
function PostScene({ game, names }: SceneProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Face name={INTRO_YOU} size={28} />
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-text-primary">{INTRO_YOU}</span>
            <FlareStatus />
          </div>
        </div>
        <span
          className={`flex size-8 items-center justify-center rounded-full border-2 border-accent shadow-[0_0_10px_var(--color-accent)] ${ANIMATE}`}
          style={play("cf-intro-pop", 150)}
        >
          <Plus className="size-5 text-text-primary" />
        </span>
      </div>
      <div className="flex gap-2">
        {([1, 2, 3] as const).map((n, index) => (
          <span
            key={n}
            className={ANIMATE}
            style={play("cf-intro-slide", 300 + index * 140)}
          >
            <Art src={art(game, n)} alt={names[index]} width={70} />
          </span>
        ))}
      </div>
      <div
        className={`flex items-center gap-4 text-[13px] font-semibold text-text-secondary ${ANIMATE}`}
        style={play("cf-flare-in", 800)}
      >
        <span className="flex items-center gap-1">
          <Heart className="size-4 fill-accent text-accent" />
          {INTRO_LIKES}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="size-4" />
          {INTRO_COMMENT_COUNT}
        </span>
      </div>
      <p
        className={`flex items-start gap-2 text-[13px] leading-snug text-text-secondary ${ANIMATE}`}
        style={play("cf-flare-in", 1100)}
      >
        <Face name={INTRO_COMMENT.name} size={24} />
        <span className="flex-1">
          <span className="font-bold text-text-primary">{INTRO_COMMENT.name} </span>
          {INTRO_COMMENT.body}
        </span>
      </p>
    </>
  );
}

/* 2. Players near you with it in a binder: the nearest one offers it. */
function NearbyScene({ game, names }: SceneProps) {
  return (
    <div className="flex items-center gap-3">
      <Art src={art(game, 3)} alt={names[2]} width={96} />
      <ul className="flex flex-1 flex-col gap-2.5">
        {INTRO_PEOPLE.map((person, index) => (
          <li
            key={person.name}
            className={`flex items-center gap-2 ${ANIMATE}`}
            style={play("cf-intro-slide", 200 + index * 150)}
          >
            <Face name={person.name} size={28} />
            <span className="flex flex-1 flex-col leading-tight">
              <span className="text-sm font-bold text-text-primary">{person.name}</span>
              <span className="text-xs text-text-muted">{person.miles}</span>
            </span>
            {index === 0 && (
              <span
                className={`flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-extrabold text-accent-contrast ${ANIMATE}`}
                style={play("cf-intro-pop", 900)}
              >
                <Hand className="size-3" />
                {INTRO_OFFERED}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* 3. Your binders: three covers fanned out, named, one locked private. */
function BindersScene() {
  const tilt = [-8, 0, 8];
  return (
    <>
      <div className="flex h-[150px] items-end justify-center">
        {INTRO_BINDERS.map((binder, index) => (
          /* The entrance on the outside, the tilt inside: the animation
             would otherwise overwrite the transform. */
          <span
            key={binder.name}
            className={`-mx-3.5 ${index === 1 ? "z-10" : ""} ${ANIMATE}`}
            style={play("cf-flare-in", 150 + index * 170)}
          >
            <span
              className="relative block"
              style={{
                transform: `rotate(${tilt[index]}deg) translateY(${index === 1 ? -10 : 0}px)`,
              }}
            >
              <BinderCover
                cover={binder.cover as BinderCoverId}
                label={binder.name}
                size="sm"
              />
              {binder.private && (
                <span
                  className={`absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border border-border-strong bg-elevated ${ANIMATE}`}
                  style={play("cf-intro-pop", 900)}
                >
                  <LockKeyhole className="size-3.5 text-text-primary" />
                </span>
              )}
            </span>
          </span>
        ))}
      </div>
      <div
        className={`flex justify-center gap-4 text-xs font-semibold text-text-secondary ${ANIMATE}`}
        style={play("cf-flare-in", 1100)}
      >
        <span className="flex items-center gap-1">
          <UserRound className="size-3.5 text-accent" />
          {INTRO_PUBLIC}
        </span>
        <span className="flex items-center gap-1">
          <Lock className="size-3.5" />
          {INTRO_PRIVATE}
        </span>
      </div>
    </>
  );
}

/* 4. The trade binder's link, sent in a message; the friend who opens
   it wants a card, and the offer goes. */
function ShareScene({ game, names, handle }: SceneProps & { handle: string | null }) {
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSent(true), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <>
      <div
        className={`flex w-[264px] max-w-full flex-col gap-1.5 self-end rounded-2xl rounded-br-sm bg-accent p-1.5 ${ANIMATE}`}
        style={play("cf-flare-in", 150)}
      >
        <p className="px-1.5 pt-0.5 text-sm font-semibold text-accent-contrast">
          {INTRO_SHARE_MESSAGE}
        </p>
        <div className="flex items-center gap-2 rounded-xl bg-surface p-2">
          <BinderCover
            cover={INTRO_BINDERS[0].cover as BinderCoverId}
            size="xs"
            plain
          />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-[13px] font-bold text-text-primary">
              {introShareTitle(handle)}
            </span>
            <span className="truncate text-[11px] text-text-muted">
              {INTRO_SHARE_LINK}
            </span>
            <span className="mt-0.5 flex gap-[3px]">
              {([1, 2, 3] as const).map((n, index) => (
                <Art key={n} src={art(game, n)} alt={names[index]} width={18} />
              ))}
            </span>
          </div>
        </div>
      </div>
      <div
        className={`flex items-center gap-2.5 ${ANIMATE}`}
        style={play("cf-flare-in", 800)}
      >
        <Face name={INTRO_PEOPLE[1].name} size={26} />
        <Art src={art(game, 1)} alt={names[0]} width={44} />
        <span
          className={`flex items-center gap-1 rounded-full border border-accent px-2.5 py-1.5 text-xs font-extrabold transition-colors ${
            sent ? "bg-accent text-accent-contrast" : "text-accent"
          }`}
        >
          {sent ? <Check className="size-3.5" /> : <Hand className="size-3.5" />}
          {sent ? INTRO_OFFER_SENT : INTRO_WANT}
        </span>
      </div>
    </>
  );
}

/* 5. Two messages, then the card is yours: FOUND. */
function TradeScene({ game, names }: SceneProps) {
  const [ask, answer] = introChat(names[2]);
  return (
    <>
      <div
        className={`flex items-end gap-2 ${ANIMATE}`}
        style={play("cf-flare-in", 150)}
      >
        <Face name={INTRO_PEOPLE[0].name} size={26} />
        <p className="max-w-[210px] rounded-2xl rounded-bl-sm bg-elevated px-3 py-2 text-sm text-text-primary">
          {ask}
        </p>
      </div>
      <p
        className={`max-w-[210px] self-end rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast ${ANIMATE}`}
        style={play("cf-flare-in", 650)}
      >
        {answer}
      </p>
      <div className="flex justify-center">
        <span className="relative overflow-hidden rounded-[5px]">
          <Art src={art(game, 3)} alt={names[2]} width={92} />
          <span
            className={`pointer-events-none absolute inset-x-0 bottom-0 bg-accent py-0.5 text-center text-[11px] font-bold tracking-wider text-accent-contrast uppercase ${ANIMATE}`}
            style={play("cf-flare-in", 1200)}
          >
            Found
          </span>
        </span>
      </div>
    </>
  );
}
