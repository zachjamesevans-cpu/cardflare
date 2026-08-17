/**
 * What a valid announcement is, decided outside the server.
 *
 * A Server Action is a public POST endpoint, so this runs there — but
 * it is free of server-only imports so it can be unit tested and so the
 * form can say "that link goes somewhere else" without a round trip.
 * The database enforces the same rules a second time; this layer exists
 * to turn a constraint violation into a sentence a person can act on.
 */

/** Matches the table's own check constraints, to the character. */
export const HEADLINE_MAX = 80;
export const BODY_MAX = 400;
export const LINK_LABEL_MAX = 40;

/** The longest a notice may run before it has to be written again. */
export const MAX_DAYS = 60;

export interface AnnouncementDraft {
  headline: string;
  body: string;
  linkLabel: string | null;
  linkHref: string | null;
  /** ISO, always in the future. */
  expiresAt: string;
}

export type AnnouncementCheck =
  { ok: true; draft: AnnouncementDraft } | { ok: false; message: string };

/**
 * Reads what the console typed.
 *
 * `days` rather than a date picker: every notice this product has ever
 * wanted is "for the next week or so", and a number of days cannot be
 * typed in the wrong timezone.
 */
export function checkAnnouncement(
  input: {
    headline: string;
    body: string;
    linkLabel: string;
    linkHref: string;
    days: string;
  },
  now: number = Date.now(),
): AnnouncementCheck {
  const headline = input.headline.trim();
  const body = input.body.trim();
  const linkLabel = input.linkLabel.trim();
  const linkHref = input.linkHref.trim();

  if (!headline) return { ok: false, message: "Give it a headline." };
  if (headline.length > HEADLINE_MAX) {
    return {
      ok: false,
      message: `The headline has to fit in ${HEADLINE_MAX} characters.`,
    };
  }

  if (!body) return { ok: false, message: "Say something in the body." };
  if (body.length > BODY_MAX) {
    return { ok: false, message: `The body has to fit in ${BODY_MAX} characters.` };
  }

  /* Both halves or neither: a button with no label is invisible, and a
     label with nowhere to go is the fake functionality we do not ship. */
  if (Boolean(linkLabel) !== Boolean(linkHref)) {
    return {
      ok: false,
      message: "A button needs both a label and a link, or leave them both empty.",
    };
  }

  if (linkLabel.length > LINK_LABEL_MAX) {
    return {
      ok: false,
      message: `The button label has to fit in ${LINK_LABEL_MAX} characters.`,
    };
  }

  /*
   * Our own paths only. This is the one surface on the Feed where text
   * is typed rather than derived, which makes it the one place a link
   * could be aimed at every player at once. `//host` is a URL, not a
   * path, and is refused with the rest.
   */
  if (linkHref && (!linkHref.startsWith("/") || linkHref.startsWith("//"))) {
    return {
      ok: false,
      message: "The link has to be a path on CardFlare, like /profile/settings.",
    };
  }

  const days = Number(input.days);
  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return {
      ok: false,
      message: `Say how many days it runs for, between 1 and ${MAX_DAYS}.`,
    };
  }

  return {
    ok: true,
    draft: {
      headline,
      body,
      linkLabel: linkLabel || null,
      linkHref: linkHref || null,
      expiresAt: new Date(now + Math.round(days) * 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

/**
 * What the console's form is showing.
 *
 * Here rather than beside the Server Action that produces it: a
 * `"use server"` file may only export async functions, so the idle
 * value and its type have to live in a module the client can import
 * without dragging the action's server imports along.
 */
export type AnnouncementFormState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "posted"; headline: string };

export const ANNOUNCEMENT_IDLE: AnnouncementFormState = { status: "idle" };
