"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { TvFrame } from "@/components/stores/device-frames";
import { cn } from "@/lib/cn";
import {
  DEMO_MAX_TOURNAMENTS,
  DEMO_MOMENTS,
  DEMO_SCENES,
  matchingScene,
  type DemoConfig,
  type DemoMoment,
} from "@/lib/event-hub/demo";
import { GAME_IDS, GAME_PROFILES, type GameId } from "@/lib/event-hub/game-profiles";
import type { LayoutChoice } from "@/lib/event-hub/layout";

/**
 * FlareCast's sample night, with switches.
 *
 * The founder: "showcase different types of screens. like, when there's
 * a magic tournament with one piece running at same time... different
 * switches for store owners to swap between them." The television is
 * the real display in a frame; the buttons here only choose which night
 * it shows. Scenes are one tap. On the store page the full set of
 * switches sits under them, so an owner can build their own night: the
 * games they run, where the round is, the layout, and what else is on
 * the wall.
 */

/** The scenes the homepage offers: the four that differ most. */
const COMPACT_SCENES = ["locals", "two-games", "big-night", "between-rounds"];

const LAYOUTS: { id: LayoutChoice; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "single", label: "One" },
  { id: "split", label: "Two" },
  { id: "grid", label: "Four" },
];

const TOGGLES: { key: "flares" | "qr" | "announcement" | "beginner"; label: string }[] =
  [
    { key: "flares", label: "Wanted cards" },
    { key: "qr", label: "Scan-to-join code" },
    { key: "announcement", label: "Announcement" },
    { key: "beginner", label: "Beginner mode" },
  ];

function momentLabel(moment: DemoMoment): string {
  if (moment === "untimed") return "untimed";
  return DEMO_MOMENTS.find((entry) => entry.id === moment)!.label.toLowerCase();
}

/** What the wall is showing, for a night that is not one of the scenes. */
function customCaption(config: DemoConfig): string {
  const parts = config.tournaments.map(
    (tournament) =>
      `${GAME_PROFILES[tournament.game].shortName} ${momentLabel(tournament.moment)}`,
  );
  return `Your night: ${parts.join(", ")}.`;
}

/** The moment every tournament shares, if they share one. */
function sharedMoment(config: DemoConfig): DemoMoment | null {
  const first = config.tournaments[0]?.moment ?? null;
  return config.tournaments.every((tournament) => tournament.moment === first)
    ? first
    : null;
}

export function DemoStudio({ variant }: { variant: "full" | "compact" }) {
  const [config, setConfig] = useState<DemoConfig>(DEMO_SCENES[0].config);
  const active = matchingScene(config);
  const scenes =
    variant === "full"
      ? DEMO_SCENES
      : DEMO_SCENES.filter((scene) => COMPACT_SCENES.includes(scene.id));

  return (
    <div className="flex flex-col gap-5">
      <div
        role="group"
        aria-label="FlareCast scenes"
        /* One row that scrolls sideways on a phone, rather than four
           rows of buttons pushing the television off the screen. */
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0"
      >
        {scenes.map((scene) => (
          <Chip
            key={scene.id}
            pressed={active?.id === scene.id}
            onClick={() => setConfig(scene.config)}
          >
            {scene.label}
          </Chip>
        ))}
      </div>

      <TvFrame
        config={config}
        label={`FlareCast sample night: ${active ? active.label : customCaption(config)}`}
        caption={active ? active.caption : customCaption(config)}
      />

      {variant === "full" ? (
        <Switches config={config} onChange={setConfig} />
      ) : (
        <p className="text-center">
          <Link
            href="/ultra#demo"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover"
          >
            Build your own night
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </p>
      )}
    </div>
  );
}

function Switches({
  config,
  onChange,
}: {
  config: DemoConfig;
  onChange: (config: DemoConfig) => void;
}) {
  const running = new Set(config.tournaments.map((tournament) => tournament.game));
  const full = config.tournaments.length >= DEMO_MAX_TOURNAMENTS;
  const moment = sharedMoment(config);

  const toggleGame = (game: GameId) => {
    if (running.has(game)) {
      if (config.tournaments.length === 1) return;
      onChange({
        ...config,
        tournaments: config.tournaments.filter(
          (tournament) => tournament.game !== game,
        ),
      });
      return;
    }
    if (full) return;
    onChange({
      ...config,
      tournaments: [
        ...config.tournaments,
        /* A new game joins where the others are, when they agree. */
        { game, moment: moment && moment !== "untimed" ? moment : "round" },
      ],
    });
  };

  return (
    <div className="flex flex-col gap-5 rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
      <p className="text-sm font-semibold text-text-primary">Build your own night</p>

      <Row
        title="Games running"
        hint={
          full
            ? "One screen shows up to four tournaments."
            : "Add a second game and the wall splits itself."
        }
      >
        {GAME_IDS.map((game) => {
          const on = running.has(game);
          const profile = GAME_PROFILES[game];
          return (
            <Chip
              key={game}
              pressed={on}
              /* The last game stays pressable and simply stays on: a
                 dimmed chip would read as "off" for the one game that
                 is certainly running. */
              disabled={!on && full}
              onClick={() => toggleGame(game)}
              style={{ ["--game" as string]: `var(${profile.accentToken})` }}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full bg-[var(--game)]"
              />
              {profile.shortName}
            </Chip>
          );
        })}
      </Row>

      <Row title="Where the round is">
        {DEMO_MOMENTS.map((entry) => (
          <Chip
            key={entry.id}
            pressed={moment === entry.id}
            onClick={() =>
              onChange({
                ...config,
                tournaments: config.tournaments.map((tournament) => ({
                  ...tournament,
                  moment: entry.id,
                })),
              })
            }
          >
            {entry.label}
          </Chip>
        ))}
      </Row>

      <Row
        title="Screen layout"
        hint="Auto fits the tournaments running. A layout too small for them grows, so nobody's clock is hidden."
      >
        {LAYOUTS.map((layout) => (
          <Chip
            key={layout.id}
            pressed={config.layout === layout.id}
            onClick={() => onChange({ ...config, layout: layout.id })}
          >
            {layout.label}
          </Chip>
        ))}
      </Row>

      <Row title="On the wall">
        {TOGGLES.map((toggle) => (
          <Chip
            key={toggle.key}
            pressed={config[toggle.key]}
            onClick={() => onChange({ ...config, [toggle.key]: !config[toggle.key] })}
          >
            {toggle.label}
          </Chip>
        ))}
      </Row>
    </div>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={title} className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-[0.14em] text-text-muted uppercase">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function Chip({
  pressed,
  disabled = false,
  onClick,
  style,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors duration-[var(--duration-base)] disabled:cursor-not-allowed disabled:opacity-45",
        pressed
          ? "border-accent bg-accent/15 text-accent"
          : "border-border bg-elevated text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {children}
    </button>
  );
}
