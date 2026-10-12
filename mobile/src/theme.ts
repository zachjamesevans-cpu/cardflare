/**
 * cardflare's design tokens, mirrored from the website's `@theme` block
 * (src/app/globals.css). The web tokens are the source of truth; when a
 * value changes there, it changes here. One dark look on both clients —
 * the app should feel like the room page, not like a second product.
 */
/*
 * WHICH LOOK: "soft" or "lime". One switch for the green, the glows and
 * the logo across the app.
 *
 * "soft" is the founder's CF logo (assets/cf-mark.png): its pale green
 * #CEFC84 as the accent, the glows turned right down, and the CF mark
 * where the glowing wordmark was. The founder: "trying to reduce the
 * 'gamer' glow/look from the logo... if i dont like it, i can quickly
 * switch back." "lime" is everything as it was. The app icon and splash
 * are native files: the lime ones are kept in assets/brand-lime/ and go
 * back with a copy and a build.
 */
export const BRAND: "soft" | "lime" = "soft";

const ACCENTS: Record<
  "soft" | "lime",
  { accent: string; accentHover: string; accentMuted: string; accentTint: string }
> = {
  lime: {
    accent: "#c6ee4f",
    accentHover: "#d3fa5f",
    accentMuted: "#8ba635",
    accentTint: "rgba(198,238,79,0.1)",
  },
  soft: {
    accent: "#cefc84",
    accentHover: "#dbfda2",
    accentMuted: "#93ae63",
    accentTint: "rgba(206,252,132,0.1)",
  },
};

/*
 * The surfaces and the quiet text, by BRAND. "lime" keeps the navy the
 * app was built in; "soft" is the CF logo's own ground, #111710, a deep
 * green-black sampled off the founder's second logo (its regions read
 * #10160F to #121810), with the raised steps, the borders and the grey
 * text in the same green family so nothing navy is left beside it. The
 * founder: "see how in the feed it's a navy color for all the flares?
 * what if it was that exact dark gray/green color. make sure to color
 * match it exactly", then, of the greener logo: "the tint in the
 * background is more green". The page itself stays true black on both.
 */
const SURFACES: Record<
  "soft" | "lime",
  {
    surface: string;
    elevated: string;
    border: string;
    borderStrong: string;
    textSecondary: string;
    textMuted: string;
  }
> = {
  lime: {
    surface: "#151a21",
    elevated: "#1d242d",
    border: "#2a323d",
    borderStrong: "#3a4553",
    textSecondary: "#b3becc",
    textMuted: "#8593a4",
  },
  soft: {
    surface: "#111710",
    elevated: "#1a2118",
    border: "#242d22",
    borderStrong: "#333e30",
    textSecondary: "#bcc4b8",
    textMuted: "#8a9386",
  },
};

/**
 * How strongly anything glows in the accent: a held card's ring, the
 * status crosshair, a mutual match, the PRO mark. Full on "lime", a
 * whisper on "soft".
 */
export const accentGlow = BRAND === "soft" ? 0.25 : 1;

/*
 * HOW THE FEED SITS: "blocks" or "open". "blocks" is every post in its
 * own rounded panel on the black page, as it has been. "open" is the
 * founder's try (2026-10-11): "lets see what it would look like without
 * the green 'blocks' in the feed. like the full background was just
 * that dark gray green color and there were no 'blocks' rounded around
 * ppls stuff" - the Feed's page is the surface green, and posts sit on
 * it with a hairline between them, the cards running edge to edge.
 * Declared wide so either word typechecks against the other.
 */
export type FeedLook = "blocks" | "open";
export const FEED_LOOK = "open" as FeedLook;

