import * as Haptics from "expo-haptics";

/**
 * The tick a pull-to-refresh gives when it commits.
 *
 * The founder: "When pulling up to refresh, make it so that there's a
 * small haptic vibration when it pulls all the way up to refresh." One
 * light tap, the same as a button press, so a refresh feels like
 * something you did rather than something that happened. Never throws:
 * a phone with haptics off just refreshes quietly.
 */
export function refreshTick(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
