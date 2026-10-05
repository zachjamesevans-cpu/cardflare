import { SITE } from "@/lib/site";
import type { EmailMessage } from "./client";
import { EMAIL_COLOR as C, EMAIL_FONT, escapeHtml } from "./palette";

/**
 * The gift's own emails: granted to a store that already exists, the
 * week-out and last-day reminders, and the end. The invitation itself
 * (a new store with a gift) is `storeInviteEmail` with its `gift`, and
 * it is drawn from the same pieces below, so every message about Ultra
 * looks like one family.
 *
 * Mail clients (Gmail, Apple Mail, Outlook) decide what is possible:
 * inline styles only, no <style> block, no web font, no animation, no
 * background image. "Poppy" therefore comes from colour and scale: a
 * lime headline, a ticket with the gift in huge type, one big button.
 * One image, the wordmark, sized by height with the width from its
 * ratio, the way BRAND.md sizes every lockup.
 */

/** What a gift is, as an email says it. */
export interface GiftFacts {
  kind: "timed" | "founding";
  /** 30, 60 or 90 for a timed gift; null for a Founding Store. */
  days: number | null;
  /** "Dec 4, 2026" for a timed gift; null for a Founding Store. */
  untilLabel: string | null;
  /** What keeping Ultra costs this store, a month: "$35". */
  price: string;
}

/* ------------------------------------------------------------------ */
/* The pieces, shared with store-invite.ts                             */
/* ------------------------------------------------------------------ */

/**
 * The wordmark, as the cut derivative (`npm run brand:assets`): the
 * master arrived flattened on a white card, and on this dark email that
 * card draws as a white box around the name. The cut is the same
 * lettering with the white taken out. 1522 x 256; set the height and let
 * the width follow from the ratio, never both by hand.
 */
const WORDMARK = {
  path: "/brand/cardflare-wordmark-cut.png",
  width: 1522,
  height: 256,
};
const WORDMARK_HEIGHT = 30;

export function emailWordmark(origin: string): string {
  const width = Math.round((WORDMARK.width / WORDMARK.height) * WORDMARK_HEIGHT);
  return `<img src="${origin}${WORDMARK.path}" alt="${SITE.name}" height="${WORDMARK_HEIGHT}" width="${width}" style="display:block;height:${WORDMARK_HEIGHT}px;width:${width}px;border:0;outline:none;text-decoration:none;" />`;
}

