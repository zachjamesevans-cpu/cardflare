/**
 * How sure a scanned pocket is, from evidence rather than from the model.
 *
 * The founder (2026-10-13): "Do not accept model-generated confidence
 * percentages as objective probabilities. Develop a confidence system using
 * available evidence such as catalog validation, collector-number
 * agreement, artwork similarity, and agreement between recognition
 * methods", and "Do not treat two AI models agreeing as proof".
 *
 * So the score is built from what can be checked:
 *
 *   the collector number read off the card matches the catalogue card   strong
 *   the name read matches the catalogue card's name                     medium
 *   the colours, power, cost and type read agree with it                small
 *   it was the only card left once those were weighed                   small
 *   the picture comparison chose it (or chose another)                  strong
 *   the reader itself was unsure                                        against
 *   a second reader named the same card                                 small
 *
 * and a pocket is "matched" (goes in without a check) only at or above the
 * auto-accept threshold, "ambiguous" (the player checks it) when there is a
 * candidate but not enough, "unrecognized" when nothing in the catalogue
 * fits, and "empty" when the pocket holds no card. Thresholds come from
 * the scanner settings. The number is a score for ordering and gating, not
 * a probability, and is never shown to players as a percentage.
 *
 * Pure: no server in it, every rule unit-tested.
 */

import { normalizeName } from "@/lib/cards/domain";
import { scanScore } from "@/lib/cards/scan-rules";

export type PocketStatus = "matched" | "ambiguous" | "unrecognized" | "empty";

export interface Evidence {
  /** How the collector number read compares: exact, same number, or not at all. */
  number: "exact" | "close" | "none" | "unread";
  /** The name read is the catalogue card's name. */
  nameMatches: boolean;
  /** Traits the reader gave that agree / that it gave at all. */
  traitsAgree: number;
  traitsKnown: number;
  /** The candidate was the only one left. */
  only: boolean;
  /** The picture comparison: chose this card, chose another, or was not asked. */
  art: "chosen" | "rejected" | "not-asked";
  /** The reader said it was sure. */
  readerSure: boolean;
  /** A second reader named the same card. */
  agreed: boolean;
}

export interface Verdict {
  status: PocketStatus;
  /** 0 to 1, for gating and ordering. Not a probability. */
  confidence: number;
  needsReview: boolean;
  /** The reasons, in words, for the review screen and the logs. */
  reasons: string[];
}

export interface Thresholds {
  autoAccept: number;
  reviewFloor: number;
}

/** The score for one candidate, from its evidence. */
export function scoreEvidence(e: Evidence): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];
  if (e.number === "exact") {
    score += 0.45;
    reasons.push("collector number matches");
  } else if (e.number === "close") {
    score += 0.25;
    reasons.push("number matches, set unclear");
  } else if (e.number === "none") {
    score -= 0.15;
    reasons.push("number read does not match");
  }
  if (e.nameMatches) {
    score += 0.25;
    reasons.push("name matches");
  }
  if (e.traitsKnown > 0) {
    score += 0.15 * (e.traitsAgree / e.traitsKnown);
    if (e.traitsAgree === e.traitsKnown) reasons.push("colour and stats agree");
  }
  if (e.only) {
    score += 0.1;
    reasons.push("only card that fits");
  }
  if (e.art === "chosen") {
    score += 0.25;
    reasons.push("artwork matches");
  } else if (e.art === "rejected") {
    score -= 0.3;
    reasons.push("artwork does not match");
  }
  if (!e.readerSure) {
    score -= 0.15;
    reasons.push("photo hard to read");
  }
  if (e.agreed) {
    score += 0.05;
    reasons.push("second reader agrees");
  }
  return { score: Math.max(0, Math.min(1, Math.round(score * 100) / 100)), reasons };
}

/**
 * The pocket's status from its best candidate's evidence. `printingOpen`
 * is a card known for sure whose printing (an alternate art, a parallel)
 * could not be told apart: it is held for the player to choose rather
 * than placed as the plain printing.
 */
export function verdict(
  input:
    | { kind: "empty" }
    | { kind: "none"; readerSaw: boolean }
    | { kind: "candidate"; evidence: Evidence; printingOpen: boolean },
  thresholds: Thresholds,
): Verdict {
  if (input.kind === "empty") {
    return { status: "empty", confidence: 1, needsReview: false, reasons: [] };
  }
  if (input.kind === "none") {
    return {
      status: "unrecognized",
      confidence: 0,
      needsReview: true,
      reasons: [
        input.readerSaw ? "not found in the catalogue" : "could not read the card",
      ],
    };
  }
  const { score, reasons } = scoreEvidence(input.evidence);
  if (score >= thresholds.autoAccept && !input.printingOpen) {
    return { status: "matched", confidence: score, needsReview: false, reasons };
  }
  if (input.printingOpen) reasons.push("printing needs choosing");
  /* A candidate below the floor is still offered, but as a weak guess. */
  return {
    status:
      score < thresholds.reviewFloor &&
      input.evidence.number === "unread" &&
      !input.evidence.nameMatches
        ? "unrecognized"
        : "ambiguous",
    confidence: score,
    needsReview: true,
    reasons,
  };
}

