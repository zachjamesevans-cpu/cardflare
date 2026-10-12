/**
 * The colours an email is drawn in.
 *
 * Emails are the one place a literal hex is allowed: a mail client never
 * sees `globals.css`, so the brand tokens are copied here by value. Keep
 * them matching the `@theme` block; BRAND.md has the table.
 */
export const EMAIL_COLOR = {
  canvas: "#0e1116",
  surface: "#111710",
  elevated: "#1a2118",
  border: "#242d22",
  borderStrong: "#333e30",
  accent: "#cefc84",
  accentContrast: "#0e1116",
  /** The accent laid at about 8% over the surface: the ticket's fill. */
  accentTint: "#1f2a1c",
  textPrimary: "#f2f5f7",
  textSecondary: "#bcc4b8",
  textMuted: "#8a9386",
} as const;

/** System faces only: a mail client will not load a web font reliably. */
export const EMAIL_FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

/** Every interpolated name goes through this before it reaches HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
