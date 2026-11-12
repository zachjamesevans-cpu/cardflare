import { describe, expect, it } from "vitest";

import {
  EMAIL_DOMAIN_TYPOS as WEB_TYPOS,
  emailTypoPrompt as webPrompt,
  emailTypoSuggestion as webSuggestion,
  signupSchema,
} from "@/lib/auth/signup-schema";
import {
  EMAIL_DOMAIN_TYPOS as APP_TYPOS,
  emailTypoPrompt as appPrompt,
  emailTypoSuggestion as appSuggestion,
} from "../../mobile/src/email-typo";

/**
 * Sign-up asks for the address once and offers a fix when the domain is
 * a known slip. The app carries its own copy of the list and the
 * function because it cannot import across the package boundary; these
 * hold the copy to the original, and hold the list to its one promise:
 * it never "corrects" an address that could be real.
 */

/* Where real mail lives. Nothing on the typo list may be one of these,
   and nothing may be suggested for an address at one of them. */
const REAL_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.co.uk",
  "hotmail.fr",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.co.jp",
  "ymail.com",
  "outlook.com",
  "outlook.co.uk",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "mail.com",
  "gmx.com",
  "example.com",
  "cardflare.test",
];

describe("the email typo suggestion", () => {
  it("catches the slips people actually make", () => {
    const cases: [string, string][] = [
      ["name@gmial.com", "name@gmail.com"],
      ["name@gmai.com", "name@gmail.com"],
      ["name@gmail.co", "name@gmail.com"],
      ["name@gmail.con", "name@gmail.com"],
      ["name@gmailcom", "name@gmail.com"],
      ["name@hotmial.com", "name@hotmail.com"],
      ["name@hotmail.con", "name@hotmail.com"],
      ["name@hotmailcom", "name@hotmail.com"],
      ["name@yahooo.com", "name@yahoo.com"],
      ["name@yaho.com", "name@yahoo.com"],
      ["name@yahoo.con", "name@yahoo.com"],
      ["name@yahoocom", "name@yahoo.com"],
      ["name@outlok.com", "name@outlook.com"],
      ["name@outlook.con", "name@outlook.com"],
      ["name@outlookcom", "name@outlook.com"],
      ["name@icloud.con", "name@icloud.com"],
      ["name@icloudcom", "name@icloud.com"],
    ];
    for (const [typed, meant] of cases) {
      expect(webSuggestion(typed), typed).toBe(meant);
    }
    /* Every entry on the list is exercised above, so a new one cannot
       be added without a case that says what it turns into. */
    expect(cases.map(([typed]) => typed.split("@")[1]).sort()).toEqual(
      Object.keys(WEB_TYPOS).sort(),
    );
  });

  it("reads the domain the way the account is stored, and keeps the name as typed", () => {
    expect(webSuggestion("  Zach.B@GMIAL.com ")).toBe("Zach.B@gmail.com");
    expect(webSuggestion("zach+cards@Gmail.Con")).toBe("zach+cards@gmail.com");
  });

  it("never corrects an address that could be real", () => {
    for (const domain of REAL_DOMAINS) {
      expect(webSuggestion(`name@${domain}`), domain).toBeNull();
      expect(Object.keys(WEB_TYPOS), domain).not.toContain(domain);
    }
    /* Every fix lands on a provider, never on another typo. */
    for (const fixed of Object.values(WEB_TYPOS)) {
      expect(REAL_DOMAINS).toContain(fixed);
      expect(Object.keys(WEB_TYPOS)).not.toContain(fixed);
    }
    /* Somebody's own domain that happens to start the same way. */
    expect(webSuggestion("name@gmail.company")).toBeNull();
    expect(webSuggestion("name@mygmail.co")).toBeNull();
    expect(webSuggestion("name@mail.gmail.con")).toBeNull();
  });

  it("says nothing about a half-typed or malformed address", () => {
    for (const typed of [
      "",
      "   ",
      "name",
      "name@",
      "name@g",
      "name@gmail",
      "@gmail.con",
      "a@b@gmail.con",
      "name@constructor",
      "name@toString",
    ]) {
      expect(webSuggestion(typed), typed).toBeNull();
    }
  });

  it("suggests an address the sign-up schema accepts", () => {
    for (const typo of Object.keys(WEB_TYPOS)) {
      const suggestion = webSuggestion(`name@${typo}`);
      expect(suggestion).not.toBeNull();
      const parsed = signupSchema.shape.email.safeParse(suggestion);
      expect(parsed.success, typo).toBe(true);
      /* And the fix is final: the fixed address draws no second offer. */
      expect(webSuggestion(suggestion ?? "")).toBeNull();
    }
  });

  it("asks the question in one line", () => {
    expect(webPrompt("name@gmail.com")).toBe("Did you mean name@gmail.com?");
  });
});

describe("the app's copy", () => {
  it("carries the same list", () => {
    expect(APP_TYPOS).toEqual(WEB_TYPOS);
  });

  it("gives the same answer for every input", () => {
    const inputs = [
      ...Object.keys(WEB_TYPOS).map((typo) => `name@${typo}`),
      ...Object.keys(WEB_TYPOS).map((typo) => `  Name@${typo.toUpperCase()} `),
      ...REAL_DOMAINS.map((domain) => `name@${domain}`),
      "",
      "name",
      "name@",
      "@gmail.con",
      "a@b@gmail.con",
      "name@constructor",
    ];
    for (const input of inputs) {
      expect(appSuggestion(input), input).toBe(webSuggestion(input));
    }
  });

  it("asks the question in the same words", () => {
    expect(appPrompt("name@gmail.com")).toBe(webPrompt("name@gmail.com"));
  });
});