/** The page and the card, with the accent stripe across the top. */
export function emailShell(origin: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
  </head>
  <body style="margin:0;padding:24px 12px;background-color:${C.canvas};font-family:${EMAIL_FONT};">
    <div style="max-width:560px;margin:0 auto;background-color:${C.surface};border:1px solid ${C.border};border-radius:20px;overflow:hidden;">
      <div style="height:6px;line-height:6px;font-size:0;background-color:${C.accent};">&nbsp;</div>
      <div style="padding:28px 28px 32px;">
      ${emailWordmark(origin)}
      ${body}
      </div>
    </div>
  </body>
</html>`;
}

/** "You're in." in lime, huge, and the line that says who. */
export function emailHeadline(headline: string, storeLine: string): string {
  return `<h1 style="margin:28px 0 8px;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:-1px;color:${C.accent};">${headline}</h1>
      <p style="margin:0 0 20px;font-size:20px;line-height:1.35;font-weight:700;color:${C.textPrimary};">${storeLine}</p>`;
}

export function emailParagraph(html: string, margin = "0 0 16px"): string {
  return `<p style="margin:${margin};font-size:16px;line-height:1.6;color:${C.textSecondary};">${html}</p>`;
}

/**
 * The ticket: an accent-bordered pass with the gift in huge type, a
 * dashed tear line, and the terms underneath.
 */
export function emailTicket(ticket: {
  label: string;
  big: string;
  line: string;
  terms: string;
}): string {
  return `<div style="margin:8px 0 28px;background-color:${C.accentTint};border:2px solid ${C.accent};border-radius:18px;">
        <div style="padding:22px 24px 18px;text-align:center;">
          <p style="margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:800;letter-spacing:3px;color:${C.accent};">${ticket.label}</p>
          <p style="margin:0;font-size:64px;line-height:1;font-weight:900;letter-spacing:-2px;color:${C.textPrimary};">${ticket.big}</p>
          <p style="margin:12px 0 0;font-size:18px;line-height:1.4;font-weight:700;color:${C.textPrimary};">${ticket.line}</p>
        </div>
        <div style="border-top:2px dashed ${C.accent};margin:0 16px;font-size:0;line-height:0;">&nbsp;</div>
        <div style="padding:16px 24px 20px;text-align:center;">
          <p style="margin:0;font-size:15px;line-height:1.55;color:${C.textSecondary};">${ticket.terms}</p>
        </div>
      </div>`;
}

export type PerkSet = "lgs" | "vendor";

const PERKS: Record<PerkSet, ReadonlyArray<readonly [string, string]>> = {
  lgs: [
    ["🔥", "FlareCast on your TV"],
    ["🎯", "Every Flare in the room matched to your singles"],
    ["📣", "Posts to your followers"],
  ],
  vendor: [
    ["🗺️", "Buyers walked to your booth"],
    ["🃏", "Your inventory matched to what they hunt"],
    ["📣", "Posts to your followers"],
  ],
};

/** Three short rows, an emoji each. A table, because Outlook. */
export function emailPerks(set: PerkSet): string {
  const rows = PERKS[set]
    .map(
      ([emoji, line]) => `<tr>
            <td width="48" valign="middle" style="padding:6px 0;width:48px;">
              <div style="width:40px;height:40px;line-height:40px;text-align:center;font-size:20px;background-color:${C.elevated};border:1px solid ${C.border};border-radius:12px;">${emoji}</div>
            </td>
            <td valign="middle" style="padding:6px 0 6px 12px;font-size:17px;line-height:1.35;font-weight:700;color:${C.textPrimary};">${line}</td>
          </tr>`,
    )
    .join("\n          ");
  return `<p style="margin:0 0 8px;font-size:12px;line-height:1.4;font-weight:800;letter-spacing:3px;color:${C.textMuted};">WHAT YOU GET</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border-collapse:collapse;">
        <tbody>
          ${rows}
        </tbody>
      </table>`;
}

export function perksText(set: PerkSet): string[] {
  return ["What you get:", ...PERKS[set].map(([emoji, line]) => `${emoji} ${line}`)];
}

/** One huge button, the whole width of the card. */
export function emailButton(href: string, label: string): string {
  return `<div style="margin:0 0 24px;">
        <a href="${href}" style="display:block;background-color:${C.accent};color:${C.accentContrast};font-weight:800;font-size:20px;line-height:1.2;text-align:center;text-decoration:none;padding:18px 24px;border-radius:14px;">${label}</a>
      </div>`;
}

export function emailFooter(html: string): string {
  return `<p style="margin:0;padding-top:20px;border-top:1px solid ${C.border};font-size:13px;line-height:1.6;color:${C.textMuted};">${html}</p>`;
}

export function emailLink(href: string, label: string): string {
  return `<a href="${href}" style="color:${C.accent};">${label}</a>`;
}

/** The ticket's words for a gift, in both parts of a message. */
export function giftTicket(gift: GiftFacts): {
  label: string;
  big: string;
  line: string;
  terms: string;
} {
  if (gift.kind === "founding") {
    return {
      label: "FOUNDING STORE",
      big: "FOR LIFE",
      line: `${SITE.name} Ultra, free, for as long as ${SITE.name} exists.`,
      terms: "You're one of ten Founding Stores getting it off the ground.",
    };
  }
  return {
    label: "YOUR ULTRA PASS",
    big: `${gift.days} DAYS`,
    line: `of ${SITE.name} Ultra. On us. No card.`,
    terms: `Ends ${gift.untilLabel}. Keep it after for ${gift.price} a month, locked in for life.`,
  };
}

/** The ticket as plain text, between two rules. */
export function ticketText(ticket: ReturnType<typeof giftTicket>): string[] {
  return [
    "------------------------------",
    ticket.label,
    ticket.big,
    ticket.line,
    "- - - - - - - - - - - - - - -",
    ticket.terms,
    "------------------------------",
  ];
}

function storeConsoleUrl(origin: string, storeId: string): string {
  return `${origin}/store?as=${encodeURIComponent(storeId)}`;
}

function keepUltraUrl(origin: string, storeId: string): string {
  return `${origin}/store/settings?as=${encodeURIComponent(storeId)}`;
}

const REPLY_FOOTER = "Questions? Just reply to this email.";

/* ------------------------------------------------------------------ */
/* The messages                                                        */
/* ------------------------------------------------------------------ */

/** Ultra given to a store that already has an account. */
export function giftGrantedEmail(
  storeName: string,
  to: string,
  origin: string,
  storeId: string,
  gift: GiftFacts,
): EmailMessage {
  const name = escapeHtml(storeName);
  const founding = gift.kind === "founding";
  const ticket = giftTicket(gift);
  const url = storeConsoleUrl(origin, storeId);

  const subject = founding
    ? `${storeName} is a ${SITE.name} Founding Store 🎉`
    : `🎁 ${storeName}: ${SITE.name} Ultra is on us`;
  const storeLine = founding
    ? `${name} is a ${SITE.name} Founding Store.`
    : `${name} just got ${SITE.name} Ultra.`;
  const lead = founding
    ? "Thank you for being here early. Everything Ultra does is switched on in your console now, and it stays on."
    : "Thank you for being in the beta. Everything Ultra does is switched on in your console now. Nothing to set up, nothing to pay.";

  const html = emailShell(
    origin,
    `${emailHeadline("Surprise.", storeLine)}
      ${emailParagraph(lead, "0 0 24px")}
      ${emailTicket(ticket)}
      ${emailPerks("lgs")}
      ${emailButton(url, "Open your console")}
      ${emailFooter(REPLY_FOOTER)}`,
  );

  const text = [
    "Surprise.",
    founding
      ? `${storeName} is a ${SITE.name} Founding Store.`
      : `${storeName} just got ${SITE.name} Ultra.`,
    "",
    lead,
    "",
    ...ticketText(ticket),
    "",
    ...perksText("lgs"),
    "",
    `Open your console: ${url}`,
    "",
    "---",
    REPLY_FOOTER,
  ].join("\n");

  return { to, subject, html, text };
}

/** A week out, and the last day. */
export function giftReminderEmail(
  storeName: string,
  to: string,
  origin: string,
  storeId: string,
  reminder: { daysLeft: number; untilLabel: string; price: string },
): EmailMessage {
  const name = escapeHtml(storeName);
  const lastDay = reminder.daysLeft <= 1;
  const url = keepUltraUrl(origin, storeId);

  const subject = lastDay
    ? `Last day of Ultra for ${storeName}`
    : `${reminder.daysLeft} days of Ultra left for ${storeName}`;
  const headline = lastDay ? "Last call." : "Heads up.";
  const ticket = {
    label: "YOUR ULTRA PASS",
    big: lastDay ? "LAST DAY" : `${reminder.daysLeft} DAYS`,
    line: lastDay ? `of ${SITE.name} Ultra.` : `of ${SITE.name} Ultra left.`,
    terms: "Nothing is charged unless you choose to keep it.",
  };
  const body = `Everything stays on until ${reminder.untilLabel}. Keep it for ${reminder.price} a month, locked in for life, or let it switch off. Nothing you made is lost either way.`;

  const html = emailShell(
    origin,
    `${emailHeadline(headline, `The Ultra beta for ${name} ends soon.`)}
      ${emailTicket(ticket)}
      ${emailParagraph(body, "0 0 24px")}
      ${emailButton(url, "Keep Ultra")}
      ${emailFooter(REPLY_FOOTER)}`,
  );

  const text = [
    headline,
    `The Ultra beta for ${storeName} ends soon.`,
    "",
    ...ticketText(ticket),
    "",
    body,
    "",
    `Keep Ultra: ${url}`,
    "",
    "---",
    REPLY_FOOTER,
  ].join("\n");

  return { to, subject, html, text };
}

/** The gift has run out. */
export function giftEndedEmail(
  storeName: string,
  to: string,
  origin: string,
  storeId: string,
  ended: { price: string },
): EmailMessage {
  const name = escapeHtml(storeName);
  const url = keepUltraUrl(origin, storeId);

  const thanks = `You were part of the ${SITE.name} beta, and that helped shape what ${SITE.name} is.`;
  const still =
    "Your events, your followers and your case are all still there. Ultra's tools are paused.";
  const keep = `Keep it for ${ended.price} a month, locked in for life, and they switch straight back on.`;

  const html = emailShell(
    origin,
    `${emailHeadline("Thank you.", `The Ultra beta for ${name} has ended.`)}
      ${emailParagraph(thanks)}
      ${emailParagraph(still)}
      ${emailParagraph(`<strong style="color:${C.textPrimary};">${keep}</strong>`, "0 0 24px")}
      ${emailButton(url, "Keep Ultra")}
      ${emailFooter(REPLY_FOOTER)}`,
  );

  const text = [
    "Thank you.",
    `The Ultra beta for ${storeName} has ended.`,
    "",
    thanks,
    "",
    still,
    "",
    keep,
    "",
    `Keep Ultra: ${url}`,
    "",
    "---",
    REPLY_FOOTER,
  ].join("\n");

  return {
    to,
    subject: `Your Ultra beta has ended, ${storeName}`,
    html,
    text,
  };
}
