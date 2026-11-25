import { BottomTabBar, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import Animated, {
  interpolate,
  makeMutable,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";

import { TAB_BAR } from "./glass";
import { useEffect, useState } from "react";
import { AppState, View } from "react-native";

import { storedAccessToken } from "./api";
import { FLARE_BUTTON, FlareButton } from "./flare-button";
import { gutter, spacing } from "./theme";

/**
 * The tab bar, smaller while you scroll down - the way Instagram's does.
 *
 * The founder (2026-10-11): "the tabs at the bottom, that whole bar,
 * should get slightly smaller when i scroll down. like how the other
 * thing disappears (the top bar). this is how instagram does it so more
 * info is present on screen."
 *
 * One value says how far along it is, 0 (full) to 1 (compact). The
 * Feed's scroll writes it in step with its collapsing header
 * (src/collapsing-header.tsx), so the two move as one gesture and snap
 * together on release; any tab change puts the bar back to full. The
 * bar shrinks about its bottom edge, so it settles lower rather than
 * floating up, and its touch targets shrink with it.
 */
export const dockCompact = makeMutable(0);

/** How small the bar gets, fully compact. */
export const DOCK_COMPACT_SCALE = 0.82;

/** Back to full size, animated: a tab change, a screen with no scroll. */
export function restoreDock(): void {
  dockCompact.value = withTiming(0, { duration: 180 });
}

export function DockTabBar(props: BottomTabBarProps) {
  const shrink = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(dockCompact.value, [0, 1], [1, DOCK_COMPACT_SCALE]) },
    ],
  }));

  const route = props.state.routes[props.state.index]?.name;
  const signedIn = useSignedIn();
  /* The Flare button rides above the bar on every tab but the ones where
     it would only be in the way: Messages (its own composer) and the
     Flare composer itself. Never for a guest: posting needs an account. */
  const flare = signedIn && route !== undefined && !NO_FLARE_BUTTON.has(route);

  return (
    <>
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          /* The bar's whole reach, lift included, so its touches land
             inside this box; it is pinned inside by its own absolute
             style (App.tsx tabBarStyle). */
          height: TAB_BAR.lift + TAB_BAR.height,
          transformOrigin: "50% 100%",
        },
        shrink,
      ]}
    >
      <BottomTabBar {...props} />
    </Animated.View>
    {flare ? (
      /* A box of its own above the bar: a touch outside its parent's
         bounds never lands on iOS, so the button is not a child of the
         bar's box. */
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          right: gutter + spacing(1),
          bottom: TAB_BAR.lift + TAB_BAR.height + spacing(3),
          width: FLARE_BUTTON,
          height: FLARE_BUTTON,
        }}
      >
        <FlareButton
          label="Post a Flare"
          spotlight
          onPress={() => props.navigation.navigate("Flare")}
        />
      </View>
    ) : null}
    </>
  );
}

/** Tabs that carry no Flare button. */
const NO_FLARE_BUTTON = new Set(["Messages", "Flare", "Local"]);

/** Whether this phone is signed in, looked at again whenever the app returns. */
function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let live = true;
    const look = () => {
      void storedAccessToken().then((token) => {
        if (live) setSignedIn(Boolean(token));
      });
    };
    look();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") look();
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return signedIn;
}
