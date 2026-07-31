import "server-only";

/**
 * Reports what the running server can see of its own configuration.
 *
 * This exists because a missing environment variable used to be invisible.
 * Email is deliberately inert when unconfigured — it sends nothing and returns
 * cleanly — which is right for the visitor and useless for whoever is trying to
 * work out why no mail arrived. Renaming a variable without updating the
 * deployment produced exactly that: a silent, healthy-looking nothing.
 *
 * Values are never returned, only whether a value is present. The one
 * exception is the from address, which is printed on every email that leaves
 * the system and is therefore already public — and which is the single most
 * useful thing to see when mail is not sending.
 */

/** A variable that was renamed, and the name that replaced it. */
const RENAMED: Record<string, string> = {
  WAITLIST_FROM_EMAIL: "CARDFLARE_FROM_EMAIL",
};

export type CheckStatus = "ok" | "warn" | "missing";

export interface ConfigCheck {
  label: string;
  variable: string;
  status: CheckStatus;
  detail: string;
}

export interface ConfigGroup {
  title: string;
  /** What the app does when this group is incomplete. */
  whenIncomplete: string;
  checks: ConfigCheck[];
}

function present(variable: string): boolean {
  return Boolean(process.env[variable]?.trim());
}

/** Presence only — never the value. */
function secretCheck(label: string, variable: string): ConfigCheck {
  return present(variable)
    ? { label, variable, status: "ok", detail: "Set" }
    : { label, variable, status: "missing", detail: "Not set" };
}

/**
 * Checks the from address, which has more ways to be wrong than to be right.
 *
 * Accepts either a bare address or the `Name <address>` form, since both are
 * valid to the provider. Surfaces the address itself so a typo in the domain —
 * the failure that gets mail silently rejected — is visible at a glance.
 */
function fromAddressCheck(): ConfigCheck {
  const label = "From address";
  const variable = "CARDFLARE_FROM_EMAIL";
  const raw = process.env[variable]?.trim();

  if (!raw) {
    const legacy = Object.keys(RENAMED).find((name) => present(name));

    // The specific mistake this module was written after: the value is set,
    // under the name the code used to read.
    return {
      label,
      variable,
      status: "missing",
      detail: legacy
        ? `Not set — but ${legacy} is. That variable was renamed to ${RENAMED[legacy]}; rename it in your host's settings and redeploy.`
        : "Not set",
    };
  }

  const angled = raw.match(/<([^>]+)>\s*$/);
  const address = (angled ? angled[1] : raw).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    return {
      label,
      variable,
      status: "warn",
      detail: `"${raw}" is not a valid address. Expected "CardFlare <hello@example.com>" or "hello@example.com".`,
    };
  }

  const displayName = angled ? raw.slice(0, raw.lastIndexOf("<")).trim() : "";

  // A bare address is valid and sends fine, but mail clients fall back to the
  // local part for the sender name — so "hello@cardflare.gg" arrives in the
  // inbox as "hello", which is not a brand.
  if (!displayName) {
    return {
      label,
      variable,
      status: "warn",
      detail: `Sending as ${address} with no display name, so inboxes will show "${address.split("@")[0]}" as the sender. Use "CardFlare <${address}>" instead.`,
    };
  }

  return {
    label,
    variable,
    status: "ok",
    detail: `Sending as ${displayName} <${address}> — this domain must be verified with the provider.`,
  };
}

export function configGroups(): ConfigGroup[] {
  return [
    {
      title: "Database",
      whenIncomplete: "Waitlist signups and sign-in fail with a generic error.",
      checks: [
        secretCheck("Project URL", "NEXT_PUBLIC_SUPABASE_URL"),
        secretCheck("Anon key", "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
        secretCheck("Service role key", "SUPABASE_SERVICE_ROLE_KEY"),
      ],
    },
    {
      title: "Email",
      whenIncomplete:
        "Confirmations and invites send nothing. Signups and invites still succeed.",
      checks: [secretCheck("API key", "RESEND_API_KEY"), fromAddressCheck()],
    },
  ];
}

/** Worst status in a group, for the summary badge. */
export function groupStatus(group: ConfigGroup): CheckStatus {
  if (group.checks.some((check) => check.status === "missing")) return "missing";
  if (group.checks.some((check) => check.status === "warn")) return "warn";
  return "ok";
}
