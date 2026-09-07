import { expect, test } from "@playwright/test";

/**
 * The store pitch: what a shop owner sees before they type anything.
 * No database is needed for any of this; the form itself posts to a
 * Server Action that needs one, so submitting is not exercised here.
 */
test.describe("the tier pages", () => {
  test("/for-stores lands on /ultra", async ({ page }) => {
    await page.goto("/for-stores");
    await expect(page).toHaveURL(/\/ultra$/);
  });

  test("/pro pitches Pro with the app's own three lines", async ({ page }) => {
    await page.goto("/pro");
    await expect(page).toHaveTitle(/cardflare pro/i);
    const title = page.getByRole("heading", { level: 1 });
    await expect(title.locator(".gold-text")).toHaveText("Pro");
    await expect(page.getByText("$7.99").first()).toBeVisible();
    await expect(
      page.getByText("Wear cosmetics: rings, auras, card borders, titles"),
    ).toBeVisible();
    /* Signed out: the free account comes first. */
    await expect(
      page.getByRole("link", { name: /create your account/i }),
    ).toBeVisible();
  });

  test("/max pitches Max by invite", async ({ page }) => {
    await page.goto("/max");
    await expect(page).toHaveTitle(/cardflare max/i);
    const title = page.getByRole("heading", { level: 1 });
    await expect(title.locator(".shimmer-text")).toHaveText("Max");
    await expect(page.getByText(/by invite/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /request an invite/i }).first(),
    ).toBeVisible();
  });

  test("the pricing row sends each tier to its own page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^see pro$/i })).toHaveAttribute(
      "href",
      "/pro",
    );
    await expect(page.getByRole("link", { name: /^see ultra$/i })).toHaveAttribute(
      "href",
      "/ultra",
    );
    await expect(page.getByRole("link", { name: /^see max$/i })).toHaveAttribute(
      "href",
      "/max",
    );
  });

  test("pitches Ultra with the price, the trial and the voice", async ({ page }) => {
    await page.goto("/ultra");

    await expect(page).toHaveTitle(/ultra/i);
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toContainText(/cardflare/i);
    await expect(title).toContainText(/ultra/i);
    /* The holo is a class on the word, so the pitch and the pricing
       card wear the same foil. */
    await expect(title.locator(".holo-text")).toHaveText("Ultra");

    await expect(page.getByText("$50").first()).toBeVisible();
    await expect(page.getByText(/14 days free/i).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /let flarecast run the room/i }),
    ).toBeVisible();
    await expect(page.getByText(/One Piece is ready for round 4/)).toBeVisible();
  });

  test("offers the trial form with the five fields", async ({ page }) => {
    await page.goto("/ultra");

    await expect(page.getByLabel("Store name")).toBeVisible();
    await expect(page.getByLabel("City")).toBeVisible();
    await expect(page.getByLabel("State or region")).toBeVisible();
    await expect(page.getByLabel("Your email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /free trial|create your store/i }),
    ).toBeVisible();
  });

  test("shows the real display and control panel on a sample night", async ({
    page,
  }) => {
    await page.goto("/ultra");

    /* Two televisions: one mid-round, one between rounds. */
    const frames = page.locator("iframe[src^='/display/demo']");
    await expect(frames).toHaveCount(2);
    await expect(frames.first()).toHaveAttribute("src", "/display/demo?scene=focus");
    /* The organizer's phone, with Auto Mode's cockpit open. */
    await expect(page.getByText(/round 4 target/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /start round now/i })).toBeVisible();
  });

  test("the sample display runs the real screen", async ({ page }) => {
    await page.goto("/display/demo?scene=focus");
    await expect(page.getByText(/wanted in the room/i)).toBeVisible();
    await expect(page.getByText(/mox valley games/i)).toBeVisible();
    await expect(page.getByText(/scan to join/i)).toBeVisible();
  });

  test("is where the landing page sends stores", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /see ultra and start your trial/i }),
    ).toHaveAttribute("href", "/ultra");
  });
});
