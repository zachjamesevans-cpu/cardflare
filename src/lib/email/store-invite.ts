import { SITE } from "@/lib/site";
import type { EmailMessage } from "./client";

/**
 * Sent when a store is added to the beta.
 *
 * Deliberately contains no sign-in link. A magic link would expire long before
 * a shop owner got round to reading it; pointing at the sign-in page instead
 * lets them request a fresh one whenever they are ready. Same reasoning as the
 * waitlist email on styling: inline styles, no images, real plain-text
 * alternative.
 */
const COLOR = {
  canvas: "#0e1116",
  surface: "#151a21",
  border: "#2a323d",
  accent: "#c6ee4f",
  accentContrast: "#0e1116",
  textPrimary: "#f2f5f7",
  textSecondary: "#b3becc",
  textMuted: "#8593a4",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function storeInviteEmail(
  storeName: string,
  to: string,
  origin: string,
): EmailMessage {
  const name = escapeHtml(storeName);
  const signInUrl = `${origin}/login`;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:${COLOR.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;padding:32px;">
      <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${COLOR.textPrimary};">
        Card<span style="color:${COLOR.accent};">Flare</span>
      </p>

      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${COLOR.textPrimary};">
        ${name} is in the CardFlare beta.
      </h1>

      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        CardFlare helps players at your events find the cards they need from
        other people already in the room. You're one of the first stores trying
        it.
      </p>

      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        Sign in with this email address to get started. There's no password —
        we email you a link each time.
      </p>

      <p style="margin:0 0 24px;">
        <a href="${signInUrl}" style="display:inline-block;background-color:${COLOR.accent};color:${COLOR.accentContrast};font-weight:700;font-size:16px;text-decoration:none;padding:12px 24px;border-radius:10px;">
          Sign in to ${SITE.name}
        </a>
      </p>

      <p style="margin:0;padding-top:24px;border-top:1px solid ${COLOR.border};font-size:13px;line-height:1.6;color:${COLOR.textMuted};">
        Sign in at <a href="${signInUrl}" style="color:${COLOR.accent};">${SITE.domain}/login</a>.
        Not expecting this? Reply and let us know &mdash; nothing happens until
        you sign in.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    `${storeName} is in the CardFlare beta.`,
    "",
    "CardFlare helps players at your events find the cards they need from other",
    "people already in the room. You're one of the first stores trying it.",
    "",
    "Sign in with this email address to get started. There's no password - we",
    "email you a link each time.",
    "",
    `Sign in: ${signInUrl}`,
    "",
    "---",
    "Not expecting this? Reply and let us know - nothing happens until you sign in.",
  ].join("\n");

  return {
    to,
    subject: `${storeName} is in the ${SITE.name} beta`,
    html,
    text,
  };
}
