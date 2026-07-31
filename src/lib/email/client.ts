import "server-only";

/**
 * Minimal Resend client.
 *
 * Talks to the REST API with `fetch` rather than pulling in the SDK — this is
 * one endpoint and the payload is four fields, so a dependency would cost more
 * than it saves.
 *
 * Nothing here ever throws. Email is a nice-to-have on top of a signup that
 * has already been stored; a provider outage must never turn a successful
 * signup into a visible failure.
 */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Abandon the request rather than hold a serverless function open. */
const TIMEOUT_MS = 8_000;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Surfaced to clients as the one-click unsubscribe target. */
  listUnsubscribe?: string;
}

export type SendResult =
  | { status: "sent"; id: string }
  | { status: "skipped"; reason: "not-configured" }
  | { status: "failed"; reason: string };

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.WAITLIST_FROM_EMAIL);
}

export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.WAITLIST_FROM_EMAIL;

  if (!apiKey || !from) return { status: "skipped", reason: "not-configured" };

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.listUnsubscribe
          ? { headers: { "List-Unsubscribe": `<${message.listUnsubscribe}>` } }
          : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      // Read the body for the log only — it can echo the recipient address,
      // so it must never reach the caller's return value verbatim.
      const detail = await response.text().catch(() => "");
      console.error(
        `Resend rejected the request (${response.status}): ${detail.slice(0, 300)}`,
      );
      return { status: "failed", reason: `http-${response.status}` };
    }

    const body = (await response.json().catch(() => ({}))) as { id?: string };
    return { status: "sent", id: body.id ?? "unknown" };
  } catch (error) {
    console.error("Failed to reach the email provider", error);
    return { status: "failed", reason: "network" };
  }
}
