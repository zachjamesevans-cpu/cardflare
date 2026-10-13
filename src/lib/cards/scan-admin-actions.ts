"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getViewer } from "@/lib/auth/session";
import {
  cardByNumber,
  deleteBenchmark,
  labelBenchmark,
  runBenchmark,
} from "@/lib/cards/scan-bench";
import type { BenchTruth } from "@/lib/cards/scan-bench-rules";
import {
  DEFAULT_PRICES,
  SCAN_MODES,
  saveScannerSettings,
  type ModelPrice,
  type ScanMode,
} from "@/lib/cards/scan-settings";

/**
 * The scanner's admin doors: its settings, and the bench. Admins only,
 * checked here on every call: a Server Action is a public POST endpoint.
 */

export type ScannerFormState =
  { status: "idle" } | { status: "done" | "error"; message: string };

async function adminUserId(): Promise<string | null> {
  const viewer = await getViewer();
  return viewer.kind === "admin" ? viewer.user.id : null;
}

const numberIn = (value: FormDataEntryValue | null, low: number, high: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= low && n <= high ? n : null;
};

export async function saveScannerSettingsAction(
  _previous: ScannerFormState,
  form: FormData,
): Promise<ScannerFormState> {
  const userId = await adminUserId();
  if (!userId) return { status: "error", message: "Admins only." };
  const mode = String(form.get("mode") ?? "");
  const autoAccept = numberIn(form.get("autoAccept"), 0, 1);
  const reviewFloor = numberIn(form.get("reviewFloor"), 0, 1);
  const pageCapCents = numberIn(form.get("pageCapCents"), 0, 100);
  if (!SCAN_MODES.includes(mode as ScanMode)) {
    return { status: "error", message: "Choose a mode." };
  }
  if (autoAccept === null || reviewFloor === null || pageCapCents === null) {
    return {
      status: "error",
      message: "Thresholds are 0 to 1, the cap 0 to 100 cents.",
    };
  }
  if (reviewFloor > autoAccept) {
    return {
      status: "error",
      message: "The review floor cannot be above auto-accept.",
    };
  }
  const prices: Record<string, ModelPrice> = {};
  for (const model of Object.keys(DEFAULT_PRICES)) {
    const price = ["in", "out", "cached"].map((part) =>
      numberIn(form.get(`price:${model}:${part}`), 0, 1000),
    );
    if (price.some((n) => n === null)) {
      return {
        status: "error",
        message: `Prices for ${model} are dollars per million tokens.`,
      };
    }
    prices[model] = price as ModelPrice;
  }
  const saved = await saveScannerSettings(
    { mode: mode as ScanMode, autoAccept, reviewFloor, pageCapCents, prices },
    userId,
  );
  if (!saved)
    return { status: "error", message: "Could not save. Has the migration run?" };
  revalidatePath("/admin/scanner");
  return { status: "done", message: "Saved. Scans use it within a minute." };
}

export async function runBenchmarkAction(
  _previous: ScannerFormState,
  form: FormData,
): Promise<ScannerFormState> {
  const userId = await adminUserId();
  if (!userId) return { status: "error", message: "Admins only." };
  const photo = form.get("photo");
  if (!(photo instanceof Blob) || photo.size === 0) {
    return { status: "error", message: "Choose a photo of a binder page." };
  }
  const result = await runBenchmark(
    userId,
    new Uint8Array(await photo.arrayBuffer()),
    String(form.get("label") ?? ""),
  );
  if (!result.ok) {
    return {
      status: "error",
      message:
        result.reason === "too-big"
          ? "That photo is over 6 MB."
          : result.reason === "not-a-photo"
            ? "That is not a JPEG, PNG or WebP photo."
            : "Could not run it. Has the migration run?",
    };
  }
  revalidatePath("/admin/scanner");
  return {
    status: "done",
    message: "Ran all three modes. Label the right answers below.",
  };
}

/**
 * The right answers for a bench photo. Each pocket is empty, a card one of
 * the modes named, or a card by its printed number.
 */
export async function labelBenchmarkAction(
  id: string,
  answers: {
    slot: number;
    empty: boolean;
    cardId: string | null;
    printingId: string | null;
    number?: string;
  }[],
): Promise<{ ok: boolean; message: string }> {
  if (!(await adminUserId())) return { ok: false, message: "Admins only." };
  if (!Array.isArray(answers)) return { ok: false, message: "Nothing to save." };
  const truth: BenchTruth[] = [];
  for (const answer of answers.slice(0, 9)) {
    if (answer.empty) {
      truth.push({ slot: answer.slot, empty: true, cardId: null, printingId: null });
      continue;
    }
    const guid = (value: unknown) =>
      z.guid().safeParse(value).success ? (value as string) : null;
    let cardId = guid(answer.cardId);
    if (!cardId && answer.number) {
      cardId = await cardByNumber(answer.number);
      if (!cardId) {
        return {
          ok: false,
          message: `No single card has the number ${answer.number}.`,
        };
      }
    }
    if (!cardId) continue;
    truth.push({
      slot: answer.slot,
      empty: false,
      cardId,
      printingId: guid(answer.printingId),
    });
  }
  const ok = await labelBenchmark(id, truth);
  if (ok) revalidatePath("/admin/scanner");
  return { ok, message: ok ? "Labels saved." : "Could not save the labels." };
}

export async function deleteBenchmarkAction(id: string): Promise<{ ok: boolean }> {
  if (!(await adminUserId())) return { ok: false };
  const ok = await deleteBenchmark(id);
  if (ok) revalidatePath("/admin/scanner");
  return { ok };
}
