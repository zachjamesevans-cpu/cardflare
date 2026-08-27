import {
  GAME_PROFILES,
  gameProfile,
  timerPreset,
  type Bracket,
  type GameId,
} from "./game-profiles";
import { LAYOUT_CHOICES, type LayoutChoice } from "./layout";

/**
 * What the control panel is allowed to say.
 *
 * Kept free of server-only imports so the form can check itself before a
 * round trip and so this is unit-testable — the same split the waitlist
 * uses. The Server Action runs every one of these again: a Server Action
 * is a public POST endpoint and the browser's copy is a convenience.
 */

export const EVENT_NAME_MAX = 60;
export const FORMAT_MAX = 40;
export const ANNOUNCEMENT_MAX = 200;
export const NIGHT_TITLE_MAX = 60;
export const DISPLAY_NAME_MAX = 60;

/** Eight hours, matching the table's own constraint. */
export const MAX_DURATION_SECONDS = 28_800;

export type TimerDraft = {
  game: GameId;
  eventName: string;
  round: number | null;
  format: string | null;
  bracket: Bracket;
  presetId: string;
  durationSeconds: number | null;
};

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

function trimmed(value: string, max: number): string {
  return value.trim().slice(0, max);
}

/**
 * Reads a timer out of a form.
 *
 * `customMinutes` overrides the preset's own length, which is how a
 * store runs a 45-minute round the publisher never printed a preset for.
 * An empty string means "use the preset", not "zero".
 */
export function checkTimerDraft(input: {
  game: string;
  eventName: string;
  round: string;
  format: string;
  bracket: string;
  presetId: string;
  customMinutes: string;
}): Checked<TimerDraft> {
  const profile = gameProfile(input.game);
  if (!profile) return { ok: false, message: "Pick one of the supported games." };

  const preset = timerPreset(profile.id, input.presetId);
  if (!preset) return { ok: false, message: "Pick a timer preset." };

  const eventName = trimmed(input.eventName, EVENT_NAME_MAX);
  if (!eventName) return { ok: false, message: "Give the tournament a name." };

  const bracket: Bracket = input.bracket === "elimination" ? "elimination" : "swiss";

  const roundRaw = input.round.trim();
  let round: number | null = null;
  if (roundRaw) {
    const parsed = Number(roundRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
      return { ok: false, message: "A round number is between 1 and 99." };
    }
    round = parsed;
  }

  const format = trimmed(input.format, FORMAT_MAX) || null;

  /* Blank means the preset decides, including a preset that is untimed.
     Zero is a real answer and is refused separately below. */
  const customRaw = input.customMinutes.trim();
  let durationSeconds = preset.durationSeconds;

  if (customRaw) {
    const minutes = Number(customRaw);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return { ok: false, message: "A custom length is a number of minutes." };
    }
    durationSeconds = Math.round(minutes * 60);
    if (durationSeconds > MAX_DURATION_SECONDS) {
      return { ok: false, message: "That is longer than eight hours." };
    }
  }

  return {
    ok: true,
    value: {
      game: profile.id,
      eventName,
      round,
      format,
      bracket,
      presetId: preset.id,
      durationSeconds,
    },
  };
}

/**
 * The between-rounds window, out of a form.
 *
 * `choice` is one of the offered minute counts or "custom";
 * `customMinutes` only matters for "custom". Anything unreadable lands
 * on the recommended default rather than an error — a mis-typed
 * intermission is not worth losing the rest of the tournament form over.
 */
export function checkIntermissionSeconds(
  choice: string,
  customMinutes: string,
): number {
  const fallback = 180;

  if (choice === "custom") {
    const minutes = Number(customMinutes.trim());
    if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
    return Math.min(3600, Math.max(30, Math.round(minutes * 60)));
  }

  const minutes = Number(choice);
  if (!Number.isFinite(minutes) || minutes <= 0) return fallback;
  return Math.min(3600, Math.max(30, Math.round(minutes * 60)));
}

export function checkLayout(value: string): LayoutChoice {
  return LAYOUT_CHOICES.includes(value as LayoutChoice)
    ? (value as LayoutChoice)
    : "auto";
}

export function checkAnnouncement(value: string): string | null {
  return trimmed(value, ANNOUNCEMENT_MAX) || null;
}

export function checkNightTitle(value: string): string | null {
  return trimmed(value, NIGHT_TITLE_MAX) || null;
}

export function checkDisplayName(value: string): string {
  return trimmed(value, DISPLAY_NAME_MAX) || "Main display";
}

/** The overtime seconds a game's procedure implies for this timer. */
export function overtimeSecondsFor(game: GameId, bracket: Bracket): number | null {
  const procedure =
    bracket === "elimination"
      ? GAME_PROFILES[game].elimination
      : GAME_PROFILES[game].swiss;

  return procedure.timed ? procedure.overtimeSeconds : null;
}
