/**
 * Long enough to be worth having.
 *
 * Supabase's own floor is six characters, which is not a password. Ten is the
 * shortest length that survives an offline guess of anything but the very
 * worst choices, and it is what NIST recommends as a user-chosen minimum.
 * Composition rules — a digit, a symbol, a capital — are deliberately absent:
 * they push people towards `Password1!` and are no longer recommended.
 *
 * The server-side floor is a Supabase project setting and has to be raised
 * there too; this only governs cardflare's own forms. See docs/DEPLOYMENT.md.
 */
export const PASSWORD_MIN = 10;

/**
 * A ceiling, because bcrypt silently truncates past 72 bytes.
 *
 * Without this a 200-character passphrase would appear to be accepted while
 * only its first 72 bytes were ever checked — so two different passwords
 * sharing a prefix would both work, which is a surprise nobody wants to find
 * out about later.
 */
export const PASSWORD_MAX = 72;
