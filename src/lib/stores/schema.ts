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

export type InviteStoreState =
  | { status: "idle" }
  | { status: "success"; storeName: string; emailSent: boolean }
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
