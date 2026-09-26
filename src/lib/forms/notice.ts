/**
 * What a console form says back after it posts.
 *
 * Several console actions returned nothing, so a refused or failed press
 * looked exactly like a successful one: an organizer who could not be
 * added, a tournament whose round number was out of range. A form that
 * uses this shows the sentence instead. A plain module, so the actions
 * files keep exporting nothing but async functions.
 */
export type FormNotice =
  { status: "idle" } | { status: "done" } | { status: "error"; message: string };

export const FORM_IDLE: FormNotice = { status: "idle" };
