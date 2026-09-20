import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { hoursLines, openNow, parseHours } from "@/lib/stores/hours";
import { readHoursFields, storePageSchema } from "@/lib/stores/page-schema";
import { SETUP_STEPS, nextSetupStep } from "@/lib/stores/setup-schema";
import { hoursLines as appHoursLines } from "../../mobile/src/store-hours";

/**
 * The Ultra sign-up: the wizard, and the store page it fills in.
 *
 * The founder: "work on the sign up process for Ultra. needs to be a
 * great onboarding experience. setting up a profile, adding 'screens'
 * and explaining what screens are, etc. also, think of the store pages
 * similar to how players can customize their pages. banner image,
 * etc."
 *
 * The pure half: hours parsed, folded into lines, and read against a
 * clock in the store's zone; the page schema's new rules. The pinned
 * half: the wizard's six steps in order, what finishes it, where
 * checkout lands, the marks on the public page, and the app's copy of
 * the hours logic held to the web's.
 */

const ROOT = resolve(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const week = [
  null,
  { open: "11:00", close: "21:00" },
  { open: "11:00", close: "21:00" },
  { open: "11:00", close: "21:00" },
  { open: "11:00", close: "21:00" },
  { open: "11:00", close: "23:00" },
  { open: "10:00", close: "23:00" },
];

describe("parseHours", () => {
  it("accepts seven entries of pairs or null", () => {
    expect(parseHours(week)).toEqual(week);
    expect(parseHours(Array(7).fill(null))).toEqual(Array(7).fill(null));
  });

  it("refuses the wrong count, a bad clock, or a half entry", () => {
    expect(parseHours(week.slice(0, 6))).toBeNull();
    expect(
      parseHours([...week.slice(0, 6), { open: "25:00", close: "21:00" }]),
    ).toBeNull();
    expect(parseHours([...week.slice(0, 6), { open: "11:00" }])).toBeNull();
    expect(parseHours("11-9")).toBeNull();
    expect(parseHours(null)).toBeNull();
  });
});

describe("hoursLines", () => {
  it("folds consecutive days with the same hours, Monday first", () => {
    expect(hoursLines(week)).toEqual([
      { days: "Mon to Thu", hours: "11 am to 9 pm" },
      { days: "Fri", hours: "11 am to 11 pm" },
      { days: "Sat", hours: "10 am to 11 pm" },
      { days: "Sun", hours: "closed" },
    ]);
  });

  it("says the half hours and the noon and midnight edges the way a sign does", () => {
    const odd = [
      { open: "00:00", close: "12:00" },
      { open: "09:30", close: "17:45" },
      null,
      null,
      null,
      null,
      null,
    ];
    expect(hoursLines(odd)).toEqual([
      { days: "Mon", hours: "9:30 am to 5:45 pm" },
      { days: "Tue to Sat", hours: "closed" },
      { days: "Sun", hours: "12 am to 12 pm" },
    ]);
  });

  it("does not fold Sunday into Saturday across the week's end", () => {
    const same = Array(7).fill({ open: "11:00", close: "21:00" });
    expect(hoursLines(same)).toEqual([{ days: "Mon to Sun", hours: "11 am to 9 pm" }]);
  });
});

describe("openNow", () => {
  /* 2026-09-18 is a Friday. 20:30 in Chicago is 01:30 UTC on the 19th. */
  const fridayEvening = new Date("2026-09-19T01:30:00Z");

  it("reads the clock in the store's zone, not the server's", () => {
    expect(openNow(week, fridayEvening, "America/Chicago")).toBe(true);
    /* In London it is already Saturday 02:30, before the doors. */
    expect(openNow(week, fridayEvening, "Europe/London")).toBe(false);
  });

  it("is closed on a null day and outside the window", () => {
    const sundayNoon = new Date("2026-09-20T17:00:00Z");
    expect(openNow(week, sundayNoon, "America/Chicago")).toBe(false);
    const fridayMorning = new Date("2026-09-18T14:00:00Z");
    expect(openNow(week, fridayMorning, "America/Chicago")).toBe(false);
  });
});

const valid = {
  name: "Card Kingdom",
  city: "Seattle",
  region: "WA",
  addressLine: "",
  postalCode: "",
  phone: "",
  website: "",
  description: "",
};

describe("the page schema's hours and games", () => {
  it("reads no hours as not set and keeps a valid week", () => {
    const none = storePageSchema.safeParse(valid);
    expect(none.success).toBe(true);
    if (none.success) {
      expect(none.data.hours).toBeNull();
      expect(none.data.games).toEqual([]);
    }
    const some = storePageSchema.safeParse({ ...valid, hours: week });
    expect(some.success).toBe(true);
    if (some.success) expect(some.data.hours).toEqual(week);
  });

  it("refuses a day that closes before it opens, and a malformed week", () => {
    const backwards = [...week.slice(0, 6), { open: "21:00", close: "11:00" }];
    const parsed = storePageSchema.safeParse({ ...valid, hours: backwards });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "A day has to close after it opens.",
      );
    }
    expect(storePageSchema.safeParse({ ...valid, hours: [null] }).success).toBe(false);
  });

  it("keeps only slugs from the one game list, each once", () => {
    const parsed = storePageSchema.safeParse({
      ...valid,
      games: ["mtg", "one-piece", "mtg"],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.games).toEqual(["mtg", "one-piece"]);
    expect(storePageSchema.safeParse({ ...valid, games: ["yugioh"] }).success).toBe(
      false,
    );
  });

  it("assembles the seven rows the form posts, closed boxes first", () => {
    const fields: Record<string, string> = {};
    for (let day = 0; day < 7; day += 1) {
      fields[`hours.${day}.open`] = "11:00";
      fields[`hours.${day}.close`] = "21:00";
    }
    fields["hours.0.closed"] = "on";
    const read = (name: string) => fields[name] ?? "";
    const has = (name: string) => name in fields;
    expect(readHoursFields(read, has)).toEqual([
      null,
      ...Array(6).fill({ open: "11:00", close: "21:00" }),
    ]);
    expect(
      readHoursFields(
        () => "",
        () => false,
      ),
    ).toBeUndefined();
  });
});

