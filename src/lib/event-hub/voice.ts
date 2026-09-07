import type { GameProfile } from "./game-profiles";

/**
 * What the organizer's computer says out loud.
 *
 * The founder's sentence, exactly: "(game name) is ready for (round) on
 * the TO's computer." Pure, so the pitch page can quote it and the test
 * can hold it, and the control panel speaks the same words.
 */
export function roundReadyLine(
  profile: Pick<GameProfile, "shortName">,
  round: number,
): string {
  return `${profile.shortName} is ready for round ${round}.`;
}

/** The between-rounds moment, for the same voice. */
export function timeCalledLine(
  profile: Pick<GameProfile, "shortName">,
  round: number | null,
): string {
  return round === null
    ? `${profile.shortName}: time in the round.`
    : `${profile.shortName}: time in round ${round}.`;
}

/** Remembered per browser: the organizer chooses once per computer. */
export const VOICE_STORAGE_KEY = "cf-hub-voice";
