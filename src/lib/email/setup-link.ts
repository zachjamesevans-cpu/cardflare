import { SITE } from "@/lib/site";
import type { EmailMessage } from "./client";

/**
 * A fresh sign-in link, asked for on /login/reset.
 *
 * Sent by cardflare rather than by Supabase's built-in mailer, for two
 * reasons found walking an invited store's morning-after: Supabase's own
 * reset email redirects through a PKCE code that only opens in the browser
 * that ASKED for it (a shop owner asks on the counter PC and opens the email
 * on their phone, and lands on "expired" again), and Supabase's built-in
 * sender allows two emails an hour across the whole project. This link is
 * the same kind the invitation carries: a hashed token redeemed on
 * /auth/confirm, which works on whatever device opens it.
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

export function setupLinkEmail(to: string, link: string, origin: string): EmailMessage {
  const subject = `Your ${SITE.name} sign-in link`;
  const resetUrl = `${origin}/login/reset`;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:${COLOR.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;padding:32px;">
      <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${COLOR.accent};">
        ${SITE.name}
      </p>

      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${COLOR.textPrimary};">
        Here is your link.
      </h1>

      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        Tap the button to sign in and choose a password. It works on any phone or
        computer, once.
      </p>

      <p style="margin:0 0 24px;">
        <a href="${link}" style="display:inline-block;background-color:${COLOR.accent};color:${COLOR.accentContrast};font-weight:700;font-size:16px;text-decoration:none;padding:12px 24px;border-radius:10px;">
          Sign in and set a password
        </a>
      </p>

      <p style="margin:0;padding-top:24px;border-top:1px solid ${COLOR.border};font-size:13px;line-height:1.6;color:${COLOR.textMuted};">
        If it has expired, ask for another at
        <a href="${resetUrl}" style="color:${COLOR.accent};">${SITE.domain}/login/reset</a>.
        Did not ask for this? Ignore it; nothing changes until the link is used.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    "Here is your link.",
    "",
    "Open it to sign in and choose a password. It works on any phone or",
    "computer, once.",
    "",
    `Sign in: ${link}`,
    "",
    `If it has expired, ask for another at ${resetUrl}.`,
    "Did not ask for this? Ignore it; nothing changes until the link is used.",
  ].join("\n");

  return { to, subject, html, text };
}
