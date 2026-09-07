import { expect, test } from "@playwright/test";

/**
 * The store pitch: what a shop owner sees before they type anything.
 * No database is needed for any of this; the form itself posts to a
 * Server Action that needs one, so submitting is not exercised here.
 */
test.describe("the store page", () => {
  test("pitches Ultra with the price, the trial and the voice", async ({ page }) => {
    await page.goto("/for-stores");

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
    await page.goto("/for-stores");

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
    await page.goto("/for-stores");

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
    ).toHaveAttribute("href", "/for-stores");
  });
});
