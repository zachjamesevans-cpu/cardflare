import { z } from "zod";

import { localToInstant } from "@/lib/time/zone";
import type { CardResult } from "@/lib/cards/schema";
import type { InventoryForm } from "@/lib/supabase/types";

/**
 * Card shows: the rules, free of server-only imports so they test without a
 * database.
 *
 * The vocabulary here is the vendor's, not the collector forum's: a card is
 * either **raw** (a single in a sleeve) or a **slab** (the same card in a
 * graded case — PSA, BGS, CGC — with a grade on the label). Which one it is
 * decides whether an attendee walks to the booth, so it is first-class and
 * never inferred. **No prices anywhere**, per PRODUCT.md.
 */

/**
 * The graders the form offers. A select, not an enum in the database — the
 * column takes any 2–8 uppercase letters, so a grader we have not heard of
 * costs a typed value, not a migration.
 */
export const GRADERS = ["PSA", "BGS", "CGC"] as const;

/** 10 down to 1 in half steps — every mainstream grading scale. */
export const GRADE_OPTIONS = Array.from({ length: 19 }, (_, i) => 10 - i * 0.5);

export const MAX_INVENTORY = 5000;
export const MAX_INVENTORY_QUANTITY = 999;

/**
 * One inventory line as the vendor states it.
 *
 * Raw strips grading fields rather than rejecting them, because the form
 * hides them for raw and a stale hidden value must not block the add. A slab
 * must name its grader; a slab with no grade is a case marked "Authentic".
 */
export const inventoryEntrySchema = z
  .object({
    cardId: z.guid("Pick a card from the list."),
    printingId: z
      .union([z.guid(), z.literal("")])
      .nullish()
      .transform((value) => value || null),
    form: z.enum(["raw", "slab"]),
    grader: z
      .string()
      .trim()
      .toUpperCase()
      .nullish()
      .transform((value) => value || null),
    grade: z
      // The empty branch first: coerce.number would turn "" into 0, and a
      // slab with no number means "Authentic", not "graded zero".
      .union([z.literal(""), z.coerce.number()])
      .nullish()
      .transform((value) => (value === "" || value == null ? null : value)),
    quantity: z.coerce
      .number()
      .int("Whole cards only.")
      .min(1, "At least one.")
      .max(MAX_INVENTORY_QUANTITY, `At most ${MAX_INVENTORY_QUANTITY}.`)
      .default(1),
  })
  .transform((entry) =>
    entry.form === "raw" ? { ...entry, grader: null, grade: null } : entry,
  )
  .refine((entry) => entry.form === "raw" || entry.grader !== null, {
    message: "A slab names its grading company.",
    path: ["grader"],
  })
  .refine((entry) => entry.grader === null || /^[A-Z]{2,8}$/.test(entry.grader), {
    message: "Grading companies are short letter codes, like PSA.",
    path: ["grader"],
  })
  .refine(
    (entry) =>
      entry.grade === null ||
      (entry.grade >= 1 && entry.grade <= 10 && (entry.grade * 2) % 1 === 0),
    { message: "Grades run 1–10 in half steps.", path: ["grade"] },
  );

export type InventoryEntryInput = z.infer<typeof inventoryEntrySchema>;

/**
 * "PSA 10", "BGS 9.5", "CGC Authentic", "Raw".
 *
 * The label an attendee reads next to a booth number, so it says what the
 * physical object is and nothing else.
 */
export function slabLabel(
  form: InventoryForm,
  grader: string | null,
  grade: number | null,
): string {
  if (form === "raw") return "Raw";
  if (grade === null) return `${grader} Authentic`;

  // 10, not 10.0 — but 9.5 stays 9.5. Number() drops the trailing zero.
  return `${grader} ${Number(grade)}`;
}

/** "A12" on the back of an attendee's hand. Same hygiene as the database. */
export const boothSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 .-]{0,11}$/, {
    message: "Booth numbers are short and plain, like A12 or 215.",
  });

export const createShowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please name the show.")
    .max(120, "Please keep the name under 120 characters."),
  city: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || null)
    .nullable()
    .default(null),
  region: z
    .string()
    .trim()
    .max(80)
    .transform((value) => value || null)
    .nullable()
    .default(null),
});

/**
 * Shows run a weekend, not an evening — the cap events use (24 hours) would
 * refuse every real card show, and a fortnight is a typo.
 */
export const MAX_SHOW_DAYS = 7;

export type ShowWindow =
  | { ok: true; startsAt: string; endsAt: string }
  | { ok: false; field: "startsAt" | "endsAt"; message: string };

