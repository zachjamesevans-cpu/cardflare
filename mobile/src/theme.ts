/**
 * CardFlare's design tokens, mirrored from the website's `@theme` block
 * (src/app/globals.css). The web tokens are the source of truth; when a
 * value changes there, it changes here. One dark look on both clients —
 * the app should feel like the room page, not like a second product.
 */
export const colors = {
  canvas: "#0e1116",
  surface: "#151a21",
  elevated: "#1d242d",
  border: "#2a323d",
  borderStrong: "#3a4553",
  accent: "#c6ee4f",
  accentHover: "#d3fa5f",
  accentContrast: "#0e1116",
  textPrimary: "#f2f5f7",
  textSecondary: "#b3becc",
  textMuted: "#8593a4",
  danger: "#ff6b6b",
} as const;

export const radius = { control: 10, panel: 16 } as const;

export const spacing = (n: number) => n * 4;