describe("the wizard", () => {
  it("has the six steps in the founder's order", () => {
    expect(SETUP_STEPS).toEqual([
      "welcome",
      "page",
      "screens",
      "event",
      "team",
      "done",
    ]);
    expect(nextSetupStep("welcome")).toBe("page");
    expect(nextSetupStep("done")).toBeNull();
  });

  it("renders every step and can skip every one", () => {
    const page = read("src/app/store/setup/page.tsx");
    for (const step of SETUP_STEPS) expect(page).toContain(`step === "${step}"`);
    expect(read("src/components/stores/setup-wizard.tsx")).toContain("Skip for now");
  });

  it("is the owner's, locked in the loader like the owner-only tabs", () => {
    const console = read("src/lib/stores/console.ts");
    expect(console).toMatch(/OWNER_ONLY_PATHS = \[[^\]]*"\/store\/setup"/);
    /* One lock, not a second copy that could drift from it. */
    expect(read("src/app/store/setup/page.tsx")).not.toContain(
      'store.role !== "owner"',
    );
    /* The actions the steps post ask for the owner again. */
    expect(read("src/lib/stores/setup-actions.ts")).toContain(
      'viewer.storeRoles[storeId] === "owner"',
    );
  });

  it("makes the first night through the Events tab's own action, in place", () => {
    const form = read("src/components/stores/setup-event-form.tsx");
    expect(form).toContain("createEventInPlaceAction");
    expect(form).not.toContain("createSetupEventAction");
    expect(read("src/lib/stores/setup-actions.ts")).not.toContain(
      "createSetupEventAction",
    );

    const actions = read("src/lib/events/actions.ts");
    expect(actions).toContain("export async function createEventInPlaceAction");
    /* Both doors share one body; only the redirecting one leaves. */
    expect(actions.match(/await createEventFrom\(formData\)/g)).toHaveLength(2);
    expect(actions).toMatch(
      /createEventInPlaceAction[\s\S]*?return \{ status: "created"/,
    );
  });

  it("names a screen with the one form FlareCast can adopt", () => {
    const form = read("src/components/stores/add-screen-form.tsx");
    expect(form).toContain("action: (formData: FormData) => Promise<void>");
    const page = read("src/app/store/setup/page.tsx");
    expect(page).toContain(
      'import { AddScreenForm } from "@/components/stores/add-screen-form"',
    );
    expect(page).toContain("action={addSetupScreenAction}");
    expect(read("src/components/stores/setup-wizard.tsx")).not.toContain(
      "AddScreenForm",
    );
  });

  it("says how to put a screen on the TV once, in the lede", () => {
    const page = read("src/app/store/setup/page.tsx");
    expect(page.match(/Enter Fullscreen/g)).toHaveLength(1);
    expect(read("src/components/stores/setup-wizard.tsx")).not.toContain(
      "Enter Fullscreen",
    );
  });

  it("prints the counter code on Done with the console's own sheet", () => {
    const page = read("src/app/store/setup/page.tsx");
    const done = page.slice(page.indexOf("async function DoneStep"));
    expect(done).toContain("<CounterCode");
    expect(done).not.toContain("dangerouslySetInnerHTML");
    /* The event step no longer draws it: it is one step away. */
    const event = page.slice(
      page.indexOf("async function EventStep"),
      page.indexOf("async function TeamStep"),
    );
    expect(event).not.toContain("<CounterCode");
  });

  it("stamps onboarding_completed_at from Later and from Done", () => {
    const actions = read("src/lib/stores/setup-actions.ts");
    expect(actions).toContain("export async function finishStoreSetupAction");
    expect(actions).toContain("await markStoreOnboarded(storeId)");

    const page = read("src/app/store/setup/page.tsx");
    /* Later posts the action; reaching Done marks on render. */
    expect(page).toContain("<form action={finishStoreSetupAction}>");
    expect(page).toMatch(
      /async function DoneStep[\s\S]*?await markStoreOnboarded\(storeId\)/,
    );

    expect(read("src/lib/stores/page.ts")).toContain(
      "onboarding_completed_at: new Date().toISOString()",
    );
  });

  it("explains what a screen is, in plain words", () => {
    expect(read("src/app/store/setup/page.tsx")).toContain(
      "A screen is a TV in your shop running FlareCast",
    );
  });

  it("is where checkout lands; a closed or failed checkout lands on Settings", () => {
    const actions = read("src/lib/stores/ultra-actions.ts");
    expect(actions).toContain("const setup = `/store/setup?as=${storeId}`");
    expect(actions).toContain(
      "successUrl: `${origin}${setup}&checkout=success&session_id={CHECKOUT_SESSION_ID}`",
    );
    expect(actions).toContain("cancelUrl: `${origin}${settings}&checkout=cancelled`");
    expect(actions).toContain("redirect(`${settings}&checkout=failed`)");
    expect(actions).toContain(
      "const back = `${siteUrl()}/store/settings?as=${storeId}`",
    );
    expect(read("src/app/store/setup/page.tsx")).toContain(
      "await reconcileCheckoutSession(params.session_id, { storeId: store.id })",
    );
    /* The console home neither reconciles nor shows the plan; Settings does. */
    const home = read("src/app/store/page.tsx");
    expect(home).not.toContain("reconcileCheckoutSession");
    expect(home).not.toContain("BillingCard");
    expect(read("src/app/store/settings/page.tsx")).toContain("<BillingCard");
  });

  it("has no welcome flag: the wizard is the welcome", () => {
    for (const file of [
      "src/lib/stores/ultra-actions.ts",
      "src/app/store/setup/page.tsx",
      "src/app/store/page.tsx",
      "src/components/stores/billing-card.tsx",
    ]) {
      expect(read(file), file).not.toContain("welcome=1");
      expect(read(file), file).not.toContain("welcome?:");
    }
    expect(read("src/components/stores/billing-card.tsx")).not.toContain(
      "Your store is ready.",
    );
  });

  it("is offered from the console home until it is finished, alone", () => {
    const home = read("src/app/store/page.tsx");
    expect(home).toContain("Finish setting up");
    expect(home).toContain("const offerWizard = owner && onboardedAt === null");
    expect(home).not.toContain("WelcomeHero");
    /* While the wizard is offered the checklist is not drawn as well. */
    expect(home).toContain("const visibleSteps = offerWizard\n    ? []");
    /* Afterwards, the steps the wizard walked show only while undone,
       and an organizer never sees a step whose page turns them away. */
    expect(home).toContain(
      'const WIZARD_STEPS = new Set(["page", "flarecast", "event"])',
    );
    expect(home).toContain("!(WIZARD_STEPS.has(step.key) && step.done)");
    expect(home).toContain("(owner || !isOwnerOnlyPath(step.href))");
  });

  it("lists organizers with the same rows on the tab and in the wizard", () => {
    for (const file of [
      "src/app/store/organizers/page.tsx",
      "src/app/store/setup/page.tsx",
    ]) {
      expect(read(file)).toContain("<OrganizerList");
      expect(read(file)).not.toContain("<PlayerAvatar");
    }
  });
});

describe("the public store page", () => {
  it("wears the cardflare Verified mark, not a library tick", () => {
    const page = read("src/app/s/[storeId]/page.tsx");
    const header = read("src/components/stores/store-page-header.tsx");
    expect(page).not.toContain("BadgeCheck");
    expect(header).not.toContain("BadgeCheck");
    expect(header).toContain(
      'import { VerifiedMark } from "@/components/stores/verified-mark"',
    );
    expect(page).toContain("<StorePageHeader");
  });

  it("carries the same header block to the wizard's preview", () => {
    expect(read("src/app/store/setup/page.tsx")).toContain("<StorePageHeader");
  });

  it("says the same words on both platforms", () => {
    const web = read("src/app/s/[storeId]/page.tsx");
    const app = read("mobile/src/screens/store-profile.tsx");
    for (const words of ["Open now", "Closed now"]) {
      expect(web).toContain(words);
      expect(app).toContain(words);
    }
    expect(read("src/components/stores/store-page-header.tsx")).toContain(
      "cardflare <UltraMark /> store",
    );
    expect(app).toContain("Ultra</Text> store");
    expect(app).toContain("<VerifiedMark");
  });

  it("sends the app absolute pictures and the open-now word", () => {
    const route = read("src/app/api/v1/stores/[storeId]/route.ts");
    expect(route).toContain("logoUrl: absolute(store.logoUrl)");
    expect(route).toContain("coverUrl: absolute(store.coverUrl)");
    expect(route).toContain("openNow:");
  });
});

describe("the app's copy of the hours logic", () => {
  const body = (source: string, name: string) => {
    const at = source.indexOf(`export function ${name}(`);
    expect(at, `${name} not found`).toBeGreaterThanOrEqual(0);
    const end = source.indexOf("\n}\n", at);
    return source.slice(at, end).replace(/\s+/g, " ");
  };

  it("has the same hoursLines and formatClock bodies as the web", () => {
    const web = read("src/lib/stores/hours.ts");
    const app = read("mobile/src/store-hours.ts");
    expect(body(app, "hoursLines")).toBe(body(web, "hoursLines"));
    expect(body(app, "formatClock")).toBe(body(web, "formatClock"));
  });

  it("folds a week the same way", () => {
    expect(appHoursLines(week)).toEqual(hoursLines(week));
  });
});
