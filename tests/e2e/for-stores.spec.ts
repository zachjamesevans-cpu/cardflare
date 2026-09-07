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

  test("is where the landing page sends stores", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /see ultra and start your trial/i }),
    ).toHaveAttribute("href", "/for-stores");
  });
});
