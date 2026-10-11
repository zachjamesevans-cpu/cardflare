import {
  Inter_300Light,
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_600SemiBold_Italic,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
  useFonts,
} from "@expo-google-fonts/inter";
import { forwardRef, useContext, type ComponentRef } from "react";
import type * as ReactNativeTypes from "react-native";
import { StyleSheet, type TextStyle } from "react-native";

/* The module's own exports object, not a namespace copy of it: the
   swap below has to land where every other file's import reads from. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNative = require("react-native") as typeof ReactNativeTypes;

/*
 * WHICH TYPEFACE: "inter" or "system". One switch for every word in the
 * app, the way BRAND switches the colours.
 *
 * The founder (2026-10-11): "can you try an alternative font option for
 * the app? something a little cleaner." Inter is the website's face
 * already (BRAND.md: "Sans: Inter - headings and body"), so the app now
 * reads like the site it mirrors; "system" is San Francisco, what the
 * app has always drawn. Switching back is this one word and a reload.
 */
export const TYPEFACE: "inter" | "system" = "inter";

const FACES = {
  Inter_300Light,
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_600SemiBold_Italic,
  Inter_700Bold,
  Inter_800ExtraBold,
  Inter_900Black,
};

/* Each weight the app writes, to the face that draws it. A face per
   weight rather than one family and a weight, so iOS never fakes a bold
   or picks the wrong cut of a downloaded font. */
const BY_WEIGHT: Record<string, keyof typeof FACES> = {
  "100": "Inter_300Light",
  "200": "Inter_300Light",
  "300": "Inter_300Light",
  "400": "Inter_400Regular",
  normal: "Inter_400Regular",
  "500": "Inter_500Medium",
  "600": "Inter_600SemiBold",
  "700": "Inter_700Bold",
  bold: "Inter_700Bold",
  "800": "Inter_800ExtraBold",
  "900": "Inter_900Black",
};

function faceFor(style: TextStyle): keyof typeof FACES {
  const weight = String(style.fontWeight ?? "400");
  const italic = style.fontStyle === "italic";
  if (italic) {
    return Number(weight) >= 600 || weight === "bold"
      ? "Inter_600SemiBold_Italic"
      : "Inter_400Regular_Italic";
  }
  return BY_WEIGHT[weight] ?? "Inter_400Regular";
}

/**
 * The style a Text draws with: its own, with Inter's face for its
 * weight. Untouched when it names a family of its own (Menlo for a card
 * code, a worn name's art) and when it is a span inside another Text
 * that says nothing about weight - it inherits its parent's face then,
 * as a bold word's plain neighbour should.
 */
function withFace(style: ReactNativeTypes.StyleProp<TextStyle>, nested: boolean) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return style;
  if (nested && flat.fontWeight === undefined && flat.fontStyle === undefined) {
    return style;
  }
  return [style, { fontFamily: faceFor(flat) }];
}

let installed = false;

/**
 * Put Inter on every Text and TextInput, once, before the first render.
 *
 * Seven hundred Text elements set their own styles and there is no
 * shared component to change, so this swaps the component React Native
 * hands out: `Text` and `TextInput` are getters on its exports, and the
 * app's compiled imports read them at render time. Off entirely when
 * TYPEFACE is "system".
 */
export function installTypeface(): void {
  if (installed || TYPEFACE !== "inter") return;
  installed = true;

  const BaseText = ReactNative.Text;
  const BaseInput = ReactNative.TextInput;
  const Ancestor = ReactNative.unstable_TextAncestorContext;

  const InterText = forwardRef<ComponentRef<typeof BaseText>, ReactNativeTypes.TextProps>(
    function InterText(props, ref) {
      const nested = useContext(Ancestor);
      return <BaseText ref={ref} {...props} style={withFace(props.style, nested)} />;
    },
  );
  InterText.displayName = "Text";

  const InterInput = forwardRef<
    ComponentRef<typeof BaseInput>,
    ReactNativeTypes.TextInputProps
  >(function InterInput(props, ref) {
    return (
      <BaseInput
        ref={ref}
        {...props}
        style={withFace(props.style as ReactNativeTypes.StyleProp<TextStyle>, false)}
      />
    );
  });
  InterInput.displayName = "TextInput";

  for (const [name, component] of [
    ["Text", InterText],
    ["TextInput", InterInput],
  ] as const) {
    Object.defineProperty(ReactNative, name, {
      configurable: true,
      enumerable: true,
      get: () => component,
    });
  }
}

/**
 * Whether the faces are in: the app waits on this before its first
 * screen, so nothing draws in San Francisco and then jumps. A failed
 * load lets the app go on in the system face rather than hang.
 */
export function useTypefaceReady(): boolean {
  const [loaded, error] = useFonts(TYPEFACE === "inter" ? FACES : {});
  return TYPEFACE !== "inter" || loaded || Boolean(error);
}
