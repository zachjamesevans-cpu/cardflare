"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/controls";
import { Spinner } from "@/components/ui/spinner";
import { slotName } from "@/lib/cards/page-geometry";
import {
  deleteBenchmarkAction,
  labelBenchmarkAction,
} from "@/lib/cards/scan-admin-actions";
import type { BenchMode, BenchRun, BenchTruth } from "@/lib/cards/scan-bench-rules";

/**
 * The admin's right answers for one bench photo, pocket by pocket: empty,
 * one of the cards the modes named, or a card by its printed number.
 */

type Choice = { key: string; label: string; cardId: string; printingId: string | null };
type Answer = {
  slot: number;
  empty: boolean;
  cardId: string | null;
  printingId: string | null;
  number?: string;
};

const keyOf = (cardId: string, printingId: string | null) =>
  `${cardId}:${printingId ?? ""}`;

export function ScannerBenchLabel({
  id,
  runs,
  truth,
}: {
  id: string;
  runs: Partial<Record<BenchMode, BenchRun>>;
  truth: BenchTruth[] | null;
}) {
  const choicesFor = (slot: number): Choice[] => {
    const seen = new Map<string, Choice>();
    for (const run of Object.values(runs)) {
      const pocket = run?.pockets.find((p) => p.slot === slot);
      if (!pocket?.cardId) continue;
      const key = keyOf(pocket.cardId, pocket.printingId);
      if (!seen.has(key)) {
        seen.set(key, {
          key,
          label: `${pocket.name} ${pocket.number}${pocket.printingId ? "" : " (printing not chosen)"}`,
          cardId: pocket.cardId,
          printingId: pocket.printingId,
        });
      }
    }
    return [...seen.values()];
  };
  const initial = Array.from({ length: 9 }, (_, slot) => {
    const known = truth?.find((t) => t.slot === slot);
    if (!known) return "";
    if (known.empty) return "empty";
    return known.cardId ? keyOf(known.cardId, known.printingId) : "";
  });
  const [picks, setPicks] = useState<string[]>(initial);
  const [numbers, setNumbers] = useState<string[]>(Array(9).fill(""));
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const answers = picks.flatMap((pick, slot): Answer[] => {
        if (pick === "empty")
          return [{ slot, empty: true, cardId: null, printingId: null }];
        if (pick === "number") {
          return numbers[slot].trim()
            ? [
                {
                  slot,
                  empty: false,
                  cardId: null,
                  printingId: null,
                  number: numbers[slot].trim(),
                },
              ]
            : [];
        }
        if (!pick) return [];
        const [cardId, printingId] = pick.split(":");
        return [{ slot, empty: false, cardId, printingId: printingId || null }];
      });
      const result = await labelBenchmarkAction(id, answers);
      setMessage(result.message);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {Array.from({ length: 9 }, (_, slot) => {
          const choices = choicesFor(slot);
          const known = truth?.find((t) => t.slot === slot);
          const unlisted =
            known &&
            !known.empty &&
            known.cardId &&
            !choices.some((c) => c.key === picks[slot]);
          return (
            <div key={slot} className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-muted">
                {slotName(slot)}
              </span>
              <Select
                aria-label={`Right answer for ${slotName(slot)}`}
                value={picks[slot]}
                onChange={(event) => {
                  const next = [...picks];
                  next[slot] = event.target.value;
                  setPicks(next);
                }}
              >
                <option value="">Not labelled</option>
                <option value="empty">Empty</option>
                {choices.map((choice) => (
                  <option key={choice.key} value={choice.key}>
                    {choice.label}
                  </option>
                ))}
                {unlisted && <option value={picks[slot]}>Labelled earlier</option>}
                <option value="number">Another card, by number</option>
              </Select>
              {picks[slot] === "number" && (
                <TextInput
                  aria-label={`Card number for ${slotName(slot)}`}
                  placeholder="OP01-120"
                  value={numbers[slot]}
                  onChange={(event) => {
                    const next = [...numbers];
                    next[slot] = event.target.value;
                    setNumbers(next);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending}>
          {pending && <Spinner size="sm" />}
          Save labels
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await deleteBenchmarkAction(id);
            })
          }
        >
          Delete this photo
        </Button>
        {message && (
          <span role="status" className="text-sm text-text-secondary">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
