/**
 * The shape of the ZIP form's answer.
 *
 * Its own module because `location-actions.ts` is a `"use server"` file,
 * and such a file may export nothing but async functions - a const or a
 * type in there becomes a build error rather than a lint warning. Same
 * reason `discovery-schema.ts` exists beside `discovery-actions.ts`.
 */
export interface PostalState {
  status: "idle" | "saved" | "error";
  message: string;
}

export const POSTAL_IDLE: PostalState = { status: "idle", message: "" };
