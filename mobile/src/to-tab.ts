import type { TabParams } from "../App";

/**
 * Go to a tab, BACK to the one tab bar the app has, never a second copy.
 *
 * In React Navigation 7, `navigate("Tabs")` from a screen opened over the
 * tabs (a sheet, a pushed screen) PUSHES another Tabs on top unless asked
 * to pop: the founder saw the Feed "as a slide up menu" after posting.
 * `pop: true` goes back down the stack to the existing tabs instead.
 */
export function toTab<Name extends keyof TabParams>(
  navigation: { navigate: (...args: never[]) => void },
  screen: Name,
  params?: TabParams[Name],
): void {
  (navigation.navigate as unknown as (options: object) => void)({
    name: "Tabs",
    params: params === undefined ? { screen } : { screen, params },
    pop: true,
  });
}
