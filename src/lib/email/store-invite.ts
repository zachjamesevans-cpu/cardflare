import { SITE } from "@/lib/site";
import type { EmailMessage } from "./client";

/**
 * Sent when a store is added to the beta.
 *
 * One email, one button. It used to take two: this message pointed at a form,
 * the form asked for the address the message had just been sent to, and only
 * then did a *second* email arrive carrying the link that actually did
 * something. The first email did nothing but ask for a click.
 *
 * The button now carries a real Supabase action link, minted server-side, so
 * tapping it signs the store in and lands them on the setup screen with their
 * address already filled in.
 *
 * It expires — an hour by default — and a shop owner reads email the next
 * morning, so the message says so plainly and gives the one-step way to get
 * another. That paragraph is not boilerplate; it is the difference between a
 * dead link and a recovered one.
 *
 * Styling follows the waitlist email: inline styles, no images, a real
 * plain-text alternative.
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
  /**
   * A one-click link that signs them in and lands them on the setup screen.
   *
   * Optional because generating it can fail, and an invitation that arrives
   * without the shortcut is far better than none. Without it the email falls
   * back to the two-step route, which is what every invitation used to do.
   */
  setupLink?: string | null,
  /** Changes one paragraph: what the recipient is being invited to *do*. */
  kind: "lgs" | "vendor" | "player" = "lgs",
): EmailMessage {
  const name = escapeHtml(storeName);
  const signInUrl = `${origin}/login`;

  /*
   * A player is not a store, and this message told them they were: the
   * subject and the headline both read "Zach is in the CardFlare beta",
   * which is the sentence a shop gets with a person's name dropped into
   * it. Found by walking the invitation paths rather than by anybody
   * receiving one, which is the only reason it had not been reported.
   *
   * The store wording stays exactly as it was — it was written for a
   * shop owner and it is right.
   */
  const headline =
    kind === "player"
      ? `Your ${SITE.name} account is ready, ${name}.`
      : `${name} is in the ${SITE.name} beta.`;

  const subject =
    kind === "player"
      ? `Your ${SITE.name} account is ready`
      : `${storeName} is in the ${SITE.name} beta`;
  /*
   * The fallback, and the recovery path when the one-click link has expired.
   * An invited account exists with no password, so "choose a password" and "I
   * forgot mine" are the same flow underneath — and sending a store to a
   * sign-in form they cannot yet complete is how the first real invitation
   * went wrong once already.
   */
  const passwordUrl = `${origin}/login/reset`;
  const primaryUrl = setupLink ?? passwordUrl;

  /*
   * The two messages have to differ, and rendering both proved they did not.
   * With no link the button already points at the reset page, so telling the
   * reader "if the button has expired, go to the reset page" sent them to the
   * URL they had just tapped — a loop that reads as a broken email. The
   * fallback promises one extra step instead, because that is what happens.
   */
  const lead = setupLink
    ? "Your account is ready on this address. One tap below finishes it: pick a password and you are in."
    : "Your account is ready on this address. Ask for a link below and we will email you one that sets your password.";

  const buttonLabel = setupLink ? "Finish setting up" : "Choose a password";

  const followUp = setupLink
    ? `The button expires after a while. If it has, use
        <a href="${passwordUrl}" style="color:${COLOR.accent};">${SITE.domain}/login/reset</a>
        and we will send a fresh one to this address.`
    : `The page will ask for this address, then email you a link. It expires
        after a while, so open it when you have a minute.`;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background-color:${COLOR.canvas};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background-color:${COLOR.surface};border:1px solid ${COLOR.border};border-radius:16px;padding:32px;">
      <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${COLOR.textPrimary};">
        Card<span style="color:${COLOR.accent};">Flare</span>
      </p>

      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;color:${COLOR.textPrimary};">
        ${headline}
      </h1>

      <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        ${
          kind === "vendor"
            ? "CardFlare helps card-show attendees find the exact cards they want, and walks them straight to your booth. Upload your inventory before the show, singles and slabs alike, and buyers arrive already knowing you have what they came for."
            : kind === "player"
              ? "A CardFlare account makes your wants follow you: post a card once, and every CardFlare room you walk into offers to post it again until you find it. No account is ever needed just to trade; this one is for keeping your hunt across stores."
              : "CardFlare helps players at your events find the cards they need from other people already in the room. You're one of the first stores trying it."
        }
      </p>

      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        ${lead}
      </p>

      <p style="margin:0 0 24px;">
        <a href="${primaryUrl}" style="display:inline-block;background-color:${COLOR.accent};color:${COLOR.accentContrast};font-weight:700;font-size:16px;text-decoration:none;padding:12px 24px;border-radius:10px;">
          ${buttonLabel}
        </a>
      </p>

      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:${COLOR.textSecondary};">
        ${followUp}
      </p>

      <p style="margin:0;padding-top:24px;border-top:1px solid ${COLOR.border};font-size:13px;line-height:1.6;color:${COLOR.textMuted};">
        Sign in any time at <a href="${signInUrl}" style="color:${COLOR.accent};">${SITE.domain}/login</a>.
        Not expecting this? Reply and let us know; nothing happens until
        you sign in.
      </p>
    </div>
  </body>
</html>`;

  const middle = setupLink
    ? [
        "Your account is ready on this address. One link below finishes it - pick",
        "a password and you are in.",
        "",
        `Finish setting up: ${setupLink}`,
        "",
        "That link expires after a while. If it has, go to the address below and we",
        "will send a fresh one.",
        "",
        `New link: ${passwordUrl}`,
      ]
    : [
        "Your account is ready on this address. Ask for a link below and we will",
        "email you one that sets your password.",
        "",
        `Choose a password: ${passwordUrl}`,
        "",
        "That page will ask for this address, then email you a link. It expires",
        "after a while, so open it when you have a minute.",
      ];

  const intro =
    kind === "player"
      ? [
          "A CardFlare account makes your wants follow you: post a card once, and",
          "every CardFlare room you walk into offers to post it again until you",
          "find it. No account is needed just to trade - this one keeps your hunt",
          "across stores.",
        ]
      : kind === "vendor"
        ? [
            "CardFlare helps card-show attendees find the exact cards they want -",
            "and walks them straight to your booth. Upload your inventory before",
            "the show, singles and slabs alike.",
          ]
        : [
            "CardFlare helps players at your events find the cards they need from other",
            "people already in the room. You're one of the first stores trying it.",
          ];

  const text = [
    kind === "player"
      ? `Your ${SITE.name} account is ready, ${storeName}.`
      : `${storeName} is in the ${SITE.name} beta.`,
    "",
    ...intro,
    "",
    ...middle,
    "",
    `Sign in: ${signInUrl}`,
    "",
    "---",
    "Not expecting this? Reply and let us know - nothing happens until you sign in.",
  ].join("\n");

  return {
    to,
    subject,
    html,
    text,
  };
}

/** The player flavour, named for what it is at the call site. */
export function playerInviteEmail(
  displayName: string,
  to: string,
  origin: string,
  setupLink?: string | null,
): EmailMessage {
  return storeInviteEmail(displayName, to, origin, setupLink, "player");
}
