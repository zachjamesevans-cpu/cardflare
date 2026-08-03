import { afterEach, describe, expect, it } from "vitest";

import {
  enabledProviders,
  isProviderEnabled,
  OAUTH_PROVIDERS,
  parseProviders,
  PROVIDER_LABELS,
} from "@/lib/auth/providers";

/**
 * Which social buttons render.
 *
 * PRODUCT.md forbids controls that do not work, and a "Continue with Google"
 * button with no Google client behind it is exactly that — it sends somebody
 * to a Supabase error page and tells them nothing. The default has to be
 * silence, and a typo in an environment variable has to cost one button rather
 * than the whole sign-in page.
 */

const ORIGINAL = process.env.AUTH_PROVIDERS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.AUTH_PROVIDERS;
  else process.env.AUTH_PROVIDERS = ORIGINAL;
});

describe("parseProviders", () => {
  it("shows nothing when nothing is configured", () => {
    expect(parseProviders(undefined)).toEqual([]);
    expect(parseProviders("")).toEqual([]);
    expect(parseProviders("   ")).toEqual([]);
  });

  it("reads a list", () => {
    expect(parseProviders("google,apple")).toEqual(["google", "apple"]);
  });

  it("tolerates the spacing and casing a person would actually type", () => {
    expect(parseProviders(" Google , APPLE ")).toEqual(["google", "apple"]);
  });

  it("ignores a repeat", () => {
    expect(parseProviders("google,google")).toEqual(["google"]);
  });

  /*
   * A typo must not take down sign-in. The password form behind these buttons
   * still has to work, so an unknown name is dropped rather than thrown.
   */
  it("drops a name it does not recognise, and keeps the rest", () => {
    expect(parseProviders("google,facebook")).toEqual(["google"]);
    expect(parseProviders("gooogle")).toEqual([]);
  });

  it("orders them the same way every time, whatever the list says", () => {
    expect(parseProviders("apple,google")).toEqual(parseProviders("google,apple"));
  });
});

describe("isProviderEnabled", () => {
  /*
   * The provider arrives in a form field, so it is attacker-controlled. This
   * check is what stops somebody starting a flow for a provider this
   * deployment never turned on.
   */
  it("refuses a provider that is not configured", () => {
    process.env.AUTH_PROVIDERS = "google";

    expect(isProviderEnabled("google")).toBe(true);
    expect(isProviderEnabled("apple")).toBe(false);
  });

  it("refuses anything that is not a provider at all", () => {
    process.env.AUTH_PROVIDERS = "google,apple";

    for (const value of ["", "GOOGLE ", "facebook", "__proto__", "google,apple"]) {
      expect(isProviderEnabled(value)).toBe(false);
    }
  });

  it("refuses everything when nothing is configured", () => {
    delete process.env.AUTH_PROVIDERS;

    expect(enabledProviders()).toEqual([]);
    for (const provider of OAUTH_PROVIDERS) {
      expect(isProviderEnabled(provider)).toBe(false);
    }
  });
});

describe("PROVIDER_LABELS", () => {
  it("names every provider, so no button can render blank", () => {
    for (const provider of OAUTH_PROVIDERS) {
      expect(PROVIDER_LABELS[provider]).toBeTruthy();
    }
  });
});