/**
 * Turns the typed wall-clock window into instants, in the show's own zone —
 * the same two-pass DST-correct conversion events use, with a show-sized cap.
 */
export function showWindowIn(
  startsAtLocal: string,
  endsAtLocal: string,
  timeZone: string,
): ShowWindow {
  const startsAt = localToInstant(startsAtLocal, timeZone);
  if (!startsAt) {
    return {
      ok: false,
      field: "startsAt",
      message: "Please choose a valid date and time.",
    };
  }

  const endsAt = localToInstant(endsAtLocal, timeZone);
  if (!endsAt) {
    return {
      ok: false,
      field: "endsAt",
      message: "Please choose a valid date and time.",
    };
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    return {
      ok: false,
      field: "endsAt",
      message: "The show must end after it starts.",
    };
  }

  if (endsAt.getTime() - startsAt.getTime() > MAX_SHOW_DAYS * 24 * 60 * 60 * 1000) {
    return {
      ok: false,
      field: "endsAt",
      message: `Shows run at most ${MAX_SHOW_DAYS} days. Check the dates.`,
    };
  }

  return { ok: true, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

/* -------------------------------------------------------------------------- */
/* Action state — here rather than in actions.ts, because a "use server"      */
/* module may export only async functions                                      */
/* -------------------------------------------------------------------------- */

export interface CreateShowState {
  status: "idle" | "created" | "error";
  message?: string;
  fieldErrors: Partial<
    Record<"name" | "city" | "region" | "timezone" | "startsAt" | "endsAt", string>
  >;
}

export const CREATE_SHOW_IDLE: CreateShowState = { status: "idle", fieldErrors: {} };

export interface InventoryState {
  status: "idle" | "added" | "error";
  message?: string;
}

export const INVENTORY_IDLE: InventoryState = { status: "idle" };

export type ShowSearchResponse =
  | {
      status: "ok";
      query: string;
      results: CardResult[];
      /** Keyed by card id. Absent means nobody at this show has it. */
      availability: Record<string, VendorAvailability[]>;
    }
  | { status: "invalid" | "error"; message: string };

/* -------------------------------------------------------------------------- */
/* Availability — what an attendee's search comes back with                    */
/* -------------------------------------------------------------------------- */

/** One physical thing at one booth. */
export interface AvailabilityItem {
  form: InventoryForm;
  grader: string | null;
  grade: number | null;
  quantity: number;
  /** Null when the vendor did not say which printing. */
  printingLabel: string | null;
}

/** One vendor who has the card, and where to find them. */
export interface VendorAvailability {
  storeId: string;
  vendorName: string;
  booth: string;
  items: AvailabilityItem[];
}

/**
 * Groups a show's matching inventory under the vendors who hold it.
 *
 * Sorted by booth so the list reads as a walking route, and items within a
 * vendor slabs-first — the case is what somebody crossed the hall for.
 */
export function groupAvailability(
  rows: {
    storeId: string;
    cardId: string;
    form: InventoryForm;
    grader: string | null;
    grade: number | null;
    quantity: number;
    printingLabel: string | null;
  }[],
  roster: Map<string, { vendorName: string; booth: string }>,
): Map<string, VendorAvailability[]> {
  const byCard = new Map<string, Map<string, VendorAvailability>>();

  for (const row of rows) {
    const vendor = roster.get(row.storeId);
    // Inventory from a vendor not at this show is not availability here.
    if (!vendor) continue;

    const vendors = byCard.get(row.cardId) ?? new Map<string, VendorAvailability>();
    const entry = vendors.get(row.storeId) ?? {
      storeId: row.storeId,
      vendorName: vendor.vendorName,
      booth: vendor.booth,
      items: [],
    };

    entry.items.push({
      form: row.form,
      grader: row.grader,
      grade: row.grade,
      quantity: row.quantity,
      printingLabel: row.printingLabel,
    });

    vendors.set(row.storeId, entry);
    byCard.set(row.cardId, vendors);
  }

  const grouped = new Map<string, VendorAvailability[]>();

  for (const [cardId, vendors] of byCard) {
    const list = [...vendors.values()].sort((a, b) =>
      a.booth.localeCompare(b.booth, undefined, { numeric: true }),
    );

    for (const vendor of list) {
      vendor.items.sort((a, b) => {
        if (a.form !== b.form) return a.form === "slab" ? -1 : 1;
        return (b.grade ?? 0) - (a.grade ?? 0);
      });
    }

    grouped.set(cardId, list);
  }

  return grouped;
}
