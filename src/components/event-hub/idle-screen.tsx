"use client";

import { useEffect, useState, type ReactNode } from "react";

import type { DisplayPayload } from "@/lib/event-hub/display-payload";
import {
  goingLine,
  IDLE_CLOSED,
  IDLE_FLARES_OPEN,
  IDLE_FROM_STORE,
  IDLE_INFO_MS,
  IDLE_JOIN_LINE,
  IDLE_LIVE_NOW,
  IDLE_NEXT_UP,
  IDLE_ROTATE_MS,
  IDLE_WANTED_NOW,
  IDLE_WANTED_WEEK,
  idleSlides,
  peopleLine,
  tradesCaption,
  type IdleInfo,
  type IdleSlide,
} from "@/lib/event-hub/idle-rules";

/**
 * The screen when no tournament is on it.
 *
 * The founder (2026-10-11): "if they're not showing a tournament timer
 * or anything - maybe it'll show some valuable cardflare info, what time
 * it is, when next event is, prior cards people were looking for there."
 *
 * Three things, readable from the back of the shop: the time, the way
 * in, and one panel at a time from the ones the store chose (the next
 * nights, the cards wanted here, the trades made here, the store's
 * latest post). A panel with nothing to say is skipped rather than
 * shown empty. After the store's hours it dims to a quiet clock.
 *
 * Built for a screen left on all day: one interval for the rotation, one
 * for the panels' contents, both cleared; the clock is the display's
 * own tick, passed in. And the whole picture drifts a few pixels each
 * minute, so nothing sits on the same pixels long enough to burn in.
 */

/**
 * The panels' contents, asked for every five minutes. The preview has
 * no token and shows the sample it was handed.
 */
function useIdleInfo(token: string | null, sample: IdleInfo | undefined): IdleInfo {
  const [info, setInfo] = useState<IdleInfo>(
    sample ?? { nights: [], wanted: [], trades: 0, post: null },
  );

  useEffect(() => {
    if (token === null) return;
    let live = true;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(`/api/display/${token}/idle`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const fresh = (await response.json()) as IdleInfo;
        if (live) setInfo(fresh);
      } catch {
        /* The last panels it knew stay up; the next try is five minutes
           away, which is nothing to a slide about next week. */
      }
    };
    void load();
    const every = setInterval(load, IDLE_INFO_MS);
    return () => {
      live = false;
      clearInterval(every);
    };
  }, [token]);

  return info;
}

