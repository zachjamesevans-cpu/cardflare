import "server-only";

import { alertRecipients } from "@/lib/billing/trial-alerts";
import { isEmailConfigured, sendEmail } from "@/lib/email/client";
import { siteUrl } from "@/lib/site";
import type { ReportKind, ReportReason } from "./safety-reasons";

/**
 * The admins hear about every report, by email.
 *
 * The same lane the Ultra trial alerts use: one line to whoever
 * `CARDFLARE_ALERT_EMAIL` names, with the queue's address. Nothing the
 * reporter wrote and nobody's name goes in the mail; the queue, behind
 * the admin sign-in, is where the detail lives. Best-effort, every
 * step: a missing address or a mail hiccup is logged, and the report
 * itself is already filed.
 */

const KIND_WORD: Record<ReportKind, string> = {
  post: "a post",
  player: "a player",
  thread: "a conversation",
  comment: "a comment",
};

/** The mail's subject and text, apart from sending, so it is tested. */
export function reportAlertMessage(
  kind: ReportKind,
  reason: ReportReason,
  link = `${siteUrl()}/admin/reports#queue`,
): { subject: string; text: string } {
  return {
    subject: `New report: ${KIND_WORD[kind]} (${reason})`,
    text: `A player reported ${KIND_WORD[kind]} for ${reason}.\nOpen the queue: ${link}`,
  };
}

export async function notifyReportFiled(
  kind: ReportKind,
  reason: ReportReason,
): Promise<void> {
  const recipients = alertRecipients();
  if (recipients.length === 0) {
    console.warn("Report alert skipped: CARDFLARE_ALERT_EMAIL is not set");
    return;
  }
  if (!isEmailConfigured()) {
    console.warn("Report alert skipped: email is not configured");
    return;
  }

  try {
    const { subject, text } = reportAlertMessage(kind, reason);
    const html = `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll("\n", "<br>")}</p>`;
    for (const to of recipients) {
      const result = await sendEmail({ to, subject, text, html });
      if (result.status !== "sent") {
        console.error("Report alert not sent", { to, kind, result });
      }
    }
  } catch (error) {
    console.error("Report alert failed", { kind, error });
  }
}
