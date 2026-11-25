import { useNavigation } from "@react-navigation/native";
import { useEffect, useRef } from "react";

/**
 * Tapping the tab you are already on takes it back to its first screen,
 * as if it had just been opened: the founder (2026-11-25), "clicking any
 * of the tab icons on bottom row should bring you back to the first
 * screen on that tab ... pressing search, from this screen, should bring
 * me back to the main search menu as if i just pushed it." Switching
 * tabs keeps each where you left it; only a second tap on the same tab
 * resets it. Each tab says what its reset is (scroll to the top, clear
 * the search, the profile's first section).
 */
export function useTabReset(reset: () => void): void {
  const navigation = useNavigation();
  const latest = useRef(reset);
  latest.current = reset;

  useEffect(() => {
    const tabs = navigation as unknown as {
      addListener?: (event: "tabPress", listener: () => void) => () => void;
      isFocused: () => boolean;
    };
    /* Only a tab's own screen hears "tabPress"; a pushed one does not. */
    return tabs.addListener?.("tabPress", () => {
      if (tabs.isFocused()) latest.current();
    });
  }, [navigation]);
}