/** How a collector number read compares with a catalogue card's. */
export function numberEvidence(scanScore: number, read: string): Evidence["number"] {
  if (!read.trim()) return "unread";
  if (scanScore >= 4) return "exact";
  if (scanScore >= 2) return "close";
  return "none";
}

/** Words that mark a printing as an alternate or special art. */
const ALT_WORDS =
  /alt|alternate|parallel|special|manga|full ?art|treasure|wanted|foil art/i;

/** Whether a catalogue printing is an alternate art, from its own labels. */
export function isAltPrinting(printing: {
  printingLabel: string | null;
  variantType: string | null;
  printingName: string | null;
}): boolean {
  return [printing.printingLabel, printing.variantType, printing.printingName].some(
    (label) => Boolean(label) && ALT_WORDS.test(label as string),
  );
}

/**
 * The printings a read can still be: by the set code printed on it, then
 * the rarity mark, then alternate art or not. Each filter is soft: one
 * that would rule out every printing is skipped. One left is the
 * printing; more is a choice for the picture comparison, or the player.
 */
export function narrowPrintings<
  T extends {
    id: string;
    setCode: string | null;
    rarity: string | null;
    printingLabel: string | null;
    variantType: string | null;
    printingName: string | null;
  },
>(
  printings: readonly T[],
  read: { setCode: string; rarity: string; altArt: boolean },
  /* Without the alternate-art word: the printings a picture should choose between. */
  options: { art?: boolean } = {},
): T[] {
  const compact = (v: string) => v.replace(/[^a-z0-9]/gi, "").toUpperCase();
  const filters: ((p: T) => boolean)[] = [];
  if (read.setCode.trim()) {
    filters.push((p) => compact(p.setCode ?? "") === compact(read.setCode));
  }
  if (read.rarity.trim()) {
    filters.push((p) => compact(p.rarity ?? "") === compact(read.rarity));
  }
  if (options.art !== false) filters.push((p) => isAltPrinting(p) === read.altArt);
  let left = [...printings];
  for (const keep of filters) {
    const narrowed = left.filter(keep);
    if (narrowed.length > 0) left = narrowed;
  }
  return left;
}

/** What a reader said, as far as the evidence needs it. */
export interface ReadForEvidence {
  name: string;
  englishName: string;
  number: string;
  setCode: string;
  colors: string[];
  power: number | null;
  cost: number | null;
  cardType: string;
  sure: boolean;
}

/** The catalogue card, as far as the evidence needs it. */
export interface CardForEvidence {
  exactName: string;
  canonicalCardNumber: string;
  colors: string[];
  power: number | null;
  cost: number | null;
  cardType: string | null;
}

/** How many of the traits the reader gave agree with the card. */
export function traitAgreement(
  read: Pick<ReadForEvidence, "colors" | "power" | "cost" | "cardType">,
  card: Pick<CardForEvidence, "colors" | "power" | "cost" | "cardType">,
): { agree: number; known: number } {
  let agree = 0;
  let known = 0;
  const lower = (v: string) => v.trim().toLowerCase();
  const colors = read.colors.map(lower).filter(Boolean);
  if (colors.length > 0) {
    known += 1;
    const own = card.colors.map(lower);
    if (colors.every((c) => own.includes(c))) agree += 1;
  }
  if (read.power !== null) {
    known += 1;
    if (card.power === read.power) agree += 1;
  }
  if (read.cost !== null) {
    known += 1;
    if (card.cost === read.cost) agree += 1;
  }
  if (lower(read.cardType)) {
    known += 1;
    if (lower(card.cardType ?? "") === lower(read.cardType)) agree += 1;
  }
  return { agree, known };
}

/** Whether the name read is the card's name, in either language. */
export function nameMatches(
  read: Pick<ReadForEvidence, "name" | "englishName">,
  exactName: string,
): boolean {
  const own = normalizeName(exactName);
  if (!own) return false;
  return [read.englishName, read.name]
    .map((n) => normalizeName(n))
    .some((n) => n.length > 0 && (n === own || own.startsWith(`${n} `)));
}

/** The evidence for one catalogue card against one read. */
export function evidenceFor(
  read: ReadForEvidence,
  card: CardForEvidence,
  context: { only: boolean; art: Evidence["art"]; agreed: boolean },
): Evidence {
  const traits = traitAgreement(read, card);
  return {
    number: numberEvidence(scanScore(read, card.canonicalCardNumber), read.number),
    nameMatches: nameMatches(read, card.exactName),
    traitsAgree: traits.agree,
    traitsKnown: traits.known,
    only: context.only,
    art: context.art,
    readerSure: read.sure,
    agreed: context.agreed,
  };
}
