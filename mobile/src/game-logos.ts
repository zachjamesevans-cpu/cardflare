import type { ImageSourcePropType } from "react-native";

import type { GameSlug } from "./games";

/*
 * Each game's own logo, in cardflare's green: the founder, "the icons for
 * lorcana and other tcgs on this screen should just be the logo of the
 * actual game, with the classic cardflare green as the logo color."
 * Made from the logos Wikipedia and Wikimedia Commons host, recoloured
 * offline to the accent (#cefc84): a one-colour logo flat, a many-colour
 * one as a green duotone so its outlines stay legible. Riftbound (Riot's
 * own lockup) and Gundam (Scrydex's copy of Bandai's, enlarged with its
 * edge re-sharpened) are flat green; the founder found the plain-name
 * tiles "awful" (2026-11-25).
 */
export const GAME_LOGO: Partial<Record<GameSlug, ImageSourcePropType>> = {
  "one-piece": require("../assets/games/one-piece.png"),
  pokemon: require("../assets/games/pokemon.png"),
  mtg: require("../assets/games/mtg.png"),
  lorcana: require("../assets/games/lorcana.png"),
  "flesh-and-blood": require("../assets/games/flesh-and-blood.png"),
  riftbound: require("../assets/games/riftbound.png"),
  gundam: require("../assets/games/gundam.png"),
};
