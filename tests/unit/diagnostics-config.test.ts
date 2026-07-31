import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configGroups, groupStatus } from "@/lib/diagnostics/config";

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "CARDFLARE_FROM_EMAIL",
  "WAITLIST_FROM_EMAIL",
];

const original: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const name of VARS) {
    original[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of VARS) {
    if (original[name] === undefined) delete process.env[name];
    else process.env[name] = original[name];
  }
});

function emailGroup() {
  const group = configGroups().find((candidate) => candidate.title === "Email");
  if (!group) throw new Error("Email group missing");
  return group;
}

function check(variable: string) {
  const found = emailGroup().checks.find((c) => c.variable === variable);
  if (!found) throw new Error(`${variable} check missing`);
  return found;
}

describe("configGroups", () => {
  it("reports missing variables as missing", () => {
    expect(check("RESEND_API_KEY").status).toBe("missing");
    expect(check("CARDFLARE_FROM_EMAIL").status).toBe("missing");
    expect(groupStatus(emailGroup())).toBe("missing");
  });

  it("reports a complete email configuration as ok", () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.CARDFLARE_FROM_EMAIL = "CardFlare <hello@cardflare.gg>";

    expect(groupStatus(emailGroup())).toBe("ok");
    expect(check("CARDFLARE_FROM_EMAIL").detail).toContain("hello@cardflare.gg");
  });

  /*
   * A bare address sends perfectly well, so this is a warning rather than a
   * failure — but mail clients fall back to the local part, and the first
   * emails CardFlare ever sent arrived from "hello" rather than "CardFlare".
   */
  it("warns when the address carries no display name", () => {
    process.env.CARDFLARE_FROM_EMAIL = "hello@cardflare.gg";

    const result = check("CARDFLARE_FROM_EMAIL");
    expect(result.status).toBe("warn");
    expect(result.detail).toContain('"hello"');
    expect(result.detail).toContain("CardFlare <hello@cardflare.gg>");
  });

  it("reports the display name when one is set", () => {
    process.env.CARDFLARE_FROM_EMAIL = "CardFlare <hello@cardflare.gg>";

    const result = check("CARDFLARE_FROM_EMAIL");
    expect(result.status).toBe("ok");
    expect(result.detail).toContain("CardFlare <hello@cardflare.gg>");
  });

  it("flags a malformed address rather than calling it configured", () => {
    process.env.CARDFLARE_FROM_EMAIL = "CardFlare hello@cardflare.gg";

    expect(check("CARDFLARE_FROM_EMAIL").status).toBe("warn");
  });

  /*
   * The regression this module was written for. The variable was renamed and
   * the deployment kept the old name, so email was unconfigured while every
   * dashboard showed a value present. Nothing logged, nothing failed.
   */
  it("points at the old name when only the pre-rename variable is set", () => {
    process.env.WAITLIST_FROM_EMAIL = "CardFlare <hello@cardflare.gg>";

    const result = check("CARDFLARE_FROM_EMAIL");
    expect(result.status).toBe("missing");
    expect(result.detail).toContain("WAITLIST_FROM_EMAIL");
    expect(result.detail).toContain("CARDFLARE_FROM_EMAIL");
    expect(result.detail).toMatch(/redeploy/i);
  });

  it("never reveals a secret's value", () => {
    process.env.RESEND_API_KEY = "re_super_secret_value";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_do_not_leak";

    const serialised = JSON.stringify(configGroups());
    expect(serialised).not.toContain("re_super_secret_value");
    expect(serialised).not.toContain("sb_secret_do_not_leak");
  });
});
