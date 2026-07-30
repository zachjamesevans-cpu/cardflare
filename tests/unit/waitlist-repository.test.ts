import { beforeEach, describe, expect, it, vi } from "vitest";

import { insertWaitlistSignup } from "@/lib/waitlist/repository";
import type { WaitlistSubmission } from "@/lib/waitlist/schema";

const insert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: () => ({ insert }) }),
  isSupabaseConfigured: () => true,
}));

const SUBMISSION: WaitlistSubmission = {
  firstName: "Zach",
  email: "zach@example.com",
  userType: "store",
  primaryGame: "One Piece Card Game",
  city: "Austin",
  region: "TX",
  storeName: "Grand Line Games",
  comment: null,
  marketingConsent: true,
  referralCode: null,
};

beforeEach(() => {
  insert.mockReset();
});

describe("insertWaitlistSignup", () => {
  it("maps the submission onto database columns", async () => {
    insert.mockResolvedValue({ error: null });

    await insertWaitlistSignup(SUBMISSION, "cardflare.gg/");

    expect(insert).toHaveBeenCalledWith({
      first_name: "Zach",
      email: "zach@example.com",
      user_type: "store",
      primary_game: "One Piece Card Game",
      city: "Austin",
      region: "TX",
      store_name: "Grand Line Games",
      comment: null,
      marketing_consent: true,
      referral_code: null,
      source: "cardflare.gg/",
    });
  });

  it("reports a created signup", async () => {
    insert.mockResolvedValue({ error: null });

    await expect(insertWaitlistSignup(SUBMISSION, null)).resolves.toEqual({
      outcome: "created",
    });
  });

  it("reports a duplicate on unique violation rather than throwing", async () => {
    insert.mockResolvedValue({
      error: { code: "23505", message: "duplicate key value" },
    });

    await expect(insertWaitlistSignup(SUBMISSION, null)).resolves.toEqual({
      outcome: "duplicate",
    });
  });

  it("throws on any other database error", async () => {
    insert.mockResolvedValue({
      error: { code: "42P01", message: "relation does not exist" },
    });

    await expect(insertWaitlistSignup(SUBMISSION, null)).rejects.toThrow(
      /relation does not exist/,
    );
  });
});
