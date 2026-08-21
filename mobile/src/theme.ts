/**
 * CardFlare's design tokens, mirrored from the website's `@theme` block
 * (src/app/globals.css). The web tokens are the source of truth; when a
 * value changes there, it changes here. One dark look on both clients —
 * the app should feel like the room page, not like a second product.
 */
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
  surface: "#151a21",
  elevated: "#1d242d",
  border: "#2a323d",
  borderStrong: "#3a4553",
  accent: "#c6ee4f",
  accentHover: "#d3fa5f",
  accentMuted: "#8ba635",
  accentContrast: "#0e1116",
  textPrimary: "#f2f5f7",
  textSecondary: "#b3becc",
  textMuted: "#8593a4",
  success: "#6ee7a8",
  warning: "#fbc85a",
  danger: "#ff8f8f",
  /* Cosmetics — the colours Embers buy, same block as the web tokens. */
  ember: "#ff8a3d",
  emberDeep: "#c2410c",
  galaxy: "#6d4aff",
  galaxyDeep: "#1a0b3d",
  frost: "#6ec3ff",
  rose: "#ff6fb5",
  gold: "#f0c24b",
} as const;

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
