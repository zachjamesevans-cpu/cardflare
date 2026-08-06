import { z } from "zod";

/**
 * Shared types for player-account actions. Outside the "use server" files
 * because an actions module may export only async functions.
 */

export const invitePlayerSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Give them a display name.")
    .max(40, "Keep the name under 40 characters."),
  email: z.email("That email address does not look right.").trim().toLowerCase(),
});

export type InvitePlayerInput = z.infer<typeof invitePlayerSchema>;

export type InvitePlayerState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | {
      status: "success";
      displayName: string;
      email: "sent" | "not-configured" | "failed";
      setupLink: string | null;
    };

export const INVITE_PLAYER_IDLE: InvitePlayerState = { status: "idle" };

export type RepostState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "posted"; count: number };

export const REPOST_IDLE: RepostState = { status: "idle" };
