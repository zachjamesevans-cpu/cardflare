import { SITE } from "@/lib/site";
import type { ContactSubmission } from "@/lib/contact/schema";
import type { EmailMessage } from "./client";

/**
 * A contact-form message, as it lands in the CardFlare inbox.
 *
 * Written for the reader rather than the brand: this one goes to us, so
 * it is plain, the sender's details are at the top, and the reply-to is
 * set so hitting reply reaches them. The message body is escaped and
 * rendered with `white-space: pre-wrap` — somebody pasting a store's
 * address across four lines should not have it collapse into one, and
 * somebody pasting HTML should not have it interpreted.
 *
 * Colours match the waitlist email's, which repeats them for the same
 * reason: email has no access to the stylesheet.
 */
const COLOR = {
  surface: "#151a21",
  border: "#2a323d",
  accent: "#c6ee4f",
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

export function contactMessageEmail(
  submission: ContactSubmission,
  to: string,
): EmailMessage {
  const name = escapeHtml(submission.name);
  const email = escapeHtml(submission.email);
  const subject = escapeHtml(submission.subject);
  const body = escapeHtml(submission.message);

  /*
   * The sender's own subject line, prefixed so the inbox can be filtered
   * and so a message can never impersonate a system email.
   */
  const emailSubject = `[${SITE.name} contact] ${submission.subject}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:${COLOR.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <div style="max-width:600px;margin:0 auto;">
      <p style="margin:0 0 4px;font-size:13px;color:${COLOR.textMuted};">
        New message from the ${SITE.domain} contact form
      </p>
      <p style="margin:0 0 20px;font-size:20px;font-weight:bold;color:${COLOR.textPrimary};">
        ${subject}
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:6px 12px 6px 0;font-size:14px;color:${COLOR.textMuted};">From</td>
          <td style="padding:6px 0;font-size:14px;color:${COLOR.textPrimary};">${name}</td>
        </tr>
        <tr>
          <td style="padding:6px 12px 6px 0;font-size:14px;color:${COLOR.textMuted};">Email</td>
          <td style="padding:6px 0;font-size:14px;">
            <a href="mailto:${email}" style="color:${COLOR.accent};">${email}</a>
          </td>
        </tr>
      </table>

      <div style="padding:16px;border:1px solid ${COLOR.border};border-radius:8px;">
        <p style="margin:0;font-size:15px;line-height:1.6;color:${COLOR.textSecondary};white-space:pre-wrap;">${body}</p>
      </div>

      <p style="margin:20px 0 0;font-size:12px;color:${COLOR.textMuted};">
        Reply to this email to answer ${name} directly.
      </p>
    </div>
  </body>
</html>`;

  const text = [
    `New message from the ${SITE.domain} contact form`,
    "",
    `Subject: ${submission.subject}`,
    `From: ${submission.name} <${submission.email}>`,
    "",
    submission.message,
    "",
    `Reply to this email to answer ${submission.name} directly.`,
  ].join("\n");

  return { to, subject: emailSubject, html, text, replyTo: submission.email };
}
