"use client";

import { useSyncExternalStore } from "react";

/**
 * A date drawn once, in the reader's own clock.
 *
 * The audit of 2026-10-01: /profile/trades said "Sun, Aug 9" from the
 * server, which formats in UTC, and "Sat, Aug 8" a moment later once
 * the browser had its say. Two answers to one question, and the first
 * one wrong for everybody west of Greenwich.
 *
 * So the text is produced only in the browser. The server renders a
 * placeholder the width of nothing (a non-breaking space, hidden from
 * screen readers), the hydration pass draws the same placeholder, and
 * the first client render after that writes the real date. One
 * answer, and it is the reader's.
 */

export type LocalDateFormat = "day" | "month";

/** "Fri, Sep 12", or "September 2026". */
export function formatLocalDate(
  iso: string,
  format: LocalDateFormat,
  timeZone?: string,
): string {
  const options: Intl.DateTimeFormatOptions =
    format === "day"
      ? { weekday: "short", month: "short", day: "numeric" }
      : { month: "long", year: "numeric" };
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(
    new Date(iso),
  );
}

const subscribeNothing = () => () => {};

/**
 * True once this is the browser. The server snapshot is false and so
 * is the hydration render, which is what keeps the two in step; the
 * render after that is the first one allowed to know the time zone.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function LocalDate({
  iso,
  format,
  className,
}: {
  iso: string;
  format: LocalDateFormat;
  className?: string;
}) {
  const text = useSyncExternalStore(
    subscribeNothing,
    () => formatLocalDate(iso, format),
    () => "",
  );

  if (!text) {
    return (
      <span aria-hidden="true" className={className}>
        &nbsp;
      </span>
    );
  }

  return <span className={className}>{text}</span>;
}