export const colors = {
  /*
   * True black, matching the website's --color-canvas. The founder:
   * "I want the background to be full black. will look much cleaner."
   * Every surface above it is unchanged, so a Card reads as raised off
   * the page instead of as a slightly lighter shade of it.
   *
   * accentContrast stays #0e1116 — that is ink on a lime fill, not a
   * background, and pure black on that lime is harsher.
   */
  canvas: "#000000",
  surface: SURFACES[BRAND].surface,
  elevated: SURFACES[BRAND].elevated,
  border: SURFACES[BRAND].border,
  borderStrong: SURFACES[BRAND].borderStrong,
  /* The accent, its hover, its dim and (below) its wash: from BRAND. */
  accent: ACCENTS[BRAND].accent,
  accentHover: ACCENTS[BRAND].accentHover,
  accentMuted: ACCENTS[BRAND].accentMuted,
  accentContrast: "#0e1116",
  /*
   * The accent as a wash: a selected row, a chip that is on, the Embers
   * badge. One strength, so "selected" reads the same on every screen
   * instead of at 8, 10, 12 or 15 percent depending on who wrote it.
   */
  accentTint: ACCENTS[BRAND].accentTint,
  /* What dims the page behind a card, a badge or a sheet, one strength. */
  scrim: "rgba(0,0,0,0.75)",
  textPrimary: "#f2f5f7",
  textSecondary: SURFACES[BRAND].textSecondary,
  textMuted: SURFACES[BRAND].textMuted,
  success: "#6ee7a8",
  warning: "#fbc85a",
  danger: "#ff8f8f",
  /* Cosmetics — the colours Embers buy, same block as the web tokens. */
  ember: "#ff8a3d",
  emberDeep: "#c2410c",
  galaxy: "#6d4aff",
  galaxyDeep: "#1a0b3d",
  frost: "#6ec3ff",
  frostDeep: "#1d6fa8",
  rose: "#ff6fb5",
  roseDeep: "#b8367d",
  gold: "#f0c24b",
  goldDeep: "#a8781d",
} as const;

/*
 * THE BACKDROP: the player's own choice, in Settings. "green" is the
 * look above - surfaces in the CF logo's green-black. "black" turns
 * those surfaces pure black, for profiles, panels and cards; the accent,
 * the FOUND band and every green highlight stay exactly as they are.
 * The founder (2026-10-12): "add a dark mode toggle in settings to make
 * our classic green stuff just pure black ... mainly just for
 * backgrounds on profile and other elements that are that dark green".
 *
 * Applied by changing `colors` in place before the app's screens load
 * (src/backdrop.ts), so everything that reads a colour - inline styles,
 * and the stylesheets that read these four live - draws in it.
 */
export type Backdrop = "green" | "black";

export const BACKDROPS: Record<
  Backdrop,
  { surface: string; elevated: string; border: string; borderStrong: string }
> = {
  green: {
    surface: SURFACES[BRAND].surface,
    elevated: SURFACES[BRAND].elevated,
    border: SURFACES[BRAND].border,
    borderStrong: SURFACES[BRAND].borderStrong,
  },
  /* Neutral, not tinted: a raised step and two hairlines just light
     enough to separate a panel from the black page. */
  black: {
    surface: "#000000",
    elevated: "#121212",
    border: "#1f1f1f",
    borderStrong: "#2e2e2e",
  },
};

/** Put a backdrop's surfaces into `colors`, in place. */
export function applyBackdrop(backdrop: Backdrop): void {
  Object.assign(colors as unknown as Record<string, string>, BACKDROPS[backdrop]);
}

/** Six hues for initials avatars, matching --color-avatar-N. */
export const avatarHues = [
  "#8fd3ff",
  "#a8e6a1",
  "#ffc98f",
  "#d9b3ff",
  "#ffadad",
  "#7fe3d4",
] as const;

export const radius = { control: 10, card: 16, panel: 20 } as const;

export const spacing = (n: number) => n * 4;

/**
 * How much air sits between content and the edge of the screen.
 *
 * The founder: "I think we can go a little bit closer to the edges of
 * the screen with our UI. there's a good amount of dead space there. so
 * just make everything as close to the sides of the os as possible."
 *
 * Eight rather than sixteen. Phones are narrow and a card's own padding
 * already keeps its text off its border, so a second inset outside that
 * was air between two kinds of air. Named once because forty-odd screens
 * set it, and a number typed forty times is a number that drifts.
 */
export const gutter = spacing(2);
