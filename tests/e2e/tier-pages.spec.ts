import { expect, test, type Locator } from "@playwright/test";

/**
 * The store pitch: what a shop owner sees before they type anything.
 * No database is needed for any of this; the form itself posts to a
 * Server Action that needs one, so submitting is not exercised here.
 */
/**
 * Presses a switch on the sample night, and keeps pressing until it
 * takes. The buttons are in the server's HTML before the page hydrates,
 * so a click can land before React is listening; the button only
 * reports pressed once it is.
 */
async function press(button: Locator) {
  await expect(async () => {
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 1_000 });
  }).toPass();
}

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
    const pricing = page.locator("#pricing");
    await expect(pricing.getByRole("link", { name: /^see pro$/i })).toHaveAttribute(
      "href",
      "/pro",
    );
    await expect(pricing.getByRole("link", { name: /^see ultra$/i })).toHaveAttribute(
      "href",
      "/ultra",
    );
    await expect(pricing.getByRole("link", { name: /^see max$/i })).toHaveAttribute(
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
    await expect(frames.first()).toHaveAttribute("src", "/display/demo?scene=locals");
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

  test("switches the sample television between scenes in place", async ({ page }) => {
    await page.goto("/ultra");
    const scenes = page.getByRole("group", { name: "FlareCast scenes" });
    const tv = page.frameLocator("#demo iframe");

    await expect(tv.getByText(/wanted in the room/i)).toBeVisible();
    await press(scenes.getByRole("button", { name: "Two games at once" }));
    await expect(tv.getByText("Magic", { exact: true })).toBeVisible();
    /* Swapped by message, not by reloading the frame. */
    await expect(page.locator("#demo iframe")).toHaveAttribute(
      "src",
      "/display/demo?scene=locals",
    );
    await expect(
      scenes.getByRole("button", { name: "Two games at once" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("keeps the switches in a drawer until somebody asks", async ({ page }) => {
    await page.goto("/ultra");
    const toggle = page.getByRole("button", { name: "Build your own night" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("group", { name: "Games running" })).toHaveCount(0);

    await expect(async () => {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass();
    await expect(page.getByRole("group", { name: "Games running" })).toBeVisible();
    await expect(
      page.getByRole("group", { name: "More scenes" }).getByRole("button", {
        name: "Beginner night",
      }),
    ).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("group", { name: "Games running" })).toHaveCount(0);
  });

  test("builds a night of the owner's own from the switches", async ({ page }) => {
    await page.goto("/ultra");
    const tv = page.frameLocator("#demo iframe");
    await expect(tv.getByText(/wanted in the room/i)).toBeVisible();
    const toggle = page.getByRole("button", { name: "Build your own night" });
    await expect(async () => {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 1_000 });
    }).toPass();

    await press(
      page.getByRole("group", { name: "Games running" }).getByRole("button", {
        name: "Riftbound",
      }),
    );
    await press(
      page.getByRole("group", { name: "Where the round is" }).getByRole("button", {
        name: "Paused",
      }),
    );

    await expect(tv.getByText("Riftbound", { exact: true })).toBeVisible();
    await expect(tv.getByText(/^paused$/i)).toHaveCount(2);
    await expect(
      page.getByText("Your night: One Piece paused, Riftbound paused."),
    ).toBeVisible();
  });

  test("opens a shared night straight from its link", async ({ page }) => {
    await page.goto("/display/demo?t=pokemon.overtime,mtg.round&l=auto");
    await expect(page.getByText("Pokémon", { exact: true })).toBeVisible();
    await expect(page.getByText("Magic", { exact: true })).toBeVisible();
    await expect(page.getByText(/^overtime$/i)).toBeVisible();
  });

  test("offers scenes on the homepage too", async ({ page }) => {
    await page.goto("/");
    const scenes = page.getByRole("group", { name: "FlareCast scenes" });
    await press(scenes.getByRole("button", { name: "Big night" }));
    const tv = page.frameLocator("section[aria-labelledby='ultra-band-title'] iframe");
    await expect(tv.getByText("Lorcana", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: /build your own night/i }),
    ).toHaveAttribute("href", "/ultra#demo");
  });

  test("is where the landing page sends stores", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /start your 14-day free trial/i }),
    ).toHaveAttribute("href", "/ultra");
  });
});
