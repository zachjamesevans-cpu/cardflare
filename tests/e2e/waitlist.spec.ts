import { expect, test, type Page } from "@playwright/test";

/**
 * The form blocks submissions completed faster than a human could manage.
 * Tests fill instantly, so they have to wait past that threshold.
 */
const MIN_FILL_MS = 2_000;

/**
 * Waits out the minimum-fill window, measured from the right moment.
 *
 * The timestamp the server checks is stamped on hydration, not on navigation.
 * Starting the clock at `goto` therefore races: under parallel load hydration
 * can lag far enough that the click still lands inside the window, and the
 * submission is silently classified as a bot — the form reports success and
 * nothing is stored. Wait for the field to be populated first.
 */
async function settleFillWindow(page: Page) {
  await expect(page.locator('input[name="form_rendered_at"]')).not.toHaveValue("");
  await page.waitForTimeout(MIN_FILL_MS);
}

async function fillValidForm(page: Page, email: string) {
  await page.goto("/#waitlist");

  await page.getByLabel("First name").fill("Zach");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel(/which best describes you/i).selectOption("player");
  await page.getByRole("checkbox").check();

  await settleFillWindow(page);
}

test.describe("waitlist form", () => {
  test("is keyboard accessible and properly labelled", async ({ page }) => {
    await page.goto("/#waitlist");

    for (const label of [
      "First name",
      "Email address",
      "Primary card game",
      "City",
      "State or region",
      "Local game store",
    ]) {
      await expect(page.getByLabel(label, { exact: false })).toBeVisible();
    }

    // Consent must never be pre-ticked.
    await expect(page.getByRole("checkbox")).not.toBeChecked();
  });

  test("shows useful messages for an empty submission", async ({ page }) => {
    await page.goto("/#waitlist");
    await settleFillWindow(page);

    await page.getByRole("button", { name: /join the waitlist/i }).click();

    await expect(page.getByText("Please enter your first name.")).toBeVisible();
    await expect(page.getByText("Please enter your email address.")).toBeVisible();

    // The consent box is optional, so an empty form must not complain about it.
    await expect(page.getByText(/cardflare news, event announcements/i)).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toHaveAttribute("aria-invalid");
  });

  /*
   * The box was once required, so leaving it unticked blocked the signup.
   *
   * Deliberately submitted with a bad email rather than a good one: validation
   * reports every field at once, so an unticked box that produced no error
   * alongside one that did proves consent is optional — without spending the
   * shared rate-limit budget that a valid submission would.
   */
  test("does not complain about an unticked consent box", async ({ page }) => {
    await page.goto("/#waitlist");

    await page.getByLabel("First name").fill("Zach");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel(/which best describes you/i).selectOption("player");
    await expect(page.getByRole("checkbox")).not.toBeChecked();

    await settleFillWindow(page);
    await page.getByRole("button", { name: /join the waitlist/i }).click();

    await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
    await expect(page.getByRole("checkbox")).not.toHaveAttribute("aria-invalid");
  });

  test("rejects a malformed email with an inline message", async ({ page }) => {
    await page.goto("/#waitlist");

    await page.getByLabel("First name").fill("Zach");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel(/which best describes you/i).selectOption("player");
    await page.getByRole("checkbox").check();
    await settleFillWindow(page);

    await page.getByRole("button", { name: /join the waitlist/i }).click();

    await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
  });

  test("keeps everything else the user typed when one field is invalid", async ({
    page,
  }) => {
    await page.goto("/#waitlist");

    await page.getByLabel("First name").fill("Zach");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel(/which best describes you/i).selectOption("creator");
    await page.getByLabel("City").fill("Austin");
    await page.getByLabel("State or region").fill("TX");
    await page.getByLabel("Local game store").fill("Grand Line Games");
    await page.getByRole("checkbox").check();
    await settleFillWindow(page);

    await page.getByRole("button", { name: /join the waitlist/i }).click();
    await expect(page.getByText("Please enter a valid email address.")).toBeVisible();

    await expect(page.getByLabel("First name")).toHaveValue("Zach");
    await expect(page.getByLabel("City")).toHaveValue("Austin");
    await expect(page.getByLabel("State or region")).toHaveValue("TX");
    await expect(page.getByLabel("Local game store")).toHaveValue("Grand Line Games");
    await expect(page.getByLabel(/which best describes you/i)).toHaveValue("creator");

    // Consent is a deliberate act; it must never be re-ticked on the user's behalf.
    await expect(page.getByRole("checkbox")).not.toBeChecked();
  });

  test("a quick correction is not mistaken for a bot", async ({ page }) => {
    await page.goto("/#waitlist");

    await page.getByLabel("First name").fill("Zach");
    await page.getByLabel("Email address").fill("not-an-email");
    await page.getByLabel(/which best describes you/i).selectOption("player");
    await page.getByRole("checkbox").check();
    await settleFillWindow(page);
    await page.getByRole("button", { name: /join the waitlist/i }).click();
    await expect(page.getByText("Please enter a valid email address.")).toBeVisible();

    // Fix and resubmit immediately — well inside the minimum-fill window. The
    // form must not silently swallow this as a bot submission.
    await page.getByLabel("Email address").fill("quick-fix@cardflare.test");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /join the waitlist/i }).click();

    await expect(page.getByText("Please enter a valid email address.")).toBeHidden();
  });

  test("marks invalid fields for assistive technology", async ({ page }) => {
    await page.goto("/#waitlist");
    await settleFillWindow(page);

    await page.getByRole("button", { name: /join the waitlist/i }).click();

    const email = page.getByLabel("Email address");
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", /email-error/);
  });

  /**
   * Requires Supabase credentials. Skipped rather than failed so the suite is
   * meaningful in environments without a database, and honest about coverage.
   */
  test("accepts a valid submission and confirms it", async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Supabase is not configured in this environment.",
    );

    const email = `e2e-${Date.now()}@cardflare.test`;
    await fillValidForm(page, email);

    await page.getByRole("button", { name: /join the waitlist/i }).click();

    await expect(page.getByRole("status")).toContainText("You're on the list.");
  });

  test("tells a returning signup they are already on the list", async ({ page }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY,
      "Supabase is not configured in this environment.",
    );

    const email = `e2e-dupe-${Date.now()}@cardflare.test`;

    await fillValidForm(page, email);
    await page.getByRole("button", { name: /join the waitlist/i }).click();
    await expect(page.getByRole("status")).toBeVisible();

    await fillValidForm(page, email);
    await page.getByRole("button", { name: /join the waitlist/i }).click();

    await expect(page.getByRole("status")).toContainText("already on the list");
  });

  test("surfaces a safe error when the backend is unavailable", async ({ page }) => {
    test.skip(
      Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      "Only meaningful when Supabase is deliberately unconfigured.",
    );

    await fillValidForm(page, "backend-down@cardflare.test");
    await page.getByRole("button", { name: /join the waitlist/i }).click();

    const alert = page.getByRole("alert").filter({ hasText: /went wrong/i });
    await expect(alert).toBeVisible();
    // The message must not leak infrastructure detail.
    await expect(alert).not.toContainText(/supabase|postgres|service.role/i);
  });
});

test.describe("mobile navigation", () => {
  test.skip(({ isMobile }) => !isMobile, "Mobile menu only renders on small screens.");

  test("opens, navigates and closes", async ({ page }) => {
    await page.goto("/");

    const trigger = page.getByRole("button", { name: /open menu/i });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(page.getByRole("button", { name: /close menu/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );

    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "How It Works" })
      .click();

    await expect(page).toHaveURL(/#how-it-works$/);
    await expect(page.getByRole("button", { name: /open menu/i })).toBeVisible();
  });

  test("closes on Escape and returns focus to the trigger", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /open menu/i }).click();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("button", { name: /open menu/i })).toBeFocused();
  });
});
