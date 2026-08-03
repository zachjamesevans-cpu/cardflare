import { SITE } from "@/lib/site";
import type { EmailMessage } from "./client";

/**
 * Sent when a store is added to the beta.
 *
 * Deliberately contains no sign-in link of its own. A magic link would expire
 * long before a shop owner got round to reading it; pointing at the sign-in
 * page instead lets them get a fresh one whenever they are ready. Same
 * reasoning as the waitlist email on styling: inline styles, no images, real
 * plain-text alternative.
 *
 * The copy used to say "there's no password — we email you a link each time",
 * which stopped being true when password sign-in landed. It matters more than
 * most stale copy: this is the first instruction a store ever reads, and it
 * was telling them to expect a flow that is now the fallback rather than the
 * route in.
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
  /*
   * Points at the reset page rather than at sign-in. An invited account exists
   * with no password, so "choose a password" and "I forgot mine" are the same
   * flow underneath — and sending a store to a sign-in form they cannot yet
   * complete is how the first real invitation went wrong once already.
   */
  const passwordUrl = `${origin}/login/reset`;

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
        Your account is ready on this email address. Choose a password to
        finish setting it up, and you can sign straight in from then on.
      </p>

      <p style="margin:0 0 24px;">
        <a href="${passwordUrl}" style="display:inline-block;background-color:${COLOR.accent};color:${COLOR.accentContrast};font-weight:700;font-size:16px;text-decoration:none;padding:12px 24px;border-radius:10px;">
          Choose a password
        </a>
      </p>

      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        Rather not have one? You can ask for a one-time sign-in link by email
        instead, every time.
      </p>

      <p style="margin:0;padding-top:24px;border-top:1px solid ${COLOR.border};font-size:13px;line-height:1.6;color:${COLOR.textMuted};">
        Sign in any time at <a href="${signInUrl}" style="color:${COLOR.accent};">${SITE.domain}/login</a>.
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
    "Your account is ready on this email address. Choose a password to finish",
    "setting it up, and you can sign straight in from then on.",
    "",
    `Choose a password: ${passwordUrl}`,
    "",
    "Rather not have one? You can ask for a one-time sign-in link by email",
    "instead, every time.",
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
