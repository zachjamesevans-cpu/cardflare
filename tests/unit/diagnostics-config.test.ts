import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configGroups, groupStatus } from "@/lib/diagnostics/config";

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "CARDFLARE_FROM_EMAIL",
  "WAITLIST_FROM_EMAIL",
  "NEXT_PUBLIC_ENABLE_CARD_IMAGES",
];

const original: Record<string, string | undefined> = {};

/** Database facts the panel is handed rather than reading itself. */
const FACTS = { cardCount: 1234, lastSync: null };

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
  const group = configGroups(FACTS).find((candidate) => candidate.title === "Email");
  if (!group) throw new Error("Email group missing");
  return group;
}

function check(variable: string) {
  const found = emailGroup().checks.find((c) => c.variable === variable);
  if (!found) throw new Error(`${variable} check missing`);
  return found;
}

function cardGroup(
  count: number,
  printingImages?: { total: number; withImage: number },
) {
  const group = configGroups({ cardCount: count, lastSync: null, printingImages }).find(
    (candidate) => candidate.title === "Cards",
  );
  if (!group) throw new Error("Cards group missing");
  return group;
}

const imageCheck = (
  count: number,
  printingImages?: { total: number; withImage: number },
) => cardGroup(count, printingImages).checks.find((c) => c.label === "Card images")!;

/*
 * With an empty pool every search correctly matches nothing, which reads as
 * broken search rather than as an import nobody has run. The panel is where
 * that stops being invisible.
 */
describe("card pool", () => {
  it("warns when no cards are loaded", () => {
    const check = cardGroup(0).checks[0]!;

    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/no cards imported/i);
    expect(check.detail).toContain("CARD_DATA.md");
  });

  it("reports the count once cards exist", () => {
    const check = cardGroup(2451).checks[0]!;

    expect(check.status).toBe("ok");
    expect(check.detail).toContain("2,451");
  });

  /*
   * "Why are there no pictures" has two answers — the flag is off, or the
   * provider supplied no URL — and only the first is a setting. Off is a
   * deliberate state, so it is never reported as a fault.
   */
  it("reports the image flag as informational, never as a fault", () => {
    delete process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES;
    const off = cardGroup(10).checks.find((c) => c.variable.includes("CARD_IMAGES"))!;

    expect(off.status).toBe("ok");
    expect(off.detail).toMatch(/off/i);
    expect(off.detail).toMatch(/placeholder/i);

    process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES = "true";
    const on = cardGroup(10).checks.find((c) => c.variable.includes("CARD_IMAGES"))!;

    expect(on.status).toBe("ok");
    expect(on.detail).toMatch(/on\./i);
  });

  /*
   * The flag being off and the provider having supplied no URL look identical
   * from a browser, and only the first is a setting. Reported together so the
   * panel answers "why are there no pictures" outright.
   */
  it("says how many printings actually carry an image URL", () => {
    const check = imageCheck(10, { total: 120, withImage: 118 });

    expect(check.detail).toMatch(/off/i);
    expect(check.detail).toContain("118 of 120");
  });

  it("says plainly when turning the flag on would change nothing", () => {
    const check = imageCheck(10, { total: 120, withImage: 0 });

    expect(check.detail).toMatch(/no image URL/i);
    expect(check.detail).toMatch(/would change nothing/i);
  });

  it("reports the supply whether the flag is on or off", () => {
    process.env.NEXT_PUBLIC_ENABLE_CARD_IMAGES = "true";
    const check = imageCheck(10, { total: 120, withImage: 118 });

    expect(check.detail).toMatch(/on\./i);
    expect(check.detail).toContain("118 of 120");
  });

  /* Before any import the counts are noise, not information. */
  it("says nothing about supply when nothing has been imported", () => {
    expect(imageCheck(0, { total: 0, withImage: 0 }).detail).not.toMatch(/printings/i);
    expect(imageCheck(0).detail).not.toMatch(/printings/i);
  });

  it("warns when no sync has ever run", () => {
    const check = cardGroup(0).checks.find((c) => c.label === "Last sync")!;

    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/never/i);
  });
});

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

    const serialised = JSON.stringify(configGroups(FACTS));
    expect(serialised).not.toContain("re_super_secret_value");
    expect(serialised).not.toContain("sb_secret_do_not_leak");
  });
});
