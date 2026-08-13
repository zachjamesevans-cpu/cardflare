import { permanentRedirect } from "next/navigation";

/**
 * Moved to `/profile/password`, and this stays behind on purpose.
 *
 * Password reset emails already in somebody's inbox point here, and an
 * email cannot be edited after it is sent. A reset link that 404s is a
 * player locked out of their account, so this redirect outlives the
 * rename by a long way.
 */
export default function PasswordRedirect(): never {
  permanentRedirect("/profile/password");
}
