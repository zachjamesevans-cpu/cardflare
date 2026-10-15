import type { ImageSourcePropType } from "react-native";

import type { IntroGame } from "./intro-copy";

/**
 * The intro scenes' card art, bundled so the first launch needs no
 * network (intro-copy.ts says which cards and why). React Native wants a
 * literal require per image, so the table is written out; the website
 * reads the same files from public/intro.
 */
export const INTRO_IMAGES: Record<IntroGame, readonly [ImageSourcePropType, ImageSourcePropType, ImageSourcePropType]> = {
  "one-piece": [
    require("../assets/intro/one-piece-1.jpg"),
    require("../assets/intro/one-piece-2.jpg"),
    require("../assets/intro/one-piece-3.jpg"),
  ],
  pokemon: [
    require("../assets/intro/pokemon-1.jpg"),
    require("../assets/intro/pokemon-2.jpg"),
    require("../assets/intro/pokemon-3.jpg"),
  ],
  lorcana: [
    require("../assets/intro/lorcana-1.jpg"),
    require("../assets/intro/lorcana-2.jpg"),
    require("../assets/intro/lorcana-3.jpg"),
  ],
  mtg: [
    require("../assets/intro/mtg-1.jpg"),
    require("../assets/intro/mtg-2.jpg"),
    require("../assets/intro/mtg-3.jpg"),
  ],
  "flesh-and-blood": [
    require("../assets/intro/flesh-and-blood-1.jpg"),
    require("../assets/intro/flesh-and-blood-2.jpg"),
    require("../assets/intro/flesh-and-blood-3.jpg"),
  ],
};
