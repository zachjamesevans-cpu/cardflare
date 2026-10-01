import { z } from "zod";

/**
 * A trade the player writes down themselves, free of server imports so
 * the website's form, the app's screen and a unit test all hold it to
 * the same rules.
 *
 * The founder: "allow me to enter my own trades. Like if I did
 * something off of CardFlare." A logged trade is the player's own
 * word: one card, which way it went, who with, where and when, and a
 * note. It earns no Embers, because nobody else confirmed it, and only
 * its author ever reads it.
 */

export const LOGGED_PARTNER_MAX = 60;
export const LOGGED_PLACE_MAX = 80;
export const LOGGED_NOTE_MAX = 140;
export const LOGGED_QUANTITY_MAX = 99;

/** "YYYY-MM-DD", the only shape a calendar date takes here. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day that exists. `new Date("2026-02-30")` quietly becomes March 2,
 * so the parts are read back and compared.
 */
function isRealDay(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

/** Today as "YYYY-MM-DD" in the reader's own clock. */
export function todayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A typed string, trimmed, with nothing left reading as null. The
 * form sends every box; most of them are empty.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

export const logTradeSchema = z.object({
  cardId: z.guid("Pick a card from the list."),
  printingId: z
    .union([z.guid(), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  quantity: z.coerce
    .number()
    .int("Whole cards only.")
    .min(1, "At least one.")
    .max(LOGGED_QUANTITY_MAX, `At most ${LOGGED_QUANTITY_MAX}.`)
    .default(1),
  direction: z.enum(["got", "gave"]),
  /** The other side as an account, when they have one. */
  partnerPlayerId: z
    .union([z.guid(), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  /** The other side as typed, for somebody who is not on CardFlare. */
  partnerName: optionalText(LOGGED_PARTNER_MAX),
  place: optionalText(LOGGED_PLACE_MAX),
  tradedOn: z
    .string()
    .regex(DAY, "A date is needed.")
    .refine((value) => isRealDay(value), { message: "That is not a real date." })
    .refine((value) => value <= todayISO(new Date(Date.now() + 24 * 60 * 60 * 1000)), {
      message: "A trade cannot be in the future.",
    }),
  note: optionalText(LOGGED_NOTE_MAX),
  /**
   * Keep the Have list in step: a card given away comes off it, a
   * card received goes on. On by default, because a binder that does
   * not match the history is the exact problem the history solves.
   */
  updateHaveList: z.boolean().default(true),
});

export type LogTradeInput = z.input<typeof logTradeSchema>;
export type LogTrade = z.output<typeof logTradeSchema>;

/**
 * When a logged trade happened, as an instant the history can sort
 * and format beside a room trade's timestamp. Noon, in the reader's
 * own clock: a bare date parses as UTC midnight, which in every
 * American time zone is the evening BEFORE, and "Fri, Sep 12" turning
 * into "Thu, Sep 11" is the kind of thing a binder owner notices.
 */
export function loggedWhen(tradedOn: string): string {
  return `${tradedOn}T12:00:00`;
}

/**
 * The history, both sources in one list, newest first. Room trades
 * carry an instant and logged ones a day; the day's noon sorts among
 * that day's room trades, which is as right as a date can be.
 */
export function newestFirst<T extends { confirmedAt: string }>(entries: T[]): T[] {
  return [...entries].sort(
    (a, b) => new Date(b.confirmedAt).getTime() - new Date(a.confirmedAt).getTime(),
  );
}
