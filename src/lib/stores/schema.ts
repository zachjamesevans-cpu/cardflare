import { z } from "zod";

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Please keep this under ${max} characters.`)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null);
}

export const inviteStoreSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please enter the store's name.")
    .max(120, "Please keep the name under 120 characters."),
  contactEmail: z
    .string()
    .trim()
    .min(1, "Please enter a contact email address.")
    .max(254, "That email address is too long.")
    .pipe(z.email("Please enter a valid email address."))
    .transform((value) => value.toLowerCase()),
  city: optionalText(80),
  region: optionalText(80),
});

export type InviteStoreInput = z.infer<typeof inviteStoreSchema>;

export type InviteStoreFieldErrors = Partial<Record<keyof InviteStoreInput, string>>;

/**
 * Why the invitation email did or did not go out.
 *
 * Kept distinct from a plain boolean because "email is not configured yet" and
 * "the provider rejected it" need completely different responses from an
 * admin, and flattening them into `false` hides which one happened.
 */
export type InviteEmailOutcome = "sent" | "not-configured" | "failed";

export type InviteStoreState =
  | { status: "idle" }
  | {
      status: "success";
      storeName: string;
      email: InviteEmailOutcome;
      /**
       * The one-click setup link, returned only when the email did not go out.
       *
       * It signs the holder in as that store, so it is a credential and is not
       * echoed back when the store already has it in their inbox. When email
       * is unconfigured or the provider rejected the message, an admin with no
       * way to hand it over has no way to onboard the store at all.
       */
      setupLink?: string | null;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: InviteStoreFieldErrors;
    };

export const INVITE_STORE_IDLE: InviteStoreState = { status: "idle" };

export function toInviteFieldErrors(error: z.ZodError): InviteStoreFieldErrors {
  const fieldErrors: InviteStoreFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in fieldErrors)) {
      fieldErrors[key as keyof InviteStoreInput] = issue.message;
    }
  }

  return fieldErrors;
}
