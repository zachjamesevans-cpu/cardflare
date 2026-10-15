import Image from "next/image";
import { Bell, Hand, Heart, MessageCircle, Plus } from "lucide-react";
import type { CSSProperties } from "react";

import { FlareStatus } from "@/components/feed/flare-feed-card";
import {
  INTRO_ART,
  INTRO_COMMENTS,
  INTRO_LIKES,
  INTRO_OFFERED,
  INTRO_PEOPLE,
  INTRO_YOU,
  introChat,
  type IntroCard,
  type IntroGame,
} from "@/lib/onboarding/intro";

/**
 * The intro's three scenes on the website: the same small pieces of the
 * app the phone shows (mobile/src/intro-scenes.tsx), in the art of the
 * game the player picked. The founder: "the big screen that shows all
 * the big icons ... isn't enough. maybe a screenshot of the app or
 * something for each of those things." FlareStatus is the Feed's own
 * line; the FOUND band is the one the hunt binder wears.
 *
 * Each plays once as its card arrives, then holds. Reduced motion skips
 * the movement (motion-safe).
 */

const art = (game: IntroGame, n: 1 | 2 | 3) => `/intro/${game}-${n}.jpg`;

/* One animation, delayed: the way every piece arrives. */
const play = (name: "cf-flare-in" | "cf-intro-slide" | "cf-intro-pop", delay: number) =>
  ({ animation: `${name} 420ms ease-out ${delay}ms both` }) satisfies CSSProperties;

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
}: {
  card: IntroCard["key"];
  game: IntroGame;
}) {
  const names = INTRO_ART[game];
  return (
    <div
      className="flex w-[300px] max-w-full flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 text-left shadow-[0_0_28px_-8px_var(--color-accent)]"
      aria-hidden="true"
    >
      {card === "post" && (
        <>
          <div className="flex items-center justify-between">
            <span
              className="flex size-[34px] items-center justify-center rounded-full border-2 border-accent shadow-[0_0_10px_var(--color-accent)] motion-safe:[animation:var(--a)]"
              style={{ ["--a" as string]: play("cf-intro-pop", 150).animation }}
            >
              <Plus className="size-5 text-text-primary" />
            </span>
            <Bell className="size-5 text-text-muted" />
          </div>
          <div className="flex items-center gap-2">
            <Face name={INTRO_YOU} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold text-text-primary">
                {INTRO_YOU}
              </span>
              <FlareStatus />
            </div>
          </div>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map((n, index) => (
              <span
                key={n}
                className="motion-safe:[animation:var(--a)]"
                style={{
                  ["--a" as string]: play("cf-intro-slide", 350 + index * 160)
                    .animation,
                }}
              >
                <Art src={art(game, n)} alt={names[index]} width={82} />
              </span>
            ))}
          </div>
        </>
      )}

      {card === "social" && (
        <>
          <div className="flex items-center gap-2">
            <Face name={INTRO_YOU} size={28} />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-text-primary">{INTRO_YOU}</span>
              <FlareStatus />
            </div>
          </div>
          <div className="flex gap-1.5">
            {([1, 2, 3] as const).map((n, index) => (
              <Art key={n} src={art(game, n)} alt={names[index]} width={56} />
            ))}
          </div>
          {/* The Feed's own marks: a filled heart and a speech bubble. */}
          <div
            className="flex items-center gap-4 text-[13px] font-semibold text-text-secondary motion-safe:[animation:var(--a)]"
            style={{ ["--a" as string]: play("cf-flare-in", 250).animation }}
          >
            <span className="flex items-center gap-1">
              <Heart className="size-4 fill-accent text-accent" />
              {INTRO_LIKES}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-4" />
              {INTRO_COMMENTS.length}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {INTRO_COMMENTS.map((comment, index) => (
              <li
                key={comment.name}
                className="flex items-start gap-2 motion-safe:[animation:var(--a)]"
                style={{
                  ["--a" as string]: play("cf-flare-in", 550 + index * 400).animation,
                }}
              >
                <Face name={comment.name} size={24} />
                <p className="flex-1 text-[13px] leading-snug text-text-secondary">
                  <span className="font-bold text-text-primary">{comment.name} </span>
                  {comment.body}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {card === "nearby" && (
        <div className="flex items-center gap-3">
          <Art src={art(game, 3)} alt={names[2]} width={96} />
          <ul className="flex flex-1 flex-col gap-2.5">
            {INTRO_PEOPLE.map((person, index) => (
              <li
                key={person.name}
                className="flex items-center gap-2 motion-safe:[animation:var(--a)]"
                style={{
                  ["--a" as string]: play("cf-intro-slide", 200 + index * 150)
                    .animation,
                }}
              >
                <Face name={person.name} size={28} />
                <span className="flex flex-1 flex-col leading-tight">
                  <span className="text-sm font-bold text-text-primary">
                    {person.name}
                  </span>
                  <span className="text-xs text-text-muted">{person.miles}</span>
                </span>
                {index === 0 && (
                  <span
                    className="flex items-center gap-0.5 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-extrabold text-accent-contrast motion-safe:[animation:var(--a)]"
                    style={{ ["--a" as string]: play("cf-intro-pop", 900).animation }}
                  >
                    <Hand className="size-3" />
                    {INTRO_OFFERED}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card === "trade" && (
        <>
          <div
            className="flex items-end gap-2 motion-safe:[animation:var(--a)]"
            style={{ ["--a" as string]: play("cf-flare-in", 150).animation }}
          >
            <Face name={INTRO_PEOPLE[0].name} size={26} />
            <p className="max-w-[210px] rounded-2xl rounded-bl-sm bg-elevated px-3 py-2 text-sm text-text-primary">
              {introChat(names[2])[0]}
            </p>
          </div>
          <p
            className="max-w-[210px] self-end rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm font-semibold text-accent-contrast motion-safe:[animation:var(--a)]"
            style={{ ["--a" as string]: play("cf-flare-in", 650).animation }}
          >
            {introChat(names[2])[1]}
          </p>
          <div className="flex justify-center">
            <span className="relative overflow-hidden rounded-[5px]">
              <Art src={art(game, 3)} alt={names[2]} width={92} />
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 bg-accent py-0.5 text-center text-[11px] font-bold tracking-wider text-accent-contrast uppercase motion-safe:[animation:var(--a)]"
                style={{ ["--a" as string]: play("cf-flare-in", 1200).animation }}
              >
                Found
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
