import { describe, expect, it } from "vitest";

import { validateClaim } from "@/lib/stores/claim-schema";
import { validateClaimFields } from "../../mobile/src/claim-validation";

/**
 * One rulebook for a claim, on both platforms.
 *
 * The app validates before sending so each error can be drawn against
 * the field it belongs to - the fix for a junk STORE email reading as
 * the founder's own, correct email being rejected. The server stays the
 * authority; this holds the app's copy to it, verdict for verdict and
 * message for message, because two rulebooks that drift turn into a
 * form that passes on the phone and bounces on the wire.
 */

const CASES = [
  {
    claimantName: "",
    claimantEmail: "",
    claimantRole: "Owner",
    businessEmail: "",
    notes: "",
  },
  {
    claimantName: "Zach",
    claimantEmail: "zach@example.com",
    claimantRole: "Owner",
    businessEmail: "",
    notes: "",
  },
  /* The founder's exact shape: real email, junk in the optional field. */
  {
    claimantName: "Test",
    claimantEmail: "almostquincy@gmail.com",
    claimantRole: "Owner",
    businessEmail: "tsst",
    notes: "Test",
  },
  {
    claimantName: "Zach",
    claimantEmail: "not-an-email",
    claimantRole: "Staff",
    businessEmail: "",
    notes: "",
  },
  {
    claimantName: "Zach",
    claimantEmail: "zach@example",
    claimantRole: "Staff",
    businessEmail: "",
    notes: "",
  },
  {
    claimantName: "Zach",
    claimantEmail: "z@shop.gg",
    claimantRole: "Owner",
    businessEmail: "owner@shop.gg",
    notes: "",
  },
  {
    claimantName: "Zach",
    claimantEmail: "weird+tag@sub.domain.co",
    claimantRole: "Other",
    businessEmail: "",
    notes: "",
  },
  {
    claimantName: "Zach",
    claimantEmail: "z@shop.gg",
    claimantRole: "Owner",
    businessEmail: "",
    notes: "x".repeat(501),
  },
  {
    claimantName: "  ",
    claimantEmail: " z@shop.gg ",
    claimantRole: "Owner",
    businessEmail: " tsst ",
    notes: "",
  },
];

describe("the app's claim rules against the server's", () => {
  it.each(CASES.map((fields, index) => [index, fields] as const))(
    "case %i gets the same verdict on both platforms",
    (_index, fields) => {
      /* The server trims on read; the app validates what was typed, so
         it trims inside. Feed the server the same trimmed shape its own
         readClaim would produce. */
      const trimmed = {
        claimantName: fields.claimantName.trim(),
        claimantEmail: fields.claimantEmail.trim(),
        claimantRole: fields.claimantRole.trim(),
        businessEmail: fields.businessEmail.trim(),
        notes: fields.notes.trim(),
      };

      expect(validateClaimFields(fields)).toEqual(validateClaim(trimmed));
    },
  );

  it("catches the founder's exact report, on the right field", () => {
    const errors = validateClaimFields(CASES[2]);

    expect(errors.businessEmail).toBe("That doesn't look like an email address.");
    /* And his real email is untouched - the whole point. */
    expect(errors.claimantEmail).toBeUndefined();
  });
});
