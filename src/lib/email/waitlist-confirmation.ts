import { SITE } from "@/lib/site";
import type { EmailMessage } from "./client";

/**
 * Confirmation sent after a new waitlist signup.
 *
 * Deliberately image-free and table-free. Most clients block remote images by
 * default and many mangle modern CSS, so the message is built from inline
 * styles on a handful of elements and reads correctly even when every style is
 * stripped. The plain-text alternative is a real alternative, not a
 * placeholder — it carries the same information.
 *
 * Colours are repeated here rather than read from the design tokens because
 * email has no access to the stylesheet. Keep them in step with the `@theme`
 * block in globals.css.
 */
const COLOR = {
  canvas: "#0e1116",
  surface: "#151a21",
  border: "#2a323d",
  accent: "#c6ee4f",
  textPrimary: "#f2f5f7",
  textSecondary: "#b3becc",
  textMuted: "#8593a4",
};

/** Escapes interpolated user input so a name can never inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function waitlistConfirmationEmail(
  firstName: string,
  to: string,
  origin: string,
): EmailMessage {
  const name = escapeHtml(firstName);
  const unsubscribe = `mailto:${SITE.contactEmail}?subject=Unsubscribe`;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:${COLOR.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;padding:32px;">
      <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${COLOR.textPrimary};">
        Card<span style="color:${COLOR.accent};">Flare</span>
      </p>

      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${COLOR.textPrimary};">
        You're on the list, ${name}.
      </h1>

      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        Thanks for joining the ${SITE.name} waitlist. We're building a way for
        players at the same event to find the cards they need from the people
        already in the room.
      </p>

      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        We're preparing for our first local-store pilots. You'll hear from us
        when early testing opens up &mdash; we won't email you for anything else.
      </p>

      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        Nothing to do for now.
      </p>

      <p style="margin:0;padding-top:24px;border-top:1px solid ${COLOR.border};font-size:13px;line-height:1.6;color:${COLOR.textMuted};">
        You're getting this because you signed up at
        <a href="${origin}" style="color:${COLOR.accent};">${SITE.domain}</a>.
        To be removed, reply to this email or write to
        <a href="${unsubscribe}" style="color:${COLOR.accent};">${SITE.contactEmail}</a>.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    `You're on the list, ${firstName}.`,
    "",
    `Thanks for joining the ${SITE.name} waitlist. We're building a way for players`,
    "at the same event to find the cards they need from the people already in the room.",
    "",
    "We're preparing for our first local-store pilots. You'll hear from us when early",
    "testing opens up - we won't email you for anything else.",
    "",
    "Nothing to do for now.",
    "",
    "---",
    `You're getting this because you signed up at ${origin}`,
    `To be removed, reply to this email or write to ${SITE.contactEmail}`,
  ].join("\n");

  return {
    to,
    subject: `You're on the ${SITE.name} waitlist`,
    html,
    text,
    listUnsubscribe: unsubscribe,
  };
}