export function IdleScreen({
  payload,
  now,
  token,
  join,
  header,
  sample,
}: {
  payload: DisplayPayload;
  /** The display's server-corrected clock. */
  now: number;
  token: string | null;
  /** The JOIN square, drawn by the display so it is the one the wall uses. */
  join: ReactNode;
  header: ReactNode;
  /** The preview's panels, when there is no token to ask with. */
  sample?: IdleInfo;
}) {
  const info = useIdleInfo(token, sample);
  const slides = idleSlides(payload.idlePanels, info, payload.flares);
  const [turn, setTurn] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const rotate = setInterval(() => setTurn((value) => value + 1), IDLE_ROTATE_MS);
    return () => clearInterval(rotate);
  }, [slides.length]);

  const slide = slides.length > 0 ? slides[turn % slides.length] : null;
  const zone = payload.timeZone;

  /* A few pixels each minute, round a small square: invisible to anyone
     watching, and enough that no pixel holds the same light all day. */
  const minute = Math.floor(now / 60_000);
  const drift = {
    transform: `translate(${(minute % 5) * 3 - 6}px, ${(Math.floor(minute / 5) % 5) * 3 - 6}px)`,
  };

  if (!payload.storeOpen) {
    return (
      <main
        id="main"
        className="flex h-dvh w-full items-center justify-center overflow-hidden bg-canvas"
      >
        <div
          style={drift}
          className="flex flex-col items-center gap-[clamp(0.4rem,1vw,1rem)] opacity-50 transition-transform duration-[2000ms]"
        >
          <Clock now={now} zone={zone} size="quiet" />
          <p className="text-[clamp(0.9rem,1.6vw,1.8rem)] font-semibold tracking-[0.2em] text-text-muted uppercase">
            {payload.storeName}
          </p>
          <p className="text-[clamp(0.8rem,1.3vw,1.4rem)] text-text-muted">
            {IDLE_CLOSED}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main"
      className="flex h-dvh w-full flex-col gap-[clamp(0.4rem,0.9vw,1.25rem)] overflow-hidden bg-canvas p-[clamp(0.6rem,1.2vw,1.75rem)]"
    >
      {header}

      <div
        style={drift}
        className="flex min-h-0 flex-1 gap-[clamp(0.6rem,1.4vw,2rem)] transition-transform duration-[2000ms]"
      >
        <section className="flex min-h-0 min-w-0 flex-[5] flex-col gap-[clamp(0.5rem,1.2vw,1.5rem)]">
          <Clock now={now} zone={zone} size="wall" />

          {slide && (
            <div
              key={`${slide.panel}-${turn}`}
              className="flex min-h-0 flex-1 flex-col gap-[clamp(0.4rem,1vw,1.25rem)] rounded-[var(--radius-panel)] border border-border bg-surface p-[clamp(0.8rem,1.6vw,2rem)] motion-safe:animate-[cf-join-in_0.8s_var(--ease-out-soft)_both]"
            >
              <SlideBody slide={slide} zone={zone} now={now} />
            </div>
          )}
        </section>

        {join && (
          <section className="flex shrink-0 flex-col items-center justify-center gap-[clamp(0.6rem,1.2vw,1.5rem)] rounded-[var(--radius-panel)] border border-border bg-surface px-[clamp(1rem,2vw,3rem)] py-[clamp(0.8rem,1.6vw,2rem)]">
            {join}
            <p className="max-w-[14em] text-center text-[clamp(0.85rem,1.4vw,1.6rem)] font-semibold text-text-secondary">
              {IDLE_JOIN_LINE}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

function Clock({
  now,
  zone,
  size,
}: {
  now: number;
  zone: string;
  size: "wall" | "quiet";
}) {
  const at = new Date(now);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).formatToParts(at);
  const clock = time
    .filter((part) => part.type !== "dayPeriod")
    .map((part) => part.value)
    .join("")
    .trim();
  const period = time.find((part) => part.type === "dayPeriod")?.value ?? "";
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(at);

  return (
    <div className={size === "wall" ? "shrink-0" : "text-center"}>
      <p
        className={`leading-none font-bold tracking-tight text-text-primary tabular-nums ${
          size === "wall"
            ? "text-[clamp(3.5rem,13vw,15rem)]"
            : "text-[clamp(3rem,10vw,11rem)]"
        }`}
      >
        {clock}
        <span className="ml-[0.15em] text-[0.3em] font-semibold text-text-muted">
          {period}
        </span>
      </p>
      <p className="mt-[clamp(0.2rem,0.5vw,0.6rem)] text-[clamp(1rem,2vw,2.3rem)] font-semibold text-accent">
        {date}
      </p>
    </div>
  );
}

function Heading({ children }: { children: string }) {
  return (
    <h2 className="shrink-0 text-[clamp(0.9rem,1.6vw,1.9rem)] font-bold tracking-[0.18em] text-accent uppercase">
      {children}
    </h2>
  );
}

function SlideBody({
  slide,
  zone,
  now,
}: {
  slide: IdleSlide;
  zone: string;
  now: number;
}) {
  if (slide.panel === "nights") {
    return (
      <>
        <Heading>{IDLE_NEXT_UP}</Heading>
        <ul className="flex min-h-0 flex-col gap-[clamp(0.4rem,0.9vw,1.1rem)]">
          {slide.nights.slice(0, 3).map((night) => (
            <li
              key={`${night.name}-${night.startsAt}`}
              className="flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="truncate text-[clamp(1.1rem,2.3vw,2.7rem)] font-bold text-text-primary">
                  {night.name}
                </p>
                <p className="text-[clamp(0.85rem,1.5vw,1.7rem)] text-text-secondary">
                  {nightWhen(night.startsAt, zone, now)} · {goingLine(night.going)}
                </p>
              </div>
              {(night.live || night.flaresOpen) && (
                <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-[0.8em] py-[0.25em] text-[clamp(0.75rem,1.2vw,1.4rem)] font-bold text-accent">
                  {night.live ? IDLE_LIVE_NOW : IDLE_FLARES_OPEN}
                </span>
              )}
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (slide.panel === "wanted") {
    return (
      <>
        <Heading>{slide.live ? IDLE_WANTED_NOW : IDLE_WANTED_WEEK}</Heading>
        <ul className="grid min-h-0 flex-1 grid-cols-6 gap-[clamp(0.4rem,0.9vw,1.1rem)]">
          {slide.cards.map((card) => (
            <li key={card.cardId} className="flex min-h-0 min-w-0 flex-col gap-1">
              <div className="relative min-h-0 flex-1 overflow-hidden rounded-[6px] bg-canvas">
                {card.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={card.imageUrl}
                    alt={`${card.cardName}, ${card.cardNumber}`}
                    className="absolute inset-0 size-full object-contain"
                  />
                )}
              </div>
              <p className="truncate text-[clamp(0.7rem,1.1vw,1.3rem)] font-semibold text-text-primary">
                {card.cardName}
              </p>
              <p className="text-[clamp(0.65rem,1vw,1.15rem)] text-text-muted">
                {peopleLine(card.people)}
              </p>
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (slide.panel === "trades") {
    return (
      <div className="flex flex-1 flex-col justify-center gap-[clamp(0.3rem,0.8vw,1rem)]">
        <p className="text-[clamp(3rem,9vw,10rem)] leading-none font-bold text-accent tabular-nums">
          {slide.count}
        </p>
        <p className="text-[clamp(1rem,2.2vw,2.6rem)] font-semibold text-text-primary">
          {tradesCaption(slide.count)}
        </p>
      </div>
    );
  }

  return (
    <>
      <Heading>{IDLE_FROM_STORE}</Heading>
      <div className="flex min-h-0 flex-1 gap-[clamp(0.6rem,1.2vw,1.5rem)]">
        {slide.post.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={slide.post.imageUrl}
            alt=""
            className="h-full max-w-[40%] rounded-[var(--radius-card)] object-cover"
          />
        )}
        <div className="min-w-0">
          <p className="text-[clamp(1.2rem,2.6vw,3rem)] font-bold text-text-primary">
            {slide.post.title}
          </p>
          {slide.post.body && (
            <p className="mt-[0.4em] line-clamp-4 text-[clamp(0.9rem,1.7vw,2rem)] text-text-secondary">
              {slide.post.body}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

/** "Fri 6:30 PM", or "Today 6:30 PM", on the store's clock. */
function nightWhen(startsAt: string, zone: string, now: number): string {
  const at = new Date(startsAt);
  const day = (date: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone: zone, dateStyle: "short" }).format(
      date,
    );
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
  if (day(at) === day(new Date(now))) return `Today ${time}`;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
  }).format(at);
  return `${weekday} ${time}`;
}
