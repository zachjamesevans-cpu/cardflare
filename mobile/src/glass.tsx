import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
  type GlassStyle,
} from "expo-glass-effect";
import { useContext } from "react";
import { Platform, StyleSheet, View, type ViewProps } from "react-native";

import { colors } from "./theme";

/**
 * Liquid Glass, and the one honest answer about whether we have it.
 *
 * The founder asked for the iOS 26 look - "make sure that the tabs at
 * the bottom are 'liquid glass' ui elements and other ui elements" -
 * and Liquid Glass is a system material, not a stylesheet. It exists on
 * iOS 26 and nowhere else, so every surface that wants it has to say
 * what it looks like when it cannot have it.
 *
 * TWO checks, not one, and both matter:
 *
 * - `isLiquidGlassAvailable` says the app is drawing in the Liquid
 *   Glass design at all.
 * - `isGlassEffectAPIAvailable` says the API is actually there. Expo
 *   added it because some iOS 26 betas ship without it and CRASH when
 *   a GlassView is mounted (expo/expo#40911). A phone in the wild is
 *   exactly where that happens, so the guard is not optional.
 *
 * Both are native constants read once, so this is a module-level
 * boolean rather than a hook: it cannot change while the app is running,
 * and making it a hook would invite a re-render that never comes.
 */
export const GLASS_AVAILABLE =
  Platform.OS === "ios" && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();

/**
 * A surface that is glass where glass exists and the app's own dark
 * surface everywhere else.
 *
 * `fallback` is the colour the surface had BEFORE any of this, so an
 * older iPhone sees exactly the app it saw last week rather than a hole
 * where a material should be. Nothing about layout changes either way -
 * the glass replaces a colour, not a box.
 *
 * COLOUR SCHEME IS PINNED DARK. CardFlare has one look and it is the
 * true-black canvas in `theme.ts`; left on `auto` the material follows
 * the SYSTEM appearance, so a phone in light mode would draw a bright
 * white bar under our white-on-black type. The app has no light theme
 * to follow, so it says so.
 *
 * NEVER PUT OPACITY ON THIS OR ITS PARENT. Expo's own caveat: an
 * opacity below 1 anywhere above a GlassView renders the effect
 * incorrectly. Animate position or scale instead - the collapsing
 * header does exactly that and is the reason this note is here.
 */
export function GlassSurface({
  style,
  children,
  glassEffectStyle = "regular",
  tintColor,
  fallback = colors.canvas,
  ...rest
}: ViewProps & {
  glassEffectStyle?: GlassStyle;
  tintColor?: string;
  /** The flat colour used when Liquid Glass is not available. */
  fallback?: string;
}) {
  if (!GLASS_AVAILABLE) {
    return (
      <View style={[{ backgroundColor: fallback }, style]} {...rest}>
        {children}
      </View>
    );
  }

  return (
    <GlassView
      style={style}
      glassEffectStyle={glassEffectStyle}
      tintColor={tintColor}
      colorScheme="dark"
      {...rest}
    >
      {children}
    </GlassView>
  );
}

/**
 * The same surface, filling whatever it is dropped into.
 *
 * Both bars want this: React Navigation's `tabBarBackground` and the
 * collapsing header both hand us a box to paint rather than a box to
 * size, so the common case is "be the whole of it".
 */
export function GlassFill({
  fallback = colors.canvas,
  glassEffectStyle = "regular",
  style,
  ...rest
}: ViewProps & {
  glassEffectStyle?: GlassStyle;
  fallback?: string;
}) {
  return (
    <GlassSurface
      style={[StyleSheet.absoluteFill, style]}
      glassEffectStyle={glassEffectStyle}
      fallback={fallback}
      {...rest}
    />
  );
}


/**
 * How much room the floating tab bar needs at the bottom of a list.
 *
 * The bar overlays now (see App.tsx), so a scroll view that ends where
 * it always did ends UNDERNEATH it, and the last row of every list is
 * unreadable and untappable. That is not a look, it is a bug, and the
 * founder's one condition on this work was that no functionality
 * change.
 *
 * Read off the CONTEXT rather than through `useBottomTabBarHeight`,
 * which throws outside a tab screen. Plenty of these screens are also
 * pushed onto the stack, where the tab bar is not on screen and the
 * honest answer is zero - a hook that throws there would make this
 * usable in exactly the places that do not need it.
 *
 * The height already includes the home-indicator inset, so nothing here
 * adds `insets.bottom` on top: that was the double-count waiting to
 * happen.
 */
export function useTabBarInset(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
